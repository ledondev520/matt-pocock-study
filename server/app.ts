import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import type Database from 'better-sqlite3'
import { acceptLanguageHint, pickLang, routeInfo } from '../src/lib/lang'
import { listPages, searchPages } from './db'
import { loadCorpus, queryCorpus, importCorpus, corpusTags, type CorpusRecord } from './corpus'

export function createApp(db: Database.Database, staticRoot?: string, corpus: CorpusRecord[] = loadCorpus()) {
  importCorpus(db, corpus)
  const app = new Hono()
  app.use('*', async (c, next) => {
    await next()
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
    c.header('Cache-Control', c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate')
  })
  app.get('/api/corpus/tags', (c) => c.json(corpusTags(db)))
  app.get('/api/health', (c) => c.json({ ok: true }))
  app.get('/api/lang-hint', (c) => c.json({ lang: acceptLanguageHint(c.req.header('Accept-Language')) }))
  app.get('/api/pages', (c) => c.json(listPages(db, pickLang(c.req.query('lang') ?? null, undefined))))
  app.get('/api/search', (c) => {
    const query = c.req.query('q') ?? ''
    if (query.length > 200 || /[\p{Cc}]/u.test(query)) return c.json({ error: 'Search query is too long' }, 400)
    return c.json(searchPages(db, pickLang(c.req.query('lang') ?? null, undefined), query))
  })
  app.get('/api/corpus', (c) => {
    const type = c.req.query('type')
    const sort = c.req.query('sort')
    if (type && !['post', 'article', 'repo', 'web'].includes(type)) return c.json({ error: 'Unknown type' }, 400)
    if (sort && !['engagement', 'date'].includes(sort)) return c.json({ error: 'Unknown sort' }, 400)
    const q = c.req.query('q') ?? ''
    const tag = c.req.query('tag') ?? ''
    const from = c.req.query('from'), to = c.req.query('to')
    const validDate = (value: string | undefined) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value)
    if (q.length > 200 || /[\p{Cc}]/u.test(q) || tag.length > 100 || !validDate(from) || !validDate(to) || (from && to && from > to)) return c.json({ error: 'Invalid search or date range' }, 400)
    const limit = Number(c.req.query('limit') ?? 50)
    const offset = Number(c.req.query('offset') ?? 0)
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return c.json({ error: 'Bad paging' }, 400)
    return c.json(queryCorpus(db, { q: c.req.query('q'), type, tag: c.req.query('tag'), from: c.req.query('from'), to: c.req.query('to'), sort, limit, offset }))
  })
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))
  if (staticRoot) {
    app.use('*', serveStatic({ root: staticRoot }))
    app.get('*', (c) => {
      const html = readFileSync(join(staticRoot, `${routeInfo(c.req.path).lang}/404.html`), 'utf8')
      return c.html(html, 404)
    })
  }
  return app
}
