import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAskApp, cacheKey } from '../server/ask/app'
import { checkQuote, parseAnswer } from '../server/ask/answer'
import { loadConfig } from '../server/ask/config'
import { shortEnough, shortExcerpt, withinExcerptBudget } from '../server/ask/excerpts'
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
const characterSource = 'Comprehensive documentation strengthens maintainability through predictable configuration boundaries, while characterization testing improves interoperability between independently initialized authentication, authorization, serialization, and synchronization components.'
const punctuationSource = 'Clear docs strengthen maintenance through predictable configuration boundaries, while character testing improves interoperability between independently initialized "authentication", "authorization", "serialization", and "synchronization" components.'

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
    expect(shortExcerpt('字'.repeat(61))).toBe('字'.repeat(50))
    expect(shortExcerpt('a'.repeat(300))).toHaveLength(240)
    expect(shortEnough('word,'.repeat(26))).toBe(false)
    expect(shortEnough('字'.repeat(2) + ' word'.repeat(26))).toBe(false)
    expect(shortEnough('Start small\nAdjust quickly\nBuild trust')).toBe(false)
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

  for (const fixture of [
    { lang: 'en', source: shortPost.text, fragments: ['Start small', 'Adjust quickly', 'Build trust'], explanation: 'We can inspect risk', text: 'Start small. We can inspect risk. Adjust quickly. Then review our assumptions. Build trust.', q: 'small' },
    { lang: 'zh', source: '先分拆。再验证。后发布。', fragments: ['先分拆', '再验证', '后发布'], explanation: '我们检查风险', text: '先分拆。我们检查风险。再验证。我们检查依赖。后发布。', q: '分拆' },
  ]) {
    const unit = { ...shortPost, text: fixture.source }
    it(`rejects interleaved source sentences with or without output punctuation (${fixture.lang})`, () => {
      for (const text of [fixture.text, fixture.fragments.join(` ${fixture.explanation} `), fixture.fragments.join(' ')]) {
        expect(withinExcerptBudget([text], [unit], [], [url])).toBe(false)
        expect(parse(answer([point(text)]), [unit])).toBeUndefined()
      }
    })

    it(`accumulates unpunctuated excerpts across fields, points, chunks and quotes (${fixture.lang})`, () => {
      const [first, second, third] = fixture.fragments
      expect(parse(answer([{ ...point(`${second} ${fixture.explanation} ${third}`), title: first }]), [unit])).toBeUndefined()
      expect(parse(answer([{ ...point(third), title: second }], first), [unit])).toBeUndefined()
      expect(parse(answer([point(`${second} ${fixture.explanation} ${third}`)]), [{ ...unit, title: first }])).toBeUndefined()
      expect(parse(answer(fixture.fragments.map(text => point(text))), [unit])).toBeUndefined()
      expect(parse(answer([point(`${first} ${fixture.explanation} ${second}`, third)]), [unit])).toBeUndefined()
      const chunks: Unit[] = fixture.fragments.map((text, i) => ({ ...unit, id: `method:${i}`, kind: 'method', text: 'Our interpretation.', quotes: [{ text, url: i ? `${url}?s=20#part` : url }] }))
      expect(withinExcerptBudget(fixture.fragments, chunks, [], [url])).toBe(false)
    })

    it(`rejects and never caches the report's interleaved answer (${fixture.lang})`, async () => {
      const store = openStore(':memory:')
      try {
        let calls = 0
        const app = createAskApp({ config: config(), units: [unit], store, log: () => {}, fetch: (async () => {
          calls++
          return fetchAnswer(answer([point(fixture.text)]))('unused')
        }) as typeof fetch })
        for (let i = 0; i < 2; i++) {
          const response = await app.request('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: fixture.q, lang: fixture.lang }) })
          expect(response.status).toBe(200)
          const body = await response.json()
          expect(body).toMatchObject({ mode: 'search', reason: 'unverified', cached: false, citations: [{ sourceUrl: url }] })
          expect(body.citations[0]).not.toHaveProperty('snippet')
          expect(body.citations[0]).not.toHaveProperty('title')
          expect(JSON.stringify(body)).not.toContain(fixture.text)
        }
        expect(calls).toBe(2)
      } finally { store.close() }
    })
  }

  it('enforces cumulative word and Han limits without sentence punctuation', () => {
    const words = Array.from({ length: 26 }, (_, i) => `word${i}`)
    const han = Array.from({ length: 51 }, (_, i) => String.fromCodePoint(0x4e00 + i))
    for (const parts of [words.slice(0, 13).join(' '), words.slice(13).join(' ')]) expect(shortEnough(parts)).toBe(true)
    expect(withinExcerptBudget([words.slice(0, 25).join(' ')], [{ ...shortPost, text: words.join(' ') }], [], [url])).toBe(true)
    expect(withinExcerptBudget([words.slice(0, 13).join(' '), words.slice(13).join(' ')], [{ ...shortPost, text: words.join(' ') }], [], [url])).toBe(false)
    expect(shortEnough('字'.repeat(50))).toBe(true)
    expect(shortEnough('字'.repeat(51))).toBe(false)
    const parts = [han.slice(0, 25).join(''), han.slice(25, 51).join('')]
    expect(withinExcerptBudget(parts, [{ ...shortPost, text: han.join('') }], [], [url])).toBe(false)
  })

  for (const fixture of [
    { lang: 'en', parts: Array.from({ length: 26 }, (_, i) => `term${i}`), separator: ' ', limit: 25 },
    { lang: 'zh', parts: Array.from({ length: 51 }, (_, i) => String.fromCodePoint(0x4e00 + i)), separator: '', limit: 50 },
  ]) {
    const source = fixture.parts.join(fixture.separator)
    const unit = { ...shortPost, text: source }
    const fragment = (parts: string[]) => {
      const runs: string[] = []
      for (let i = 0; i < parts.length; i += 3) runs.push(parts.slice(i, i + 3).join(fixture.separator))
      return runs.join(' aside ')
    }
    const text = fragment(fixture.parts)

    it(`caps even isolated overlap without source or output sentence punctuation (${fixture.lang})`, () => {
      expect(withinExcerptBudget([fragment(fixture.parts.slice(0, fixture.limit))], [unit], [], [url])).toBe(true)
      expect(withinExcerptBudget([text], [unit], [], [url])).toBe(false)
      expect(parse(answer([point(text)]), [unit])).toBeUndefined()
      expect(withinExcerptBudget(fixture.parts, [unit], [], [url])).toBe(false)
      // Common or repeated tokens are ambiguous and must not escape the hard total.
      expect(withinExcerptBudget([Array(fixture.limit + 1).fill(fixture.parts[0]).join(' aside ')], [unit], [], [url])).toBe(false)
      const first = fixture.parts.slice(0, 13).join(fixture.separator)
      const rest = fragment(fixture.parts.slice(13))
      expect(withinExcerptBudget([rest], [unit], [{ text: first, url: `${url}?s=20#part` }], [url])).toBe(false)
      expect(parse(answer([point(rest, first)]), [unit])).toBeUndefined()
      const chunks: Unit[] = [fixture.parts.slice(0, 13), fixture.parts.slice(13)].map((parts, i) => ({
        ...unit, id: `method:${i}`, kind: 'method', text: 'Our interpretation.',
        quotes: [{ text: parts.join(fixture.separator), url: i ? `${url}?s=20#part` : url }],
      }))
      expect(withinExcerptBudget([text], chunks, [], [url])).toBe(false)
    })

    it(`returns only source links and never caches an over-budget fragmented answer (${fixture.lang})`, async () => {
      const store = openStore(':memory:')
      try {
        let calls = 0
        const app = createAskApp({ config: config(), units: [unit], store, log: () => {}, fetch: (async () => {
          calls++
          return fetchAnswer(answer([point(text)]))('unused')
        }) as typeof fetch })
        for (let i = 0; i < 2; i++) {
          const response = await app.request('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: fixture.parts.slice(1, 3).join(fixture.separator), lang: fixture.lang }) })
          expect(response.status).toBe(200)
          expect(await response.json()).toEqual({
            mode: 'search', reason: 'unverified', message: '', cached: false,
            citations: [{ n: 1, kind: 'post', sourceUrl: url }],
          })
        }
        expect(calls).toBe(2)
      } finally { store.close() }
    })
  }

  for (const fixture of [
    { lang: 'en', source: characterSource, aside: 'Our aside.' },
    { lang: 'zh', source: `接口：${characterSource}`, aside: '我们另作说明。' },
  ]) {
    const unit = { ...shortPost, text: fixture.source }
    const parts = fixture.source.split(/\s+/)
    const fragment = (words: string[]) => {
      const groups: string[] = []
      for (let i = 0; i < words.length; i += 3) groups.push(words.slice(i, i + 3).join(' '))
      return groups.join(` ${fixture.aside} `)
    }
    const text = fragment(parts)

    it(`rejects scattered overlap exceeding 240 characters below word and Han limits (${fixture.lang})`, () => {
      expect(characterSource.split(/\s+/)).toHaveLength(22)
      expect(characterSource).toHaveLength(270)
      expect(characterSource.replace(/[^a-z]/gi, '')).toHaveLength(244)
      expect(shortEnough(fixture.source)).toBe(false)
      expect(withinExcerptBudget([text], [unit], [], [url])).toBe(false)
      expect(parse(answer([point(text)]), [unit])).toBeUndefined()
      expect(withinExcerptBudget(parts.map(word => `${word} ${fixture.aside}`), [unit], [], [url])).toBe(false)
      const first = parts.slice(0, 2).join(' ')
      const rest = fragment(parts.slice(2))
      expect(checkQuote(first, [unit])).toEqual({ text: first, url })
      expect(withinExcerptBudget([rest], [unit], [{ text: first, url: `${url}?s=20#part` }], [url])).toBe(false)
      expect(parse(answer([point(rest, first)]), [unit])).toBeUndefined()
      const chunks: Unit[] = [parts.slice(0, 2), parts.slice(2)].map((words, i) => ({
        ...unit, id: `method:chars:${i}`, kind: 'method', text: 'Our interpretation.',
        quotes: [{ text: words.join(' '), url: i ? `${url}?s=20#part` : url }],
      }))
      expect(withinExcerptBudget([text], chunks, [], [url])).toBe(false)
    })

    it(`returns only links and never caches the fragmented character counterexample (${fixture.lang})`, async () => {
      const store = openStore(':memory:')
      try {
        let calls = 0
        const app = createAskApp({ config: config(), units: [unit], store, log: () => {}, fetch: (async () => {
          calls++
          return fetchAnswer(answer([point(text)]))('unused')
        }) as typeof fetch })
        for (let i = 0; i < 2; i++) {
          const response = await app.request('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: 'documentation', lang: fixture.lang }) })
          expect(response.status).toBe(200)
          expect(await response.json()).toEqual({
            mode: 'search', reason: 'unverified', message: '', cached: false,
            citations: [{ n: 1, kind: 'post', sourceUrl: url }],
          })
        }
        expect(calls).toBe(2)
      } finally { store.close() }
    })
  }

  it('shares the 240 character boundary between scattered overlap and explicit quotes', () => {
    const quote = 'a'.repeat(120)
    for (const length of [120, 121]) {
      const text = 'b'.repeat(length)
      const unit = { ...shortPost, text: `${quote} ${text}` }
      expect(withinExcerptBudget([text], [unit], [{ text: quote, url }], [url])).toBe(length === 120)
    }
  })

  it('keeps the character ceiling when recording source sentence boundaries', () => {
    const text = `${'a'.repeat(110)}${'.'.repeat(30)} ${'b'.repeat(110)}`
    expect(withinExcerptBudget([text], [{ ...shortPost, text }], [], [url])).toBe(false)
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

  it('degrades copied model output to source links alone', async () => {
    const store = openStore(':memory:')
    try {
      const app = createAskApp({ config: config(), units: [longPost], store, log: () => {}, fetch: fetchAnswer(answer([point(longText)])) })
      const body = await (await request(app, 'workflow')).json()
      expect(body).toMatchObject({ mode: 'search', reason: 'unverified', citations: [{ sourceUrl: url }] })
      expect(body.citations[0]).not.toHaveProperty('snippet')
      expect(body.citations[0]).not.toHaveProperty('title')
      expect(JSON.stringify(body)).not.toContain(longText)
    } finally { store.close() }
  })
})

describe('answer character intervals', () => {
  it('rejects the review-4 punctuation counterexample at the parser', () => {
    const words = punctuationSource.split(/\s+/)
    const groups = Array.from({ length: 8 }, (_, i) => words.slice(i * 3, i * 3 + 3).join(' '))
    expect(punctuationSource).toHaveLength(249)
    expect(groups.reduce((sum, group) => sum + group.length, 0)).toBe(242)
    const text = groups.join(' Our aside. ')
    const unit = { ...shortPost, text: punctuationSource }
    expect(withinExcerptBudget([text], [unit], [], [url])).toBe(false)
    expect(parse(answer([point(text)]), [unit])).toBeUndefined()
  })

  for (const fixture of [
    { lang: 'en', tokens: ['alpha', 'bravo', 'delta', 'echo'], aside: 'Independent explanation' },
    { lang: 'zh', tokens: ['先', '拆', '验', '发'], aside: '我们另作说明' },
  ]) {
    // Each fragment has exactly 60 characters; punctuation belongs to the source.
    const fragments = fixture.tokens.map(token => `【“${token}”】${'，；：、'.repeat(16).slice(0, 56 - token.length)}`)
    const source = fragments.join('↦') + '、'
    const unit = { ...shortPost, text: source }
    const chunks: Unit[] = [0, 1].map(i => ({
      ...unit, id: `method:interval:${i}`, kind: 'method', text: 'Our interpretation.',
      quotes: [{ text: fragments.slice(i * 2, i * 2 + 2).join('↦') + (i ? '、' : ''), url: i ? `${url}?s=20#part` : url }],
    }))
    const splitAnswer = (last: string) => answer([
      { ...point(fragments[2], last), title: fragments[1] },
    ], fragments[0])

    it(`counts punctuation, quotes and separated spans at exactly 240/241 (${fixture.lang})`, () => {
      expect(fragments.map(part => [...part].length)).toEqual([60, 60, 60, 60])
      for (const extra of ['', '、']) {
        const parts = [...fragments.slice(0, 3), fragments[3] + extra]
        // Interleave our prose so the independent sentence limit does not reject four fields.
        const fields = parts.map(text => `${text} ${fixture.aside}`)
        const expected = extra === ''
        expect(withinExcerptBudget([parts.join(` ${fixture.aside} `)], [unit], [], [url])).toBe(expected)
        expect(withinExcerptBudget(fields, [unit], [], [url])).toBe(expected)
        expect(withinExcerptBudget(fields.slice(0, 3), [unit], [{ text: parts[3], url: `${url}?s=20#part` }], [url])).toBe(expected)
        expect(withinExcerptBudget(fields, chunks, [], [url])).toBe(expected)
        if (expected) expect(parse(splitAnswer(parts[3]), [unit])).toMatchObject({ found: true, title: parts[0], points: [{ title: parts[1], text: parts[2], quote: parts[3] }] })
        else expect(parse(splitAnswer(parts[3]), [unit])).toBeUndefined()
      }
    })

    it(`unions overlapping matches without deduplicating repeated output (${fixture.lang})`, () => {
      const text = fragments.join('')
      const duplicateSources = [{ ...unit, text }, { ...unit, id: 'post:duplicate', text: text.slice(30), sourceUrl: `${url}?s=20#part` }]
      expect([...text]).toHaveLength(240)
      expect(withinExcerptBudget([text], duplicateSources, [], [url])).toBe(true)
      expect(withinExcerptBudget([], duplicateSources, [{ text, url }], [url])).toBe(true)
      expect(withinExcerptBudget([text, fragments[0]], duplicateSources, [], [url])).toBe(false)
      expect(withinExcerptBudget([text], duplicateSources, [{ text: fragments[0], url }], [url])).toBe(false)
    })

    it(`counts actual whitespace and original Unicode characters (${fixture.lang})`, () => {
      const token = fixture.tokens[0]
      for (const extra of ['', '\t']) {
        const text = ` \t${token}${'，'.repeat(235 - token.length)}\n  ${extra}`
        expect([...text]).toHaveLength(extra ? 241 : 240)
        expect(withinExcerptBudget([text], [{ ...unit, text }], [], [url])).toBe(!extra)
      }
      // NFKC expands the ligature but must not inflate the actual copied character count.
      const text = `ﬃ${'，'.repeat(239)}`
      expect(withinExcerptBudget([text], [{ ...unit, text }], [], [url])).toBe(true)
      expect(withinExcerptBudget([`${text}，`], [{ ...unit, text: `${text}，` }], [], [url])).toBe(false)
      // A copied punctuation/whitespace span must also count without any word anchor.
      for (const extra of ['', '\t']) {
        const symbols = `“${'， '.repeat(119)}”${extra}`
        expect([...symbols]).toHaveLength(extra ? 241 : 240)
        expect(withinExcerptBudget([symbols], [{ ...unit, text: `${fixture.tokens[0]}${symbols}` }], [], [url])).toBe(!extra)
      }
    })

    it(`degrades 241 copied characters to links without caching, while caching 240 (${fixture.lang})`, async () => {
      for (const extra of ['', '、']) {
        const store = openStore(':memory:')
        try {
          let calls = 0
          const app = createAskApp({ config: config(), units: [unit], store, log: () => {}, fetch: (async () => {
            calls++
            return fetchAnswer(splitAnswer(fragments[3] + extra))('unused')
          }) as typeof fetch })
          for (let i = 0; i < 2; i++) {
            const response = await app.request('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: fixture.tokens[0], lang: fixture.lang }) })
            expect(response.status).toBe(200)
            const body = await response.json()
            if (extra) expect(body).toEqual({ mode: 'search', reason: 'unverified', message: '', cached: false, citations: [{ n: 1, kind: 'post', sourceUrl: url }] })
            else expect(body).toMatchObject({ mode: 'answer', title: fragments[0], points: [{ title: fragments[1], text: fragments[2], quote: fragments[3] }], cached: i === 1 })
          }
          expect(calls).toBe(extra ? 2 : 1)
        } finally { store.close() }
      }
    })
  }
})

describe('review-5 character substring regressions', () => {
  const chinesePrefix = '清晰文档让维护边界更加稳定，字符级检查让各字段之间的引用保持一致'
  for (const fixture of [
    { lang: 'en', source: punctuationSource, word: 'interoperability', cut: 7, query: 'configuration' },
    { lang: 'zh', source: chinesePrefix + '，；：、'.repeat(60).slice(0, 248 - chinesePrefix.length) + '。', word: '维护边界', cut: 2, query: '文档' },
  ]) {
    const unit = { ...shortPost, text: fixture.source }
    const cut = fixture.source.indexOf(fixture.word) + fixture.cut
    const split = (text: string) => [text.slice(0, cut), text.slice(cut)]
    const model = (fields: string[]) => answer([{ title: '', text: fields[1], sources: ['S1'] }], fields[0])
    const cases = [
      ...[240, 241, 249].map(length => ({ name: `split-${length}`, fields: split(fixture.source.slice(0, length)), allowed: length === 240 })),
      ...['X', 'ｘ'].map(suffix => ({ name: `suffix-${suffix}`, fields: ['', fixture.source.replace(fixture.word, fixture.word + suffix)], allowed: false })),
    ]

    for (const sample of cases) {
      it(`checks source substrings at the parser and shared entry (${fixture.lang}, ${sample.name})`, () => {
        expect([...fixture.source]).toHaveLength(249)
        if (sample.name.startsWith('split-')) {
          expect(sample.fields.join('')).toBe(fixture.source.slice(0, Number(sample.name.slice(6))))
          expect(sample.fields[0].endsWith(fixture.word.slice(0, fixture.cut))).toBe(true)
          expect(sample.fields[1].startsWith(fixture.word.slice(fixture.cut))).toBe(true)
        } else {
          const suffix = sample.name.slice(7)
          expect(sample.fields[1].replace(fixture.word + suffix, fixture.word)).toBe(fixture.source)
        }
        expect(withinExcerptBudget(sample.fields, [unit], [], [url])).toBe(sample.allowed)
        const chunks: Unit[] = [fixture.source.slice(0, 180), fixture.source.slice(80)].map((text, i) => ({
          ...unit, id: `method:substring:${i}`, kind: 'method', text: 'Our interpretation.',
          quotes: [{ text, url: i ? `${url}?s=20#part` : url }],
        }))
        expect(withinExcerptBudget(sample.fields, chunks, [], [url])).toBe(sample.allowed)
        if (sample.allowed) expect(parse(model(sample.fields), [unit])).toMatchObject({ found: true, title: sample.fields[0], points: [{ text: sample.fields[1] }] })
        else expect(parse(model(sample.fields), [unit])).toBeUndefined()
      })

      it(`checks the API and cache (${fixture.lang}, ${sample.name})`, async () => {
        const store = openStore(':memory:')
        try {
          let calls = 0
          const app = createAskApp({ config: config(), units: [unit], store, log: () => {}, fetch: (async () => {
            calls++
            return fetchAnswer(model(sample.fields))('unused')
          }) as typeof fetch })
          for (let i = 0; i < 2; i++) {
            const response = await app.request('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: fixture.query, lang: fixture.lang }) })
            expect(response.status).toBe(200)
            const body = await response.json()
            if (sample.allowed) expect(body).toMatchObject({ mode: 'answer', title: sample.fields[0], points: [{ text: sample.fields[1] }], cached: i === 1 })
            else expect(body).toEqual({ mode: 'search', reason: 'unverified', message: '', cached: false, citations: [{ n: 1, kind: 'post', sourceUrl: url }] })
          }
          expect(calls).toBe(sample.allowed ? 1 : 2)
        } finally { store.close() }
      })
    }
  }

  it('normalizes case, width, quotes, apostrophes, dashes and whitespace without losing source characters', () => {
    const prefix = 'ＣＬＥＡＲ “docs” aren’t fragile—'
    for (const length of [240, 241]) {
      const source = prefix + '；'.repeat(length - prefix.length - 3) + ' \t\n'
      const output = 'clear "docs" aren\'t fragile-' + ';'.repeat(length - prefix.length - 3) + ' '
      expect([...source]).toHaveLength(length)
      expect(withinExcerptBudget([output], [{ ...shortPost, text: source }], [], [url])).toBe(length === 240)
    }
    // A composed answer still covers both original code points of a decomposed grapheme.
    for (const length of [240, 241]) {
      const source = 'e\u0301' + '—'.repeat(length - 2)
      expect([...source]).toHaveLength(length)
      expect(withinExcerptBudget(['é' + '-'.repeat(length - 2)], [{ ...shortPost, text: source }], [], [url])).toBe(length === 240)
    }
  })

  it('maps contextual lowercase, corner quotes and modifier apostrophes back to the source', () => {
    for (const [sourcePrefix, outputPrefix] of [['ΟΣ', 'ος'], ['接口「Ａ」—', '接口"a"-'], ['canʼt', "can't"]]) {
      for (const length of [240, 241]) {
        const source = sourcePrefix + '；'.repeat(length - sourcePrefix.length)
        const output = outputPrefix + ';'.repeat(length - sourcePrefix.length)
        expect([...source]).toHaveLength(length)
        expect(withinExcerptBudget([output], [{ ...shortPost, text: source }], [], [url])).toBe(length === 240)
      }
    }
  })

  for (const fixture of [
    { lang: 'en', quote: 'Keep boundaries small. Test changes early.', text: 'Automate a narrow check before expanding the task so feedback arrives while revisions are cheap.', query: 'boundaries' },
    { lang: 'zh', quote: '先拆分。再验证。', text: '每次只处理一个可以撤回的改动，确认依赖后继续推进。', query: '拆分' },
  ]) {
    it(`accepts and caches a normal short quote with our own explanation (${fixture.lang})`, async () => {
      const unit = { ...shortPost, text: fixture.quote }
      const content = answer([{ title: '', text: fixture.text, quote: fixture.quote, sources: ['S1'] }], '')
      expect([...fixture.quote].length).toBeLessThanOrEqual(240)
      expect(checkQuote(fixture.quote, [unit])).toEqual({ text: fixture.quote, url })
      expect(parse(content, [unit])).toMatchObject({ found: true, points: [{ text: fixture.text, quote: fixture.quote }] })
      const store = openStore(':memory:')
      try {
        let calls = 0
        const app = createAskApp({ config: config(), units: [unit], store, log: () => {}, fetch: (async () => {
          calls++
          return fetchAnswer(content)('unused')
        }) as typeof fetch })
        for (let i = 0; i < 2; i++) {
          const response = await app.request('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: fixture.query, lang: fixture.lang }) })
          expect(response.status).toBe(200)
          expect(await response.json()).toMatchObject({ mode: 'answer', cached: i === 1, points: [{ text: fixture.text, quote: fixture.quote, quoteUrl: url }] })
        }
        expect(calls).toBe(1)
      } finally { store.close() }
    })
  }
})

describe('persistent answer content version', () => {
  it('isolates review-5 word-boundary answers cached under the v5 policy', async () => {
    const store = openStore(':memory:')
    try {
      const cfg = config()
      const unit = { ...shortPost, text: punctuationSource }
      const digest = createHash('sha256').update(JSON.stringify([[
        unit.id, 'post', '', unit.text, null, url, null, [],
      ]])).digest('hex')
      const oldKey = cacheKey('configuration', 'en', `${digest}:${cfg.model}:methodology-v5-excerpt-ranges`)
      const cut = punctuationSource.indexOf('interoperability') + 7
      const fields = [punctuationSource.slice(0, cut), punctuationSource.slice(cut)]
      store.putCache(oldKey, JSON.stringify({ mode: 'answer', title: fields[0], points: [{ text: fields[1] }], citations: [], cached: false }), 86_400_000, Date.now())
      let calls = 0
      const content = answer([{ title: '', text: fields[1], sources: ['S1'] }], fields[0])
      const app = createAskApp({ config: cfg, units: [unit], store, log: () => {}, fetch: (async () => {
        calls++
        return fetchAnswer(content)('unused')
      }) as typeof fetch })
      for (let i = 0; i < 2; i++) {
        expect(await (await request(app, 'configuration')).json()).toEqual({
          mode: 'search', reason: 'unverified', message: '', cached: false,
          citations: [{ n: 1, kind: 'post', sourceUrl: url }],
        })
      }
      expect(calls).toBe(2)
    } finally { store.close() }
  })

  it('isolates review-4 punctuation answers cached under the v4 policy', async () => {
    const store = openStore(':memory:')
    try {
      const cfg = config()
      const unit = { ...shortPost, text: punctuationSource }
      const digest = createHash('sha256').update(JSON.stringify([[
        unit.id, 'post', '', unit.text, null, url, null, [],
      ]])).digest('hex')
      const oldKey = cacheKey('configuration', 'en', `${digest}:${cfg.model}:methodology-v4-excerpt-chars`)
      const words = punctuationSource.split(/\s+/)
      const text = Array.from({ length: 8 }, (_, i) => words.slice(i * 3, i * 3 + 3).join(' ')).join(' Our aside. ')
      store.putCache(oldKey, JSON.stringify({ mode: 'answer', title: 'Unsafe cached answer', points: [{ text }], citations: [], cached: false }), 86_400_000, Date.now())
      let calls = 0
      const app = createAskApp({ config: cfg, units: [unit], store, log: () => {}, fetch: (async () => {
        calls++
        return fetchAnswer(answer([point(text)]))('unused')
      }) as typeof fetch })
      for (let i = 0; i < 2; i++) {
        expect(await (await request(app, 'configuration')).json()).toEqual({
          mode: 'search', reason: 'unverified', message: '', cached: false,
          citations: [{ n: 1, kind: 'post', sourceUrl: url }],
        })
      }
      expect(calls).toBe(2)
    } finally { store.close() }
  })

  it('does not reuse a fragmented character counterexample cached under the review-3 policy', async () => {
    const store = openStore(':memory:')
    try {
      const cfg = config()
      const unit = { ...shortPost, text: characterSource }
      const digest = createHash('sha256').update(JSON.stringify([[
        unit.id, 'post', '', unit.text, null, url, null, [],
      ]])).digest('hex')
      const oldKey = cacheKey('documentation', 'en', `${digest}:${cfg.model}:methodology-v3-excerpt-totals`)
      const text = characterSource.split(/\s+/).map((word, i) => `${i && i % 3 === 0 ? 'Our aside. ' : ''}${word}`).join(' ')
      store.putCache(oldKey, JSON.stringify({ mode: 'answer', title: 'Unsafe cached answer', points: [{ text }], citations: [], cached: false }), 86_400_000, Date.now())
      let calls = 0
      const app = createAskApp({ config: cfg, units: [unit], store, log: () => {}, fetch: (async () => {
        calls++
        return fetchAnswer(answer([point(text)]))('unused')
      }) as typeof fetch })
      for (let i = 0; i < 2; i++) {
        expect(await (await request(app, 'documentation')).json()).toEqual({
          mode: 'search', reason: 'unverified', message: '', cached: false,
          citations: [{ n: 1, kind: 'post', sourceUrl: url }],
        })
      }
      expect(calls).toBe(2)
    } finally { store.close() }
  })

  it('does not reuse the review-2 unsafe answer cached by the previous excerpt policy', async () => {
    const store = openStore(':memory:')
    try {
      const cfg = config()
      // Fixed previous-policy key, with the same current content digest: only the policy changes.
      const digest = createHash('sha256').update(JSON.stringify([[
        shortPost.id, 'post', '', shortPost.text, null, url, null, [],
      ]])).digest('hex')
      const oldKey = cacheKey('small', 'en', `${digest}:${cfg.model}:methodology-v2-excerpts`)
      store.putCache(oldKey, JSON.stringify({ mode: 'answer', title: 'Unsafe cached answer', points: [{ text: 'Start small. We can inspect risk. Adjust quickly. Then review our assumptions. Build trust.' }], citations: [], cached: false }), 86_400_000, Date.now())
      let calls = 0
      const app = createAskApp({ config: cfg, units: [shortPost], store, log: () => {}, fetch: (async () => {
        calls++
        return fetchAnswer(answer([point()]))('unused')
      }) as typeof fetch })
      expect(await (await request(app, 'small')).json()).toMatchObject({ mode: 'answer', cached: false, title: 'Workflow' })
      expect(calls).toBe(1)
      expect(await (await request(app, 'small')).json()).toMatchObject({ mode: 'answer', cached: true, title: 'Workflow' })
      expect(calls).toBe(1)
    } finally { store.close() }
  })

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
