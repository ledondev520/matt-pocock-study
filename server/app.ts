import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { brotliCompress, constants, gzip } from 'node:zlib'
import { Hono } from 'hono'
import { COMPRESSIBLE_CONTENT_TYPE_REGEX } from 'hono/compress'
import { parseAccept } from 'hono/utils/accept'
import { serveStatic } from '@hono/node-server/serve-static'
import type Database from 'better-sqlite3'
import { acceptLanguageHint, pickLang, routeInfo } from '../src/lib/lang'
import { listPages, searchPages } from './db'
import { loadCorpus, queryCorpus, importCorpus, corpusTags, type CorpusRecord } from './corpus'

const encodeBrotli = promisify(brotliCompress)
const encodeGzip = promisify(gzip)

// Allow Cloudflare's automatically injected Web Analytics beacon script.
export const PAGE_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"

function negotiateEncoding(header: string | undefined) {
  const accepted = parseAccept(header ?? '')
  const wildcard = accepted.find(value => value.type === '*')?.q
  // Unlisted identity stays acceptable (RFC 9110 §12.5.3) but ranks below every listed coding.
  // The wildcard may only refuse it (`*;q=0`); a positive wildcard never raises it above 0.001.
  const quality = (encoding: string) => accepted.find(value => value.type.toLowerCase() === encoding)?.q
    ?? (encoding === 'identity' ? (wildcard === 0 ? 0 : 0.001) : wildcard ?? 0)
  // Stable sorting preserves the server preference for equal quality values.
  const encoding = (['br', 'gzip', 'identity'] as const).filter(value => quality(value) > 0)
    .sort((a, b) => quality(b) - quality(a))[0]
  return { encoding, identityAllowed: quality('identity') > 0 }
}

export function createApp(db: Database.Database, staticRoot?: string, corpus: CorpusRecord[] = loadCorpus()) {
  importCorpus(db, corpus)
  const app = new Hono()
  app.use('*', async (c, next) => {
    if (c.req.method !== 'HEAD') return next()
    // Hono routes HEAD as GET but leaves the raw method unchanged. Normalize it
    // for the entire representation pipeline, then discard only the final body.
    const original = c.req.raw
    c.req.raw = new Request(original, { method: 'GET' })
    try {
      await next()
      await c.res.body?.cancel()
      c.res = new Response(null, c.res)
    } finally { c.req.raw = original }
  })
  app.use('*', async (c, next) => {
    await next()
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header('Content-Security-Policy', PAGE_CSP)
    c.header('Cache-Control', c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
    const vary = c.res.headers.get('Vary')
    if (vary !== '*' && !vary?.split(',').some(value => value.trim().toLowerCase() === 'accept-encoding')) c.header('Vary', vary ? `${vary}, Accept-Encoding` : 'Accept-Encoding')
  })
  // Hash after compression so each wire representation has its own strong validator.
  app.use('*', async (c, next) => {
    await next()
    if (c.res.status !== 200 || !['GET', 'HEAD'].includes(c.req.method)) return
    const existing = c.res.headers.get('ETag')
    // Buffer once instead of clone(): re-wrapping a tee'd file stream in c.header() could
    // intermittently throw "body disturbed or locked" and turn the response into a 500.
    const bytes = new Uint8Array(await c.res.arrayBuffer())
    c.res = new Response(bytes, c.res)
    const tag = existing && !existing.startsWith('W/') ? existing : `"${createHash('sha256').update(bytes).digest('hex')}"`
    c.res.headers.set('ETag', tag)
    const condition = c.req.header('If-None-Match')
    if (condition === '*' || condition?.split(',').some(value => value.trim().replace(/^W\//, '') === tag)) {
      const headers = new Headers(c.res.headers)
      await c.res.body?.cancel()
      c.res = new Response(null, { status: 304, headers })
      for (const name of ['Content-Length', 'Content-Encoding', 'Content-Type']) c.res.headers.delete(name)
    }
  })
  app.use('*', async (c, next) => {
    await next()
    const { encoding, identityAllowed } = negotiateEncoding(c.req.header('Accept-Encoding'))
    const notAcceptable = async () => {
      if (!c.res.bodyUsed) await c.res.body?.cancel()
      c.res = new Response('Not Acceptable', { status: 406, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': '14' } })
      c.header('Content-Length', '14')
      c.res.headers.delete('Content-Encoding')
      c.res.headers.delete('ETag')
    }
    if (!encoding) return notAcceptable()
    if (!c.res.body || c.res.headers.has('Content-Encoding')) return
    const bytes = new Uint8Array(await c.res.arrayBuffer())
    const canCompress = c.res.status !== 206 && !c.res.headers.has('Transfer-Encoding')
      && COMPRESSIBLE_CONTENT_TYPE_REGEX.test(c.res.headers.get('Content-Type') ?? '')
      && !/(?:^|,)\s*no-transform\s*(?:,|$)/i.test(c.res.headers.get('Cache-Control') ?? '')
    if (!canCompress && !identityAllowed) return notAcceptable()
    // Keep small responses plain only when identity is acceptable.
    const compressed = canCompress && encoding !== 'identity' && (bytes.byteLength >= 1024 || !identityAllowed)
    // On-the-fly Brotli uses quality 5: q11 (Node's default) costs too much CPU per request.
    const result = compressed ? await (encoding === 'br' ? encodeBrotli(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }) : encodeGzip(bytes)) : bytes
    // Update the context first: Hono carries its existing headers into a new response.
    c.res.headers.set('Content-Length', String(result.byteLength))
    if (compressed) {
      c.res.headers.set('Content-Encoding', encoding)
      c.res.headers.delete('ETag')
    }
    c.res = new Response(result, c.res)
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
    })
    app.use('*', async (c, next) => {
      // serveStatic expects bare tokens; use the same negotiation as dynamic responses.
      const original = c.req.raw
      const { encoding } = negotiateEncoding(c.req.header('Accept-Encoding'))
      const headers = new Headers(original.headers)
      headers.set('Accept-Encoding', encoding ?? '')
      c.req.raw = new Request(original, { headers })
      try {
        const response = await staticFiles(c, next)
        if (response instanceof Response && /^\/(zh|en)\/(?:methods\/)?[a-z0-9-]+\.md$/.test(c.req.path)) response.headers.set('Content-Type', 'text/markdown; charset=utf-8')
        return response
      } finally { c.req.raw = original }
    })
    app.get('*', (c) => c.html(missingHtml(c.req.path), 404))
  }
  return app
}
