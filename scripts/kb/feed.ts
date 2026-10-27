// Learning knowledge base feed: parse the maintainers' daily notes, keep only the public part of
// each entry, and gate everything that would be published. The gate fails closed: any finding
// blocks the whole batch. The list of private names is never stored in this public repository;
// callers pass it in (see scripts/kb/sync.ts). Data format: docs/knowledge-base-format.md.

export interface Segment { text: string; href?: string }
/** One published entry. `id` is stable: source + date + the original post's id (or URL hash). */
export interface KbEntry { id: string; date: string; source: SourceId; title: string; body: Segment[]; url: string }
export interface KbFeed { version: 2; entries: KbEntry[] }
export interface Skipped { source: SourceId; date: string; reason: 'no-title' | 'usage-marker' | 'no-source-link' | 'no-usage-marker'; line: number }
export interface Finding { category: Category; id: string; field: string; match: string }
export type Category = 'email' | 'quota' | 'internal-name' | 'internal-path' | 'internal-rule' | 'secret' | 'ip' | 'phone' | 'link'

/** Sources that may be published. Each one names the links that count as its original post. */
export const SOURCES = {
  // Daily study notes on Matt Pocock's public posts.
  'matt-notes': { label: ['Matt 笔记', 'Matt notes'], original: /^https:\/\/x\.com\/mattpocockuk\/status\/\d+$/ },
  // Things the team learned elsewhere; the original is any public X post or GitHub page.
  team: { label: ['团队知识', 'Team notes'], original: /^https:\/\/(?:x\.com\/\w{1,15}\/status\/\d+|github\.com\/[\w.-]+\/[\w.-]+(?:\/[\w.-]+)*)$/ },
} as const
export type SourceId = keyof typeof SOURCES
export const isSourceId = (value: unknown): value is SourceId => typeof value === 'string' && Object.hasOwn(SOURCES, value)

const SECTION = /^##\s*每日追加/
const DAY = /^###\s*(\d{4}-\d{2}-\d{2})(?!\d)/
const ENTRY = /^-\s+\*\*(.+?)\*\*\s*(.*)$/
// Invisible characters a reader never sees: format characters (zero-width, soft hyphen, BOM, bidi
// marks) plus the fillers and selectors Unicode does not class as format characters.
// (Combining and selector characters stay outside the class so it reads as one character each.)
const INVISIBLE = '(?:[\\p{Cf}\\u115F\\u1160\\u3164\\uFFA0]|\\p{Variation_Selector}|\\u034F|\\u17B4|\\u17B5)'
/** Text folded for matching only (never published): NFKC (full-width letters, digits, ＠, ．),
 * invisible characters removed, whitespace collapsed. */
export function fold(text: string) {
  return text.normalize('NFKC').replace(new RegExp(INVISIBLE, 'gu'), '').replace(/\s+/g, ' ')
}
/** What Markdown leaves on screen: link labels without their targets, no emphasis marks or tags. */
export function plain(text: string) {
  return text.replace(/!?\[([^\]\n]*)\]\([^)\s]*\)/g, '$1').replace(/<(https?:[^>\s]+)>/g, '$1')
    .replace(/<\/?[A-Za-z][^>]*>/g, '').replace(/[*_~`]+/g, '')
}
// The internal "how we use it" part always follows this marker and is never published. Emphasis,
// spaces and invisible characters may sit inside it; the colon may be any colon-like character.
const DECOR = `(?:\\s|[*_~\`]|${INVISIBLE})*`
const USAGE = new RegExp(`[*_~]*[用⽤]${DECOR}[法途]${DECOR}[:：︰﹕꞉∶˸‥]`, 'u')
// Anything that still looks like the start of a "用…" section after folding means the marker was
// written in a form the split did not recognise: the whole entry is skipped (better unpublished).
const SUSPECT = /用\s*[法途]|(?:^|[\s\p{P}\p{S}])用\p{Script=Han}{0,3}\s*(?::|\.\.|[꞉∶˸])/u
const suspect = (text: string) => SUSPECT.test(fold(plain(text)))
const EVIDENCE = /\b(?:Direct|Supported|Inferred|Speculative|Unknown)\b/g
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)）\]，。；、"“”'<>]+)/g

function segments(text: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of text.matchAll(LINK)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push(m[3] ? { text: m[3], href: m[3] } : { text: m[1], href: m[2] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}
function tidy(text: string) {
  return text.replace(/\*\*|`/g, '').replace(EVIDENCE, '').replace(/[ \t]+/g, ' ')
    .replace(/（\s*[，；、]\s*/g, '（').replace(/\s*[，；、]\s*）/g, '）').replace(/（\s*）/g, '')
    .replace(/[，；]\s*([。；])/g, '$1').replace(/。(\s*。)+/g, '。').replace(/^\s*[。，；：:,]\s*/, '')
}
function stableId(source: SourceId, date: string, url: string) {
  const status = /\/status\/(\d+)$/.exec(url)?.[1]
  if (status) return `${source}-${date}-${status}`
  let h = 0x811c9dc5 // FNV-1a over the URL, for originals without a numeric id.
  for (const c of url) { h ^= c.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0 }
  return `${source}-${date}-${h.toString(16).padStart(8, '0')}`
}

/** Parse one notes file. Only the "每日追加" section is read; everything before it is research text. */
export function parseNotes(text: string, source: SourceId): { entries: KbEntry[]; skipped: Skipped[] } {
  const entries: KbEntry[] = [], skipped: Skipped[] = []
  let inSection = false, date: string | undefined
  text.split(/\r?\n/).forEach((line, i) => {
    if (SECTION.test(line)) { inSection = true; return }
    if (!inSection) return
    if (/^##\s/.test(line)) { inSection = false; date = undefined; return }
    const d = DAY.exec(line)
    if (d) { date = d[1]; return }
    if (!date || !/^-\s/.test(line)) return
    const m = ENTRY.exec(line)
    if (!m) { skipped.push({ source, date, reason: 'no-title', line: i + 1 }); return }
    const day = date
    const skip = (reason: Skipped['reason']) => { skipped.push({ source, date: day, reason, line: i + 1 }) }
    const marker = USAGE.exec(m[2])
    const pub = marker ? m[2].slice(0, marker.index) : m[2]
    if (USAGE.test(m[1]) || suspect(m[1]) || suspect(pub)) return skip('usage-marker')
    const body = segments(tidy(pub)).filter(s => s.href || s.text.trim())
    const url = body.find(s => s.href && SOURCES[source].original.test(s.href))?.href
    if (!url) return skip('no-source-link')
    // By convention every entry has a usage part; without the marker nothing proves where it starts.
    if (!marker) return skip('no-usage-marker')
    // Trailing separators left after removing the usage part.
    const tail = body[body.length - 1]
    if (!tail.href) tail.text = tail.text.replace(/[\s，；、]+$/, '')
    entries.push({ id: stableId(source, date, url), date, source, title: tidy(m[1]).trim().replace(/[。.]$/, ''), body: body.filter(s => s.href || s.text), url })
  })
  return { entries, skipped }
}

/** Merge files from every configured source; newest date first, note order kept within a day. */
export function buildFeed(files: { source: SourceId; text: string }[]): { feed: KbFeed; skipped: Skipped[] } {
  const all: KbEntry[] = [], skipped: Skipped[] = []
  for (const file of files) { const parsed = parseNotes(file.text, file.source); all.push(...parsed.entries); skipped.push(...parsed.skipped) }
  const seen = new Map<string, number>()
  for (const entry of all) {
    // The same post noted twice on one day keeps distinct, still stable ids.
    const n = (seen.get(entry.id) ?? 0) + 1
    seen.set(entry.id, n)
    if (n > 1) entry.id += `-${n}`
  }
  const order = new Map(all.map((e, i) => [e, i]))
  const entries = [...all].sort((a, b) => b.date.localeCompare(a.date) || order.get(a)! - order.get(b)!)
  return { feed: { version: 2, entries }, skipped }
}

/** Entries grouped by date, newest first (what the page renders). */
export function byDate(entries: KbEntry[]): { date: string; entries: KbEntry[] }[] {
  const days = new Map<string, KbEntry[]>()
  for (const e of entries) days.set(e.date, [...(days.get(e.date) ?? []), e])
  return [...days].map(([date, list]) => ({ date, entries: list }))
}

// Links any source may use besides its own originals (each source only gets its own original rule).
const COMMON_LINKS = [/^https:\/\/github\.com\/mattpocock(?:\/[\w.-]+)*\/?(?:#[\w-]+)?$/, /^https:\/\/www\.aihero\.dev(?:\/[\w.-]+)*\/?$/, /^https:\/\/www\.totaltypescript\.com(?:\/[\w.-]+)*\/?$/]
const allowedLink = (source: string, href: string) =>
  (isSourceId(source) && SOURCES[source].original.test(href)) || COMMON_LINKS.some(r => r.test(href))
const QUOTA_WORD = '(?:额度|用量|配额|剩余|限额|余量|quota|usage|limit|remaining|credits?|rate[ -]?limit)'
const RULES: [Category, RegExp][] = [
  ['email', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/],
  ['quota', /\d[\d,.]*\s*[kKmMbB万亿]?\s*(?:tokens?|toks?)\b/i],
  ['quota', /\b(?:cached|cache[ -]?read|input|output)[\s-]*(?:tokens?)?\s*[:：=]?\s*\d/i],
  ['quota', /\d[\d,.]*\s*[kKmMbB万亿]?\s*(?:cached|cache[ -]?reads?)\b/i],
  ['quota', new RegExp(`${QUOTA_WORD}[^\\n。.;；]{0,16}?\\d`, 'i')],
  ['quota', new RegExp(`\\d[\\d,.]*\\s*(?:%|％|/\\s*\\d+)[^\\n。.;；]{0,12}?${QUOTA_WORD}`, 'i')],
  ['quota', /\b\d+\s*\/\s*(?:1000|500|100)\b/],
  // "还剩/用掉 + amount": a percentage, 万/亿/k/M, or 成 (also written in Chinese numerals).
  ['quota', /(?:还剩|剩下|剩余|用掉|用了|消耗了?|烧掉|花掉)\s*(?:\d[\d,.]*\s*(?:%|万|亿|[kKmM](?![A-Za-z])|成)|[一二三四五六七八九十两半]成)/],
  // Generic absolute paths. Paths and terms specific to the maintainers' machine are in the private list.
  ['internal-path', /(?:^|[^\w./-])(?:\/home\/|\/tmp\/|\/root\b|\/etc\/|\/Users\/|\/var\/|\/opt\/|~\/)|\b[A-Za-z]:\\/],
  ['internal-rule', /\b(?:rules|voice|PROGRESS|INDEX|AGENTS)\.md\b|access-register|\b(?:sitelock|ulog|umeter|ureport|boxhealth|brv)\b|\broutines?\b|看板|routine/i],
  // `[_]` keeps a few literal prefixes out of this file so secret scanners do not flag the rule itself;
  // it matches exactly the same text.
  ['secret', /\b(?:gh[pousr][_]|github_pat[_]|sk-[A-Za-z0-9]{8}|sk-(?:proj|ant|svcacct|admin)-|xox[abposr]-|AKIA[0-9A-Z]{8}|AI[z]a[\w-]{20}|glpat-[\w-]{8})|-----BEGIN [A-Z ]*PRIVATE KEY|(?:^|[\s/])\.env\b/],
  ['email', /[\w.+-]+\s+@\s*[\w-]+(?:\.[\w-]+)+|[\w.+-]+@\s+[\w-]+(?:\.[\w-]+)+/],
  ['ip', /\b(?:\d{1,3}[.。｡]){3}\d{1,3}\b/],
  ['phone', /(?<!\d)(?:\+?86[\s.-]?)?1[3-9]\d(?:[\s.-]?\d{4}){2}(?!\d)|(?<!\d)\+\d{1,3}[\s-]?\d{3,4}[\s-]?\d{4}(?!\d)/],
]

function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
/** Private names and machine-specific terms come from a file outside the repository; one per line, # comments allowed. */
export function parseDenylist(text: string): string[] {
  return text.split(/\r?\n/).map(l => l.replace(/#.*/, '').trim()).filter(Boolean)
}
function nameRule(names: string[]) {
  const list = [...new Set(names.map(fold).filter(Boolean))]
  if (!list.length) return undefined
  // Latin names match as whole words (case-insensitive; `_` counts as a break); CJK names match anywhere.
  return new RegExp(list.map(n => /^[\w-]+$/.test(n) ? `(?<![A-Za-z0-9])${escapeRegExp(n)}(?![A-Za-z0-9])` : escapeRegExp(n)).join('|'), 'i')
}
/** Text and names with every space, punctuation mark and symbol removed ("Sample bot", "样·例名"). */
const compact = (text: string) => fold(plain(text)).replace(/[\s\p{P}\p{S}]/gu, '')

/** Runs every rule on the text as written, folded, and folded with Markdown removed; names also on
 * the compact form. One finding per category. */
export function checkText(text: string, names: string[] = []): { category: Category; match: string }[] {
  const out: { category: Category; match: string }[] = []
  const add = (category: Category, match: string) => { if (!out.some(f => f.category === category)) out.push({ category, match: match.trim() }) }
  const names1 = nameRule(names), names2 = nameRule(names.map(compact))
  for (const form of new Set([text, fold(text), fold(plain(text))])) {
    for (const [category, rule] of RULES) { const m = rule.exec(form); if (m) add(category, m[0]) }
    const n = names1?.exec(form)
    if (n) add('internal-name', n[0])
  }
  const c = names2?.exec(compact(text))
  if (c) add('internal-name', c[0])
  return out
}

/** Every published string is checked: titles, text, link labels and link targets, and then the
 * entry as the page shows it (title plus all segment texts joined), so a name or address split
 * across a link label or emphasis is still seen whole. */
export function gateFeed(feed: KbFeed, names: string[] = []): Finding[] {
  const findings: Finding[] = []
  const rule = nameRule(names)
  for (const entry of feed.entries) {
    const mine: Finding[] = []
    const fields: [string, string][] = [['title', entry.title], ['url', entry.url],
      ...entry.body.flatMap((s, j): [string, string][] => [[`body[${j}].text`, s.text], ...(s.href ? [[`body[${j}].href`, s.href] as [string, string]] : [])])]
    for (const [field, value] of fields) {
      // Allowed links are checked for shape, not content (status ids are long digit runs).
      if (field.endsWith('.href') || field === 'url') {
        if (!allowedLink(entry.source, value)) mine.push({ category: 'link', id: entry.id, field, match: value })
        const n = rule?.exec(value)
        if (n) mine.push({ category: 'internal-name', id: entry.id, field, match: n[0] })
        continue
      }
      for (const f of checkText(value, names)) mine.push({ ...f, id: entry.id, field })
    }
    const shown = `${entry.title}\n${entry.body.map(s => s.text).join('')}`
    for (const f of checkText(shown, names)) if (!mine.some(m => m.category === f.category)) mine.push({ ...f, id: entry.id, field: 'shown' })
    findings.push(...mine)
  }
  return findings
}

/** Shape check for the committed feed (used by the build). Throws on anything unexpected. */
export function validateFeed(value: unknown): KbFeed {
  const fail = (why: string): never => { throw new Error(`Invalid data/knowledge-base.json: ${why}`) }
  const isString = (v: unknown): v is string => typeof v === 'string'
  if (!value || typeof value !== 'object') fail('not an object')
  const { version, entries, ...rest } = value as Record<string, unknown>
  if (version !== 2 || !Array.isArray(entries) || Object.keys(rest).length) fail('expected { version: 2, entries: [] }')
  const ids = new Set<string>()
  let previous = '9999-99-99'
  for (const entry of entries as unknown[]) {
    const { id, date, source, title, body, url, ...more } = (entry ?? {}) as Record<string, unknown>
    if (!isString(id) || !/^[a-z0-9-]+$/.test(id) || ids.has(id)) fail(`bad or duplicate id ${String(id)}`)
    ids.add(String(id))
    if (!isString(date) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > previous) fail(`bad date or not newest first at ${String(id)}`)
    previous = String(date)
    if (!isSourceId(source) || !String(id).startsWith(`${source}-${date}-`)) fail(`bad source at ${String(id)}`)
    if (!isString(title) || !title.trim() || !isString(url) || !SOURCES[source as SourceId].original.test(url) || !Array.isArray(body) || Object.keys(more).length) fail(`bad entry ${String(id)}`)
    for (const s of body as unknown[]) {
      const { text, href, ...other } = (s ?? {}) as Record<string, unknown>
      if (!isString(text) || (href !== undefined && !isString(href)) || Object.keys(other).length) fail(`bad body segment in ${String(id)}`)
    }
    if (!(body as Segment[]).some(s => s.href === url)) fail(`original link missing from body in ${String(id)}`)
  }
  const feed = value as KbFeed
  // The build cannot see the private name list; it re-runs every other category.
  const findings = gateFeed(feed)
  if (findings.length) fail(`gate findings: ${findings.map(f => `${f.id} ${f.field} ${f.category}`).join('; ')}`)
  return feed
}
