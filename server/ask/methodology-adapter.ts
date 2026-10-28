// Thin adapter from methodology chunks (knowledge-architecture §4: one chunk per overview, step,
// pitfalls and evolution of each methodology, plus `post` fallback chunks) to retrieval units.
// This is the only file that knows the chunk format; when the methodology module's export
// changes, change `MethodologyChunk` and `chunkUnits` here and nothing else.
// Supports existing chunks and language-specific keys/sitePath from the methodology exporter.
import { readFileSync } from 'node:fs'
import { isAllowedSourceUrl, isSitePath, type Anchor, type Unit } from './units'

export interface MethodologyChunk {
  key?: string
  chunk_id: string // "m.pr-review#s4", "post:<id>", "post:<id>#p2"
  kind: 'overview' | 'step' | 'pitfalls' | 'evolution' | 'post' | string
  methodology_id?: string
  step?: number | null
  title?: string | { zh?: string; en?: string }
  text?: string | { zh?: string; en?: string }
  body?: string
  lang?: string
  sitePath?: string
  source_url?: string
  quote?: { text: string; url: string; date?: string }
  date_last?: string
  stance_status?: 'current' | 'history' | 'superseded' | string
  source_urls?: string[]
  quotes?: { text: string; url: string; date?: string }[]
}

const pick = (value: MethodologyChunk['title']) => typeof value === 'string' ? value : [value?.zh, value?.en].filter(Boolean).join(' / ')

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
    units.push({ id, kind: c.kind === 'post' ? 'post' : 'method', title: `${pick(c.title)}${stance}`, text, date: c.date_last, sourceUrl, sitePath, quotes })
  }
  return units
}
