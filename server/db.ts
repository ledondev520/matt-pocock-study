import Database from 'better-sqlite3'
import type { Page, PageSummary } from '../src/lib/content'
import type { Lang } from '../src/lib/lang'

export interface SearchResult extends PageSummary { excerpt: string }
export function createIndex(pages: Page[], filename = ':memory:') {
  const db = new Database(filename)
  // This is a disposable index rebuilt from repository content at build/start.
  db.exec(`DROP TABLE IF EXISTS pages;
    CREATE TABLE pages (
      lang TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT NOT NULL,
      number INTEGER NOT NULL, sort_order INTEGER NOT NULL, section TEXT NOT NULL,
      summary TEXT NOT NULL, head TEXT NOT NULL, updated TEXT NOT NULL, markdown TEXT NOT NULL,
      PRIMARY KEY (lang, slug)
    );`)
  const insert = db.prepare('INSERT INTO pages VALUES (@lang, @slug, @title, @subtitle, @number, @order, @section, @summary, @head, @updated, @markdown)')
  db.transaction(() => { for (const page of pages) insert.run(page) })()
  return db
}
const columns = 'lang, slug, title, subtitle, number, sort_order AS "order", section, summary, head, updated'
export function listPages(db: Database.Database, lang: Lang): PageSummary[] {
  return db.prepare(`SELECT ${columns} FROM pages WHERE lang = ? ORDER BY sort_order, slug`).all(lang) as PageSummary[]
}
export function searchPages(db: Database.Database, lang: Lang, query: string): SearchResult[] {
  if (!query.trim()) return []
  const pattern = `%${query.trim().replace(/[\\%_]/g, '\\$&')}%`
  return db.prepare(`SELECT ${columns}, substr(markdown, 1, 180) AS excerpt FROM pages
    WHERE lang = ? AND (title LIKE ? ESCAPE '\\' OR markdown LIKE ? ESCAPE '\\')
    ORDER BY sort_order, slug LIMIT 20`).all(lang, pattern, pattern) as SearchResult[]
}
