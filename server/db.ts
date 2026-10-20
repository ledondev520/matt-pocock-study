import Database from 'better-sqlite3'
import type { Page, PageSummary } from '../src/lib/content'
import type { Lang } from '../src/lib/lang'

export interface SearchResult extends PageSummary {
  excerpt: string
}

export function createIndex(pages: Page[], filename = ':memory:') {
  const db = new Database(filename)
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      lang TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL,
      sort_order INTEGER NOT NULL, section TEXT NOT NULL, markdown TEXT NOT NULL,
      PRIMARY KEY (lang, slug)
    );
  `)
  const insert = db.prepare('INSERT INTO pages VALUES (@lang, @slug, @title, @order, @section, @markdown)')
  db.transaction(() => {
    db.exec('DELETE FROM pages')
    for (const page of pages) insert.run(page)
  })()
  return db
}

const columns = 'lang, slug, title, sort_order AS "order", section'

export function listPages(db: Database.Database, lang: Lang): PageSummary[] {
  return db.prepare(`SELECT ${columns} FROM pages WHERE lang = ? ORDER BY sort_order, slug`).all(lang) as PageSummary[]
}

export function searchPages(db: Database.Database, lang: Lang, query: string): SearchResult[] {
  if (!query.trim()) return []
  // LIKE keeps the tiny index portable and supports Chinese without a tokenizer.
  const pattern = `%${query.trim().replace(/[\\%_]/g, '\\$&')}%`
  return db.prepare(`SELECT ${columns}, substr(markdown, 1, 180) AS excerpt FROM pages
    WHERE lang = ? AND (title LIKE ? ESCAPE '\\' OR markdown LIKE ? ESCAPE '\\')
    ORDER BY sort_order, slug LIMIT 20`).all(lang, pattern, pattern) as SearchResult[]
}
