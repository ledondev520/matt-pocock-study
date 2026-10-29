import { createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { cacheKey, createAskApp } from '../server/ask/app'
import { parseAnswer } from '../server/ask/answer'
import { explanationsAreIndependent } from '../server/ask/excerpts'
import { loadConfig } from '../server/ask/config'
import { chunkUnits } from '../server/ask/methodology-adapter'
import { openStore } from '../server/ask/store'
import type { Unit } from '../server/ask/units'
import { getMethodology } from '../scripts/methods'
import { buildChunks } from '../src/lib/methods'

// Our own explanations of the checked-in methodology fixtures, not upstream completions.
const samples = [
  {
    // The review repro: 148 words, three points with three sentences each, against the claim anchor.
    question: 'generics', lang: 'en' as const, slug: 'generics', claim: true,
    title: 'Connect related positions',
    points: [
      ['Name the connection', 'Think of a generic as a promise to keep information flowing through an API. When a caller passes an array of invoices, selecting an item should produce an invoice rather than an unknown value. The type parameter gives that choice a name.'],
      ['Choose the signature', 'TypeScript can infer the name at the call site, so users usually do not need to spell out a type argument. By comparison, a union is a good fit when a function accepts a fixed set of alternatives. Check whether the result actually depends on the caller’s choice before adding a parameter.'],
      ['Check the benefit', 'For a reusable table, connect the row data to the callback that renders a cell; that lets the callback see the right fields. If a parameter appears only once and connects nothing, try removing it. Keep the signature focused on the relationship a caller needs to understand, and let inference handle the routine details.'],
    ],
  },
  {
    question: 'monorepo', lang: 'zh' as const, slug: 'codebase-design',
    title: '让仓库结构帮助团队判断修改范围',
    points: [
      ['从一次具体修改出发', 'monorepo 让多个项目可以在同一个位置协作，但目录放到一起以后，职责不会自动变清楚。先选择一个常见任务，记录需要打开哪些文件、询问哪些同事，以及哪些地方容易产生意外影响。根据这些观察重新安排模块，让每个包都能解释自己负责什么，并让调用方从少量公开入口获得需要的能力。'],
      ['把接口当成协作契约', 'agent 开始修改之前，应当能够从接口看出输入、结果和允许依赖的方向。使用 lint 和依赖检查发现绕过包入口的导入，让工具在评审之前给出可以定位的反馈。这样增加一个功能时，团队可以先确认契约是否需要变化，再决定内部实现放在哪里，避免把所有细节都暴露给每个使用者。'],
      ['用维护成本检验抽象', '一个封装是否值得留下，要看它能否减少调用方需要理解的事情。只转发参数、增加跳转、却没有隐藏复杂性的层，可以结合实际调用逐步合并。保留修改前后的行为检查，每次处理一个可以撤回的范围，再观察新的结构是否让下一次任务更容易判断；仓库大小本身不能说明设计是否有效。'],
    ],
  },
  {
    question: 'What does Matt say about TypeScript generics?', lang: 'en' as const, slug: 'generics',
    title: 'Choose generics by the relationship they express',
    points: [
      ['Check whether a relationship varies', 'Ask what information the caller supplies that the function must preserve. A fixed signature needs no extra machinery; a finite menu of cases can usually be described with a union.'],
      ['Connect related positions', 'Use a type parameter to carry information from an input into a result or another argument. Let inference fill in that relationship at the call site instead of making callers repeat it.'],
      ['Apply the same test to components', 'For a table, the row renderer should receive the shape supplied through the rows prop. When props merely select between known alternatives, a discriminated union often expresses the choice more clearly.'],
      ['Preserve information instead of erasing it', 'Replacing any with a type parameter can keep the caller’s concrete input available in the output. The benefit is a useful relationship, rather than extra syntax for its own sake.'],
      ['Adjust inference deliberately', 'If inference widens a literal too far, consider const type parameters. NoInfer can exclude an argument from contributing candidates, while a default can guide callers toward an explicit type argument.'],
    ],
  },
  {
    question: 'Matt 对 monorepo 有什么建议?', lang: 'zh' as const, slug: 'codebase-design',
    title: '让 monorepo 的边界能被工具检查',
    points: [
      ['按能力组织包', '仓库放在一起以后，仍然要让每个模块承担明确的职责。用 deep modules 收住内部细节，让调用方只理解少量入口，agent 修改时也更容易确定影响范围。'],
      ['把导入约定变成检查', '跨包访问应经过公开入口，再用 lint 或依赖规则阻止绕过入口的导入。这样 monorepo 中的边界能在每次修改时得到验证。'],
      ['删掉没有减少复杂度的层', '定期检查转发调用、暴露大量内部细节的薄封装。判断抽象有没有让使用者少想一些事情，再决定是否合并或移除。'],
      ['用约束帮助 agent 做决定', '先设计清楚可用的接口与依赖方向，再让自动检查持续执行这些要求。代码放在同一仓库只是起点，长期维护还需要清晰的目标和反馈。'],
    ],
  },
  {
    question: 'Matt 怎么看 TDD?', lang: 'zh' as const, slug: 'testing-tdd',
    title: '围绕可观察的行为逐步开发',
    points: [
      ['先确定验证的位置', '先与使用者确认关键接口和预期结果，把有限的测试精力花在这些边界上。'],
      ['每次完成一个行为', '先观察一项检查失败，再完成让它通过的改动，随后整理结构；不要一次猜测整套实现。'],
    ],
  },
]

for (const sample of samples) {
  it(`preserves and caches realistic explanations: ${sample.question}`, async () => {
    const method = getMethodology(sample.slug)!
    const units = ('claim' in sample ? [{
      id: 'method:long', kind: 'method', title: sample.slug === 'generics' ? 'Generics' : 'monorepo',
      text: 'Our explanatory note', sourceUrl: method.claim.anchors[0].url, sitePath: `/${sample.lang}/methods/${sample.slug}`,
      quotes: [{ text: method.claim.anchors[0].quote!, url: method.claim.anchors[0].url }],
    } satisfies Unit] : chunkUnits(buildChunks(method, sample.lang).filter(c => c.kind === 'step').slice(0, sample.points.length))).map(unit => ({
      ...unit,
      // Label this retrieval fixture with the question's topic; the protected anchors
      // and the explanatory content are the checked-in methodology data.
      title: sample.slug === 'codebase-design' ? `Matt · monorepo · ${unit.title}` : unit.title,
    }))
    const contentFor = (ids: string[]) => JSON.stringify({ found: true, title: sample.title, points: sample.points.map(([title, text], i) => ({
      title, text, sources: [ids['claim' in sample ? 0 : i]],
      // Step fixtures include a brief server-extracted reference per point, within all budgets.
      ...(!('claim' in sample) ? { quote: { chunk_id: `${ids[i]}:Q1`, start: 0, end: Math.min(12, units[i].quotes![0].text.length) } } : {}),
    })) })
    const expected = sample.points.map(([title, text]) => ({ title, text }))
    const parsed = await parseAnswer(contentFor(units.map((_, i) => `S${i + 1}`)), units, 'https://site.example')
    expect(parsed).toMatchObject({ found: true, title: sample.title, points: expected })
    expect(parsed).not.toHaveProperty('degraded')
    const store = openStore(':memory:')
    const logs: string[] = []
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const prompt = JSON.parse(String(init?.body)).messages[1].content as string
      const ids = units.map(unit => {
        const sources = [...prompt.matchAll(/<source id="(S\d+)"[^>]*>(.*?)<\/source>/gs)]
        return sources.find(([, , payload]) => JSON.parse(payload).text === unit.text)![1]
      })
      return new Response(JSON.stringify({ choices: [{ message: { content: contentFor(ids) } }], usage: { prompt_tokens: 120, completion_tokens: 60 } }))
    })
    try {
      const app = createAskApp({ config: { ...loadConfig({ ASK_ENABLED: '1', DEEPSEEK_API_KEY: 'test-placeholder' }), minScore: 0 }, units, store, fetch: fetch as typeof globalThis.fetch, log: line => logs.push(line) })
      for (let i = 0; i < 2; i++) {
        const response = await app.request('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: sample.question, lang: sample.lang }) })
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ mode: 'answer', title: sample.title, points: expected, cached: i === 1 })
      }
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(JSON.parse(logs[0])).toMatchObject({ mode: 'answer', inTokens: 120, outTokens: 60 })
    } finally { store.close() }
  })
}

const sourceUrl = 'https://x.com/mattpocockuk/status/1000000000000000001'
const review: Unit = { id: 'post:review', kind: 'post', title: '', text: 'Review changes by risk before release.', sourceUrl }
const config = () => ({ ...loadConfig({ ASK_ENABLED: '1', DEEPSEEK_API_KEY: 'test-placeholder' }), minScore: 0 })
const request = (app: ReturnType<typeof createAskApp>) => app.request('/api/ask', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: 'review changes', lang: 'en' }),
})

for (const text of ['', 'https://discarded.example/path']) {
  it(`returns uncached links instead of an answer when every text is empty after validation (${text || 'empty'})`, async () => {
    const store = openStore(':memory:')
    const writes = vi.spyOn(store, 'putCache')
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      found: true, title: 'Assess release risk', points: [{ title: 'Inspect the change', text, quote: { chunk_id: 'S1', start: 0, end: 6 }, sources: ['S1'] }],
    }) } }] })))
    try {
      const app = createAskApp({ config: config(), units: [review], store, fetch, log: () => {} })
      for (let i = 0; i < 2; i++) {
        const response = await request(app)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ mode: 'search', reason: 'unverified', message: '', citations: [{ n: 1, kind: 'post', sourceUrl }], cached: false })
      }
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(writes).not.toHaveBeenCalled()
    } finally { store.close() }
  })
}

it('isolates empty shells persisted under the v9 policy', async () => {
  const store = openStore(':memory:')
  const cfg = config()
  const digest = createHash('sha256').update(JSON.stringify([[review.id, 'post', '', review.text, null, sourceUrl, null, []]])).digest('hex')
  store.putCache(cacheKey('review changes', 'en', `${digest}:${cfg.model}:methodology-v9-normalized-overlap`), JSON.stringify({
    mode: 'answer', title: '', points: [{ title: '', text: '', quote: 'Review', quoteUrl: sourceUrl, cites: [1] }], citations: [], cached: false,
  }), 86_400_000, Date.now())
  const text = 'Assess what could fail before deciding whether to proceed.'
  const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
    found: true, title: 'Assess release risk', points: [{ title: 'Inspect the change', text, sources: ['S1'] }],
  }) } }] })))
  try {
    const app = createAskApp({ config: cfg, units: [review], store, fetch, log: () => {} })
    for (let i = 0; i < 2; i++) expect(await (await request(app)).json()).toMatchObject({ mode: 'answer', title: 'Assess release risk', points: [{ text }], cached: i === 1 })
    expect(fetch).toHaveBeenCalledTimes(1)
  } finally { store.close() }
})

it('does not charge incidental function words repeatedly against the same shared terminology', async () => {
  const sample = samples[0]
  const anchor = getMethodology('generics')!.claim.anchors[0]
  const unit: Unit = { id: 'method:generics', kind: 'method', title: 'Generics', text: 'Our explanatory note', quotes: [{ text: anchor.quote!, url: anchor.url }] }
  const explanation = sample.points.map(([, text]) => text).join(' ')
  expect(await explanationsAreIndependent([explanation, explanation, explanation], [unit], [anchor.url])).toBe(true)
})
