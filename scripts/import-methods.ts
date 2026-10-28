// Import methodology sets from a dataset folder into data/methods/. Safe to re-run: the output
// depends only on the inputs, so a second run with the same inputs changes nothing.
//
//   npm run import:methods -- <methodologies-dir>            import every set listed in index.json
//   npm run import:methods -- <methodologies-dir> --skeleton also write missing English lines to fill in
//
// Only sets listed in <dir>/index.json are read (folders not in the index are ignored), and only
// their methodology.json. English comes from data/methods-i18n/<slug>.en.json: each entry maps a
// JSON path to the Chinese it translates and the English text. When the Chinese changes, the old
// English no longer applies and the set is reported as needing English. A set is written only if
// it validates with complete English (pages are bilingual); others are listed and left as they were.
// Internal notes are excluded before translation or validation. Index metadata is never published.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MAX_QUOTE_SENTENCES, quoteSentences, slugOf, validateMethodology } from '../src/lib/methods'

export type Overlay = Record<string, { zh: string; en: string }>
interface IndexEntry { id: string; flags?: unknown; files?: { json?: string } }

const CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/
type J = Record<string, unknown>
const isObj = (v: unknown): v is J => typeof v === 'object' && v !== null && !Array.isArray(v)

// Filter keys before reading values: internal_notes must not be inspected, even for translation.
function withoutInternalNotes(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(withoutInternalNotes)
  if (!isObj(v)) return v
  return Object.fromEntries(Object.keys(v).filter(k => k !== 'internal_notes').map(k => [k, withoutInternalNotes(v[k])]))
}

// Keep a verbatim prefix of long quotations; the source translation may describe the omitted
// sentences, so leave it out when shortening rather than pair it with a different quotation.
function shortenQuotes(v: unknown): void {
  if (Array.isArray(v)) { v.forEach(shortenQuotes); return }
  if (!isObj(v)) return
  if (typeof v.quote === 'string') {
    const parts = quoteSentences(v.quote)
    if (parts.length > MAX_QUOTE_SENTENCES) {
      v.quote = parts.slice(0, MAX_QUOTE_SENTENCES).join('').trimEnd()
      delete v.quote_zh
    }
  }
  Object.values(v).forEach(shortenQuotes)
}

/** Every translatable field: i18n objects ({zh}) and free-text strings that contain Chinese. */
export function translatable(m: J): { path: string; zh: string; en?: string; kind: 'i18n' | 'string' }[] {
  const out: { path: string; zh: string; en?: string; kind: 'i18n' | 'string' }[] = []
  const walk = (v: unknown, path: string, key: string) => {
    if (isObj(v)) {
      if (typeof v.zh === 'string' && Object.keys(v).every(k => k === 'zh' || k === 'en')) { out.push({ path, zh: v.zh, en: typeof v.en === 'string' && v.en ? v.en : undefined, kind: 'i18n' }); return }
      for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, k)
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}.${i}`, key))
    else if (typeof v === 'string' && (key === 'body' || key === 'license_ref') && CJK.test(v)) out.push({ path, zh: v, kind: 'string' })
  }
  walk(m, '', '')
  return out
}

function setAt(m: J, path: string, value: unknown) {
  const keys = path.split('.')
  let o: unknown = m
  for (const k of keys.slice(0, -1)) o = (o as J)[k]
  ;(o as J)[keys.at(-1)!] = value
}

/** Apply the English overlay. Returns the merged set and the paths still missing English. */
export function applyEnglish(source: J, overlay: Overlay): { set: J; missing: { path: string; zh: string }[] } {
  const set = withoutInternalNotes(source) as J
  shortenQuotes(set)
  if (isObj(set.sources_count)) delete set.sources_count.method
  if (Array.isArray(set.repos)) for (const r of set.repos) if (isObj(r)) delete r.note
  const missing: { path: string; zh: string }[] = []
  for (const f of translatable(set)) {
    if (f.en) continue
    const o = overlay[f.path]
    if (o && o.zh === f.zh && o.en.trim()) setAt(set, f.path, { zh: f.zh, en: o.en })
    else missing.push({ path: f.path, zh: f.zh })
  }
  return { set, missing }
}

export function importMethods(sourceDir: string, { dataDir = 'data/methods', i18nDir = 'data/methods-i18n', skeleton = false, log = console.log } = {}) {
  const index = JSON.parse(readFileSync(join(sourceDir, 'index.json'), 'utf8')) as { methodologies: IndexEntry[] }
  const written: string[] = [], unchanged: string[] = [], skipped: { id: string; reasons: string[] }[] = []
  mkdirSync(dataDir, { recursive: true })
  for (const entry of index.methodologies) {
    const id = entry.id
    if (!/^m\.[a-z0-9-]+$/.test(id)) { skipped.push({ id, reasons: ['bad id'] }); continue }
    const slug = slugOf(id)
    // index.json paths are relative to the dataset root (the folder that holds methodologies/).
    const rel = entry.files?.json ?? `methodologies/${id}/methodology.json`
    const file = resolve(dirname(resolve(sourceDir)), rel)
    const within = relative(resolve(sourceDir), file)
    if (within === '..' || within.startsWith('..' + sep) || isAbsolute(within) || !existsSync(file)) { skipped.push({ id, reasons: [`no methodology.json for ${id}`] }); continue }
    const source = JSON.parse(readFileSync(file, 'utf8')) as J
    if (source.id !== id) { skipped.push({ id, reasons: [`file id ${String(source.id)} does not match index`] }); continue }
    const overlayFile = join(i18nDir, `${slug}.en.json`)
    const overlay: Overlay = existsSync(overlayFile) ? JSON.parse(readFileSync(overlayFile, 'utf8')) : {}
    const { set, missing } = applyEnglish(source, overlay)
    // Thin sets are flagged in the index ('thin', or a note starting with 薄); the flag is kept in the data.
    const flags = (Array.isArray(entry.flags) ? entry.flags : [entry.flags]).filter((f): f is string => typeof f === 'string')
    if (flags.some(f => f === 'thin' || f.startsWith('薄'))) set.thin = true
    if (missing.length) {
      if (skeleton) {
        const next: Overlay = { ...overlay }
        for (const m of missing) next[m.path] = { zh: m.zh, en: '' }
        mkdirSync(i18nDir, { recursive: true })
        writeFileSync(overlayFile, JSON.stringify(next, null, 2) + '\n')
      }
      skipped.push({ id, reasons: [`${missing.length} fields need English (${overlayFile})`] }); continue
    }
    const errors = validateMethodology(set)
    if (errors.length) { skipped.push({ id, reasons: errors }); continue }
    const out = join(dataDir, `${slug}.json`), text = JSON.stringify(set, null, 2) + '\n'
    if (existsSync(out) && readFileSync(out, 'utf8') === text) unchanged.push(id)
    else { writeFileSync(out, text); written.push(id) }
  }
  log(`methods import: ${written.length} written, ${unchanged.length} unchanged, ${skipped.length} skipped`)
  for (const s of skipped) log(`  skipped ${s.id}: ${s.reasons.slice(0, 5).join('; ')}${s.reasons.length > 5 ? ` (+${s.reasons.length - 5} more)` : ''}`)
  return { written, unchanged, skipped }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), dir = args.find(a => !a.startsWith('--'))
  if (!dir) { console.error('usage: npm run import:methods -- <methodologies-dir> [--skeleton]'); process.exit(2) }
  const { skipped } = importMethods(dir, { skeleton: args.includes('--skeleton') })
  if (skipped.length) process.exitCode = 1
}
