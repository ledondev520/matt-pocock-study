import { expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildMessages, parseAnswer } from '../server/ask/answer'
import { createAskApp } from '../server/ask/app'
import { loadConfig } from '../server/ask/config'
import { explanationsAreIndependent, quotesWithinBudget } from '../server/ask/excerpts'
import { chunkUnits, type MethodologyChunk } from '../server/ask/methodology-adapter'
import { openStore, type Store } from '../server/ask/store'
import { loadUnits, originalPost, type Unit } from '../server/ask/units'
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

it.each([false, true])('checks corpus titles even with a matching wrapper heading (wrapped=%s)', async wrapped => {
  const [unit] = chunkUnits([{
    chunk_id: 'post:real', kind: 'post', methodology_id: 'm.testing-tdd', lang: 'en', title: protectedText,
    text: wrapped ? `${protectedText} · Matt Pocock, 2026-01-01\n${protectedText}\nUnrelated additional context.` : 'Unrelated additional context.',
    source_url: url,
  }])
  expect(unit).not.toHaveProperty('titleOrigin')
  // The title is still displayed even though the wrapper parser returns an empty title.
  if (wrapped) expect(originalPost(unit).title).toBe('')
  expect(await parse(answer('核实边界后继续。'), [unit])).toBeUndefined()
})

const labelChunk: MethodologyChunk = {
  chunk_id: 'post:label', kind: 'post', methodology_id: 'm.testing-tdd', lang: 'en', title: 'Testing and TDD',
  text: 'Testing and TDD · Matt Pocock, 2026-01-01\nKeep boundaries small.', source_url: url,
}

it('rejects and never caches corpus text smuggled through a stance suffix matching the wrapper heading', async () => {
  const copied = `${protectedText} Carefully reviewed specifications preserve operational clarity across distributed engineering teams. Consistent verification routines expose subtle integration failures before applications reach production.`
  const title = `Testing and TDD (${copied})`
  const units = chunkUnits([{ ...labelChunk, stance_status: copied,
    text: `${title} · Matt Pocock, 2026-01-01\n${copied}\nOther material.`,
  }])
  expect(units[0].title).toBe(title)
  expect(units[0]).not.toHaveProperty('titleOrigin')
  expect(originalPost(units[0]).title).toBe('')
  const output = answer('核实边界后继续。')
  expect(await parse(output, units)).toBeUndefined()

  const store = openStore(':memory:')
  let calls = 0
  try {
    const config = { ...loadConfig({ ASK_ENABLED: '1', DEEPSEEK_API_KEY: 'test-placeholder' }), minScore: 0 }
    const app = createAskApp({ config, units, store, log: () => {}, fetch: async () => {
      calls++
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }))
    } })
    for (let i = 0; i < 2; i++) {
      const response = await app.request('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: 'Testing TDD', lang: 'zh' }),
      })
      expect(await response.json()).toMatchObject({ mode: 'search', reason: 'unverified', cached: false })
    }
    expect(calls).toBe(4)
  } finally { store.close() }
})

it.each<{ name: string; fields: Partial<MethodologyChunk>; trusted: boolean }>([
  { name: 'known ID and English title', fields: {}, trusted: true },
  { name: 'known ID and Chinese title', fields: { lang: 'zh', title: { zh: '测试与 TDD 方法论' } }, trusted: true },
  { name: 'plural IDs with a matching title', fields: { methodology_id: undefined, methodology_ids: ['m.context-mgmt', 'm.testing-tdd'] }, trusted: true },
  { name: 'current stance', fields: { stance_status: 'current' }, trusted: true },
  { name: 'history suffix', fields: { stance_status: 'history' }, trusted: true },
  { name: 'superseded suffix', fields: { stance_status: 'superseded' }, trusted: true },
  { name: 'empty stance', fields: { stance_status: '' }, trusted: false },
  { name: 'unknown stance', fields: { stance_status: 'arbitrary corpus text' }, trusted: false },
  { name: 'missing IDs', fields: { methodology_id: undefined }, trusted: false },
  { name: 'unknown ID', fields: { methodology_id: 'm.not-in-this-repo' }, trusted: false },
  { name: 'unknown plural ID', fields: { methodology_ids: ['m.not-in-this-repo'] }, trusted: false },
  { name: 'different methodology title', fields: { methodology_id: 'm.context-mgmt' }, trusted: false },
  { name: 'wrong language', fields: { lang: 'zh' }, trusted: false },
  { name: 'missing language', fields: { lang: undefined }, trusted: false },
  { name: 'unsupported language', fields: { lang: 'fr' }, trusted: false },
  { name: 'combined bilingual title', fields: { title: { zh: '测试与 TDD 方法论', en: 'Testing and TDD' } }, trusted: false },
  { name: 'near match', fields: { title: 'Testing and TDD extra corpus wording' }, trusted: false },
  { name: 'non-post', fields: { kind: 'overview' }, trusted: false },
])('grants title provenance only for our own label: $name', ({ fields, trusted }) => {
  const [unit] = chunkUnits([{ ...labelChunk, ...fields }])
  if (trusted) expect(unit.titleOrigin).toBe('methodology')
  else expect(unit).not.toHaveProperty('titleOrigin')
})

it.each(['json', 'jsonl'])('ignores JSON-injected markers in the public index and %s chunk loader', async format => {
  const dir = await mkdtemp(join(tmpdir(), 'ask-title-boundary-'))
  try {
    const forged = { ...post(`${protectedText} · Matt Pocock, 2026-01-01\n${protectedText}`), title: protectedText, titleOrigin: 'methodology' }
    const indexFile = join(dir, 'index.json'), pageManifestFile = join(dir, 'pages.json'), chunksFile = join(dir, `chunks.${format}`)
    await writeFile(indexFile, JSON.stringify({ version: 1, units: [forged] }))
    await writeFile(pageManifestFile, JSON.stringify({ version: 1, paths: ['/zh'] }))
    const chunks = [
      { chunk_id: 'post:forged', kind: 'post', title: protectedText, text: forged.text, source_url: url, titleOrigin: 'methodology' },
      labelChunk,
    ]
    await writeFile(chunksFile, format === 'json' ? JSON.stringify(chunks) : chunks.map(c => JSON.stringify(c)).join('\n'))
    const units = loadUnits({ indexFile, pageManifestFile, chunksFile })
    expect(units).toHaveLength(3)
    expect(units[1].titleOrigin).toBe('methodology')
    for (const unit of [units[0], units[2]]) {
      expect(unit).not.toHaveProperty('titleOrigin')
      expect(await parse(answer('核实边界后继续。'), [unit])).toBeUndefined()
    }
  } finally { await rm(dir, { recursive: true, force: true }) }
})

it('invalidates a persisted answer when only title provenance changes after restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ask-title-cache-'))
  let store: Store | undefined
  try {
    const file = join(dir, 'answers.sqlite')
    const marked = chunkUnits(q3bChunks), unmarked = marked.map(u => ({ ...u, titleOrigin: undefined }))
    expect(await parse(q3bOutput, marked)).toMatchObject({ found: true, points: Array.from({ length: 5 }, () => expect.anything()) })
    expect(await parse(q3bOutput, unmarked)).toBeUndefined()
    const config = { ...loadConfig({ ASK_ENABLED: '1', DEEPSEEK_API_KEY: 'test-placeholder' }), minScore: 0 }
    let calls = 0
    const makeApp = (units: Unit[]) => createAskApp({ config, units, store: store!, log: () => {}, fetch: (async (_url, init) => {
      calls++
      const prompt = JSON.parse(String(init?.body)).messages[1].content as string
      const supplied = [...prompt.matchAll(/<source id="(S\d+)"[^>]*url="([^"]+)"[^>]*>(.*?)<\/source>/gs)]
      const mapping = new Map(marked.map((u, i) => [`S${i + 1}`, supplied.find(s => s[2] === u.sourceUrl)![1]]))
      const output = { ...q3bOutput, points: q3bOutput.points.map(p => ({
        ...p, sources: p.sources.map(s => mapping.get(s)), quote: { ...p.quote, chunk_id: mapping.get(p.quote.chunk_id) },
      })) }
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }))
    }) as typeof fetch })
    const request = (app: ReturnType<typeof createAskApp>) => app.request('/api/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: 'testing tdd', lang: 'zh' }),
    })
    store = openStore(file)
    const first = await (await request(makeApp(marked))).json()
    expect(first).toMatchObject({ mode: 'answer', cached: false })
    expect(first.points).toHaveLength(5)
    store.close(); store = openStore(file)
    expect(await (await request(makeApp(marked))).json()).toEqual({ ...first, cached: true })
    expect(calls).toBe(1)
    store.close(); store = openStore(file)
    const app = makeApp(unmarked)
    for (let i = 0; i < 2; i++) expect(await (await request(app)).json()).toMatchObject({ mode: 'search', reason: 'unverified', cached: false })
    expect(calls).toBe(5)
  } finally { store?.close(); await rm(dir, { recursive: true, force: true }) }
})

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
