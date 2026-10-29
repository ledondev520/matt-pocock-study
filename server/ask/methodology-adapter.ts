// Thin adapter from methodology chunks (knowledge-architecture §4: one chunk per overview, step,
// pitfalls and evolution of each methodology, plus `post` fallback chunks) to retrieval units.
// This is the only file that knows the chunk format; when the methodology module's export
// changes, change `MethodologyChunk` and `chunkUnits` here and nothing else.
// Supports existing chunks and language-specific keys/sitePath from the methodology exporter.
import { readFileSync } from 'node:fs'
import { getMethodology } from '../../scripts/methods'
import { isAllowedSourceUrl, isSitePath, type Anchor, type Unit } from './units'

export interface MethodologyChunk {
  key?: string
  chunk_id: string // "m.pr-review#s4", "post:<id>", "post:<id>#p2"
  kind: 'overview' | 'step' | 'pitfalls' | 'evolution' | 'post' | string
  methodology_id?: string
  methodology_ids?: string[]
  domain?: string
  step?: number | null
  title?: string | { zh?: string; en?: string }
  text?: string | { zh?: string; en?: string }
  body?: string
  lang?: string
  sitePath?: string
  year?: number
  years?: number[]
  source_url?: string
  quote?: { text: string; url: string; date?: string }
  date_last?: string
  stance_status?: 'current' | 'history' | 'superseded' | string
  evolution_period?: string
  source_urls?: string[]
  quotes?: { text: string; url: string; date?: string }[]
}

const pick = (value: MethodologyChunk['title']) => typeof value === 'string' ? value : [value?.zh, value?.en].filter(Boolean).join(' / ')

/** Corpus metadata alone cannot establish that a displayed title is our label. */
function hasMethodologyTitle(c: MethodologyChunk): boolean {
  const lang = c.lang
  if (c.kind !== 'post' || (lang !== 'zh' && lang !== 'en')) return false
  if (c.stance_status !== undefined && c.stance_status !== 'current' && c.stance_status !== 'history' && c.stance_status !== 'superseded') return false
  if (c.methodology_ids !== undefined && !Array.isArray(c.methodology_ids)) return false
  const ids = [...(c.methodology_id === undefined ? [] : [c.methodology_id]), ...(c.methodology_ids ?? [])]
  if (!ids.length || ids.some(id => typeof id !== 'string')) return false
  const methods = ids.map(id => getMethodology(id))
  // Compare the title before the adapter appends its stance suffix. Every supplied ID
  // must resolve, and at least one associated methodology must own this exact label.
  return methods.every(m => m !== undefined) && methods.some(m => m?.title[lang] === pick(c.title))
}

/** Reads a JSON array or JSON Lines file of chunks. */
export function readChunks(file: string): MethodologyChunk[] {
  const raw = readFileSync(file, 'utf8').trim()
  return raw.startsWith('[') ? JSON.parse(raw) : raw.split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
}

export function chunkUnits(chunks: MethodologyChunk[]): Unit[] {
  const units: Unit[] = []
  const seen = new Set<string>()
  for (const c of chunks) {
    const text = pick(c.text) || c.body || ''
    if (!c.chunk_id || !text) continue
    const quotes: Anchor[] = [...(c.quotes ?? []), ...(c.quote ? [c.quote] : [])].filter(q => q && typeof q.text === 'string' && isAllowedSourceUrl(q.url)).map(q => ({ text: q.text, url: q.url, date: q.date }))
    const sourceUrl = [...quotes.map(q => q.url), c.source_url, ...(c.source_urls ?? [])].find(isAllowedSourceUrl)
    const [method, anchor] = c.chunk_id.split('#')
    const slug = method?.replace(/^m\./, '')
    const derived = c.kind !== 'post' && slug && /^[a-z0-9-]+$/.test(slug) ? `/${c.lang === 'en' ? 'en' : 'zh'}/methods/${slug}${anchor && /^s\d+$/.test(anchor) ? `#${anchor}` : ''}` : undefined
    const sitePath = isSitePath(c.sitePath) ? c.sitePath : derived
    const stance = c.stance_status && c.stance_status !== 'current' ? ` (${c.stance_status})` : ''
    const id = c.kind === 'post' ? c.chunk_id : `method:${c.key ?? c.chunk_id}`
    if (seen.has(id)) continue
    seen.add(id)
    // Only repo-owned methodology labels qualify for the displayed-title exemption.
    units.push({ id, kind: c.kind === 'post' ? 'post' : 'method', title: `${pick(c.title)}${stance}`, ...(hasMethodologyTitle(c) ? { titleOrigin: 'methodology' as const } : {}), text, date: c.date_last, sourceUrl, sitePath, quotes })
  }
  return units
}
