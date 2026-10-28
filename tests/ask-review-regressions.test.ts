import { createHash } from 'node:crypto'
import { setImmediate as yieldToRequests } from 'node:timers/promises'
import { performance } from 'node:perf_hooks'
import { expect, it, vi } from 'vitest'
import { cacheKey, createAskApp } from '../server/ask/app'
import { parseAnswer } from '../server/ask/answer'
import { loadConfig } from '../server/ask/config'
import { explanationsAreIndependent } from '../server/ask/excerpts'
import { chunkUnits } from '../server/ask/methodology-adapter'
import { openStore } from '../server/ask/store'
import type { Unit } from '../server/ask/units'

const url = 'https://x.com/mattpocockuk/status/1000000000000000001'
const post = (text: string): Unit => ({ id: 'post:fixture', kind: 'post', title: '', text, sourceUrl: url })
const point = (text: string, quote?: unknown) => ({ title: '', text, quote, sources: ['S1'] })
const answer = (points: ReturnType<typeof point>[], title = '') => JSON.stringify({ found: true, title, points })
const marker = (start: number, end: number) => ({ chunk_id: 'S1', start, end })
const parse = (content: string, units: Unit[]) => parseAnswer(content, units, 'https://site.example')
const config = () => ({ ...loadConfig({ ASK_ENABLED: '1', DEEPSEEK_API_KEY: 'test-placeholder' }), minScore: 0 })
const request = (app: ReturnType<typeof createAskApp>, q: string, ip = '198.51.100.1') => app.request('/api/ask', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip }, body: JSON.stringify({ q, lang: 'en' }),
})
const upstream = (content: string) => JSON.stringify({ choices: [{ message: { content } }] })

for (const fixture of [
  { name: 'Chinese explanation plus third-sentence marker', source: '先分拆。再验证。后发布。', points: [point('先分拆 我们检查风险 再验证', marker(8, 11))], quote: '后发布', query: '分拆', title: '' },
  { name: 'Chinese explanation plus single-character marker', source: '先分拆。再验证。后发布。', points: [point('先分拆 我们检查风险 再验证', marker(8, 9))], quote: '后', query: '分拆', title: '' },
  { name: 'Chinese explanation split across answer title and text', source: '先分拆。再验证。后发布。', points: [point('我们检查风险 再验证', marker(8, 11))], quote: '后发布', query: '分拆', title: '先分拆' },
  { name: 'Chinese explanation split across point title and text', source: '先分拆。再验证。后发布。', points: [{ ...point('我们检查风险 再验证', marker(8, 11)), title: '先分拆' }], quote: '后发布', query: '分拆', title: '' },
  { name: 'Chinese explanation split across points with a separate quote', source: '先分拆。再验证。后发布。', points: [point('先分拆'), point('我们检查风险 再验证'), point('', marker(8, 11))], quote: '后发布', query: '分拆', title: '' },
  { name: 'English explanation plus third-sentence marker', source: 'Start small. Adjust quickly. Build trust.', points: [point('Start small. Our own check. Adjust quickly.', marker(29, 41))], quote: 'Build trust.', query: 'small', title: '' },
  { name: 'English explanation plus single-character marker', source: 'Start small. Adjust quickly. Build trust.', points: [point('Start small. Our own check. Adjust quickly.', marker(29, 30))], quote: 'B', query: 'small', title: '' },
  { name: 'short-word explanation sharing its budget with a marker', source: Array(26).fill('code').join(' '), points: [point(Array(25).fill('code').join(' Our thought. '), marker(0, 4))], quote: 'code', query: 'code', title: '' },
]) {
  it(`degrades ${fixture.name} and never caches the copied prose`, async () => {
    const unit = post(fixture.source)
    const content = answer(fixture.points, fixture.title)
    const expected = { found: true, title: '', degraded: true, points: [{ title: '', text: '', quote: fixture.quote, quoteUrl: url, cites: [1] }] }
    expect(await parse(content, [unit])).toMatchObject(expected)
    const store = openStore(':memory:')
    try {
      let calls = 0
      const app = createAskApp({ config: config(), units: [unit], store, log: () => {}, fetch: (async () => {
        calls++
        return new Response(upstream(content))
      }) as typeof fetch })
      for (let i = 0; i < 2; i++) {
        const response = await request(app, fixture.query)
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({ mode: 'search', reason: 'unverified', message: '', citations: [{ n: 1, kind: 'post', sourceUrl: url }], cached: false })
        expect(body).not.toHaveProperty('points')
      }
      expect(calls).toBe(2)
    } finally { store.close() }
  })
}

// Reverse the allocation: two quoted sentences still leave no allowance for a copied third.
for (const fixture of [
  { name: 'Chinese', first: '先分拆。', second: '再验证。', third: '后发布。', query: '分拆' },
  { name: 'English', first: 'Start small.', second: ' Adjust quickly.', third: 'Build trust.', query: 'small' },
  { name: 'short English sentences', first: 'Go.', second: ' Test.', third: 'Ship.', query: 'go' },
  { name: 'repeated Chinese sentence', first: '先分拆。', second: '再验证。', third: '先分拆。', query: '分拆' },
  { name: 'repeated English sentence', first: 'Start small.', second: ' Adjust quickly.', third: 'Start small.', query: 'small' },
]) {
  for (const anchors of [false, true]) {
    it(`degrades ${fixture.name} two-sentence quote plus copied prose (cross-anchor=${anchors}) without caching`, async () => {
      const quoted = fixture.first + fixture.second
      const units: Unit[] = anchors ? [
        { ...post('Our workflow interpretation.'), kind: 'method', quotes: [{ text: quoted, url: `${url}?s=20#first` }] },
        { ...post('Our workflow interpretation.'), id: 'method:next', kind: 'method', quotes: [{ text: fixture.third, url: `${url}/#next` }] },
      ] : [post(quoted + fixture.third)]
      const quote = { chunk_id: anchors ? 'S1:Q1' : 'S1', start: 0, end: quoted.length }
      const content = answer([point(fixture.third, quote)])
      const expectedPoints = [{ title: '', text: '', quote: quoted, quoteUrl: anchors ? `${url}?s=20#first` : url, cites: [1] }]
      expect(await parse(content, units)).toEqual({ found: true, title: '', degraded: true, points: expectedPoints, citations: [{ n: 1, kind: anchors ? 'method' : 'post', title: undefined, sourceUrl: url, siteUrl: undefined, date: undefined }] })
      const store = openStore(':memory:')
      try {
        const writes = vi.spyOn(store, 'putCache')
        let calls = 0
        const app = createAskApp({ config: config(), units, store, log: () => {}, fetch: (async () => {
          calls++
          return new Response(upstream(content))
        }) as typeof fetch })
        for (let i = 0; i < 2; i++) {
          const response = await request(app, anchors ? 'workflow' : fixture.query)
          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body).toEqual({ mode: 'search', reason: 'unverified', message: '', citations: anchors ? [{ n: 1, kind: 'method', sourceUrl: url }, { n: 2, kind: 'method', sourceUrl: url }] : [{ n: 1, kind: 'post', sourceUrl: url }], cached: false })
          expect(body).not.toHaveProperty('points')
        }
        expect(calls).toBe(2)
        expect(writes).not.toHaveBeenCalled()
      } finally { store.close() }
    })
  }
}

it('isolates unsafe mixed answers already cached under the v7 marker policy', async () => {
  const unit = post('先分拆。再验证。后发布。')
  const cfg = config()
  const digest = createHash('sha256').update(JSON.stringify([[unit.id, 'post', '', unit.text, null, url, null, []]])).digest('hex')
  const content = answer([point('先分拆 我们检查风险 再验证', marker(8, 11))])
  const store = openStore(':memory:')
  try {
    store.putCache(cacheKey('分拆', 'en', `${digest}:${cfg.model}:methodology-v7-extract-markers`), JSON.stringify({ mode: 'answer', title: 'Unsafe cached prose', points: [], citations: [], cached: false }), 86_400_000, Date.now())
    let calls = 0
    const app = createAskApp({ config: cfg, units: [unit], store, log: () => {}, fetch: (async () => {
      calls++
      return new Response(upstream(content))
    }) as typeof fetch })
    for (let i = 0; i < 2; i++) expect(await (await request(app, '分拆')).json()).toEqual({ mode: 'search', reason: 'unverified', message: '', citations: [{ n: 1, kind: 'post', sourceUrl: url }], cached: false })
    expect(calls).toBe(2)
  } finally { store.close() }
})

const readable = Array(5).fill('Read each diff with care then test each path keep work easy and move only when safe').join(' ').split(' ')
for (const fixture of [
  { name: 'four-letter fragments', words: Array<string>(61).fill('code'), anchors: false, split: false },
  { name: 'natural short-word fragments', words: readable, anchors: false, split: false },
  { name: 'short anchors in one method', words: Array<string>(61).fill('code'), anchors: true, split: false },
  { name: 'short anchors across same-source methods', words: Array<string>(61).fill('code'), anchors: true, split: true },
]) {
  it(`blocks ${fixture.name} in parser, API and cache`, async () => {
    const text = fixture.words.join(fixture.anchors ? ' ' : ' Our thought. ')
    const makeMethod = (words: string[], id: number): Unit => ({ ...post('Review how to review a change.'), id: `method:${id}`, kind: 'method', quotes: words.map(word => ({ text: word, url: id ? `${url}?s=20#part` : url })) })
    const units = fixture.anchors ? (fixture.split ? [makeMethod(fixture.words.slice(0, 30), 0), makeMethod(fixture.words.slice(30), 1)] : [makeMethod(fixture.words, 0)]) : [post(fixture.words.join(' '))]
    const content = answer([point(text)])
    expect(await explanationsAreIndependent([text], units)).toBe(false)
    expect(await parse(content, units)).toBeUndefined()
    const store = openStore(':memory:')
    try {
      let calls = 0
      const app = createAskApp({ config: config(), units, store, log: () => {}, fetch: (async () => {
        calls++
        return new Response(upstream(content))
      }) as typeof fetch })
      for (let i = 0; i < 2; i++) {
        const response = await request(app, fixture.anchors ? 'review' : fixture.words[0])
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ mode: 'search', reason: 'unverified', cached: false })
      }
      expect(calls).toBe(2)
    } finally { store.close() }
  })
}

for (const words of [Array<string>(61).fill('code'), readable]) {
  for (const variant of [
    { name: 'zero-width space', render: (word: string) => word.slice(0, 2) + '\u200b' + word.slice(2) },
    { name: 'zero-width non-joiner', render: (word: string) => word.slice(0, 2) + '\u200c' + word.slice(2) },
    { name: 'BOM', render: (word: string) => word.slice(0, 2) + '\ufeff' + word.slice(2) },
    { name: 'zero-width joiner', render: (word: string) => word.slice(0, 2) + '\u200d' + word.slice(2) },
    { name: 'word joiner', render: (word: string) => word.slice(0, 2) + '\u2060' + word.slice(2) },
    { name: 'ASCII suffix', render: (word: string) => word + 'X' },
    { name: 'long suffix', render: (word: string) => word + 'XYZ' },
    { name: 'prefix and suffix', render: (word: string) => 'X' + word + 'X' },
    { name: 'compatibility suffix', render: (word: string) => word + 'ｘ' },
    { name: 'combined format and suffix', render: (word: string) => word.slice(0, 2) + '\ufeff' + word.slice(2) + 'X' },
  ]) {
    for (const layout of ['post', 'one method', 'same-source methods'] as const) {
      it(`blocks ${words[0]} fragments with ${variant.name} in ${layout} without caching`, async () => {
        const makeMethod = (parts: string[], id: number): Unit => ({ ...post('Our review interpretation.'), id: `method:${id}`, kind: 'method', quotes: parts.map(text => ({ text, url: id ? `${url}/?s=20#part` : url })) })
        const units = layout === 'post' ? [post(words.join(' '))] : layout === 'one method' ? [makeMethod(words, 0)] : [makeMethod(words.slice(0, 30), 0), makeMethod(words.slice(30), 1)]
        const text = words.map(variant.render).join(' Our thought. ')
        const content = answer([point(text)])
        expect(await explanationsAreIndependent([text], units)).toBe(false)
        expect(await parse(content, units)).toBeUndefined()
        const store = openStore(':memory:')
        try {
          const writes = vi.spyOn(store, 'putCache')
          let calls = 0
          const app = createAskApp({ config: config(), units, store, log: () => {}, fetch: (async () => {
            calls++
            return new Response(upstream(content))
          }) as typeof fetch })
          for (let i = 0; i < 2; i++) {
            const response = await request(app, layout === 'post' ? words[0] : 'review')
            expect(response.status).toBe(200)
            expect(await response.json()).toEqual({ mode: 'search', reason: 'unverified', message: '', cached: false, citations: layout === 'same-source methods' ? [{ n: 1, kind: 'method', sourceUrl: url }, { n: 2, kind: 'method', sourceUrl: url }] : [{ n: 1, kind: layout === 'post' ? 'post' : 'method', sourceUrl: url }] })
          }
          expect(calls).toBe(2)
          expect(writes).not.toHaveBeenCalled()
        } finally { store.close() }
      })
    }
  }
}

it('counts repeated suffixed short anchors inside a single token without caching', async () => {
  const unit: Unit = { ...post('Our review interpretation.'), kind: 'method', quotes: Array.from({ length: 61 }, () => ({ text: 'code', url })) }
  const content = answer([point('codeX'.repeat(61))])
  expect(await parse(content, [unit])).toBeUndefined()
  const store = openStore(':memory:')
  try {
    const writes = vi.spyOn(store, 'putCache')
    let calls = 0
    const app = createAskApp({ config: config(), units: [unit], store, log: () => {}, fetch: (async () => {
      calls++
      return new Response(upstream(content))
    }) as typeof fetch })
    for (let i = 0; i < 2; i++) expect(await (await request(app, 'review')).json()).toEqual({ mode: 'search', reason: 'unverified', message: '', cached: false, citations: [{ n: 1, kind: 'method', sourceUrl: url }] })
    expect(calls).toBe(2)
    expect(writes).not.toHaveBeenCalled()
  } finally { store.close() }
})

for (const fixture of [
  { name: 'mixed allocation', source: '先分拆。再验证。后发布。', text: '后发布。', quote: marker(0, 8), query: '分拆' },
  { name: 'short-word suffix', source: Array(61).fill('code').join(' '), text: Array(61).fill('codeX').join(' Our thought. '), quote: undefined, query: 'code' },
]) {
  it(`isolates the v8 cached ${fixture.name} bypass and never writes a replacement`, async () => {
    const unit = post(fixture.source)
    const cfg = config()
    const digest = createHash('sha256').update(JSON.stringify([[unit.id, 'post', '', unit.text, null, url, null, []]])).digest('hex')
    const store = openStore(':memory:')
    try {
      store.putCache(cacheKey(fixture.query, 'en', `${digest}:${cfg.model}:methodology-v8-combined-overlap`), JSON.stringify({ mode: 'answer', title: 'Unsafe v8 cache', points: [{ text: fixture.text }], citations: [], cached: false }), 86_400_000, Date.now())
      const writes = vi.spyOn(store, 'putCache')
      let calls = 0
      const app = createAskApp({ config: cfg, units: [unit], store, log: () => {}, fetch: (async () => {
        calls++
        return new Response(upstream(answer([point(fixture.text, fixture.quote)])))
      }) as typeof fetch })
      for (let i = 0; i < 2; i++) {
        const response = await request(app, fixture.query)
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({ mode: 'search', reason: 'unverified', message: '', citations: [{ n: 1, kind: 'post', sourceUrl: url }], cached: false })
        expect(body).not.toHaveProperty('points')
      }
      expect(calls).toBe(2)
      expect(writes).not.toHaveBeenCalled()
    } finally { store.close() }
  })
}

for (const title of ['Managing the context window', 'Designing a codebase for agents']) {
  for (const withQuote of [true, false]) {
    it(`preserves and caches independent prose with generated heading ${title} (quote=${withQuote})`, async () => {
      const units = chunkUnits([{ chunk_id: 'post:fixture', kind: 'post', title, text: `${title} · Matt Pocock, 2026-01-01\nKeep boundaries small. Test changes early.`, source_url: url }])
      const text = 'Automate a narrow check before expanding the task so feedback arrives while revisions are cheap.'
      const content = answer([point(text, withQuote ? marker(0, 22) : undefined)])
      const parsed = await parse(content, units)
      expect(parsed).toMatchObject({ found: true, points: [{ text }], citations: [{ title }] })
      expect(parsed).not.toHaveProperty('degraded')
      if (withQuote) expect(parsed).toMatchObject({ points: [{ quote: 'Keep boundaries small.' }] })
      const store = openStore(':memory:')
      try {
        let calls = 0
        const app = createAskApp({ config: config(), units, store, log: () => {}, fetch: (async () => {
          calls++
          return new Response(upstream(content))
        }) as typeof fetch })
        for (let i = 0; i < 2; i++) expect(await (await request(app, 'boundaries')).json()).toMatchObject({ mode: 'answer', points: [{ text }], citations: [{ title }], cached: i === 1 })
        expect(calls).toBe(1)
      } finally { store.close() }
    })
  }
}

it('continues to protect genuine source titles without an exporter heading', async () => {
  const unit = { ...post('Keep boundaries small.'), title: 'A distinctive original title containing protected source wording' }
  expect(await parse(answer([point(unit.title)]), [unit])).toBeUndefined()
})

it('yields during output preparation even when there are no original sources to scan', async () => {
  let yielded = false
  const scheduled = yieldToRequests().then(() => { yielded = true })
  expect(await explanationsAreIndependent(['independent prose '.repeat(1200)], [])).toBe(true)
  expect(yielded).toBe(true)
  await scheduled
})

it('fails closed on legal-size NFKC expansion for four concurrent API requests without caching', async () => {
  const text = '\ufdfa'.repeat(21_500)
  const content = answer([point(text)])
  expect(content.length).toBeLessThan(32_000)
  expect(text.length).toBeLessThan(24_000)
  expect(Buffer.byteLength(upstream(content))).toBeLessThan(65_536)
  expect(await explanationsAreIndependent([text], [post('independent source')])).toBe(false)
  const store = openStore(':memory:')
  let last = performance.now()
  let maxDelay = 0
  let ticks = 0
  const timer = setInterval(() => {
    const now = performance.now()
    maxDelay = Math.max(maxDelay, now - last)
    last = now
    ticks++
  }, 1)
  try {
    let calls = 0
    const app = createAskApp({ config: config(), units: [post('independent source')], store, log: () => {}, peer: () => '127.0.0.1', fetch: (async () => {
      calls++
      return new Response(upstream(content))
    }) as typeof fetch })
    for (let round = 0; round < 2; round++) {
      const responses = await Promise.all(Array.from({ length: 4 }, (_, i) => request(app, `independent source ${i}`, `198.51.100.${i + 1}`)))
      for (const response of responses) {
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ mode: 'search', reason: 'unverified', cached: false })
      }
    }
    maxDelay = Math.max(maxDelay, performance.now() - last)
    expect(maxDelay).toBeLessThan(100)
    expect(ticks).toBeGreaterThan(0)
    expect(calls).toBe(8)
  } finally { clearInterval(timer); store.close() }
})
