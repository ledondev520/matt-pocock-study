import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import type Database from 'better-sqlite3'
import { acceptLanguageHint, pickLang } from '../src/lib/lang'
import { listPages, searchPages } from './db'
import { loadCorpus, queryCorpus, type CorpusRecord } from './corpus'

export function createApp(db: Database.Database, staticRoot?: string, corpus: CorpusRecord[] = loadCorpus()) {
  const app = new Hono()
  app.get('/api/health', (c) => c.json({ ok: true }))
  app.get('/api/lang-hint', (c) => c.json({ lang: acceptLanguageHint(c.req.header('Accept-Language')) }))
  app.get('/api/pages', (c) => c.json(listPages(db, pickLang(c.req.query('lang') ?? null, undefined))))
  app.get('/api/search', (c) => {
    const query = c.req.query('q') ?? ''
    if (query.length > 200) return c.json({ error: 'Search query is too long' }, 400)
    return c.json(searchPages(db, pickLang(c.req.query('lang') ?? null, undefined), query))
  })
  app.get('/api/corpus', (c) => {
    const type = c.req.query('type')
    const sort = c.req.query('sort')
    if (type && !['post', 'article', 'repo', 'web'].includes(type)) return c.json({ error: 'Unknown type' }, 400)
    if (sort && !['engagement', 'date'].includes(sort)) return c.json({ error: 'Unknown sort' }, 400)
    const limit = Number(c.req.query('limit') ?? 50)
    const offset = Number(c.req.query('offset') ?? 0)
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(offset) || offset < 0) return c.json({ error: 'Bad paging' }, 400)
    return c.json(queryCorpus(corpus, { q: c.req.query('q'), type, tag: c.req.query('tag'), from: c.req.query('from'), to: c.req.query('to'), sort, limit, offset }))
  })
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))
  if (staticRoot) {
    app.use('*', serveStatic({ root: staticRoot }))
    app.get('*', serveStatic({ root: staticRoot, path: 'index.html' }))
  }
  return app
}
