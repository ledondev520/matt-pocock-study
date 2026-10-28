import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { chunks, getMethodology, listMethodologies, loadMethodologies, todaysMethodology } from '../scripts/methods'
import { importMethods } from '../scripts/import-methods'
import { checkQuotes, loadSources } from '../scripts/check-method-quotes'
import { excerpt, postChunks, scanChunk, splitText, type AskChunk } from '../scripts/build-ask-chunks'
import { MethodPage, MethodsIndex } from '../src/Methods'
import { buildChunks, CHUNK_MAX, forDisplay, currentLabel, DOMAINS, domainLabel, methodsTitle, sectionTitles, summarize, translationLabel, validateMethodology, type Methodology } from '../src/lib/methods'
import type { Lang } from '../src/lib/lang'

const sets = loadMethodologies()
const shown = sets.map(forDisplay)
const CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/
const tmp = () => mkdtempSync(join(tmpdir(), 'methods-'))
const sample = () => structuredClone(getMethodology('pr-review')!) as unknown as Record<string, unknown>

describe('methodology data', () => {
  it('loads every set in data/methods and each one validates', () => {
    expect(sets.length).toBe(readdirSync('data/methods').filter(f => f.endsWith('.json')).length)
    for (const m of sets) expect(validateMethodology(m), m.id).toEqual([])
    expect(new Set(sets.map(m => m.id)).size).toBe(sets.length)
  })
  it('keeps the publishing status and marks thin sets', () => {
    for (const m of sets) expect(['draft', 'published']).toContain(m.status)
    expect(sets.filter(m => m.thin).map(m => m.id).sort()).toEqual(['m.educator-career', 'm.ts-migration', 'm.write-docs'])
    expect(listMethodologies('en').find(s => s.id === 'm.write-docs')).toMatchObject({ thin: true, status: 'draft' })
  })
  it('rejects invalid sets with field paths', () => {
    const bad = sample()
    delete bad.claim
    ;(bad.steps as { id: string }[])[0]!.id = 'm.pr-review#s9'
    bad.status = 'live'
    bad.thin = false
    bad.extra = 1
    const errors = validateMethodology(bad).join('\n')
    expect(errors).toMatch(/\$\.claim/)
    expect(errors).toMatch(/steps\[0\]\.id/)
    expect(errors).toMatch(/\$\.status/)
    expect(errors).toMatch(/\$\.thin/)
    expect(errors).toMatch(/unknown field extra/)
  })
  it('requires English without Chinese and quotes of at most 25 words', () => {
    const bad = sample() as unknown as Methodology
    bad.title = { zh: bad.title.zh, en: '' }
    bad.claim.text.en = '中文'
    bad.steps[0]!.anchors[0]!.quote = Array(26).fill('word').join(' ')
    const errors = validateMethodology(bad).join('\n')
    expect(errors).toMatch(/title/)
    expect(errors).toMatch(/claim/)
    expect(errors).toMatch(/26 words/)
  })
  it('the loader names the file when a set is invalid or misnamed', () => {
    const dir = tmp()
    writeFileSync(join(dir, 'other-name.json'), JSON.stringify(sample()))
    expect(() => loadMethodologies(dir)).toThrow(/other-name\.json/)
  })
  it('exposes the module interface', () => {
    const zh = listMethodologies('zh'), en = listMethodologies('en')
    expect(zh).toHaveLength(sets.length)
    expect(en.every(s => !CJK.test(s.title + s.claim + (s.question ?? '')))).toBe(true)
    expect(getMethodology('m.pr-review')?.id).toBe('m.pr-review')
    expect(getMethodology('pr-review')?.id).toBe('m.pr-review')
    expect(getMethodology('nope')).toBeUndefined()
    const a = todaysMethodology('2026-10-28'), b = todaysMethodology('2026-10-28'), c = todaysMethodology('2026-10-29')
    expect(a?.id).toBe(b?.id)
    expect(a?.id).not.toBe(c?.id)
  })
})

describe('import', () => {
  const source = () => {
    const root = tmp(), dir = join(root, 'methodologies')
    mkdirSync(join(dir, 'm.pr-review'), { recursive: true })
    mkdirSync(join(dir, 'm.not-indexed'), { recursive: true })
    const zh = JSON.parse(JSON.stringify(getMethodology('pr-review'), (k, v) => v && typeof v === 'object' && 'zh' in v && 'en' in v ? { zh: v.zh } : v))
    writeFileSync(join(dir, 'm.pr-review', 'methodology.json'), JSON.stringify(zh))
    writeFileSync(join(dir, 'm.not-indexed', 'methodology.json'), JSON.stringify({ ...zh, id: 'm.not-indexed' }))
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ methodologies: [{ id: 'm.pr-review', flags: ['thin'], files: { json: 'methodologies/m.pr-review/methodology.json' } }] }))
    return { dir, out: tmp() }
  }
  it('imports only indexed sets, applies the English overlay and is idempotent', () => {
    const { dir, out } = source(), log = () => {}
    const i18nDir = join(out, 'i18n'), dataDir = join(out, 'data')
    const first = importMethods(dir, { dataDir, i18nDir, skeleton: true, log })
    expect(first.skipped.map(s => s.id)).toEqual(['m.pr-review'])
    const overlay = JSON.parse(readFileSync(join(i18nDir, 'pr-review.en.json'), 'utf8')) as Record<string, { zh: string; en: string }>
    const repo = JSON.parse(readFileSync('data/methods-i18n/pr-review.en.json', 'utf8')) as Record<string, { zh: string; en: string }>
    for (const k of Object.keys(overlay)) overlay[k]!.en = repo[k]?.en ?? 'x'
    writeFileSync(join(i18nDir, 'pr-review.en.json'), JSON.stringify(overlay))
    expect(importMethods(dir, { dataDir, i18nDir, log }).written).toEqual(['m.pr-review'])
    expect(importMethods(dir, { dataDir, i18nDir, log }).unchanged).toEqual(['m.pr-review'])
    expect(readdirSync(dataDir)).toEqual(['pr-review.json'])
    expect(JSON.parse(readFileSync(join(dataDir, 'pr-review.json'), 'utf8')).thin).toBe(true)
  })
  it('treats a stale translation (the Chinese changed) as missing', () => {
    const { dir, out } = source(), log = () => {}
    const i18nDir = join(out, 'i18n')
    mkdirSync(i18nDir)
    const repo = JSON.parse(readFileSync('data/methods-i18n/pr-review.en.json', 'utf8')) as Record<string, { zh: string; en: string }>
    const missing = () => Number(/(\d+) fields need English/.exec(importMethods(dir, { dataDir: join(out, 'data'), i18nDir, log }).skipped[0]?.reasons.join() ?? '')?.[1] ?? 0)
    writeFileSync(join(i18nDir, 'pr-review.en.json'), JSON.stringify(repo))
    const before = missing()
    repo['claim.text']!.zh = 'changed'
    writeFileSync(join(i18nDir, 'pr-review.en.json'), JSON.stringify(repo))
    expect(missing()).toBe(before + 1)
  })
})

describe('chunks', () => {
  it('builds overview, step, pitfalls and evolution chunks with unique keys', () => {
    const all = chunks()
    expect(new Set(all.map(c => c.key)).size).toBe(all.length)
    for (const m of sets) for (const lang of ['zh', 'en'] as Lang[]) {
      const cs = buildChunks(m, lang)
      expect(cs.filter(c => c.kind === 'overview')).toHaveLength(1)
      expect(cs.filter(c => c.kind === 'step').map(c => c.step)).toEqual(m.steps.map(s => s.order))
      expect(cs.some(c => c.kind === 'pitfalls')).toBe(!!m.pitfalls?.length)
      expect(cs.some(c => c.kind === 'evolution')).toBe(!!m.evolution?.length)
      if (lang === 'zh') for (const c of cs.filter(c => c.kind === 'pitfalls')) expect(c.text.length).toBeLessThanOrEqual(CHUNK_MAX)
      for (const c of cs) {
        expect(c.sitePath.startsWith(`/${lang}/methods/`)).toBe(true)
        expect(c.title).toBe(m.title[lang])
      }
    }
  })
  it('copies quotes from anchors only, word for word', () => {
    for (const m of sets) {
      const quotes = new Set([m.claim, ...m.steps, ...(m.pitfalls ?? [])].flatMap(x => x.anchors).concat((m.evolution ?? []).flatMap(e => e.anchors)).filter(a => a.quote).map(a => `${a.url} ${a.quote}`))
      for (const c of buildChunks(m, 'en')) for (const q of c.quotes) expect(quotes.has(`${q.url} ${q.text}`)).toBe(true)
    }
  })
  it('splits long pitfalls into several chunks', () => {
    const m = structuredClone(getMethodology('pr-review')!)
    m.pitfalls = Array.from({ length: 8 }, () => ({ ...m.pitfalls![0]!, text: { zh: '长'.repeat(150), en: 'long '.repeat(30) } }))
    const ids = buildChunks(m, 'zh').filter(c => c.kind === 'pitfalls').map(c => c.chunk_id)
    expect(ids.length).toBeGreaterThan(1)
    expect(ids[1]).toBe('m.pr-review#pitfalls-2')
  })
})

describe('ask chunks', () => {
  const m = getMethodology('pr-review')!
  const post = (id: string, text: string, type = 'original') => ({ id, date: '2026-05-01T00:00:00.000Z', type, text, url: `https://x.com/mattpocockuk/status/${id}` })
  it('maps posts by anchor or rule, skips replies, splits long posts and quotes verbatim', () => {
    const anchor = m.steps[0]!.anchors[0]!
    const anchorId = anchor.url.split('/').at(-1)!
    const out = postChunks([
      { ...post(anchorId, 'An anchored post about review with enough words in it'), date: `${anchor.date}T00:00:00.000Z` },
      post('2', 'I review every PR twice before merging it, here is why'),
      post('3', 'I review every reply too, just kidding about this', 'reply'),
      post('4', Array.from({ length: 40 }, (_, i) => `Line ${i} about code review and how to review well.`).join('\n')),
      post('5', 'Nothing relevant here at all, just weather talk'),
    ], [m], { flags: 'i', rules: { 'm.pr-review': '\\breview' } })
    expect(out.find(c => c.chunk_id === `post:${anchorId}`)).toMatchObject({ methodology_id: 'm.pr-review', step: 1, sitePath: '/en/methods/pr-review#s1' })
    expect(out.some(c => c.chunk_id === 'post:3' || c.chunk_id === 'post:5')).toBe(false)
    const long = out.filter(c => c.chunk_id.startsWith('post:4'))
    expect(long.length).toBeGreaterThan(1)
    for (const c of out) {
      expect(c.text.length).toBeLessThanOrEqual(CHUNK_MAX)
      if (c.quote) expect(c.text).toContain(c.quote.text)
    }
  })
  it('scans fail on emails, phone numbers and third-party quotes but not on "grok"', () => {
    const base = postChunks([post('9', 'Reviewing code is how you grok a codebase, honestly')], [m], { rules: { 'm.pr-review': 'review' } })[0]!
    expect(scanChunk(base)).toEqual([])
    const withText = (text: string): AskChunk => ({ ...base, text })
    expect(scanChunk(withText('mail me at someone@example.com'))).toContain('email')
    expect(scanChunk(withText('call +44 7700 900123 now'))).toContain('phone')
    expect(scanChunk(withText('call (555) 123-4567 now'))).toContain('phone')
    expect(scanChunk(withText('> someone else wrote this'))).toContain('third-party')
    expect(scanChunk(withText('@someone said "this is a long quote from a person who is not Matt at all"'))).toContain('third-party')
    expect(scanChunk({ ...base, quotes: [{ text: 'x', url: 'https://x.com/other/status/1', date: '2026-05-01' }] })).toContain('quote not from Matt')
  })
  it('excerpts stop before links and split keeps every part under the limit', () => {
    expect(excerpt('Thinking about https://t.co/abc vs that')).toBeUndefined()
    expect(excerpt('Hi\nThis is the first real line https://t.co/abc')).toBe('This is the first real line')
    for (const p of splitText('word '.repeat(500), 100)) expect(p.length).toBeLessThanOrEqual(100)
  })
})

describe('quote check', () => {
  it('passes verbatim quotes and fails a changed one', () => {
    const dir = tmp(), m = structuredClone(getMethodology('pr-review')!)
    const rows = [m.claim, ...m.steps, ...(m.pitfalls ?? [])].flatMap(x => x.anchors).concat((m.evolution ?? []).flatMap(e => e.anchors))
      .map(a => JSON.stringify({ url: a.url, date: `${a.date}T12:00:00.000Z`, text: `Before. ${a.quote ?? ''} After.` }))
    writeFileSync(join(dir, 'matt-posts-2026.jsonl'), [...new Set(rows)].join('\n'))
    writeFileSync(join(dir, 'github-repos.jsonl'), (m.repos ?? []).map(r => JSON.stringify({ url: r.url, text: '', license: r.license })).join('\n'))
    expect(checkQuotes([m], loadSources(dir)).problems).toEqual([])
    const a = m.steps[0]!.anchors.find(x => x.quote)!
    a.quote = a.quote!.replace(/\w+/, 'Changed')
    expect(checkQuotes([m], loadSources(dir)).problems.join()).toMatch(/not found verbatim/)
  })
})

// Visible text on the methodology pages that is not data: everything else must come from
// data/methods/*.json. The allowed labels are titles of sections and the source line.
export function nonContentText(html: string, m: Methodology | undefined, lang: Lang, list: Methodology[]) {
  const strings: string[] = []
  const collect = (v: unknown) => {
    if (typeof v === 'string') strings.push(v)
    else if (Array.isArray(v)) v.forEach(collect)
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (!(k === 'zh' && lang === 'en')) collect(x) })
  }
  collect(m ?? list)
  for (const s of list) collect(s.title)
  const content = strings.join('\n')
  const body = new JSDOM(html).window.document.body
  const walker = body.ownerDocument.createTreeWalker(body, 4)
  const extra: string[] = []
  const isContent = (t: string) => content.includes(t) || content.includes(`https://${t}`)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent!.trim()
    if (!t || isContent(t)) continue
    // A label joined from data parts ("github.com/mattpocock/x · MIT") is content too.
    const parts = t.split(' · ')
    if (parts.length > 1 && parts.every(isContent)) continue
    extra.push(t)
  }
  return [...new Set(extra)]
}

describe('pages', () => {
  const summaries = (lang: Lang) => sets.map(s => summarize(s, lang))
  const allowed = (lang: Lang) => new Set([
    methodsTitle(lang), currentLabel(lang), translationLabel, '：', 'Matt Pocock ·', '.',
    ...Object.values(sectionTitles).map(t => t[lang === 'zh' ? 0 : 1]), ...DOMAINS.map(d => domainLabel(d, lang)),
  ])
  for (const lang of ['zh', 'en'] as Lang[]) {
    it(`renders the ${lang} index and every set page with sources and only content text`, () => {
      const view = { list: summaries(lang) }
      const index = renderToString(<MethodsIndex view={view} lang={lang} />)
      const doc = new JSDOM(index).window.document
      expect(doc.querySelector('h1')!.textContent).toBe(methodsTitle(lang))
      expect(doc.querySelectorAll('.topic-card')).toHaveLength(sets.length)
      for (const t of nonContentText(index, undefined, lang, shown)) expect(allowed(lang), t).toContain(t)
      for (const m of shown) {
        const html = renderToString(<MethodPage m={m} view={{ ...view, current: m }} lang={lang} pages={[]} />)
        const page = new JSDOM(html).window.document
        expect(page.querySelector('h1')!.textContent).toBe(m.title[lang])
        for (const s of m.steps) {
          const links = [...page.querySelectorAll(`#s${s.order} a`)].map(a => a.getAttribute('href')!)
          expect(links.length, `${m.id} s${s.order}`).toBeGreaterThan(0)
          expect(links.every(h => /^https:\/\/(x\.com\/mattpocockuk|www\.aihero\.dev|github\.com\/mattpocock)\//.test(h))).toBe(true)
        }
        if (lang === 'en') expect(CJK.test(page.body.textContent!), m.id).toBe(false)
        expect(page.body.textContent, m.id).not.toMatch(/\bMIT\b|Copyright \(c\)/i)
        for (const q of page.querySelectorAll('.method-quote > p[lang=en]')) expect(q.textContent!.split(/\s+/).length).toBeLessThanOrEqual(25)
        for (const t of nonContentText(html, m, lang, shown)) expect(allowed(lang), `${m.id}: ${t}`).toContain(t)
      }
    })
  }
})
