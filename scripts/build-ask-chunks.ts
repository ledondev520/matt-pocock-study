// Builds the server-only chunk file for /api/ask (knowledge-architecture §4): every methodology
// chunk (zh and en, from data/methods) plus `post` chunks, one per Matt post (originals, quotes,
// self-threads, articles; never replies) that maps to a methodology, split above 800 characters.
// The output is internal and never committed; only this script is.
//
//   npm run build:ask-chunks -- --dataset <dir> --out <dir> [--rules <file.json>]
//
// --dataset  folder with matt-posts-*.jsonl, aihero-pages.jsonl and github-repos.jsonl
// --rules    {"flags": "i", "rules": {"m.<slug>": "<regex>"}}: maps posts to methodologies by
//            their text (URLs removed). Without it, posts map only through methodology anchors.
// --out      receives ask-chunks.jsonl, ask-chunks.sha256 and MANIFEST.md (folder mode 700)
//
// Every chunk must pass the scans (no email, no phone number, no third-party quote) and the quote
// check (each quote verbatim at its URL in Matt's own text, at most 25 words, date within a day).
// A chunk that fails is dropped and counted in MANIFEST.md. The JSONL is deterministic for the
// same inputs, so re-running after a new batch only adds the new chunks.
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chunks, loadMethodologies } from './methods'
import { loadSources, normalize } from './check-method-quotes'
import { anchorsOf, CHUNK_MAX, MAX_QUOTE_WORDS, methodPath, quoteWords, type MethodChunk, type Methodology } from '../src/lib/methods'

export const ASK_CHUNKS_VERSION = 1
const POST_TYPES = new Set(['original', 'quote', 'self_thread', 'article'])
const MATT_URL = /^https:\/\/(x\.com\/mattpocockuk\/status\/[0-9]+|www\.aihero\.dev\/|github\.com\/mattpocock\/)/

export interface AskChunk extends Omit<MethodChunk, 'kind' | 'evidence'> {
  kind: MethodChunk['kind'] | 'post'
  evidence?: MethodChunk['evidence']
  /** Latest year of the chunk's sources. */
  year: number
  /** Main source link and one short verbatim quote (at most 25 words), when there is one. */
  source_url: string
  quote?: { text: string; url: string; date: string }
  /** Post chunks: every methodology the post maps to (methodology_id is the first). */
  methodology_ids?: string[]
  post_type?: string
}

interface Post { id: string; date: string; type: string; text: string | null; url: string; post_text?: string | null }

// ---------------------------------------------------------------------------------------------
// Scans. Each returns the reasons a chunk fails; an empty list means it passes.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/
const PHONE = [/\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}/, /\(\d{3}\)\s?\d{3}[\s.-]\d{4}/, /\b\d{3}[.-]\d{3}[.-]\d{4}\b/]
const THIRD_PARTY = [
  /^\s*>/m,                                                         // block-quoted text
  /\bRT @\w/,                                                       // retweet of someone else
  /@\w{1,15}\b\s*(?:said|says|wrote|writes|tweeted|posted)\b/i,       // "@someone said"
  /\b(?:said|says|wrote|writes|tweeted|according to)\s*:?\s*["“][^"”]{40,}["”]/i, // attributed long quote
]
const stripUrls = (text: string) => text.replace(/https?:\/\/\S+/g, ' ')

export function scanChunk(c: AskChunk): string[] {
  const reasons: string[] = []
  const fields = [c.title, c.text, ...c.quotes.map(q => q.text)].map(stripUrls)
  if (fields.some(f => EMAIL.test(f))) reasons.push('email')
  if (fields.some(f => PHONE.some(p => p.test(f)))) reasons.push('phone')
  if (c.kind === 'post' && THIRD_PARTY.some(p => p.test(c.text))) reasons.push('third-party')
  for (const q of c.quotes) if (!MATT_URL.test(q.url)) reasons.push('quote not from Matt')
  return [...new Set(reasons)]
}

export function quoteProblems(c: AskChunk, sources: ReturnType<typeof loadSources>): string[] {
  const problems: string[] = []
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000
  for (const q of [...c.quotes, ...(c.quote ? [c.quote] : [])]) {
    const source = sources.get(q.url)
    if (!source) { problems.push('quote URL not in dataset'); continue }
    if (source.date && days(source.date, q.date) > 1) problems.push('quote date mismatch')
    if (quoteWords(q.text) > MAX_QUOTE_WORDS) problems.push('quote too long')
    if (!normalize(source.text).includes(normalize(q.text))) problems.push('quote not verbatim')
  }
  return [...new Set(problems)]
}

// ---------------------------------------------------------------------------------------------
// Post chunks

/** Splits text into parts of at most `max` characters at paragraph, line, sentence or word breaks. */
export function splitText(text: string, max: number): string[] {
  if (text.length <= max) return [text]
  for (const sep of ['\n\n', '\n', '. ', ' ']) {
    const pieces = text.split(sep)
    if (pieces.length < 2) continue
    const parts: string[] = []
    let cur = ''
    for (const p of pieces) {
      const next = cur ? cur + sep + p : p
      if (next.length > max && cur) { parts.push(cur); cur = p } else cur = next
    }
    if (cur) parts.push(cur)
    if (parts.every(p => p.length <= max)) return parts.map(p => p.trim()).filter(Boolean)
    return parts.flatMap(p => splitText(p.trim(), max)).filter(Boolean)
  }
  const out: string[] = []
  for (let i = 0; i < text.length; i += max) out.push(text.slice(i, i + max))
  return out
}

/** A short verbatim excerpt: the start of the first line with at least three words, URLs cut off. */
export function excerpt(text: string): string | undefined {
  for (const line of text.split('\n')) {
    const words = line.split(/https?:\/\/\S+/)[0]!.trim().split(/\s+/).filter(Boolean)
    if (words.length >= 3) return words.slice(0, MAX_QUOTE_WORDS).join(' ')
  }
  return undefined
}

const periodStart = (period: string) => period.match(/\d{4}(?:-\d{2})?/)?.[0]

export function postChunks(posts: Post[], sets: Methodology[], rules?: { flags?: string; rules: Record<string, string> }): AskChunk[] {
  const ids = new Set(sets.map(m => m.id))
  const byId = new Map(sets.map(m => [m.id, m]))
  const compiled = Object.entries(rules?.rules ?? {}).filter(([id]) => ids.has(id)).map(([id, p]) => [id, new RegExp(p, rules?.flags ?? 'i')] as const)
  // Anchors give the most precise mapping: the post is cited in a set, maybe in a given step.
  const anchored = new Map<string, { id: string; step: number | null }[]>()
  for (const m of sets) for (const { anchor, at } of anchorsOf(m)) {
    const step = /^s(\d+)$/.exec(at)?.[1]
    const list = anchored.get(anchor.url) ?? []
    if (!list.some(x => x.id === m.id)) list.push({ id: m.id, step: step === undefined ? null : Number(step) })
    anchored.set(anchor.url, list)
  }
  const out: AskChunk[] = []
  for (const post of [...posts].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!POST_TYPES.has(post.type) || !post.text || !MATT_URL.test(post.url)) continue
    const text = post.text.trim()
    if (stripUrls(text).trim().split(/\s+/).length < 5) continue
    const fromAnchors = anchored.get(post.url) ?? []
    const fromRules = compiled.filter(([, rx]) => rx.test(stripUrls(post.text!))).map(([id]) => id)
    const methodIds = [...new Set([...fromAnchors.map(a => a.id), ...fromRules])]
    if (!methodIds.length) continue
    const primary = byId.get(methodIds[0]!)!
    const step = fromAnchors.find(a => a.id === primary.id)?.step ?? null
    const date = post.date.slice(0, 10), year = Number(date.slice(0, 4))
    const current = (primary.evolution ?? []).find(e => e.current)
    const start = current && periodStart(current.period)
    const stance: AskChunk['stance_status'] = start && date < start ? 'history' : 'current'
    const head = `${primary.title.en} · Matt Pocock, ${date}`
    const parts = splitText(text, CHUNK_MAX - head.length - 1)
    parts.forEach((raw, i) => {
      // The excerpt is cut before the first link, so it stays verbatim; t.co links leave the text.
      const quoteText = excerpt(raw)
      const part = raw.replace(/https:\/\/t\.co\/\S+/g, '').replace(/[ \t]+\n/g, '\n').trim()
      const quote = quoteText ? { text: quoteText, url: post.url, date } : undefined
      out.push({
        key: `en:post:${post.id}${i ? `#p${i + 1}` : ''}`, chunk_id: `post:${post.id}${i ? `#p${i + 1}` : ''}`, kind: 'post',
        methodology_id: primary.id, methodology_ids: methodIds, domain: primary.domain, step, title: primary.title.en,
        text: `${head}\n${part}`, lang: 'en', sitePath: methodPath('en', primary.id, step ?? undefined),
        year, years: [year], date_last: date, stance_status: stance, source_url: post.url, source_urls: [post.url],
        quotes: quote ? [quote] : [], quote, post_type: post.type, schema_version: 1,
      })
    })
  }
  return out
}

/** Methodology chunks with the extra fields every ask chunk carries. */
export function methodChunks(dir?: string): AskChunk[] {
  return chunks(undefined, dir).map(c => ({
    ...c, year: c.years.at(-1) ?? Number(c.date_last.slice(0, 4)),
    source_url: c.quotes[0]?.url ?? c.source_urls[0] ?? '', quote: c.quotes[0],
  }))
}

// ---------------------------------------------------------------------------------------------

export function buildAskChunks({ dataset, rules, methodsDir }: { dataset: string; rules?: { flags?: string; rules: Record<string, string> }; methodsDir?: string }) {
  const sets = loadMethodologies(methodsDir)
  const sources = loadSources(dataset)
  const posts: Post[] = readdirSync(dataset).filter(f => /^matt-posts-.*\.jsonl$/.test(f)).sort()
    .flatMap(f => readFileSync(join(dataset, f), 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as Post))
  const candidates = [...methodChunks(methodsDir), ...postChunks(posts, sets, rules)]
  const kept: AskChunk[] = []
  const dropped: Record<string, number> = {}
  for (const c of candidates) {
    const reasons = [...scanChunk(c), ...quoteProblems(c, sources)]
    if (!c.source_url) reasons.push('no source link')
    if (reasons.length) { for (const r of reasons) dropped[r] = (dropped[r] ?? 0) + 1; dropped['chunks dropped'] = (dropped['chunks dropped'] ?? 0) + 1; continue }
    kept.push(c)
  }
  // Final gate on what is written: everything must pass again, or nothing is written.
  const failing = kept.filter(c => scanChunk(c).length || quoteProblems(c, sources).length)
  if (failing.length) throw new Error(`${failing.length} chunks failed the final scan`)
  const keys = new Set<string>()
  for (const c of kept) { if (keys.has(c.key)) throw new Error(`duplicate key ${c.key}`); keys.add(c.key) }
  return { sets, candidates: candidates.length, kept, dropped }
}

function writePrivate(file: string, text: string) {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, text, { mode: 0o600 })
  renameSync(tmp, file)
  chmodSync(file, 0o600)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }
  const dataset = arg('--dataset'), out = arg('--out'), rulesFile = arg('--rules')
  if (!dataset || !out || !existsSync(dataset)) {
    console.error('usage: npm run build:ask-chunks -- --dataset <dir> --out <dir> [--rules <file.json>]')
    process.exit(2)
  }
  const rules = rulesFile ? JSON.parse(readFileSync(rulesFile, 'utf8')) : undefined
  const { sets, candidates, kept, dropped } = buildAskChunks({ dataset, rules })
  mkdirSync(out, { recursive: true, mode: 0o700 })
  chmodSync(out, 0o700)
  const jsonl = kept.map(c => JSON.stringify(c)).join('\n') + '\n'
  const sha = createHash('sha256').update(jsonl).digest('hex')
  writePrivate(join(out, 'ask-chunks.jsonl'), jsonl)
  writePrivate(join(out, 'ask-chunks.sha256'), `${sha}  ask-chunks.jsonl\n`)
  const posts = kept.filter(c => c.kind === 'post')
  const count = (f: (c: AskChunk) => string, list = kept) => Object.entries(list.reduce<Record<string, number>>((a, c) => ({ ...a, [f(c)]: (a[f(c)] ?? 0) + 1 }), {})).sort().map(([k, v]) => `${k} ${v}`).join(', ')
  const manifest = [
    '# ask-chunks', '',
    `- generated: ${new Date().toISOString()}`,
    `- script: scripts/build-ask-chunks.ts, version ${ASK_CHUNKS_VERSION}`,
    `- format: JSON Lines, one chunk per line; key = <lang>:<chunk_id> is unique`,
    `- sha256 (ask-chunks.jsonl): ${sha}`,
    `- methodologies: ${sets.length} (${sets.filter(m => m.status === 'draft').length} draft, ${sets.filter(m => m.thin).length} thin)`,
    `- chunks written: ${kept.length} of ${candidates} candidates`,
    `- by kind: ${count(c => c.kind)}`,
    `- by language: ${count(c => c.lang)}`,
    `- post chunks: ${posts.length} from ${new Set(posts.map(c => c.source_url)).size} posts; by post type: ${count(c => c.post_type ?? '', posts)}`,
    `- post chunks by methodology: ${Object.entries(posts.reduce<Record<string, number>>((a, c) => ({ ...a, [c.methodology_id]: (a[c.methodology_id] ?? 0) + 1 }), {})).sort().map(([k, v]) => `${k} ${v}`).join(', ')}`,
    `- quotes checked: ${kept.reduce((n, c) => n + c.quotes.length, 0)}, all verbatim at their URL, at most ${MAX_QUOTE_WORDS} words`,
    `- scans: email, phone, third-party quote, non-Matt quote URL; 0 hits in the written file`,
    `- dropped: ${Object.keys(dropped).length ? Object.entries(dropped).sort().map(([k, v]) => `${k} ${v}`).join(', ') : 'none'}`,
    '',
  ].join('\n')
  writePrivate(join(out, 'MANIFEST.md'), manifest)
  console.log(manifest)
}
