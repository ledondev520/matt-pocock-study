import { expect, it } from 'vitest'
import { buildMessages, parseAnswer } from '../server/ask/answer'
import { explanationsAreIndependent, quotesWithinBudget } from '../server/ask/excerpts'
import { chunkUnits } from '../server/ask/methodology-adapter'
import { originalPost, type Unit } from '../server/ask/units'
import { q3bChunks, q3bOutput } from './ask-q3-b.fixture'

const siteUrl = 'https://site.example'
const url = 'https://x.com/mattpocockuk/status/1000000000000000001'
const parse = (value: unknown, units: Unit[]) => parseAnswer(JSON.stringify(value), units, siteUrl)
const answer = (text: string, sources = ['S1'], quote?: unknown) => ({ found: true, title: '', points: [{ title: '', text, sources, quote }] })
const post = (text: string): Unit => ({ id: 'post:probe', kind: 'post', title: '', text, sourceUrl: url })

it('keeps all five real Q3-b points with text and displayed wrapper labels', async () => {
  const units = chunkUnits(q3bChunks)
  expect(units).toHaveLength(8)
  expect(units.every(u => u.titleOrigin === 'methodology' && originalPost(u).title === '')).toBe(true)
  const parsed = await parse(q3bOutput, units)
  expect(parsed?.found).toBe(true)
  if (!parsed?.found) throw new Error('Q3-b must return a full answer')
  expect(parsed.title).toBe(q3bOutput.title)
  expect(parsed.points.map(p => ({ title: p.title, text: p.text }))).toEqual(q3bOutput.points.map(p => ({ title: p.title, text: p.text })))
  expect(parsed.points).toHaveLength(5)
  expect(parsed.points.every(p => p.text.trim() && p.quote?.length === 20)).toBe(true)
  expect(parsed.points.map(p => p.cites)).toEqual([[1], [1], [2], [3], [4]])
  expect(parsed.citations.map(c => c.title)).toEqual(['Testing and TDD', ...Array(3).fill('Testing and TDD (history)')])

  // Identical wrapper-shaped strings alone cannot grant the exemption.
  expect(await parse(q3bOutput, units.map(u => ({ ...u, titleOrigin: undefined })))).toBeUndefined()
})

it('sets provenance only in the adapter and ignores model-injected title provenance', async () => {
  const units = chunkUnits(q3bChunks).map(u => ({ ...u, titleOrigin: undefined }))
  const before = structuredClone(units)
  const forged = {
    ...q3bOutput, titleOrigin: 'methodology', units: chunkUnits(q3bChunks),
    citations: [{ n: 1, titleOrigin: 'methodology' }],
    points: q3bOutput.points.map(p => ({ ...p, titleOrigin: 'methodology' })),
  }
  expect(await parse(forged, units)).toBeUndefined()
  expect(units).toEqual(before)
  expect(buildMessages('TDD?', 'zh', chunkUnits(q3bChunks))[1].content).not.toContain('titleOrigin')
})

// The diagnostic harness's 34 copy counterexamples already run in ask-excerpts.test.ts
// (the `regressions` table: parser, guard, API and cache assertions). Keep them there.
// These are its five extra probes (phase2-controls.mts; phase2-extra.mts checks real points).
it('rejects a third shared sentence after two quoted sentences', async () => {
  const quoted = 'Start small. Adjust quickly.'
  const units = [post(`${quoted} Build trust. Expand carefully.`)]
  expect(await explanationsAreIndependent(['Build trust.'], units, [url], [{ text: quoted, url }])).toBe(false)
  expect(await parse(answer('Build trust.', ['S1'], { chunk_id: 'S1', start: 0, end: quoted.length }), units)).toBeUndefined()
})

it('rejects 26 short source words copied with suffixes', async () => {
  const units = [post(Array(26).fill('cat').join(' '))]
  const text = Array(26).fill('catX').join(' ')
  expect(await explanationsAreIndependent([text], units, [url])).toBe(false)
  expect(await parse(answer(text), units)).toBeUndefined()
})

const protectedText = 'Comprehensive documentation strengthens maintainability through predictable configuration boundaries.'
it('rejects substantive copying from an uncited original', async () => {
  const units = [post('Our independent context.'), { ...post(protectedText), id: 'post:uncited', sourceUrl: url.replace(/1$/, '2') }]
  expect(await explanationsAreIndependent([protectedText], units, [url])).toBe(false)
  expect(await parse(answer(protectedText), units)).toBeUndefined()
})

it('still checks a genuine post title, including when displayed as a citation', async () => {
  const units = [{ ...post('Unrelated additional context.'), title: protectedText }]
  expect(await explanationsAreIndependent([protectedText], units, [url])).toBe(false)
  expect(await parse(answer(protectedText), units)).toBeUndefined()
  expect(await parse(answer('核实边界后继续。'), units)).toBeUndefined()
  // Adapter provenance alone cannot discard a genuine title: originalPost stays authoritative.
  expect(await parse(answer('核实边界后继续。'), units.map(u => ({ ...u, titleOrigin: 'methodology' })))).toBeUndefined()
})

it('rejects three rendered quote sentences sharing one original URL', async () => {
  const quoted = 'Start small. Adjust quickly.'
  const third = 'Build trust.'
  expect(quotesWithinBudget([{ text: quoted, url }, { text: third, url }])).toBe(false)
  expect(await parse({ found: true, title: '', points: [
    ...answer('核实边界。', ['S1'], { chunk_id: 'S1', start: 0, end: quoted.length }).points,
    ...answer('然后继续。', ['S1'], { chunk_id: 'S1', start: quoted.length + 1, end: quoted.length + 1 + third.length }).points,
  ] }, [post(`${quoted} ${third}`)])).toBeUndefined()
})
