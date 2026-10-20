import { readFileSync } from 'node:fs'

/** One record of data/corpus-index.json: metadata + our own one-line summaries, never original text. */
export type CorpusRecord = {
  id: string
  type: 'post' | 'article' | 'repo' | 'web'
  url: string
  date: string
  tags: string[]
  metrics: Partial<Record<'likes' | 'reposts' | 'replies' | 'quotes' | 'bookmarks' | 'impressions' | 'stars', number>>
  summary: { zh: string; en: string }
}

export type CorpusQuery = { q?: string; type?: string; tag?: string; from?: string; to?: string; sort?: string; limit?: number; offset?: number }

export function loadCorpus(path = 'data/corpus-index.json'): CorpusRecord[] {
  return JSON.parse(readFileSync(path, 'utf8')) as CorpusRecord[]
}

export const engagement = (r: CorpusRecord) =>
  (r.metrics.likes ?? 0) + 2 * (r.metrics.reposts ?? 0) + (r.metrics.bookmarks ?? 0) + (r.metrics.stars ?? 0)

/** Placeholder in-memory filter; workstream B moves this into SQLite (see PLAN.md). */
export function queryCorpus(records: CorpusRecord[], query: CorpusQuery) {
  const q = query.q?.trim().toLowerCase()
  let rows = records.filter((r) =>
    (!query.type || r.type === query.type) &&
    (!query.tag || r.tags.includes(query.tag)) &&
    (!query.from || r.date >= query.from) &&
    (!query.to || r.date <= query.to) &&
    (!q || `${r.summary.zh} ${r.summary.en} ${r.tags.join(' ')}`.toLowerCase().includes(q)))
  rows = [...rows].sort(query.sort === 'date' ? (a, b) => b.date.localeCompare(a.date) : (a, b) => engagement(b) - engagement(a))
  const offset = query.offset ?? 0
  const limit = Math.min(query.limit ?? 50, 200)
  return { total: rows.length, items: rows.slice(offset, offset + limit) }
}
