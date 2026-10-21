import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { Hono } from 'hono'
import { compress } from 'hono/compress'
import { parseAccept } from 'hono/utils/accept'
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
    c.header('Cache-Control', c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
    const vary = c.res.headers.get('Vary')
    if (vary !== '*' && !vary?.split(',').some(value => value.trim().toLowerCase() === 'accept-encoding')) c.header('Vary', vary ? `${vary}, Accept-Encoding` : 'Accept-Encoding')
  })
  // Hash after compression so each wire representation has its own strong validator.
  app.use('*', async (c, next) => {
    await next()
    if (c.res.status === 206 || c.res.status === 304) return
    const existing = c.res.headers.get('ETag')
    const tag = existing && !existing.startsWith('W/') ? existing : `"${createHash('sha256').update(new Uint8Array(await c.res.clone().arrayBuffer())).digest('hex')}"`
    c.header('ETag', tag)
    const condition = c.req.header('If-None-Match')
    if (['GET', 'HEAD'].includes(c.req.method) && (condition === '*' || condition?.split(',').some(value => value.trim().replace(/^W\//, '') === tag))) {
      const headers = new Headers(c.res.headers)
      await c.res.body?.cancel()
      c.res = new Response(null, { status: 304, headers })
      for (const name of ['Content-Length', 'Content-Encoding', 'Content-Type']) c.res.headers.delete(name)
    }
  })
  app.use('*', compress({ encoding: 'gzip', threshold: 1024 }))
  app.use('*', async (c, next) => {
    await next()
    // Hono only applies the threshold when Content-Length is known.
    if (c.res.body && !c.res.headers.has('Content-Length')) c.header('Content-Length', String((await c.res.clone().arrayBuffer()).byteLength))
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
    const missingHtml = (path: string) => readFileSync(join(staticRoot, `${routeInfo(path).lang}/404.html`), 'utf8')
    app.use('*', async (c, next) => {
      const path = new URL(c.req.url).pathname
      // Static serving must never decode or expose HTML aliases that the
      // shared SSR/client route grammar interprets as a missing page.
      const asset = !path.includes('%') && /\.[a-z0-9]+$/i.test(path) && !/\.html$/i.test(path)
      if (!routeInfo(path).valid && !asset) return c.html(missingHtml(path), 404)
      await next()
    })
    const staticFiles = serveStatic({
      root: staticRoot,
      precompressed: true,
      onFound: async (path, c) => {
        // Static HEAD responses have no body; hash the selected file for GET/HEAD parity.
        c.header('ETag', `"${createHash('sha256').update(await readFile(path)).digest('hex')}"`)
      },
    })
    app.use('*', async (c, next) => {
      // serveStatic expects bare encoding tokens; honor quality values before calling it.
      const original = c.req.raw
      const accepted = parseAccept(original.headers.get('Accept-Encoding') ?? '')
      const quality = (encoding: string) => accepted.find(value => value.type.toLowerCase() === encoding)?.q ?? accepted.find(value => value.type === '*')?.q ?? 0
      const best = Math.max(quality('br'), quality('gzip'))
      const headers = new Headers(original.headers)
      headers.set('Accept-Encoding', ['br', 'gzip'].filter(encoding => best > 0 && quality(encoding) === best).join(', '))
      c.req.raw = new Request(original, { headers })
      try {
        const response = await staticFiles(c, next)
        if (response && /^\/(zh|en)\/[a-z0-9-]+\.md$/.test(c.req.path)) response.headers.set('Content-Type', 'text/markdown; charset=utf-8')
        return response
      } finally { c.req.raw = original }
    })
    app.get('*', (c) => c.html(missingHtml(c.req.path), 404))
  }
  return app
}
