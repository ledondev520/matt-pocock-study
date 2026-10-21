import { readFileSync } from 'node:fs'
import type Database from 'better-sqlite3'

/** Metadata and our own summaries only; never the source's full text. */
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
export const engagement = (r: CorpusRecord) => (r.metrics.likes ?? 0) + 2 * (r.metrics.reposts ?? 0) + (r.metrics.bookmarks ?? 0) + (r.metrics.stars ?? 0)

export function importCorpus(db: Database.Database, records: CorpusRecord[]) {
  db.exec(`CREATE TABLE IF NOT EXISTS corpus (id TEXT PRIMARY KEY, type TEXT, date TEXT, tags TEXT, zh TEXT, en TEXT, engagement REAL, record TEXT);
    CREATE VIRTUAL TABLE IF NOT EXISTS corpus_fts USING fts5(zh, en, tags, content='corpus', content_rowid='rowid');`)
  const insert = db.prepare('INSERT INTO corpus VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  db.transaction(() => {
    db.exec('DELETE FROM corpus; DELETE FROM corpus_fts;')
    for (const r of records) insert.run(r.id, r.type, r.date, JSON.stringify(r.tags), r.summary.zh, r.summary.en, engagement(r), JSON.stringify(r))
    db.exec("INSERT INTO corpus_fts(corpus_fts) VALUES ('rebuild')")
  })()
}
export function queryCorpus(db: Database.Database, query: CorpusQuery) {
  const clauses: string[] = [], args: (string | number)[] = []
  if (query.type) { clauses.push('type = ?'); args.push(query.type) }
  if (query.tag) { clauses.push('EXISTS (SELECT 1 FROM json_each(corpus.tags) WHERE value = ?)'); args.push(query.tag) }
  if (query.from) { clauses.push('substr(date, 1, 10) >= ?'); args.push(query.from) }
  if (query.to) { clauses.push('substr(date, 1, 10) <= ?'); args.push(query.to) }
  const q = query.q?.trim()
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`
    // Quoted FTS input is literal. LIKE covers CJK and partial-word searches.
    clauses.push(`(rowid IN (SELECT rowid FROM corpus_fts WHERE corpus_fts MATCH ?) OR zh LIKE ? ESCAPE '\\' OR en LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')`)
    args.push(`"${q.replace(/"/g, '""')}"`, like, like, like)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const { total } = db.prepare(`SELECT count(*) AS total FROM corpus ${where}`).get(...args) as { total: number }
  const sort = query.sort === 'date' ? 'date DESC, engagement DESC, id' : 'engagement DESC, date DESC, id'
  const rows = db.prepare(`SELECT record FROM corpus ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`).all(...args, query.limit ?? 50, query.offset ?? 0) as { record: string }[]
  return { total, items: rows.map(r => JSON.parse(r.record) as CorpusRecord) }
}
export function corpusTags(db: Database.Database): string[] {
  return (db.prepare('SELECT DISTINCT value AS tag FROM corpus, json_each(corpus.tags) ORDER BY tag').all() as { tag: string }[]).map(r => r.tag)
}
