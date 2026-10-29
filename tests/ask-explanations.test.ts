import { createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { cacheKey, createAskApp } from '../server/ask/app'
import { parseAnswer, PROMPT_VERSION, type Lang } from '../server/ask/answer'
import { loadConfig } from '../server/ask/config'
import { explanationsAreIndependent } from '../server/ask/excerpts'
import { chunkUnits } from '../server/ask/methodology-adapter'
import { openStore } from '../server/ask/store'
import type { Unit } from '../server/ask/units'
import { getMethodology } from '../scripts/methods'
import { buildChunks } from '../src/lib/methods'

const sourceUrl = 'https://x.com/mattpocockuk/status/1000000000000000001'
const config = () => ({ ...loadConfig({ ASK_ENABLED: '1', DEEPSEEK_API_KEY: 'test-placeholder' }), minScore: 0 })
const request = (app: ReturnType<typeof createAskApp>, q: string, lang: Lang) => app.request('/api/ask', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, lang }),
})
const completion = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }))
const parse = (content: string, units: Unit[]) => parseAnswer(content, units, 'https://site.example')

// Our explanations, adapted from the abandoned branch's generics and monorepo fixtures.
for (const lang of ['en', 'zh'] as const) {
  it(`${lang}: keeps realistic shared terminology while isolating a rejected point`, async () => {
    const method = getMethodology(lang === 'en' ? 'generics' : 'codebase-design')!
    const anchor = method.claim.anchors[0]
    const units: Unit[] = lang === 'en' ? [{
      id: 'method:generics', kind: 'method', title: 'Generics', text: 'Our explanatory note',
      sourceUrl: anchor.url, quotes: [{ text: anchor.quote!, url: anchor.url }],
    }] : chunkUnits(buildChunks(method, lang).filter(c => c.kind === 'step').slice(0, 4)).map(unit => ({
      ...unit, title: `Matt · monorepo · ${unit.title}`,
    }))
    const title = lang === 'en' ? 'Connect related positions' : '让 monorepo 的边界能被工具检查'
    const explanations = lang === 'en' ? [
      ['Name the connection', 'When selecting an invoice from a list, preserve enough information for the next operation to know its shape. A generic gives that connection a name.'],
      ['Choose the signature', 'For a fixed menu of cases, consider a union. Ask whether the result varies with what the caller supplies before reaching for TypeScript generics.'],
    ] : [
      ['按能力组织包', '仓库放在一起以后，仍然要让每个模块承担明确的职责。用 deep modules 收住内部细节，让调用方只理解少量入口，agent 修改时也更容易确定影响范围。'],
      ['把导入约定变成检查', '跨包访问应经过公开入口，再用 lint 或依赖规则阻止绕过入口的导入。这样 monorepo 中的边界能在每次修改时得到验证。'],
      ['删掉没有减少复杂度的层', '定期检查转发调用、暴露大量内部细节的薄封装。判断抽象有没有让使用者少想一些事情，再决定是否合并或移除。'],
      ['用约束帮助 agent 做决定', '先设计清楚可用的接口与依赖方向，再让自动检查持续执行这些要求。代码放在同一仓库只是起点，长期维护还需要清晰的目标和反馈。'],
    ]
    const contentFor = (ids: string[]) => JSON.stringify({ found: true, title, points: [
      ...explanations.map(([title, text], i) => ({ title, text, sources: [ids[lang === 'en' ? 0 : i]],
        ...(lang === 'zh' ? { quote: { chunk_id: `${ids[i]}:Q1`, start: 0, end: Math.min(12, units[i].quotes![0].text.length) } } : {}),
      })),
      ...(lang === 'en' ? [{ title: 'Copied', text: anchor.quote, sources: [ids[0]] }] : []),
    ] })
    const expected = (lang === 'en' ? explanations : explanations.slice(1)).map(([title, text]) => ({ title, text }))
    const parsed = await parse(contentFor(units.map((_, i) => `S${i + 1}`)), units)
    expect(parsed).toMatchObject({ found: true, title, points: expected })
    if (!parsed?.found) throw new Error('Expected a checked answer')
    expect(parsed.points).toHaveLength(expected.length)
    const quotes = parsed.points.flatMap(p => p.quote && p.quoteUrl ? [{ text: p.quote, url: p.quoteUrl }] : [])
    expect(await explanationsAreIndependent([
      parsed.title, ...parsed.points.flatMap(p => [p.title, p.text]), ...parsed.citations.map(c => c.title ?? ''),
    ], units, [...parsed.citations.flatMap(c => c.sourceUrl ? [c.sourceUrl] : []), ...quotes.map(q => q.url)], quotes)).toBe(true)

    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const prompt = JSON.parse(String(init?.body)).messages[1].content as string
      const sources = [...prompt.matchAll(/<source id="(S\d+)"[^>]*>(.*?)<\/source>/gs)]
      const ids = units.map(unit => sources.find(([, , payload]) => JSON.parse(payload).text === unit.text)![1])
      return completion(contentFor(ids))
    })
    const store = openStore(':memory:')
    try {
      const app = createAskApp({ config: config(), units, store, fetch, log: () => {} })
      for (let i = 0; i < 2; i++) {
        const response = await request(app, lang === 'en' ? 'generics' : 'monorepo', lang)
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toMatchObject({ mode: 'answer', title, points: expected, cached: i === 1 })
        expect(body.points).toHaveLength(expected.length)
      }
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally { store.close() }
  })

  for (const field of ['title', 'text'] as const) {
    it(`${lang}: drops only the point whose ${field} copies the source`, async () => {
      const source = lang === 'en' ? 'Start small. Adjust quickly. Build trust.' : '先分拆。再验证。后发布。'
      const unit: Unit = { id: 'post:fixture', kind: 'post', title: '', text: source, sourceUrl }
      const clean = lang === 'en' ? [
        { title: 'Inspect risk', text: 'Review dependencies before proceeding.', sources: ['S1'] },
        { title: 'Limit scope', text: 'Prefer reversible increments.', sources: ['S1'] },
      ] : [
        { title: '检查风险', text: '确认依赖后继续推进。', sources: ['S1'] },
        { title: '控制范围', text: '每次只处理一个可以撤回的改动。', sources: ['S1'] },
      ]
      const content = JSON.stringify({ found: true, title: '', points: [clean[0], { ...clean[0], [field]: source }, clean[1]] })
      const parsed = await parse(content, [unit])
      expect(parsed).toMatchObject({ found: true, title: '', points: clean.map(({ title, text }) => ({ title, text, cites: [1] })) })
      expect(parsed && parsed.found && parsed.points).toHaveLength(2)
    })
  }

  it(`${lang}: rejects the whole answer when its title fails the guard on its own`, async () => {
    const source = lang === 'en' ? 'Start small. Adjust quickly. Build trust.' : '先分拆。再验证。后发布。'
    const unit: Unit = { id: 'post:fixture', kind: 'post', title: '', text: source, sourceUrl }
    const point = lang === 'en'
      ? { title: 'Inspect risk', text: 'Review dependencies before proceeding.', sources: ['S1'] }
      : { title: '检查风险', text: '确认依赖后继续推进。', sources: ['S1'] }
    const parsed = await parse(JSON.stringify({ found: true, title: source, points: [point] }), [unit])
    expect(await explanationsAreIndependent([source], [unit], [sourceUrl], [])).toBe(false)
    expect(parsed).toBeUndefined()
    expect(await explanationsAreIndependent(['', point.title, point.text, ''], [unit], [sourceUrl], [])).toBe(true)
  })

  it(`${lang}: rejects copying split across individually accepted points and never caches it`, async () => {
    const texts = lang === 'en' ? ['Start small.', 'Adjust quickly.', 'Build trust.'] : ['先分拆。', '再验证。', '后发布。']
    const unit: Unit = { id: 'post:fixture', kind: 'post', title: '', text: texts.join(lang === 'en' ? ' ' : ''), sourceUrl }
    for (const text of texts) expect(await explanationsAreIndependent(['', text], [unit], [sourceUrl], [])).toBe(true)
    expect(await explanationsAreIndependent(texts, [unit], [sourceUrl], [])).toBe(false)
    const content = JSON.stringify({ found: true, title: '', points: texts.map(text => ({ title: '', text, sources: ['S1'] })) })
    expect(await parse(content, [unit])).toBeUndefined()
    const store = openStore(':memory:')
    const writes = vi.spyOn(store, 'putCache')
    const fetch = vi.fn(async () => completion(content))
    try {
      const app = createAskApp({ config: config(), units: [unit], store, fetch, log: () => {} })
      for (let i = 0; i < 2; i++) expect(await (await request(app, texts[0], lang)).json()).toEqual({
        mode: 'search', reason: 'unverified', message: '', citations: [{ n: 1, kind: 'post', sourceUrl }], cached: false,
      })
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(writes).not.toHaveBeenCalled()
    } finally { store.close() }
  })

  for (const text of ['', 'https://discarded.example/path']) {
    it(`${lang}: returns uncached search when no point text survives (${text || 'empty'})`, async () => {
      const unit: Unit = { id: 'post:fixture', kind: 'post', title: '', text: 'Review changes by risk before release.', sourceUrl }
      const content = JSON.stringify({ found: true, title: 'Assess release risk', points: [{
        title: 'Inspect the change', text, quote: { chunk_id: 'S1', start: 0, end: 6 }, sources: ['S1'],
      }] })
      expect(await parse(content, [unit])).toBeUndefined()
      const store = openStore(':memory:')
      const writes = vi.spyOn(store, 'putCache')
      const fetch = vi.fn(async () => completion(content))
      try {
        const app = createAskApp({ config: config(), units: [unit], store, fetch, log: () => {} })
        for (let i = 0; i < 2; i++) expect(await (await request(app, 'review changes', lang)).json()).toEqual({
          mode: 'search', reason: 'unverified', message: '', citations: [{ n: 1, kind: 'post', sourceUrl }], cached: false,
        })
        expect(fetch).toHaveBeenCalledTimes(2)
        expect(writes).not.toHaveBeenCalled()
      } finally { store.close() }
    })
  }

  for (const text of ['', '   ', 'https://discarded.example/path', undefined]) {
    for (const copied of [false, true]) {
      it(`${lang}: removes empty point text (${String(text)}) before returning and caching (copied=${copied})`, async () => {
        const unit: Unit = { id: 'post:fixture', kind: 'post', title: '', text: 'Start small. Adjust quickly. Build trust.', sourceUrl }
        const content = JSON.stringify({ found: true, title: '', points: [
          ...(copied ? [{ title: '', text: unit.text, sources: ['S1'] }] : []),
          { title: '', text, quote: { chunk_id: 'S1', start: 0, end: 12 }, sources: ['S1'] },
          { title: 'Inspect risk', text: 'Prefer reversible increments.', sources: ['S1'] },
        ] })
        const store = openStore(':memory:')
        const writes = vi.spyOn(store, 'putCache')
        const fetch = vi.fn(async () => completion(content))
        try {
          const app = createAskApp({ config: config(), units: [unit], store, fetch, log: () => {} })
          for (let i = 0; i < 2; i++) {
            const response = await request(app, 'start small', lang)
            expect(response.status).toBe(200)
            expect(await response.json()).toEqual({
              mode: 'answer', title: '', cached: i === 1,
              points: [{ title: 'Inspect risk', text: 'Prefer reversible increments.', cites: [1] }],
              citations: [{ n: 1, kind: 'post', sourceUrl }],
            })
          }
          expect(fetch).toHaveBeenCalledTimes(1)
          expect(writes).toHaveBeenCalledTimes(1)
        } finally { store.close() }
      })
    }
  }

  it.each([false, true])(`${lang}: trims unused citations and renumbers in surviving first-use order, including cache hits (copied=%s)`, async copied => {
    const units: Unit[] = [
      { id: 'post:one', kind: 'post', title: '', text: 'Start small. Adjust quickly. Build trust.', sourceUrl },
      { id: 'post:two', kind: 'post', title: '', text: 'Review changes before release.', sourceUrl: sourceUrl.replace(/1$/, '2') },
      { id: 'post:three', kind: 'post', title: '', text: 'Review dependencies before proceeding.', sourceUrl: sourceUrl.replace(/1$/, '3') },
    ]
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const prompt = JSON.parse(String(init?.body)).messages[1].content as string
      const sources = [...prompt.matchAll(/<source id="(S\d+)"[^>]*>(.*?)<\/source>/gs)]
      const ids = units.map(unit => sources.find(([, , payload]) => JSON.parse(payload).text === unit.text)![1])
      return completion(JSON.stringify({ found: true, title: '', points: [
        { title: '', text: copied ? units[0].text : '', sources: ids, quote: { chunk_id: ids[0], start: 0, end: 12 } },
        { title: 'Inspect risk', text: 'Prefer reversible increments.', sources: [ids[2], ids[1]] },
        { title: 'Assess scope', text: 'Limit the impact of each decision.', sources: [ids[1]] },
      ] }))
    })
    const store = openStore(':memory:')
    const writes = vi.spyOn(store, 'putCache')
    try {
      const app = createAskApp({ config: config(), units, store, fetch, log: () => {} })
      for (let i = 0; i < 2; i++) {
        const response = await request(app, 'review changes dependencies start small', lang)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
          mode: 'answer', title: '', cached: i === 1,
          points: [
            { title: 'Inspect risk', text: 'Prefer reversible increments.', cites: [1, 2] },
            { title: 'Assess scope', text: 'Limit the impact of each decision.', cites: [2] },
          ],
          citations: [
            { n: 1, kind: 'post', sourceUrl: sourceUrl.replace(/1$/, '3') },
            { n: 2, kind: 'post', sourceUrl: sourceUrl.replace(/1$/, '2') },
          ],
        })
      }
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(writes).toHaveBeenCalledTimes(1)
    } finally { store.close() }
  })

  it(`${lang}: checks citation titles belonging only to dropped points before trimming`, async () => {
    const copied = 'Start small. Adjust quickly. Build trust.'
    const units: Unit[] = [
      { id: 'post:one', kind: 'post', title: copied, text: copied, sourceUrl },
      { id: 'post:two', kind: 'post', title: '', text: 'Review changes before release.', sourceUrl: sourceUrl.replace(/1$/, '2') },
    ]
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const prompt = JSON.parse(String(init?.body)).messages[1].content as string
      const sources = [...prompt.matchAll(/<source id="(S\d+)"[^>]*>(.*?)<\/source>/gs)]
      const ids = units.map(unit => sources.find(([, , payload]) => JSON.parse(payload).text === unit.text)![1])
      return completion(JSON.stringify({ found: true, title: '', points: [
        { title: '', text: copied, sources: [ids[0]] },
        { title: 'Inspect risk', text: 'Prefer reversible increments.', sources: [ids[1]] },
      ] }))
    })
    const store = openStore(':memory:')
    const writes = vi.spyOn(store, 'putCache')
    try {
      const app = createAskApp({ config: config(), units, store, fetch, log: () => {} })
      for (let i = 0; i < 2; i++) {
        const response = await request(app, 'start small review changes', lang)
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ mode: 'search', reason: 'unverified', cached: false })
      }
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(writes).not.toHaveBeenCalled()
    } finally { store.close() }
  })

  for (const clean of [false, true]) {
    it(`${lang}: ${clean ? 'keeps and caches normal multi-source prose without counting equal titles twice' : 'rejects an overlapping original-title run interrupted by a displayed wrapper title without caching'}`, async () => {
      const wrapper = clean ? 'Scope' : lang === 'en' ? 'Grid' : '流程'
      const wrapperTitle = !clean && lang === 'zh' ? `${wrapper} (history)` : wrapper
      const tail = clean ? lang === 'en' ? 'reversible work' : '分步改动' : lang === 'en' ? 'iterate' : '可逆步'
      const head = lang === 'en' ? 'Incrementally' : '采用'
      const units: Unit[] = [
        ...(!clean ? [{ id: 'note:separator', kind: 'note' as const, title: lang === 'en' ? 'Context' : '背景', text: 'Our unique commentary.', sourceUrl }] : []),
        { id: 'post:wrapper', kind: 'post', title: wrapperTitle, text: `${wrapper} · Matt Pocock, 2025-07-18\n${clean ? 'Plan carefully.' : lang === 'en' ? 'Inspect the surroundings.' : '先看周围。'}`, sourceUrl: sourceUrl.replace(/1$/, '2') },
        { id: 'method:tail', kind: 'method', title: tail, text: 'Our second unique commentary.', sourceUrl: sourceUrl.replace(/1$/, '4') },
        { id: 'post:uncited', kind: 'post', title: '', text: clean ? `${tail}.` : `${head} ${tail}.`, sourceUrl: sourceUrl.replace(/1$/, '4') },
      ]
      const title = clean ? lang === 'en' ? 'Plan' : '计划' : ''
      const text = clean
        ? lang === 'en' ? 'Validate assumptions before committing further effort.' : '把每轮目标控制在容易评估的范围内，遇到疑问就先停下来核实。'
        : head
      const points = clean
        ? [{ title: lang === 'en' ? 'Inspect' : '核实', text, sources: ['S1', 'S2'] }]
        : [{ title: 'Discarded', text: '', sources: ['S1'] }, { title: '', text, sources: ['S2', 'S3'] }]
      const content = JSON.stringify({ found: true, title, points })
      const expected = {
        title, points: [{ title: points[0].title, text, cites: [1, 2] }],
        citations: [
          { n: 1, kind: 'post', title: wrapperTitle, sourceUrl: sourceUrl.replace(/1$/, '2') },
          { n: 2, kind: 'method', title: tail, sourceUrl: sourceUrl.replace(/1$/, '4') },
        ],
      }
      const parsed = await parse(content, units)
      if (clean) expect(parsed).toEqual({ found: true, ...expected })
      else expect(parsed).toBeUndefined()
      const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
        const prompt = JSON.parse(String(init?.body)).messages[1].content as string
        const supplied = [...prompt.matchAll(/<source id="(S\d+)"[^>]*>(.*?)<\/source>/gs)]
        const ids = units.map(unit => supplied.find(([, , payload]) => JSON.parse(payload).text === unit.text)?.[1])
        const mapped = points.map(p => ({ ...p, sources: p.sources.map(id => {
          const suppliedId = ids[Number(id.slice(1)) - 1]
          expect(suppliedId).toBeDefined()
          return suppliedId
        }) }))
        return completion(JSON.stringify({ found: true, title, points: mapped }))
      })
      const store = openStore(':memory:')
      const writes = vi.spyOn(store, 'putCache')
      try {
        const app = createAskApp({ config: config(), units, store, fetch, log: () => {} })
        const query = `Our unique commentary ${wrapper} Plan carefully Inspect the surroundings 先看周围 ${head} ${tail}`
        for (let i = 0; i < 2; i++) {
          const response = await request(app, query, lang)
          expect(response.status).toBe(200)
          const body = await response.json()
          if (clean) expect(body).toEqual({ mode: 'answer', ...expected, cached: i === 1 })
          else {
            expect(body).toMatchObject({ mode: 'search', reason: 'unverified', cached: false })
            expect(body).not.toHaveProperty('points')
          }
        }
        expect(fetch).toHaveBeenCalledTimes(clean ? 1 : 2)
        expect(writes).toHaveBeenCalledTimes(clean ? 1 : 0)
      } finally { store.close() }
    })
  }

  for (const oldVersion of ['methodology-v9-normalized-overlap', 'methodology-v12-ordered-overlap', 'methodology-v13-point-isolation', 'methodology-v14-trimmed-answer']) {
    it(`${lang}: isolates empty shells cached under ${oldVersion}`, async () => {
      expect(PROMPT_VERSION).toBe('methodology-v17-wrapper-title')
      const unit: Unit = { id: 'post:fixture', kind: 'post', title: '', text: 'Review changes by risk before release.', sourceUrl }
      const cfg = config()
      const digest = createHash('sha256').update(JSON.stringify([[unit.id, 'post', '', unit.text, null, sourceUrl, null, []]])).digest('hex')
      const store = openStore(':memory:')
      const text = 'Assess what could fail before deciding whether to proceed.'
      const fetch = vi.fn(async () => completion(JSON.stringify({ found: true, title: 'Assess release risk', points: [{
        title: 'Inspect the change', text, sources: ['S1'],
      }] })))
      try {
        store.putCache(cacheKey('review changes', lang, `${digest}:${cfg.model}:${oldVersion}`), JSON.stringify({
          mode: 'answer', title: '', points: [{ title: '', text: '', quote: 'Review', quoteUrl: sourceUrl, cites: [1] }], citations: [], cached: false,
        }), 86_400_000, Date.now())
        const app = createAskApp({ config: cfg, units: [unit], store, fetch, log: () => {} })
        for (let i = 0; i < 2; i++) expect(await (await request(app, 'review changes', lang)).json()).toMatchObject({
          mode: 'answer', title: 'Assess release risk', points: [{ title: 'Inspect the change', text }], cached: i === 1,
        })
        expect(fetch).toHaveBeenCalledTimes(1)
      } finally { store.close() }
    })
  }
}
