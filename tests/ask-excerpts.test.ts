import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAskApp, cacheKey } from '../server/ask/app'
import { buildMessages, checkQuote, parseAnswer } from '../server/ask/answer'
import { loadConfig } from '../server/ask/config'
import { explanationsAreIndependent, quotesWithinBudget, shortEnough } from '../server/ask/excerpts'
import { openStore, type Store } from '../server/ask/store'
import type { Unit } from '../server/ask/units'

const url = 'https://x.com/mattpocockuk/status/1000000000000000001'
const shortPost: Unit = { id: 'post:fixture', kind: 'post', title: '', text: 'Start small. Adjust quickly. Build trust. Expand carefully.', sourceUrl: url }
const longText = Array.from({ length: 10 }, (_, i) => `A sample workflow phase ${i} requires a separate confirmation.`).join(' ')
const longPost = { ...shortPost, text: longText }
const answer = (points: Record<string, unknown>[], title = 'Workflow') => JSON.stringify({ found: true, title, points })
const marker = (end: number, start = 0, chunk_id = 'S1') => ({ chunk_id, start, end })
const point = (text = 'Review changes by risk.', quote?: unknown) => ({ title: 'Review', text, quote, sources: ['S1'] })
const parse = (content: string, units = [shortPost]) => parseAnswer(content, units, 'https://site.example')
const config = () => ({ ...loadConfig({ ASK_ENABLED: '1', DEEPSEEK_API_KEY: 'test-placeholder' }), minScore: 0 })
const request = (app: ReturnType<typeof createAskApp>, q = 'workflow review') => app.request('/api/ask', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, lang: 'en' }),
})
const fetchAnswer = (content: string) => (async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }))) as typeof fetch
const characterSource = 'Comprehensive documentation strengthens maintainability through predictable configuration boundaries, while characterization testing improves interoperability between independently initialized authentication, authorization, serialization, and synchronization components.'
const punctuationSource = 'Clear docs strengthen maintenance through predictable configuration boundaries, while character testing improves interoperability between independently initialized "authentication", "authorization", "serialization", and "synchronization" components.'

// Self-written fixtures only. The previous interval-counting tests are expressed as exact
// marker budgets and conservative prose rejection: prose no longer has a 240-char allowance.
describe('server-extracted quotes', () => {
  it('accepts two short sentences with the original link and rejects three or four in either language', async () => {
    expect(checkQuote(marker(28), [shortPost])).toEqual({ text: 'Start small. Adjust quickly.', url })
    for (const text of ['Start small. Adjust quickly. Build trust.', shortPost.text, '先分拆。再验证。后发布。']) {
      const unit = { ...shortPost, text }
      expect(checkQuote(marker(text.length), [unit])).toBeUndefined()
      const parsed = await parse(answer([point('Review changes by risk.', marker(text.length))]), [unit])
      expect(parsed).toMatchObject({ found: true })
      expect(parsed && parsed.found && parsed.points[0]).not.toHaveProperty('quote')
    }
  })

  it('enforces the existing sentence, word, Han and character ceilings', () => {
    expect(shortEnough('word,'.repeat(26))).toBe(false)
    expect(shortEnough('字'.repeat(2) + ' word'.repeat(26))).toBe(false)
    expect(shortEnough('Start small\nAdjust quickly\nBuild trust')).toBe(false)
    for (const [text, accepted] of [
      [Array(25).fill('word').join(' '), true], [Array(26).fill('word').join(' '), false],
      ['字'.repeat(50), true], ['字'.repeat(51), false], ['a'.repeat(240), true], ['a'.repeat(241), false],
    ] as const) {
      expect(shortEnough(text)).toBe(accepted)
      expect(checkQuote(marker(text.length), [{ ...shortPost, text }]) !== undefined).toBe(accepted)
    }
  })

  it('ignores all model-written quote strings and rejects forged or malformed markers', async () => {
    const unit = { ...shortPost, text: 'A 🧭 directs careful review.' }
    for (const quote of ['Start small.', { text: 'Start small.' }, null, [], marker(5, -1), marker(1, 3), marker(500),
      marker(1.5), marker(Number.MAX_SAFE_INTEGER + 1), marker(5, 0, 'S99'), marker(3), marker(5, 3),
      { ...marker(1), text: 'forged' }, { ...marker(1), url: 'https://evil.example' }, { ...marker(1), start: '0' }]) {
      expect(checkQuote(quote, [unit])).toBeUndefined()
      const parsed = await parse(answer([point('Inspect risk.', quote)]), [unit])
      expect(parsed).toMatchObject({ found: true })
      expect(parsed && parsed.found && parsed.points[0]).not.toHaveProperty('quote')
    }
    expect(checkQuote(marker(4, 2), [unit])).toEqual({ text: '🧭', url })
  })

  it('uses exact source spelling and spacing, never a normalized model rendering', () => {
    const text = 'ＣＬＥＡＲ “docs” aren’t fragile— e\u0301 🧭\n  Test.'
    expect(checkQuote(marker(text.length), [{ ...shortPost, text }])).toEqual({ text, url })
    expect(checkQuote('clear "docs" aren\'t fragile- é 🧭 Test.', [{ ...shortPost, text }])).toBeUndefined()
  })

  it('only extracts from a cited post or a checked method anchor', async () => {
    const method: Unit = { ...shortPost, kind: 'method', text: 'Our independent interpretation.', quotes: [{ text: 'Start small.', url }] }
    expect(checkQuote(marker(12, 0, 'S1:Q1'), [method])).toEqual({ text: 'Start small.', url })
    expect(checkQuote(marker(12), [method])).toBeUndefined()
    expect(checkQuote(marker(12), [{ ...shortPost, kind: 'note' }])).toBeUndefined()
    expect(checkQuote(marker(12), [{ ...shortPost, sourceUrl: undefined }])).toBeUndefined()
    expect(checkQuote(marker(12), [{ ...shortPost, sourceUrl: 'https://evil.example' }])).toBeUndefined()
    expect(checkQuote(marker(12, 0, 'S2'), [shortPost, shortPost], [0])).toBeUndefined()
    const parsed = await parse(answer([point('Inspect risk.', marker(12, 0, 'S2'))]), [shortPost, shortPost])
    expect(parsed && parsed.found && parsed.points[0]).not.toHaveProperty('quote')
  })

  it('sends quote chunks as exact decoded JSON text, preserving offset meaning', () => {
    const text = '<tag> 🧭\nA sentence. </source>'
    const messages = buildMessages('question', 'en', [{ ...shortPost, text }])
    const payload = JSON.parse(messages[1].content.match(/<source[^>]*>(.*?)<\/source>/s)![1])
    expect(payload.quote_chunks).toEqual([{ chunk_id: 'S1', text }])
    expect(messages[1].content.match(/<\/source>/g)).toHaveLength(1)
    expect(messages[0].content).toContain('UTF-16')
    expect(messages[0].content).toContain('Never write quote text')
  })

  it('counts quotes across points, overlapping chunks and URL variants without deduplicating output', async () => {
    const units = ['Start small.', 'Adjust quickly.', 'Build trust.'].map((text, i): Unit => ({
      ...shortPost, id: `method:${i}`, kind: 'method', text: 'Our workflow interpretation.',
      sourceUrl: i === 1 ? `${url}?s=20` : url, quotes: [{ text, url: i === 1 ? `${url}?s=20#part` : url }],
    }))
    const points = units.map((u, i) => ({ ...point('Review changes by risk.', marker(u.quotes![0].text.length, 0, `S${i + 1}:Q1`)), sources: [`S${i + 1}`] }))
    expect(await parse(answer(points.slice(0, 2)), units)).toMatchObject({ found: true, points: [{ quote: 'Start small.' }, { quote: 'Adjust quickly.' }] })
    expect(await parse(answer(points), units)).toBeUndefined()
    const quote = { text: 'a'.repeat(120), url }
    expect(quotesWithinBudget([quote, quote])).toBe(true)
    expect(quotesWithinBudget([quote, quote, { text: 'a', url: `${url}?s=20#part` }])).toBe(false)
    expect(quotesWithinBudget([quote, { text: 'a'.repeat(121), url: `${url}?s=20#part` }])).toBe(false)
    expect(quotesWithinBudget([quote, { text: 'a'.repeat(121), url: url.replace(/1$/, '2') }])).toBe(true)
  })

  it('accumulates words and Han characters across individually short quotes', async () => {
    const texts = ['Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu.', 'One two three four five six seven eight nine ten eleven twelve thirteen.']
    const unit = { ...shortPost, text: texts.join(' ') }
    expect(checkQuote(marker(texts[0].length), [unit])).toBeDefined()
    expect(checkQuote(marker(unit.text.length, texts[0].length + 1), [unit])).toBeDefined()
    expect(await parse(answer([point('Check the change.', marker(texts[0].length)), point('Check the change.', marker(unit.text.length, texts[0].length + 1))]), [unit])).toBeUndefined()
    for (const [first, rest] of [['word '.repeat(13).trim(), 'word '.repeat(13).trim()], ['字'.repeat(25), '字'.repeat(26)]] as const) {
      expect(shortEnough(first)).toBe(true)
      expect(shortEnough(rest)).toBe(true)
      expect(quotesWithinBudget([{ text: first, url }, { text: rest, url }])).toBe(false)
    }
  })

  for (const text of [
    'a'.repeat(240), '字'.repeat(4) + '，；：、'.repeat(59), `ﬃ${'，'.repeat(239)}`, `🧭${'，'.repeat(239)}`,
    ` \talpha${'，'.repeat(230)}\n  `, `“${'， '.repeat(119)}”`, `e\u0301${'—'.repeat(238)}`,
    'ＣＬＥＡＲ “docs” aren’t fragile—' + '；'.repeat(212), 'ΟΣ' + '；'.repeat(238), '接口「Ａ」—' + '；'.repeat(234), 'canʼt' + '；'.repeat(235),
  ]) {
    it(`keeps the exact 240/241 boundary for original Unicode and punctuation (${text.slice(0, 10)})`, async () => {
      expect([...text]).toHaveLength(240)
      const unit = { ...shortPost, text: text + '、' }
      expect(checkQuote(marker(text.length), [unit])).toEqual({ text, url })
      expect(checkQuote(marker(unit.text.length), [unit])).toBeUndefined()
      // Unlike copied prose, a marker at exactly 240 is explicitly allowed and cacheable.
      expect(await parse(answer([point('Inspect risk.', marker(text.length))], ''), [unit])).toMatchObject({ found: true, points: [{ text: 'Inspect risk.', quote: text }] })
    })
  }
})

// Rounds 1–6: each counterexample must reject the entire prose at both parser and API.
// No quotes are supplied here, so degradation is links only and never cached.
const groups = (source: string) => source.split(/\s+/).reduce<string[]>((out, word, i) => {
  if (i % 3 === 0) out.push(word); else out[out.length - 1] += ` ${word}`
  return out
}, []).join(' Our aside. ')
const englishSplit = punctuationSource.indexOf('interoperability') + 7
const chinesePrefix = '清晰文档让维护边界更加稳定，字符级检查让各字段之间的引用保持一致'
const chineseSource = chinesePrefix + '，；：、'.repeat(60).slice(0, 248 - chinesePrefix.length) + '。'
const regressions = [
  { name: 'round-1 full original', source: longText, fields: [longText] },
  ...['Start small. Adjust quickly. Build trust.', 'Start small. We can inspect risk. Adjust quickly. Then review our assumptions. Build trust.', 'Start small We can inspect risk Adjust quickly We inspect dependencies Build trust'].map(text => ({ name: 'round-2 interleaved English', source: shortPost.text, fields: [text] })),
  ...['先分拆。我们检查风险。再验证。我们检查依赖。后发布。', '先分拆 我们检查风险 再验证 我们检查依赖 后发布'].map(text => ({ name: 'round-2 interleaved Han', source: '先分拆。再验证。后发布。', fields: [text] })),
  { name: 'round-3 scattered character total', source: characterSource, fields: [groups(characterSource)] },
  { name: 'round-4 punctuation', source: punctuationSource, fields: [groups(punctuationSource)] },
  ...[punctuationSource, chineseSource].flatMap(source => {
    const word = source === punctuationSource ? 'interoperability' : '维护边界'
    const cut = source === punctuationSource ? englishSplit : source.indexOf(word) + 2
    return [
      ...[240, 241, 249].map(length => ({ name: `round-5 split ${length}`, source, fields: [source.slice(0, cut), source.slice(cut, length)] })),
      ...['X', 'ｘ'].map(suffix => ({ name: `round-5 suffix ${suffix}`, source, fields: [source.replace(word, word + suffix)] })),
    ]
  }),
  ...[241, 274].map(length => {
    const source = Array(25).fill('abcdefghij').join(' ').slice(0, length)
    return { name: `round-6 short words ${length}`, source, fields: [source.replace(/[a-j]+/g, word => word + 'X')] }
  }),
  ...['\u200b', '\u200c', '\u200d', '\u2060', '\ufeff', '~'].map(symbol => ({ name: `round-6 inserted U+${symbol.codePointAt(0)!.toString(16)}`, source: punctuationSource, fields: [[...punctuationSource.slice(0, 241)].map((c, i) => c + ((i + 1) % 6 === 0 ? symbol : '')).join('')] })),
  ...[
    ['ＣＬＥＡＲ “docs” aren’t fragile—', 'clear "docs" aren\'t fragile-'],
    ['e\u0301', 'é'], ['ΟΣ', 'ος'], ['接口「Ａ」—', '接口"a"-'], ['canʼt', "can't"],
  ].map(([prefix, rendered]) => ({ name: `normalized Unicode ${prefix}`, source: prefix + '—'.repeat(241 - [...prefix].length), fields: [rendered + '-'.repeat(241 - [...prefix].length)] })),
  { name: 'unanchored punctuation', source: 'alpha' + '“' + '， '.repeat(119) + '”\t', fields: ['“' + '， '.repeat(119) + '”\t'] },
  ...['en', 'zh'].map(lang => {
    const parts = lang === 'en' ? Array.from({ length: 26 }, (_, i) => `term${i}`) : Array.from({ length: 51 }, (_, i) => String.fromCodePoint(0x4e00 + i))
    const sep = lang === 'en' ? ' ' : ''
    return { name: `isolated word/Han total ${lang}`, source: parts.join(sep), fields: [parts.join(`${sep}aside${sep}`)] }
  }),
]

for (const fixture of regressions) {
  it(`blocks ${fixture.name} in parser, API and cache`, async () => {
    const unit = { ...shortPost, text: fixture.source, title: 'probe' }
    const content = answer([point(fixture.fields.at(-1)!)], fixture.fields.length > 1 ? fixture.fields[0] : '')
    expect(await explanationsAreIndependent(fixture.fields, [unit])).toBe(false)
    expect(await parse(content, [unit])).toBeUndefined()
    const store = openStore(':memory:')
    try {
      let calls = 0
      const app = createAskApp({ config: config(), units: [unit], store, log: () => {}, fetch: (async () => {
        calls++
        return fetchAnswer(content)('unused')
      }) as typeof fetch })
      for (let i = 0; i < 2; i++) {
        const response = await request(app, 'probe')
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ mode: 'search', reason: 'unverified', message: '', cached: false, citations: [{ n: 1, kind: 'post', sourceUrl: url }] })
      }
      expect(calls).toBe(4)
    } finally { store.close() }
  })
}

for (const field of ['text', 'point title', 'answer title', 'citation title']) {
  it(`rejects a long original copied into ${field}`, async () => {
    const item = point(field === 'text' ? longText : undefined)
    if (field === 'point title') item.title = longText
    const unit = field === 'citation title' ? { ...longPost, title: longText } : longPost
    expect(await parse(answer([item], field === 'answer title' ? longText : undefined), [unit])).toBeUndefined()
  })
}

it('checks all retrieved originals, including uncited originals, linked variants and method anchors', async () => {
  const note: Unit = { ...shortPost, kind: 'note', text: 'Our independent interpretation.', sourceUrl: url.replace(/1$/, '2') }
  expect(await parse(answer([point(longText)]), [note, longPost])).toBeUndefined()
  expect(await parse(answer([point('Start small.')]), [note, shortPost])).toBeUndefined()
  const chunks: Unit[] = punctuationSource.split(/\s+/).map((text, i) => ({ ...shortPost, id: `method:${i}`, kind: 'method', text: 'Our interpretation.', quotes: [{ text, url: i ? `${url}?s=20#part` : url }] }))
  expect(await parse(answer([point(groups(punctuationSource))]), chunks)).toBeUndefined()
})

it('returns uncached search when citation metadata still fails after point isolation', async () => {
  const content = answer([point(longText, marker(12)), point('This innocent point must also disappear.')], longText)
  const unit = { ...shortPost, text: `${shortPost.text} ${longText}`, title: longText }
  const parsed = await parse(content, [unit])
  expect(parsed).toBeUndefined()
  const store = openStore(':memory:')
  try {
    let calls = 0
    const app = createAskApp({ config: config(), units: [unit], store, log: () => {}, fetch: (async () => { calls++; return fetchAnswer(content)('unused') }) as typeof fetch })
    for (let i = 0; i < 2; i++) {
      const body = await (await request(app, 'workflow')).json()
      expect(body).toEqual({ mode: 'search', reason: 'unverified', message: '', citations: [{ n: 1, kind: 'post', sourceUrl: url }], cached: false })
      expect(JSON.stringify(body)).not.toContain(longText)
    }
    expect(calls).toBe(4)
  } finally { store.close() }
})

it('keeps disabled and unverified fallbacks links only, including unlinked private text', async () => {
  for (const sourceUrl of [url, undefined]) {
    const store = openStore(':memory:')
    try {
      const units = [shortPost, { ...shortPost, id: 'method:1', kind: 'method' as const, sourceUrl, text: 'Build trust. Expand carefully.', quotes: [{ text: 'Build trust. Expand carefully.', url }] }]
      const app = createAskApp({ config: { ...config(), enabled: false }, units, store, log: () => {} })
      const body = await (await request(app, 'trust')).json()
      expect(body.mode).toBe('search')
      expect(body.citations.map((c: { sourceUrl?: string }) => c.sourceUrl)).toEqual(sourceUrl ? [url, sourceUrl] : [sourceUrl, url])
      expect(body.citations.every((c: { snippet?: string; title?: string }) => !c.snippet && !c.title)).toBe(true)
      expect(JSON.stringify(body)).not.toContain('Build trust.')
    } finally { store.close() }
  }
})

for (const fixture of [
  { lang: 'en', quote: 'Keep boundaries small. Test changes early.', text: 'Automate a narrow check before expanding the task so feedback arrives while revisions are cheap.', query: 'boundaries' },
  { lang: 'zh', quote: '先拆分。再验证。', text: '每次只处理一个可以撤回的改动，确认依赖后继续推进。', query: '拆分' },
  { lang: 'en', quote: 'Keep boundaries small. Test changes early.', text: 'Review boundaries before expanding the work.', query: 'boundaries' },
]) {
  it(`accepts and caches a normal short quote with our own explanation (${fixture.lang})`, async () => {
    const unit = { ...shortPost, text: fixture.quote }
    const content = answer([{ title: '', text: fixture.text, quote: marker(fixture.quote.length), sources: ['S1'] }], '')
    expect([...fixture.quote].length).toBeLessThanOrEqual(240)
    expect(checkQuote(marker(fixture.quote.length), [unit])).toEqual({ text: fixture.quote, url })
    expect(await parse(content, [unit])).toMatchObject({ found: true, points: [{ text: fixture.text, quote: fixture.quote }] })
    const store = openStore(':memory:')
    try {
      let calls = 0
      const app = createAskApp({ config: config(), units: [unit], store, log: () => {}, fetch: (async () => { calls++; return fetchAnswer(content)('unused') }) as typeof fetch })
      for (let i = 0; i < 2; i++) {
        const response = await request(app, fixture.query)
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ mode: 'answer', cached: i === 1, points: [{ text: fixture.text, quote: fixture.quote, quoteUrl: url }] })
      }
      expect(calls).toBe(1)
    } finally { store.close() }
  })
}
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
      expect(calls).toBe(4)
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
      expect(calls).toBe(4)
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
      expect(calls).toBe(4)
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
          return fetchAnswer(answer([point('Our revised explanation.', unit.quotes?.[0] ? { chunk_id: 'S1:Q1', start: 0, end: unit.quotes[0].text.length } : undefined)]))('unused')
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

it('never reads internal_notes while adapting chunks, building prompts or validating answers', async () => {
  const { chunkUnits } = await import('../server/ask/methodology-adapter')
  const rejectRead = { enumerable: true, get: () => { throw new Error('internal_notes was read') } }
  const chunk = { chunk_id: 'm.pr-review#s4', kind: 'step', title: 'Review', text: 'Our independent explanation.', source_url: url, quotes: [{ text: 'Start small.', url }] }
  Object.defineProperty(chunk, 'internal_notes', rejectRead)
  Object.defineProperty(chunk.quotes[0], 'internal_notes', rejectRead)
  const units = chunkUnits([chunk])
  Object.defineProperty(units[0], 'internal_notes', rejectRead)
  const messages = buildMessages('review', 'en', units)
  expect(JSON.stringify(messages)).not.toContain('internal_notes')
  expect(await parse(answer([point('Inspect risk.', marker(12, 0, 'S1:Q1'))]), units)).toMatchObject({ found: true, points: [{ quote: 'Start small.', quoteUrl: url }] })
  const store = openStore(':memory:')
  try {
    const app = createAskApp({ config: config(), units, store, log: () => {}, fetch: fetchAnswer(answer([point()])) })
    expect((await (await request(app, 'review')).json()).mode).toBe('answer')
  } finally { store.close() }
})

it('does not offer the generated post heading as a quote chunk', () => {
  const unit = { ...shortPost, title: 'Review', text: 'Review · Matt Pocock, 2026-01-01\nStart small.', date: '2026-01-01' }
  expect(checkQuote(marker(12), [unit])).toEqual({ text: 'Start small.', url })
  const payload = JSON.parse(buildMessages('review', 'en', [unit])[1].content.match(/<source[^>]*>(.*?)<\/source>/s)![1])
  expect(payload.quote_chunks[0].text).toBe('Start small.')
})

it('checks quote char budgets across same-source points at the API and preserves valid 240-char caching', async () => {
  for (const length of [120, 121]) {
    const store = openStore(':memory:')
    try {
      const unit = { ...shortPost, text: 'a'.repeat(120) + ' ' + 'b'.repeat(length) }
      const content = answer([point('Inspect risk.', marker(120)), point('Check scope.', marker(unit.text.length, 121))])
      let calls = 0
      const app = createAskApp({ config: config(), units: [unit], store, log: () => {}, fetch: (async () => { calls++; return fetchAnswer(content)('unused') }) as typeof fetch })
      for (let i = 0; i < 2; i++) {
        const response = await request(app, 'a'.repeat(120))
        expect(response.status).toBe(200)
        const body = await response.json()
        if (length === 120) expect(body).toMatchObject({ mode: 'answer', points: [{ quote: 'a'.repeat(120) }, { quote: 'b'.repeat(120) }], cached: i === 1 })
        else expect(body).toEqual({ mode: 'search', reason: 'unverified', message: '', cached: false, citations: [{ n: 1, kind: 'post', sourceUrl: url }] })
      }
      expect(calls).toBe(length === 120 ? 1 : 2)
    } finally { store.close() }
  }
})

it('invalidates the review-6 cache policy and refuses its short-word bypass twice', async () => {
  const store = openStore(':memory:')
  try {
    const unit = { ...shortPost, text: Array(25).fill('abcdefghij').join(' ') }
    const cfg = config()
    const digest = createHash('sha256').update(JSON.stringify([[unit.id, 'post', '', unit.text, null, url, null, []]])).digest('hex')
    const content = answer([point(unit.text.replace(/[a-j]+/g, word => word + 'X'))])
    store.putCache(cacheKey('abcdefghij', 'en', `${digest}:${cfg.model}:methodology-v6-character-spans`), JSON.stringify({ mode: 'answer', title: 'Unsafe cached answer', points: [{ text: unit.text }], citations: [], cached: false }), 86_400_000, Date.now())
    let calls = 0
    const app = createAskApp({ config: cfg, units: [unit], store, log: () => {}, fetch: (async () => { calls++; return fetchAnswer(content)('unused') }) as typeof fetch })
    for (let i = 0; i < 2; i++) expect(await (await request(app, 'abcdefghij')).json()).toEqual({ mode: 'search', reason: 'unverified', message: '', cached: false, citations: [{ n: 1, kind: 'post', sourceUrl: url }] })
    expect(calls).toBe(4)
  } finally { store.close() }
})

it('rejects oversized upstream JSON and context before decoding or calling the model', async () => {
  const store = openStore(':memory:')
  try {
    const app = createAskApp({ config: config(), units: [shortPost], store, log: () => {}, fetch: (async () => new Response('x'.repeat(65_537))) as typeof fetch })
    const body = await (await request(app, 'small')).json()
    expect(body).toEqual({ mode: 'search', reason: 'upstream_error', message: '', cached: false, citations: [{ n: 1, kind: 'post', sourceUrl: url }] })
    let calls = 0
    const huge = { ...shortPost, text: 'workflow '.repeat(120_000) }
    const largeApp = createAskApp({ config: config(), units: [huge], store, log: () => {}, fetch: (async () => { calls++; return fetchAnswer(answer([point()]))('unused') }) as typeof fetch })
    expect(await (await request(largeApp, 'workflow')).json()).toEqual({ mode: 'search', reason: 'unverified', message: '', cached: false, citations: [{ n: 1, kind: 'post', sourceUrl: url }] })
    expect(calls).toBe(0)
  } finally { store.close() }
})
