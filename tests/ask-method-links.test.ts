import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createAskApp } from '../server/ask/app'
import { citationFor, parseAnswer } from '../server/ask/answer'
import { loadConfig } from '../server/ask/config'
import { chunkUnits, type MethodologyChunk } from '../server/ask/methodology-adapter'
import { loadPageManifest, parsePageManifest } from '../server/ask/page-manifest'
import { openStore } from '../server/ask/store'
import { loadUnits } from '../server/ask/units'
import { checkAskMethodLinks } from '../scripts/ask-method-links'

const source = 'https://x.com/mattpocockuk/status/1000000000000000001'
const answer = JSON.stringify({ found: true, points: [{ title: 'Review', text: 'Split by risk.', sources: ['S1'] }] })
let dir: string, indexFile: string, chunksFile: string, pageManifestFile: string
const chunk = (lang: 'zh' | 'en', slug = 'pr-review'): MethodologyChunk => ({
  key: `${lang}:m.${slug}#s4`, chunk_id: `m.${slug}#s4`, kind: 'step', lang,
  title: 'Review', text: 'Split a pull request by risk.', source_url: source,
})

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ask-links-'))
  indexFile = join(dir, 'index.json'); chunksFile = join(dir, 'chunks.jsonl'); pageManifestFile = join(dir, 'pages.json')
  await writeFile(indexFile, JSON.stringify({ version: 1, units: [] }))
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })
const manifest = (paths: string[]) => writeFile(pageManifestFile, JSON.stringify({ version: 1, paths }))

for (const lang of ['zh', 'en'] as const) {
  for (const exists of [true, false]) {
    it(`${lang}: ${exists ? 'keeps' : 'omits'} method links according to the generated pages, retaining the original post`, async () => {
      // The other language exists even in the missing case: never borrow its page.
      await manifest([`/${lang === 'zh' ? 'en' : 'zh'}/methods/pr-review`, ...(exists ? [`/${lang}/methods/pr-review`] : [])])
      await writeFile(chunksFile, JSON.stringify(chunk(lang)))
      const units = loadUnits({ indexFile, chunksFile, pageManifestFile })
      const parsed = await parseAnswer(answer, units, 'https://site.example')
      expect(parsed).toMatchObject({ found: true, citations: [{ sourceUrl: source }] })
      const citation = citationFor(units[0], 1, 'https://site.example')
      expect(citation.siteUrl).toBe(exists ? `https://site.example/${lang}/methods/pr-review#s4` : undefined)
      expect(parsed && parsed.found && parsed.citations[0]).toEqual(citation)
    })
  }

  it(`${lang}: checks chunk-provided paths on post chunks and the public index too`, async () => {
    await manifest([`/${lang}/methods/present`])
    const chunks = [
      { ...chunk(lang), sitePath: `/${lang}/methods/present#s4` },
      { ...chunk(lang, 'missing'), kind: 'post', sitePath: `/${lang}/methods/missing` },
    ]
    await writeFile(chunksFile, JSON.stringify(chunks))
    await writeFile(indexFile, JSON.stringify({ version: 1, units: chunkUnits([chunk(lang, 'also-missing')]) }))
    const units = loadUnits({ indexFile, chunksFile, pageManifestFile })
    expect(units.map(u => u.sitePath)).toEqual([`/${lang}/methods/present#s4`, undefined, undefined])
    expect(units.every(u => u.sourceUrl === source)).toBe(true)
  })

  it(`${lang}: a removed method page cannot survive in a cached answer after restart`, async () => {
    const store = openStore(':memory:')
    try {
      const config = { ...loadConfig({ ASK_ENABLED: '1', DEEPSEEK_API_KEY: 'test-placeholder' }), minScore: 0 }
      await writeFile(chunksFile, JSON.stringify(chunk(lang)))
      const request = (app: ReturnType<typeof createAskApp>) => app.request('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: 'pull request risk', lang }),
      })
      let calls = 0
      const app = () => createAskApp({ config, store, units: loadUnits({ indexFile, chunksFile, pageManifestFile }), log: () => {},
        fetch: (async () => { calls++; return new Response(JSON.stringify({ choices: [{ message: { content: answer } }] })) }) as typeof fetch })
      await manifest([`/${lang}/methods/pr-review`])
      const firstApp = app()
      const first = await (await request(firstApp)).json()
      expect(first).toMatchObject({ mode: 'answer', citations: [{ siteUrl: `https://matt.withkeya.com/${lang}/methods/pr-review#s4` }] })
      expect((await (await request(firstApp)).json()).cached).toBe(true)
      expect(calls).toBe(1)
      await manifest(['/zh', '/en'])
      const next = await (await request(app())).json()
      expect(next).toMatchObject({ mode: 'answer', cached: false, citations: [{ sourceUrl: source }] })
      expect(next.citations[0]).not.toHaveProperty('siteUrl')
      expect(calls).toBe(2)
    } finally { store.close() }
  })
}

it('keeps language-specific ids and supports existing singular quotes without changing chunk format', () => {
  const units = chunkUnits(['zh', 'en'].map(lang => ({ ...chunk(lang as 'zh' | 'en'), quote: { text: 'short quote', url: source } })))
  expect(units.map(u => u.id)).toEqual(['method:zh:m.pr-review#s4', 'method:en:m.pr-review#s4'])
  expect(new Set(units.map(u => u.id)).size).toBe(2)
  expect(units.map(u => u.sitePath)).toEqual(['/zh/methods/pr-review#s4', '/en/methods/pr-review#s4'])
  expect(units.every(u => u.quotes?.[0].url === source)).toBe(true)
})

it('uses exporter paths and keeps post ids while deduplicating retrieval units', () => {
  const chunks: MethodologyChunk[] = [
    { ...chunk('en'), sitePath: '/en/methods/testing-tdd#s2' },
    { ...chunk('en'), kind: 'post', key: 'en:post:123#p2', chunk_id: 'post:123#p2', sitePath: '/en/methods/testing-tdd' },
  ]
  const units = chunkUnits([...chunks, ...chunks])
  expect(units.map(u => ({ id: u.id, kind: u.kind, sitePath: u.sitePath }))).toEqual([
    { id: 'method:en:m.pr-review#s4', kind: 'method', sitePath: '/en/methods/testing-tdd#s2' },
    { id: 'post:123#p2', kind: 'post', sitePath: '/en/methods/testing-tdd' },
  ])
})

it('rejects missing, invalid or ambiguous page manifests before loading units', async () => {
  expect(() => loadUnits({ indexFile, pageManifestFile })).toThrow()
  for (const raw of [null, [], { version: 2, paths: ['/zh'] }, { version: 1, paths: [] },
    ...['/zh/404', '//evil.example', '/zh/methods/a#s1', '/zh/methods/a/', '/zh/../en', '/zh?x', 1].map(path => ({ version: 1, paths: [path] })),
    { version: 1, paths: ['/zh', '/zh'] }]) expect(() => parsePageManifest(raw)).toThrow(/manifest/)
  await writeFile(pageManifestFile, '{}')
  expect(() => loadUnits({ indexFile, pageManifestFile })).toThrow(/manifest/)
  expect(loadConfig({}).pageManifestFile).toBe('dist/page-manifest.json')
  expect(loadConfig({ ASK_PAGE_MANIFEST: 'custom.json' }).pageManifestFile).toBe('custom.json')
})

it('the read-only checker lists every unique method link, counts missing links and leaves both inputs intact', async () => {
  await manifest(['/zh/methods/pr-review', '/en/methods/pr-review'])
  // Duplicate ids must not conceal a different target; explicit paths take priority over derivation.
  const chunks = [chunk('zh'), chunk('en'), chunk('zh', 'missing'), chunk('en', 'missing'),
    { ...chunk('zh'), sitePath: '/en/methods/also-missing' }]
  await writeFile(chunksFile, chunks.map(c => JSON.stringify(c)).join('\n'))
  const before = await Promise.all([readFile(chunksFile), readFile(pageManifestFile)])
  expect(checkAskMethodLinks(chunksFile, pageManifestFile)).toHaveLength(5)
  const run = () => execFileSync('sh', ['scripts/check-ask-method-links', pageManifestFile], {
    env: { PATH: process.env.PATH, ASK_CHUNKS_FILE: chunksFile }, encoding: 'utf8', stdio: 'pipe',
  })
  try { run(); expect.fail('missing pages must exit nonzero') } catch (error) {
    const failure = error as { status: number; stdout: string }
    expect(failure.status).toBe(1)
    expect(failure.stdout).toContain('Method links: 5, missing: 3')
    expect(failure.stdout).toContain('OK /en/methods/pr-review#s4')
    expect(failure.stdout).toContain('MISSING /zh/methods/missing#s4')
    expect(failure.stdout).not.toContain('Split a pull request')
  }
  expect(await Promise.all([readFile(chunksFile), readFile(pageManifestFile)])).toEqual(before)
  await manifest(['/zh/methods/pr-review', '/en/methods/pr-review', '/zh/methods/missing', '/en/methods/missing', '/en/methods/also-missing'])
  expect(run()).toContain('Method links: 5, missing: 0')
  expect(loadPageManifest(pageManifestFile).size).toBe(5)
})
