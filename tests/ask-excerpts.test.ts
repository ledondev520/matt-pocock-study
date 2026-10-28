import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAskApp, cacheKey } from '../server/ask/app'
import { checkQuote, parseAnswer } from '../server/ask/answer'
import { loadConfig } from '../server/ask/config'
import { shortEnough, shortExcerpt } from '../server/ask/excerpts'
import { openStore, type Store } from '../server/ask/store'
import type { Unit } from '../server/ask/units'

const url = 'https://x.com/mattpocockuk/status/1000000000000000001'
const shortPost: Unit = { id: 'post:fixture', kind: 'post', title: '', text: 'Start small. Adjust quickly. Build trust. Expand carefully.', sourceUrl: url }
const longText = Array.from({ length: 10 }, (_, i) => `A sample workflow phase ${i} requires a separate confirmation.`).join(' ')
const longPost = { ...shortPost, text: longText }
const answer = (points: Record<string, unknown>[], title = 'Workflow') => JSON.stringify({ found: true, title, points })
const point = (text = 'Review changes by risk.', quote?: string) => ({ title: 'Review', text, quote, sources: ['S1'] })
const parse = (content: string, units = [shortPost]) => parseAnswer(content, units, 'https://site.example')
const config = () => ({ ...loadConfig({ ASK_ENABLED: '1', DEEPSEEK_API_KEY: 'test-placeholder' }), minScore: 0 })
const request = (app: ReturnType<typeof createAskApp>, q = 'workflow review') => app.request('/api/ask', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, lang: 'en' }),
})
const fetchAnswer = (content: string) => (async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }))) as typeof fetch

// Self-written fixtures only: none of the protected dataset is copied into these tests.
describe('public excerpt checks', () => {
  it('accepts two short sentences with the original link, rejects three and four in both languages', () => {
    expect(checkQuote('Start small. Adjust quickly.', [shortPost])).toEqual({ text: 'Start small. Adjust quickly.', url })
    for (const text of ['Start small. Adjust quickly. Build trust.', shortPost.text, '先分拆。再验证。后发布。']) {
      const unit = { ...shortPost, text }
      expect(checkQuote(text, [unit])).toBeUndefined()
      const parsed = parse(answer([point('Review changes by risk.', text)]), [unit])
      expect(parsed).toMatchObject({ found: true })
      expect(parsed && parsed.found && parsed.points[0]).not.toHaveProperty('quote')
    }
  })

  it('truncates fallback excerpts by sentences, words, Han characters and total length', () => {
    expect(shortExcerpt(shortPost.text)).toBe('Start small. Adjust quickly.')
    expect(shortExcerpt('先分拆。再验证。后发布。')).toBe('先分拆。再验证。')
    expect(shortExcerpt(Array.from({ length: 26 }, (_, i) => `word${i}`).join(' ')).split(' ')).toHaveLength(25)
    expect(shortExcerpt('字'.repeat(61))).toBe('字'.repeat(60))
    expect(shortExcerpt('a'.repeat(300))).toHaveLength(240)
    expect(shortEnough('word,'.repeat(26))).toBe(false)
    expect(shortEnough('字'.repeat(2) + ' word'.repeat(26))).toBe(false)
  })

  for (const field of ['text', 'point title', 'answer title', 'citation title']) {
    it(`rejects a long original copied into ${field}`, () => {
      const item = point(field === 'text' ? longText : undefined)
      if (field === 'point title') item.title = longText
      const unit = field === 'citation title' ? { ...longPost, title: longText } : longPost
      expect(parse(answer([item], field === 'answer title' ? longText : undefined), [unit])).toBeUndefined()
    })
  }

  it('rejects three copied short sentences in explanations even without a quote field', () => {
    expect(parse(answer([point('Start small. Adjust quickly. Build trust.')]))).toBeUndefined()
  })

  it('counts quotes across points and chunks of the same original, including URL variants', () => {
    const units = ['Start small.', 'Adjust quickly.', 'Build trust.'].map((text, i): Unit => ({
      ...shortPost, id: `method:${i}`, kind: 'method', text: 'Our workflow interpretation.',
      sourceUrl: i === 1 ? `${url}?s=20` : url, quotes: [{ text, url: i === 1 ? `${url}?s=20` : url }],
    }))
    const points = units.map((u, i) => ({ ...point('Review changes by risk.', u.quotes![0].text), sources: [`S${i + 1}`] }))
    expect(parse(answer(points.slice(0, 2)), units)).toMatchObject({ found: true, points: [{ quote: 'Start small.' }, { quote: 'Adjust quickly.' }] })
    expect(parse(answer(points), units)).toBeUndefined()
  })

  it('counts copied explanations and explicit quotes together, including uncited originals', () => {
    expect(parse(answer([point('Start small. Adjust quickly.', 'Build trust.')]))).toBeUndefined()
    const note: Unit = { ...shortPost, id: 'note:1', kind: 'note', text: 'Our independent interpretation.' }
    expect(parse(answer([point(longText)]), [note, longPost])).toBeUndefined()
  })

  it('requires a link for copied prose from an otherwise uncited source', () => {
    const note: Unit = { ...shortPost, id: 'note:1', kind: 'note', text: 'Our independent interpretation.', sourceUrl: url.replace(/1$/, '2') }
    expect(parse(answer([point('Start small.')]), [note, shortPost])).toBeUndefined()
  })

  it('counts the cumulative word limit across individually short quotes', () => {
    const texts = ['Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu.', 'One two three four five six seven eight nine ten eleven twelve thirteen.']
    const unit = { ...shortPost, text: texts.join(' ') }
    expect(checkQuote(texts[0], [unit])).toBeDefined()
    expect(checkQuote(texts[1], [unit])).toBeDefined()
    expect(parse(answer(texts.map(text => point('Check the change.', text))), [unit])).toBeUndefined()
  })

  it('limits private fallback snippets and their titles across same-source chunks', async () => {
    const store = openStore(':memory:')
    try {
      const units = [shortPost, { ...shortPost, id: 'method:1', kind: 'method' as const, text: 'Build trust. Expand carefully.', quotes: [{ text: 'Build trust. Expand carefully.', url }] }]
      const app = createAskApp({ config: { ...config(), enabled: false }, units, store, log: () => {} })
      const body = await (await request(app, 'trust')).json()
      expect(body.mode).toBe('search')
      expect(body.citations.map((c: { sourceUrl: string }) => c.sourceUrl)).toEqual([url, url])
      expect(body.citations.every((c: { snippet?: string; title?: string }) => !c.snippet && !c.title)).toBe(true)
    } finally { store.close() }
  })

  it('withholds private excerpts when their original source link is missing', async () => {
    const unlinked = { ...longPost, sourceUrl: undefined }
    const note: Unit = { ...shortPost, id: 'note:1', kind: 'note', text: 'Our workflow interpretation.' }
    expect(parse(answer([{ ...point(longText), sources: ['S2'] }]), [unlinked, note])).toBeUndefined()
    const store = openStore(':memory:')
    try {
      const app = createAskApp({ config: { ...config(), enabled: false }, units: [unlinked], store, log: () => {} })
      const body = await (await request(app, 'workflow')).json()
      expect(body.mode).toBe('search')
      expect(body.citations).toHaveLength(1)
      expect(body.citations[0]).not.toHaveProperty('snippet')
    } finally { store.close() }
  })

  it('degrades copied model output to a truncated, linked search excerpt', async () => {
    const store = openStore(':memory:')
    try {
      const app = createAskApp({ config: config(), units: [longPost], store, log: () => {}, fetch: fetchAnswer(answer([point(longText)])) })
      const body = await (await request(app, 'workflow')).json()
      expect(body).toMatchObject({ mode: 'search', reason: 'unverified', citations: [{ sourceUrl: url }] })
      expect(body.citations[0].snippet).toBe('A sample workflow phase 0 requires a separate confirmation. A sample workflow phase 1 requires a separate confirmation.')
      expect(JSON.stringify(body)).not.toContain(longText)
    } finally { store.close() }
  })
})

describe('persistent answer content version', () => {
  for (const field of ['text', 'quotes', 'sourceUrl'] as const) {
    it(`invalidates answers after a same-id, same-path ${field} correction and restart`, async () => {
      const dir = await mkdtemp(join(tmpdir(), 'ask-cache-regression-'))
      let store: Store | undefined
      try {
        const file = join(dir, 'answers.sqlite')
        let calls = 0
        const makeApp = (unit: Unit) => createAskApp({ config: config(), units: [unit], store: store!, log: () => {}, fetch: (async () => {
          calls++
          return fetchAnswer(answer([point('Our revised explanation.', unit.quotes?.[0]?.text)]))('unused')
        }) as typeof fetch })
        const original: Unit = { id: 'method:1', kind: 'method', title: 'Workflow review', text: 'Our workflow review interpretation.', sourceUrl: url, sitePath: '/en/methods/pr-review#s4', quotes: [{ text: 'Start small.', url }] }
        store = openStore(file)
        const firstApp = makeApp(original)
        expect(await (await request(firstApp)).json()).toMatchObject({ mode: 'answer', cached: false, points: [{ quote: 'Start small.' }] })
        expect((await (await request(firstApp)).json()).cached).toBe(true)
        store.close(); store = openStore(file)
        expect((await (await request(makeApp(original))).json()).cached).toBe(true)
        expect(calls).toBe(1)
        store.close(); store = openStore(file)
        const corrected = { ...original, [field]: field === 'text' ? 'Our corrected workflow review interpretation.' : field === 'quotes' ? [] : url.replace(/1$/, '2') }
        const next = await (await request(makeApp(corrected))).json()
        expect(next).toMatchObject({ mode: 'answer', cached: false })
        if (field === 'quotes') expect(next.points[0]).not.toHaveProperty('quote')
        if (field === 'sourceUrl') expect(next.citations[0].sourceUrl).toBe(url.replace(/1$/, '2'))
        expect(calls).toBe(2)
      } finally { store?.close(); await rm(dir, { recursive: true, force: true }) }
    })
  }

  it('does not serve a legacy cached answer after the exit policy upgrade', async () => {
    const store = openStore(':memory:')
    try {
      const cfg = config()
      const oldIndexVersion = createHash('sha256').update(JSON.stringify([[shortPost.id, null]])).digest('hex').slice(0, 12)
      const oldKey = cacheKey('small', 'en', `${oldIndexVersion}:${cfg.model}:methodology-v1`)
      store.putCache(oldKey, JSON.stringify({ mode: 'answer', title: 'Legacy unsafe answer', points: [], citations: [], cached: false }), 86_400_000, Date.now())
      const app = createAskApp({ config: cfg, units: [shortPost], store, log: () => {}, fetch: fetchAnswer(answer([point()])) })
      expect(await (await request(app, 'small')).json()).toMatchObject({ mode: 'answer', cached: false, title: 'Workflow' })
    } finally { store.close() }
  })
})
