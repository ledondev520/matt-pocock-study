// Methodology sets: types, validation, paths, retrieval chunks and Markdown twins. Pure (no fs), so
// the browser bundle, the build and the servers share one definition. Files are read by
// scripts/methods.ts; data/methodology.schema.json describes the same shape for editors.
import type { Lang } from './lang'

export const methodsSlug = 'methods'
export const MAX_QUOTE_SENTENCES = 2
/** Sentence boundaries with standalone abbreviations kept with the sentence they introduce. */
export function quoteSentences(quote: string): string[] {
  const parts: string[] = []
  for (const { segment } of new Intl.Segmenter('en', { granularity: 'sentence' }).segment(quote)) {
    const previous = parts.at(-1)
    if (previous && /^(?:i\.e|e\.g|etc)\.$/i.test(previous.trim())) parts[parts.length - 1] += segment
    else parts.push(segment)
  }
  return parts
}
export const DOMAINS = ['ai-coding', 'delivery', 'typescript', 'llm-apps', 'teach-learn'] as const
export type Domain = typeof DOMAINS[number]
export const domainLabels: Record<Domain, [string, string]> = {
  'ai-coding': ['AI 编程', 'AI coding'], delivery: ['交付与协作', 'Delivery'], typescript: ['TypeScript', 'TypeScript'],
  'llm-apps': ['LLM 应用', 'LLM apps'], 'teach-learn': ['教与学', 'Teaching and learning'],
}
export const domainLabel = (domain: Domain, lang: Lang) => domainLabels[domain][lang === 'zh' ? 0 : 1]

export type Evidence = 'Direct' | 'Supported' | 'Inferred'
export interface I18n { zh: string; en: string }
/** Free text that is the same in both languages (no Chinese) or given per language. */
export type Text = string | I18n
export interface Anchor { url: string; date: string; quote?: string; quote_zh?: string }
export interface Claim { text: I18n; anchors: Anchor[]; evidence: Evidence }
export interface Step { id: string; order: number; title: I18n; how: I18n; anchors: Anchor[]; evidence: Evidence; since?: string }
export interface Example { origin: 'site' | 'mit' | 'link-only'; title?: I18n; lang?: string; body?: Text; license_ref?: Text; url?: string }
export type Change = 'first' | 'refine' | 'reverse' | 'reaffirm' | 'unclear'
export interface Evolution { period: string; stance: I18n; change: Change; current?: boolean; anchors: Anchor[] }
export interface Repo { url: string; license: string; reuse?: 'mit-with-notice' | 'link-only'; note?: string }
export interface Methodology {
  id: string; domain: Domain; title: I18n; question?: I18n; claim: Claim; steps: Step[]
  examples?: Example[]; pitfalls?: Claim[]; evolution?: Evolution[]; related?: string[]; prerequisites?: string[]
  site_pages?: string[]; repos?: Repo[]; sources_count: { keyword_hits: number; curated: number; method?: string }
  evidence: Evidence; date_first: string; date_last: string; status: 'draft' | 'published'; thin?: boolean; updated?: string
}
/** What lists, navigation and the home page need about one set. */
export interface MethodSummary { id: string; slug: string; domain: Domain; title: string; question?: string; claim: string; date_last: string; status: Methodology['status']; thin: boolean }
/** The methods slice of the page model: the list for navigation, and the open set on a set's page. */
export interface MethodsView { list: MethodSummary[]; current?: Methodology }

export const slugOf = (id: string) => id.replace(/^m\./, '')
export const text = (value: Text | undefined, lang: Lang) => value === undefined ? '' : typeof value === 'string' ? value : value[lang]
/** Site path of a set, a step (number) or a section id. */
export function methodPath(lang: Lang, id?: string, anchor?: number | string) {
  const base = `/${lang}/${methodsSlug}${id ? `/${slugOf(id)}` : ''}`
  return anchor === undefined ? base : `${base}#${typeof anchor === 'number' ? `s${anchor}` : anchor}`
}
export function summarize(m: Methodology, lang: Lang): MethodSummary {
  return { id: m.id, slug: slugOf(m.id), domain: m.domain, title: m.title[lang], question: m.question?.[lang], claim: m.claim.text[lang], date_last: m.date_last, status: m.status, thin: m.thin === true }
}
/** Sets grouped by domain in DOMAINS order, each group sorted by title with thin sets last. */
export function byDomain<T extends { domain: Domain; title: string; thin?: boolean }>(items: T[]) {
  return DOMAINS.map(domain => ({ domain, items: items.filter(m => m.domain === domain).sort((a, b) => Number(a.thin === true) - Number(b.thin === true) || a.title.localeCompare(b.title)) })).filter(g => g.items.length)
}
/** A stable pick for a calendar day (YYYY-MM-DD): the same set all day, a different one the next. */
export function pickForDay<T extends { id: string }>(items: T[], day: string): T | undefined {
  if (!items.length) return undefined
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id))
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000)
  if (!Number.isFinite(n)) throw new Error(`pickForDay: not a date: ${day}`)
  return sorted[((n % sorted.length) + sorted.length) % sorted.length]
}

// ---------------------------------------------------------------------------------------------
// Validation. Mirrors data/methodology.schema.json and adds what a schema cannot say: step ids
// follow the set id and order, quotes are at most 25 words, English text has no Chinese, and
// at most one stance is current. Returns every problem, each with its JSON path.

const ANCHOR_URL = /^https:\/\/(x\.com\/mattpocockuk\/status\/[0-9]+|www\.aihero\.dev\/|github\.com\/mattpocock\/)/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const PERIOD = /^[0-9]{4}(-[0-9]{2})?(–[0-9]{4}(-[0-9]{2})?)?$/
const CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/
export const MAX_QUOTE_WORDS = 25
export const quoteWords = (quote: string) => quote.trim().split(/\s+/).filter(Boolean).length

type O = Record<string, unknown>
const isObj = (v: unknown): v is O => typeof v === 'object' && v !== null && !Array.isArray(v)
const validDate = (v: unknown) => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().startsWith(v)

export function validateMethodology(value: unknown): string[] {
  const errors: string[] = []
  const err = (path: string, message: string) => errors.push(`${path}: ${message}`)
  const keys = (o: O, path: string, required: string[], optional: string[]) => {
    for (const k of required) if (!(k in o)) err(path, `missing ${k}`)
    for (const k of Object.keys(o)) if (!required.includes(k) && !optional.includes(k)) err(path, `unknown field ${k}`)
  }
  const str = (v: unknown, path: string, min = 1) => { if (typeof v !== 'string' || v.trim().length < min) { err(path, 'expected non-empty string'); return false } return true }
  const oneOf = (v: unknown, path: string, values: readonly string[]) => { if (!values.includes(v as string)) err(path, `expected one of ${values.join(', ')}`) }
  const i18n = (v: unknown, path: string) => {
    if (!isObj(v)) return err(path, 'expected {zh, en}')
    keys(v, path, ['zh', 'en'], [])
    str(v.zh, `${path}.zh`)
    if (str(v.en, `${path}.en`) && CJK.test(v.en as string)) err(`${path}.en`, 'English text contains Chinese characters')
  }
  const textField = (v: unknown, path: string, max?: number) => {
    if (typeof v === 'string') {
      if (CJK.test(v)) err(path, 'contains Chinese, so give {zh, en}')
      if (max && v.length > max) err(path, `longer than ${max} characters`)
    } else i18n(v, path)
  }
  const anchors = (v: unknown, path: string) => {
    if (!Array.isArray(v) || !v.length) return err(path, 'expected at least one anchor')
    v.forEach((a, i) => {
      const p = `${path}[${i}]`
      if (!isObj(a)) return err(p, 'expected object')
      keys(a, p, ['url', 'date'], ['quote', 'quote_zh'])
      if (typeof a.url !== 'string' || !ANCHOR_URL.test(a.url)) err(`${p}.url`, 'must link to x.com/mattpocockuk/status, www.aihero.dev or github.com/mattpocock')
      if (!validDate(a.date)) err(`${p}.date`, 'expected YYYY-MM-DD')
      if ('quote' in a) {
        if (str(a.quote, `${p}.quote`)) {
          const q = a.quote as string
          if (quoteWords(q) > MAX_QUOTE_WORDS) err(`${p}.quote`, `${quoteWords(q)} words; at most ${MAX_QUOTE_WORDS}`)
          if (quoteSentences(q).length > MAX_QUOTE_SENTENCES) err(`${p}.quote`, `at most ${MAX_QUOTE_SENTENCES} sentences`)
          if (q.length > 200) err(`${p}.quote`, 'longer than 200 characters')
        }
      }
      if ('quote_zh' in a) { str(a.quote_zh, `${p}.quote_zh`); if (!('quote' in a)) err(p, 'quote_zh without quote') }
    })
  }
  const evidence = (v: unknown, path: string) => oneOf(v, path, ['Direct', 'Supported', 'Inferred'])
  const claim = (v: unknown, path: string) => {
    if (!isObj(v)) return err(path, 'expected object')
    keys(v, path, ['text', 'anchors', 'evidence'], [])
    i18n(v.text, `${path}.text`); anchors(v.anchors, `${path}.anchors`); evidence(v.evidence, `${path}.evidence`)
  }
  const ids = (v: unknown, path: string) => {
    if (v === undefined) return
    if (!Array.isArray(v)) return err(path, 'expected array')
    v.forEach((x, i) => { if (typeof x !== 'string' || !/^m\.[a-z0-9-]+$/.test(x)) err(`${path}[${i}]`, 'expected a set id like m.slug') })
  }

  if (!isObj(value)) return ['$: expected object']
  const m = value
  keys(m, '$', ['id', 'domain', 'title', 'claim', 'steps', 'sources_count', 'evidence', 'date_first', 'date_last', 'status'],
    ['question', 'examples', 'pitfalls', 'evolution', 'related', 'prerequisites', 'site_pages', 'repos', 'updated', 'thin'])
  const id = typeof m.id === 'string' && /^m\.[a-z0-9-]+$/.test(m.id) ? m.id : (err('$.id', 'expected m.<slug>'), 'm.?')
  oneOf(m.domain, '$.domain', DOMAINS)
  i18n(m.title, '$.title')
  if ('question' in m) i18n(m.question, '$.question')
  claim(m.claim, '$.claim')
  if (!Array.isArray(m.steps) || !m.steps.length) err('$.steps', 'expected at least one step')
  else m.steps.forEach((s, i) => {
    const p = `$.steps[${i}]`
    if (!isObj(s)) return err(p, 'expected object')
    keys(s, p, ['id', 'order', 'title', 'how', 'anchors', 'evidence'], ['since'])
    if (s.order !== i + 1) err(`${p}.order`, `expected ${i + 1} (steps are numbered 1..n in file order)`)
    if (s.id !== `${id}#s${i + 1}`) err(`${p}.id`, `expected ${id}#s${i + 1}`)
    i18n(s.title, `${p}.title`); i18n(s.how, `${p}.how`); anchors(s.anchors, `${p}.anchors`); evidence(s.evidence, `${p}.evidence`)
    if ('since' in s && typeof s.since !== 'string') err(`${p}.since`, 'expected string')
  })
  if ('examples' in m) {
    if (!Array.isArray(m.examples)) err('$.examples', 'expected array')
    else m.examples.forEach((e, i) => {
      const p = `$.examples[${i}]`
      if (!isObj(e)) return err(p, 'expected object')
      keys(e, p, ['origin'], ['title', 'lang', 'body', 'license_ref', 'url'])
      oneOf(e.origin, `${p}.origin`, ['site', 'mit', 'link-only'])
      if ('title' in e) i18n(e.title, `${p}.title`)
      if ('body' in e) textField(e.body, `${p}.body`, 2000)
      if ('license_ref' in e) textField(e.license_ref, `${p}.license_ref`)
      if ('lang' in e && (typeof e.lang !== 'string' || !/^[a-z0-9-]+$/.test(e.lang))) err(`${p}.lang`, 'expected a code fence language')
      if ('url' in e && (typeof e.url !== 'string' || !ANCHOR_URL.test(e.url))) err(`${p}.url`, 'must link to x.com/mattpocockuk/status, www.aihero.dev or github.com/mattpocock')
      if (e.origin === 'link-only' && !('url' in e)) err(p, 'link-only example needs url')
      if (e.origin === 'link-only' && !('title' in e)) err(p, 'link-only example needs title')
      if (e.origin === 'site' && !('body' in e)) err(p, 'site example needs body')
      if (e.origin === 'mit' && !('body' in e) && !('url' in e && 'title' in e)) err(p, 'mit example needs body, or url and title')
      if (e.origin === 'mit' && !('license_ref' in e)) err(p, 'mit example needs license_ref')
    })
  }
  if ('pitfalls' in m) { if (!Array.isArray(m.pitfalls)) err('$.pitfalls', 'expected array'); else m.pitfalls.forEach((c, i) => claim(c, `$.pitfalls[${i}]`)) }
  if ('evolution' in m) {
    if (!Array.isArray(m.evolution)) err('$.evolution', 'expected array')
    else {
      m.evolution.forEach((e, i) => {
        const p = `$.evolution[${i}]`
        if (!isObj(e)) return err(p, 'expected object')
        keys(e, p, ['period', 'stance', 'change', 'anchors'], ['current'])
        if (typeof e.period !== 'string' || !PERIOD.test(e.period)) err(`${p}.period`, 'expected YYYY, YYYY-MM or a range with –')
        i18n(e.stance, `${p}.stance`); oneOf(e.change, `${p}.change`, ['first', 'refine', 'reverse', 'reaffirm', 'unclear']); anchors(e.anchors, `${p}.anchors`)
        if ('current' in e && typeof e.current !== 'boolean') err(`${p}.current`, 'expected boolean')
      })
      if (m.evolution.filter(e => isObj(e) && e.current === true).length > 1) err('$.evolution', 'more than one current stance')
    }
  }
  ids(m.related, '$.related'); ids(m.prerequisites, '$.prerequisites')
  if ('site_pages' in m && (!Array.isArray(m.site_pages) || m.site_pages.some(s => typeof s !== 'string' || !/^[a-z0-9-]+$/.test(s)))) err('$.site_pages', 'expected page slugs')
  if ('repos' in m) {
    if (!Array.isArray(m.repos)) err('$.repos', 'expected array')
    else m.repos.forEach((r, i) => {
      const p = `$.repos[${i}]`
      if (!isObj(r)) return err(p, 'expected object')
      keys(r, p, ['url', 'license'], ['reuse', 'note'])
      if (typeof r.url !== 'string' || !/^https:\/\/github\.com\/mattpocock\/[A-Za-z0-9._-]+$/.test(r.url)) err(`${p}.url`, 'expected https://github.com/mattpocock/<repo>')
      str(r.license, `${p}.license`)
      if ('reuse' in r) oneOf(r.reuse, `${p}.reuse`, ['mit-with-notice', 'link-only'])
      if ('note' in r && typeof r.note !== 'string') err(`${p}.note`, 'expected string')
    })
  }
  if (!isObj(m.sources_count)) err('$.sources_count', 'expected object')
  else {
    keys(m.sources_count, '$.sources_count', ['keyword_hits', 'curated'], ['method'])
    for (const k of ['keyword_hits', 'curated']) if (!Number.isInteger(m.sources_count[k])) err(`$.sources_count.${k}`, 'expected integer')
  }
  evidence(m.evidence, '$.evidence')
  for (const k of ['date_first', 'date_last']) if (!validDate(m[k])) err(`$.${k}`, 'expected YYYY-MM-DD')
  if ('updated' in m && !validDate(m.updated)) err('$.updated', 'expected YYYY-MM-DD')
  if (validDate(m.date_first) && validDate(m.date_last) && (m.date_first as string) > (m.date_last as string)) err('$.date_first', 'after date_last')
  oneOf(m.status, '$.status', ['draft', 'published'])
  if ('thin' in m && m.thin !== true) err('$.thin', 'expected true when present')
  return errors
}

/** Every anchor of a set, in page order, with where it sits. */
export function anchorsOf(m: Methodology): { anchor: Anchor; at: string }[] {
  return [
    ...m.claim.anchors.map(anchor => ({ anchor, at: 'claim' })),
    ...m.steps.flatMap(s => s.anchors.map(anchor => ({ anchor, at: `s${s.order}` }))),
    ...(m.pitfalls ?? []).flatMap((p, i) => p.anchors.map(anchor => ({ anchor, at: `pitfalls[${i}]` }))),
    ...(m.evolution ?? []).flatMap((e, i) => e.anchors.map(anchor => ({ anchor, at: `evolution[${i}]` }))),
  ]
}

// ---------------------------------------------------------------------------------------------
// Retrieval chunks (knowledge architecture §4): per set and language one overview, one per step,
// pitfalls (split past 800 characters) and evolution. Each chunk starts with the set's title and
// step, so it reads on its own. Quotes are copied from anchors unchanged; answers may only quote
// from `quotes`.

export type ChunkKind = 'overview' | 'step' | 'pitfalls' | 'evolution'
export interface MethodChunk {
  /** Unique across languages: `<lang>:<chunk_id>`. */
  key: string
  /** `m.<slug>#overview`, `m.<slug>#s<N>`, `m.<slug>#pitfalls` (`#pitfalls-2` …), `m.<slug>#evolution`. */
  chunk_id: string
  kind: ChunkKind
  methodology_id: string
  domain: Domain
  /** Step number for step chunks, otherwise null. */
  step: number | null
  /** The set's title in this language. */
  title: string
  text: string
  lang: Lang
  /** Page and anchor on this site, e.g. /zh/methods/pr-review#s4. */
  sitePath: string
  years: number[]
  date_last: string
  stance_status: 'current' | 'history'
  evolution_period?: string
  source_urls: string[]
  quotes: { text: string; url: string; date: string }[]
  evidence: Evidence
  schema_version: 1
}
export const CHUNK_MAX = 800

export function buildChunks(m: Methodology, lang: Lang): MethodChunk[] {
  const zh = lang === 'zh', t = (cn: string, en: string) => zh ? cn : en
  const title = m.title[lang], current = (m.evolution ?? []).find(e => e.current)
  const cite = (a: Anchor) => a.quote ? `"${a.quote}" (Matt Pocock, ${a.date}) ${a.url}` : `(Matt Pocock, ${a.date}) ${a.url}`
  const out: MethodChunk[] = []
  const emit = (suffix: string, kind: ChunkKind, step: number | null, body: string, anchors: Anchor[], anchor: string | undefined, extra: Partial<MethodChunk> = {}) => {
    const chunk_id = `${m.id}#${suffix}`
    out.push({ key: `${lang}:${chunk_id}`, chunk_id, kind, methodology_id: m.id, domain: m.domain, step, title, text: body, lang,
      sitePath: methodPath(lang, m.id, anchor), years: [...new Set(anchors.map(a => Number(a.date.slice(0, 4))))].sort(),
      date_last: anchors.map(a => a.date).sort().at(-1) ?? m.date_last, stance_status: 'current',
      source_urls: [...new Set(anchors.map(a => a.url))].sort(),
      quotes: anchors.filter(a => a.quote).map(a => ({ text: a.quote!, url: a.url, date: a.date })), evidence: m.evidence, schema_version: 1, ...extra })
  }
  const lines = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join('\n')
  emit('overview', 'overview', null, lines(
    title, m.question && `${t('问题', 'Question')}: ${m.question[lang]}`, `${t('核心主张', 'Core claim')}: ${m.claim.text[lang]}`,
    `${t('步骤', 'Steps')}:`, ...m.steps.map(s => `${s.order}. ${s.title[lang]}`),
    current && `${t('当前立场', 'Current stance')} (${current.period}): ${current.stance[lang]}`,
  ), [...m.claim.anchors, ...(current?.anchors ?? [])], 'claim', current ? { evolution_period: current.period } : {})
  for (const s of m.steps) emit(`s${s.order}`, 'step', s.order, lines(
    `${title} · ${t(`第 ${s.order} 步`, `Step ${s.order}`)}: ${s.title[lang]}`, s.how[lang], ...s.anchors.map(a => `- ${cite(a)}`),
  ), s.anchors, `s${s.order}`)
  const pitfalls = m.pitfalls ?? []
  if (pitfalls.length) {
    const head = `${title} · ${t('反例与坑', 'Pitfalls')}`
    const groups: Claim[][] = [[]]
    for (const p of pitfalls) {
      const g = groups.at(-1)!
      const next = lines(head, ...[...g, p].map(x => `- ${x.text[lang]} ${x.anchors.map(cite).join('; ')}`))
      if (g.length && next.length > CHUNK_MAX) groups.push([p]); else g.push(p)
    }
    groups.forEach((g, i) => emit(i ? `pitfalls-${i + 1}` : 'pitfalls', 'pitfalls', null,
      lines(head, ...g.map(x => `- ${x.text[lang]} ${x.anchors.map(cite).join('; ')}`)), g.flatMap(x => x.anchors), 'pitfalls'))
  }
  const evolution = m.evolution ?? []
  if (evolution.length) emit('evolution', 'evolution', null, lines(
    `${title} · ${t('观点演变', 'How the view changed')}`,
    ...evolution.map(e => `- ${e.period}${e.current ? t('(当前)', ' (current)') : ''}: ${e.stance[lang]}`),
  ), evolution.flatMap(e => e.anchors), 'evolution', { stance_status: 'history', evolution_period: evolution.map(e => e.period).join(', ') })
  return out
}

// ---------------------------------------------------------------------------------------------
// Markdown twins: the same headings, text and links as the HTML pages.

export const sectionTitles = {
  claim: ['核心主张', 'Core claim'], steps: ['步骤', 'Steps'], examples: ['例子', 'Examples'],
  pitfalls: ['反例与坑', 'Pitfalls'], evolution: ['观点演变', 'How the view changed'], related: ['相关', 'Related'],
} as const
export const sectionTitle = (key: keyof typeof sectionTitles, lang: Lang) => sectionTitles[key][lang === 'zh' ? 0 : 1]
export const translationLabel = '本站译意'
export const currentLabel = (lang: Lang) => lang === 'zh' ? '当前' : 'Current'
export const methodsTitle = (lang: Lang) => lang === 'zh' ? '方法论' : 'Methods'

// Licence names and notices appear only on the licences page, so the pages and their Markdown
// twins show a display copy: licence mentions are removed from the text and license_ref is
// dropped. Example titles omit engagement rankings. The source data keeps these details.
export const withoutLicence = (s: string) => s
  .replace(/\s*[(（]MIT[)）]/g, '').replace(/\s*[,，]\s*MIT(?=[)）])/g, '').replace(/\bMIT ?(?=库|library\b)/g, '')
export function forDisplay(m: Methodology): Methodology {
  const strip = (v: unknown, key = ''): unknown => typeof v === 'string' ? (key === 'url' || key === 'body' ? v : withoutLicence(key === 'title' ? v.replace(/\s*[(（][^()（）]*(?:互动最高|most engaged)[^()（）]*[)）]/gi, '') : v))
    : Array.isArray(v) ? v.map(x => strip(x, key))
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'license_ref').map(([k, x]) => [k, strip(x, k === 'zh' || k === 'en' ? key : k)]))
    : v
  return strip(m) as Methodology
}

export interface RelatedLink { href: string; label: string }
/** Related sets that exist, existing site pages, then repositories (with their licence). */
export function relatedLinks(m: Methodology, lang: Lang, sets: MethodSummary[], pages: { slug: string; title: string }[]): RelatedLink[] {
  return [
    ...(m.related ?? []).flatMap(id => { const s = sets.find(x => x.id === id); return s ? [{ href: methodPath(lang, id), label: s.title }] : [] }),
    ...(m.site_pages ?? []).flatMap(slug => { const p = pages.find(x => x.slug === slug); return p ? [{ href: `/${lang}/${slug}`, label: p.title }] : [] }),
    ...(m.repos ?? []).map(r => ({ href: r.url, label: r.url.replace('https://', '') })),
  ]
}

export function methodMarkdown(m: Methodology, lang: Lang, site: string, sets: MethodSummary[], pages: { slug: string; title: string }[]) {
  const zh = lang === 'zh'
  const abs = (href: string) => href.startsWith('/') ? `${site}${href.replace(/(#.*)?$/, '.md$1')}` : href
  const anchor = (a: Anchor) => a.quote
    ? `> "${a.quote}"\n>\n> [Matt Pocock · ${a.date}](${a.url})${zh && a.quote_zh ? `\n>\n> ${translationLabel}：${a.quote_zh}` : ''}`
    : `[Matt Pocock · ${a.date}](${a.url})`
  const block = (anchors: Anchor[]) => anchors.map(anchor).join('\n\n')
  const parts = [`# ${m.title[lang]}`, `## ${sectionTitle('claim', lang)}`, m.claim.text[lang], block(m.claim.anchors), `## ${sectionTitle('steps', lang)}`]
  for (const s of m.steps) parts.push(`### ${s.order}. ${s.title[lang]}`, s.how[lang], block(s.anchors))
  if (m.examples?.length) {
    parts.push(`## ${sectionTitle('examples', lang)}`)
    for (const e of m.examples) {
      const title = e.title?.[lang]
      if (e.origin === 'link-only' || e.body === undefined) { parts.push(`- [${title}](${e.url})`); continue }
      if (title) parts.push(`### ${title}`)
      const body = text(e.body, lang), fence = body.includes('```') ? '````' : '```'
      parts.push(`${fence}${e.lang ?? ''}\n${body}\n${fence}`)
      if (e.url) parts.push(`[${e.url.replace('https://', '')}](${e.url})`)
    }
  }
  if (m.pitfalls?.length) parts.push(`## ${sectionTitle('pitfalls', lang)}`, ...m.pitfalls.flatMap(p => [`- ${p.text[lang]}`, block(p.anchors)]))
  if (m.evolution?.length) parts.push(`## ${sectionTitle('evolution', lang)}`, ...m.evolution.map(e => `- ${e.period}${e.current ? ` · **${currentLabel(lang)}**` : ''}: ${e.stance[lang]} ${e.anchors.map(a => `[${a.date}](${a.url})`).join(' ')}`))
  const related = relatedLinks(m, lang, sets, pages)
  if (related.length) parts.push(`## ${sectionTitle('related', lang)}`, related.map(r => `- [${r.label}](${abs(r.href)})`).join('\n'))
  return parts.filter(Boolean).join('\n\n') + '\n'
}

export function methodsIndexMarkdown(sets: MethodSummary[], lang: Lang, site: string) {
  const groups = byDomain(sets).map(g => `## ${domainLabel(g.domain, lang)}\n\n${g.items.map(s => `- [${s.title}](${site}${methodPath(lang, s.id)}.md)${s.question ? `: ${s.question}` : ''}`).join('\n')}`)
  return `# ${methodsTitle(lang)}\n\n${groups.join('\n\n')}\n`
}
