import { performance } from 'node:perf_hooks'
import { setImmediate as yieldToRequests } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { parseAnswer, type AnswerDiagnostics, type RejectedField } from '../server/ask/answer'
import { answerWithRewrite, buildRewriteMessages, feedbackSpans } from '../server/ask/rewrite'
import type { Unit } from '../server/ask/units'

const url = 'https://x.com/mattpocockuk/status/1000000000000000001'
const unit: Unit = { id: 'post:synthetic', kind: 'post', title: '', text: '', sourceUrl: url }
const field = (text: string): RejectedField => ({ name: 'point 1 text', text })
const fragments = (feedback: string) => JSON.parse(feedback.split('\n')[3]) as { field: string; fragment: string; occurrences: number }[]

it('regression: finds output overlap beyond the first forty characters without source-only context', () => {
  const text = 'We describe a separate route for a newcomer. Check Crimson lanterns later.'
  const spans = feedbackSpans([field(text)], [{ ...unit, text: 'SourcePrivateBefore Crimson lanterns SourcePrivateAfter' }])
  expect(spans).toEqual([{ field: 'point 1 text', fragment: 'Crimson lanterns', occurrences: 1 }])
  for (const s of spans) {
    expect(text).toContain(s.fragment)
    expect(s.fragment).not.toContain('SourcePrivate')
    expect(s.fragment).not.toContain('We describe')
  }
})

it.each(['title', 'text', 'quotes', 'explicit quote'] as const)('regression: finds overlap in retrieved %s', kind => {
  const local = { ...unit, [kind]: kind === 'quotes' ? [{ text: 'QuartzBeacon', url }] : 'QuartzBeacon' }
  const spans = feedbackSpans([field('An independent lead. QuartzBeacon')], [local], kind === 'explicit quote' ? ['QuartzBeacon'] : [])
  expect(spans).toEqual([{ field: 'point 1 text', fragment: 'QuartzBeacon', occurrences: 1 }])
})

it.each([
  ['Crimson lanterns', 'CRIMSON，lanterns', 'CRIMSON，lanterns'],
  ['Crimson lanterns', '𝑪ＲＩＭＳＯＮ，lanterns', '𝑪ＲＩＭＳＯＮ，lanterns'],
  ['Crimson', 'ⒸⓇⒾⓂⓈⓄⓃ', 'ⒸⓇⒾⓂⓈⓄⓃ'],
  ['caféline', 'cafe\u0301line', 'cafe\u0301line'],
  ['明确边界检查依赖', '独立提示。明确边界、检查依赖。', '明确边界、检查依赖'],
  ['x'.repeat(254) + 'Crimson' + '!'.repeat(1000) + 'lanterns', 'Crim—son \tlanterns', 'Crim—son \tlanterns'],
])('regression: normalizes overlap while retaining original output offsets (%#)', (source, text, expected) => {
  expect(feedbackSpans([field(text)], [{ ...unit, text: source }])).toEqual([
    { field: 'point 1 text', fragment: expected, occurrences: 1 },
  ])
})

it('regression: includes short source words and ranks repeated overlap ahead of a single longer term', () => {
  expect(feedbackSpans([field('PRs are useful. CRAP matters.')], [{ ...unit, text: 'PRs CRAP' }])).toEqual([
    { field: 'point 1 text', fragment: 'CRAP', occurrences: 1 },
    { field: 'point 1 text', fragment: 'PRs', occurrences: 1 },
  ])
  expect(feedbackSpans([field('CRAP one. CRAP two. CRAP three. TypeScript single.')], [{ ...unit, title: 'CRAP', text: 'TypeScript' }])).toEqual([
    { field: 'point 1 text', fragment: 'CRAP', occurrences: 3 },
    { field: 'point 1 text', fragment: 'TypeScript', occurrences: 1 },
  ])
})

it('regression: merges adjoining windows, expands complete words and bounds long UTF-16 spans', () => {
  const text = 'Our prefix abcdefghijklmnopqrs suffix.'
  expect(feedbackSpans([field(text)], [{ ...unit, text: 'defghijklmnopq' }])).toEqual([
    { field: 'point 1 text', fragment: 'abcdefghijklmnopqrs', occurrences: 1 },
  ])
  const astral = '𐐀'.repeat(25)
  const spans = feedbackSpans([field('😀' + astral)], [{ ...unit, text: astral }])
  expect(spans.map(s => s.fragment.length)).toEqual([40, 10])
  for (const span of spans) {
    expect(astral).toContain(span.fragment)
    for (const char of span.fragment) expect(char).toBe('𐐀')
  }
})

it('regression: returns at most twelve ranked fragments and never emits an unmatched prefix', () => {
  const terms = Array.from({ length: 16 }, (_, i) => `term${i}pqrstuv`)
  const text = 'Unmatched preface. ' + terms.join(' zzzzz ')
  const spans = feedbackSpans([field(text)], [{ ...unit, text: terms.join(' ') }])
  expect(spans).toHaveLength(12)
  expect(spans.slice(0, 2).map(s => s.fragment)).toEqual(['term10pqrstuv', 'term11pqrstuv'])
  for (const span of spans) {
    expect(terms).toContain(span.fragment)
    expect(span.fragment.length).toBeLessThanOrEqual(40)
  }
  expect(feedbackSpans([field('Unique unrelated commentary.')], [])).toEqual([])
})

it('regression: bounds raw and normalized feedback work without scanning unbounded tails', () => {
  const start = performance.now()
  expect(feedbackSpans([field('QuartzBeacon')], [{ ...unit, text: 'z'.repeat(1_000_000) + 'QuartzBeacon' }])).toEqual([])
  expect(feedbackSpans([field('x'.repeat(32_000) + 'QuartzBeacon')], [{ ...unit, text: 'QuartzBeacon' }])).toEqual([])
  const expanded = feedbackSpans([field('ﷺ'.repeat(32_000))], [{ ...unit, text: 'ﷺ'.repeat(1_000_000) }])
  expect(expanded.length).toBeLessThanOrEqual(12)
  expect(performance.now() - start).toBeLessThan(500)
})

it('regression: stops at normalized limits even when raw compatibility text is within the limit', () => {
  expect(feedbackSpans([field('ﷺ'.repeat(2000) + 'QuartzBeacon')], [{ ...unit, text: 'QuartzBeacon' }])).toEqual([])
  expect(feedbackSpans([field('QuartzBeacon')], [{ ...unit, text: 'ﷺ'.repeat(20_000) + 'QuartzBeacon' }])).toEqual([])
})

it('regression: production feedback yields to pending timers during preparation', async () => {
  let yielded = false
  const pending = yieldToRequests().then(() => { yielded = true })
  const diagnostics: AnswerDiagnostics = { reason: 'independence', scope: 'points', fields: [field('Crimson lanterns')] }
  const content = JSON.stringify({ found: true, title: '', points: [{ title: '', text: 'Crimson lanterns', sources: ['S1'] }] })
  const messages = await buildRewriteMessages([], content, diagnostics, [{ ...unit, text: 'Crimson lanterns' }])
  expect(yielded).toBe(true)
  expect(fragments(messages.at(-1)!.content)).toEqual([{ field: 'point 1 text', fragment: 'Crimson lanterns', occurrences: 1 }])
  await pending
})

it('regression: a failed answer-title isolation reports only that title', async () => {
  const source = 'Crimson lanterns guide harbor crews safely beyond winter shoals.'
  const diagnostics: AnswerDiagnostics = {}
  const content = JSON.stringify({ found: true, title: source, points: [{ title: '核查', text: '先核实条件，再选择方向。', sources: ['S1'] }] })
  expect(await parseAnswer(content, [{ ...unit, text: source }], 'https://site.example', diagnostics)).toBeUndefined()
  expect(diagnostics).toEqual({ reason: 'independence', scope: 'title', fields: [{ name: 'answer title', text: source }] })
  const feedback = (await buildRewriteMessages([], content, diagnostics, [{ ...unit, text: source }])).at(-1)!.content
  expect(JSON.parse(feedback.split('\n')[1])).toEqual(['answer title'])
  expect(feedback).toContain('answer title failed')
})

it('regression: reports only points that actually failed isolation, using their original numbers', async () => {
  const source = 'Crimson lanterns guide harbor crews safely beyond winter shoals.'
  const local = [{ ...unit, title: source, text: source }]
  const diagnostics: AnswerDiagnostics = {}
  const content = JSON.stringify({ found: true, title: '核查', points: [
    { title: '', text: '忽略无来源项。', sources: ['S99'] },
    { title: '判断', text: '先核实约束，再选择方向。', sources: ['S1'] },
    { title: '替换', text: source, sources: ['S1'] },
  ] })
  expect(await parseAnswer(content, local, 'https://site.example', diagnostics)).toBeUndefined()
  expect(diagnostics).toEqual({ reason: 'independence', scope: 'points', fields: [
    { name: 'point 3 title', text: '替换' }, { name: 'point 3 text', text: source },
  ] })
  const feedback = (await buildRewriteMessages([], content, diagnostics, local)).at(-1)!.content
  expect(JSON.parse(feedback.split('\n')[1])).toEqual(['point 3 title', 'point 3 text'])
  expect(fragments(feedback).every(f => f.field === 'point 3 text')).toBe(true)
})

it('regression: a joint-only failure reports all retained fields and describes combined overlap', async () => {
  const source = 'abcdefgh ijklmnop qrstuvwx yzabcdef'
  const points = Array.from({ length: 5 }, (_, i) => ({ title: '', text: source.slice(i * 7, (i + 1) * 7), sources: ['S1'] }))
  const content = JSON.stringify({ found: true, title: '', points })
  const diagnostics: AnswerDiagnostics = {}
  expect(await parseAnswer(content, [{ ...unit, text: source }], 'https://site.example', diagnostics)).toBeUndefined()
  expect(diagnostics).toEqual({ reason: 'independence', scope: 'joint', fields: points.map((p, i) => ({ name: `point ${i + 1} text`, text: p.text.trim() })) })
  const feedback = (await buildRewriteMessages([], content, diagnostics, [{ ...unit, text: source }])).at(-1)!.content
  expect(feedback).toContain('combined overlap is too high')
})

it('regression: exposes rewrite rejection diagnostics from the same production parse', async () => {
  const source = 'Crimson lanterns guide harbor crews safely beyond winter shoals.'
  const local = [{ ...unit, text: source }]
  const content = JSON.stringify({ found: true, title: '', points: [{ title: '', text: source, sources: ['S1'] }] })
  for (const [rewritten, expected] of [[content, 'independence'], ['{bad json', 'shape']]) {
    const rewriteDiagnostics: AnswerDiagnostics = {}
    expect(await answerWithRewrite({ content, units: local, siteUrl: 'https://site.example', messages: [], rewriteDiagnostics,
      rewrite: async () => ({ content: rewritten, inputTokens: 0, outputTokens: 0 }),
    })).toBeUndefined()
    expect(rewriteDiagnostics.reason).toBe(expected)
  }
})

it('regression: production feedback preserves original model whitespace and format characters', async () => {
  const source = 'Crimson lanterns guide harbor crews safely beyond winter shoals.'
  const original = source.replace('Crimson lanterns', 'Crim\u200bson \n lanterns')
  const diagnostics: AnswerDiagnostics = {}
  const local = [{ ...unit, text: source }]
  const content = JSON.stringify({ found: true, title: '', points: [{ title: '', text: original, sources: ['S1'] }] })
  expect(await parseAnswer(content, local, 'https://site.example', diagnostics)).toBeUndefined()
  expect(diagnostics.fields).toEqual([{ name: 'point 1 text', text: original }])
  const feedback = (await buildRewriteMessages([], content, diagnostics, local)).at(-1)!.content
  const spans = fragments(feedback)
  expect(spans.some(s => s.fragment.includes('\u200b') && s.fragment.includes('\n'))).toBe(true)
  for (const span of spans) expect(original).toContain(span.fragment)
})

it('regression: scans every answer field even when the first rejection stops at the answer title', async () => {
  const title = 'Crimson lanterns guide harbor crews safely beyond winter shoals.'
  const pointTitle = 'Silent engines preserve orbital navigation'
  const text = 'Amber beacons illuminate distant meadows through winter nights.'
  const otherText = 'Silver anchors steady overnight shipping lanes.'
  const local: Unit[] = [
    { ...unit, text: title },
    { ...unit, id: 'post:second', title: pointTitle, text, sourceUrl: url.replace(/1$/, '2') },
    { ...unit, id: 'method:third', kind: 'method', quotes: [{ text: otherText, url }] },
  ]
  const value = { found: true, title, points: [
    { title: pointTitle, text, sources: ['S2'] },
    { title: 'Blank slate', text: otherText, sources: ['S1'] },
  ] }
  const content = JSON.stringify(value), diagnostics: AnswerDiagnostics = {}
  expect(await parseAnswer(content, local, 'https://site.example', diagnostics)).toBeUndefined()
  expect(diagnostics.scope).toBe('title')
  expect(diagnostics.fields).toEqual([{ name: 'answer title', text: title }])
  const feedback = (await buildRewriteMessages([], content, diagnostics, local)).at(-1)!.content
  expect(JSON.parse(feedback.split('\n')[1])).toEqual(['answer title'])
  const spans = fragments(feedback)
  for (const [name, words] of [['answer title', 'Crimson lanterns'], ['point 1 title', 'Silent engines'], ['point 1 text', 'Amber beacons'], ['point 2 text', 'Silver anchors']]) {
    expect(spans.some(s => s.field === name && s.fragment.includes(words)), name).toBe(true)
  }
  expect(spans.length).toBeLessThanOrEqual(12)
  for (const span of spans) {
    const parts = span.field.split(' ')
    const original = span.field === 'answer title' ? title : value.points[Number(parts[1]) - 1][parts[2] as 'title' | 'text']
    expect(original).toContain(span.fragment)
    expect(span.fragment.length).toBeLessThanOrEqual(40)
  }
})

it.each([
  ['Crimson lanterns guard quiet harbors.', 'Crimson lanterns guard quiet harbors'],
  ['abcdefghijklmnopqrstuvwxy', 'abcdefghijklmnopqrstuvwxy'],
])('regression: prioritizes a copied phrase or long run over frequent short words (%#)', (source, expected) => {
  expect(feedbackSpans([field('CRAP independently. '.repeat(20) + source)], [{ ...unit, title: 'CRAP', text: source }])).toEqual([
    { field: 'point 1 text', fragment: expected, occurrences: 1 },
    { field: 'point 1 text', fragment: 'CRAP', occurrences: 20 },
  ])
})

it('regression: feedback instructs a shorter answer with fewer repetitions and no quote markers', async () => {
  const content = JSON.stringify({ found: true, title: 'Crimson lanterns', points: [{ title: '', text: 'Crimson lanterns', sources: ['S1'] }] })
  const diagnostics: AnswerDiagnostics = { reason: 'independence', scope: 'title', fields: [{ name: 'answer title', text: 'Crimson lanterns' }] }
  const feedback = (await buildRewriteMessages([], content, diagnostics, [{ ...unit, text: 'Crimson lanterns' }])).at(-1)!.content
  for (const requirement of [
    'Rewrite in your own words; technical terms (product, library, command names) may be kept.',
    'The check counts overlap across the whole answer.',
    'Keep at most 4 points: drop the points listed as failing or the least important points rather than rewording them lightly.',
    'The rewrite may have fewer points than the first answer.',
    'Keep each point text to one or two short sentences.',
    'Mention names, product/library names, years and version numbers at most once in the whole answer, and do not start titles with them.',
    'Omit quote markers (quotes count as overlap).',
    'Do not reuse any listed span or close paraphrases of whole source sentences.',
    'Return the same JSON shape and language.',
    'Source IDs may only come from those originally provided.',
  ]) expect(feedback).toContain(requirement)
})
