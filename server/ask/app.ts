// POST /api/ask: one question in, a method-shaped answer with short quotes and source links out.
// Order of checks: input -> per-IP minute limit -> cache -> retrieval (no match: "not found",
// no model call) -> concurrency -> per-IP day limit -> site-wide day limit -> circuit breaker ->
// DeepSeek. Every limit after the cache counts model calls only; the minute limit counts every
// request. Nothing here stores or logs the question text or the client address.
import { createHash, createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { Hono, type Context } from 'hono'
import { buildMessages, citationFor, notFoundMessage, parseAnswer, PROMPT_VERSION, type AskResponse, type Citation, type Lang } from './answer'
import type { AskConfig } from './config'
import { callDeepSeek, chatRequest, CircuitBreaker, UpstreamError } from './deepseek'
import { createRetriever, relevant } from './retrieve'
import type { Store } from './store'
import type { Unit } from './units'

const MINUTE = 60_000
const DAY = 86_400_000
const UTC8 = 8 * 3_600_000
const MAX_BODY_BYTES = 4096

export interface AskDeps {
  config: AskConfig
  units: Unit[]
  store: Store
  now?: () => number
  fetch?: typeof fetch
  /** One JSON line per request. Defaults to stdout. */
  log?: (line: string) => void
  /** Address of the TCP peer (nginx in production). */
  peer?: (c: Context) => string | undefined
}

/** The day in UTC+8 (limits reset at 00:00 UTC+8). */
export const dayOf = (now: number) => new Date(now + UTC8).toISOString().slice(0, 10)
const secondsToNextDay = (now: number) => Math.ceil((DAY - ((now + UTC8) % DAY)) / 1000)

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
/** The client address: X-Real-IP (set by nginx from Cloudflare's header) is believed only when
 * the TCP peer is loopback; otherwise the peer itself. IPv6 is counted per /64. */
export function clientAddress(peer: string | undefined, realIp: string | undefined): string {
  const candidate = peer && LOOPBACK.has(peer) ? realIp?.trim() : peer
  if (!candidate || !isIP(candidate)) return 'unknown'
  if (isIP(candidate) === 4 || candidate.startsWith('::ffff:')) return candidate.replace(/^::ffff:/, '')
  const [head] = candidate.split('::')
  const groups = candidate.includes('::') ? [...head.split(':').filter(Boolean)] : candidate.split(':')
  return `${[...groups, '0', '0', '0', '0'].slice(0, 4).join(':')}::/64`
}

/** NFKC, unsupported control characters rejected, whitespace collapsed. */
export function normalizeQuestion(value: unknown, maxChars: number): { ok: true; q: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'q must be a string' }
  const text = value.normalize('NFKC')
  if (/[^\P{Cc}\t\n\r]/u.test(text)) return { ok: false, error: 'q contains control characters' }
  const q = text.replace(/\s+/g, ' ').trim()
  const length = [...q].length
  if (!length) return { ok: false, error: 'q is empty' }
  if (length > maxChars) return { ok: false, error: `q is longer than ${maxChars} characters` }
  return { ok: true, q }
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
export const cacheKey = (q: string, lang: Lang, version: string) =>
  sha256([q.toLowerCase().replace(/[\s?？!！。.,，;；:：、]+$/u, ''), lang, version].join('\u0000'))

export function createAskApp(deps: AskDeps) {
  const { config, store } = deps
  const now = deps.now ?? Date.now
  const log = deps.log ?? ((line: string) => process.stdout.write(`${line}\n`))
  const peer = deps.peer ?? ((c: Context) => (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress)
  const retriever = createRetriever(deps.units)
  const indexVersion = sha256(JSON.stringify(deps.units.map(u => [u.id, u.sitePath ?? null]))).slice(0, 12)
  const version = `${indexVersion}:${config.model}:${PROMPT_VERSION}`
  const breaker = new CircuitBreaker(config.breakerFailures, config.breakerCoolDownMs)
  const inFlight = new Map<string, number>()
  let calls = 0
  const cacheTtl = config.cacheDays * DAY
  let lastPrune = 0

  const app = new Hono()
  app.use('*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  })

  app.get('/healthz', c => {
    const t = now()
    return c.json({ ok: true, enabled: config.enabled, model: config.model, units: retriever.size, breaker: breaker.state(t),
      today: { calls: store.count('site', `d:${dayOf(t)}`), limit: config.globalPerDay } })
  })

  app.post('/api/ask', async c => {
    const started = now()
    const record = (fields: Record<string, unknown>) => log(JSON.stringify({ t: new Date(started).toISOString(), ...fields, ms: now() - started }))
    if (!/^application\/json\b/i.test(c.req.header('Content-Type') ?? '')) return c.json({ error: 'Content-Type must be application/json' }, 415)
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    if (bytes.byteLength > MAX_BODY_BYTES) return c.json({ error: 'Request body is too large' }, 413)
    let body: { q?: unknown; lang?: unknown }
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { return c.json({ error: 'Body must be JSON' }, 400) }
    if (!body || typeof body !== 'object') return c.json({ error: 'Body must be a JSON object' }, 400)
    const lang: Lang = body.lang === 'en' ? 'en' : 'zh'
    if (body.lang !== undefined && body.lang !== 'zh' && body.lang !== 'en') return c.json({ error: 'lang must be zh or en' }, 400)
    const input = normalizeQuestion(body.q, config.maxChars)
    if (!input.ok) return c.json({ error: input.error }, 400)
    const { q } = input

    const t = now()
    if (t - lastPrune > MINUTE) { store.prune(t); lastPrune = t }
    const day = dayOf(t)
    const ip = createHmac('sha256', store.secret()).update(`${day}\u0000${clientAddress(peer(c), c.req.header('X-Real-IP'))}`).digest('hex').slice(0, 16)
    const key = cacheKey(q, lang, version)
    const base = { ip, q: key.slice(0, 16) }
    const ipKey = `ip:${ip}`

    if (!store.take(ipKey, `m:${Math.floor(t / MINUTE)}`, config.perIpPerMinute, 2 * MINUTE, t)) {
      record({ ...base, status: 429, reason: 'per_ip_minute' })
      c.header('Retry-After', String(Math.ceil((MINUTE - (t % MINUTE)) / 1000)))
      return c.json({ error: 'Too many questions this minute', reason: 'per_ip_minute', retryAfter: Math.ceil((MINUTE - (t % MINUTE)) / 1000) }, 429)
    }

    const cached = cacheTtl ? store.getCache(key, t) : undefined
    if (cached) {
      record({ ...base, status: 200, cached: true })
      return c.json({ ...(JSON.parse(cached) as AskResponse), cached: true })
    }

    const hits = relevant(retriever.search(q, config.contextUnits * 3), config.minScore)
    const units = dedupe(hits.map(h => h.unit)).slice(0, config.contextUnits)
    const finish = (response: AskResponse, extra: Record<string, unknown> = {}) => {
      if (cacheTtl && response.mode !== 'search') store.putCache(key, JSON.stringify(response), cacheTtl, t)
      record({ ...base, status: 200, mode: response.mode, cached: false, ...extra })
      return c.json(response)
    }
    if (!units.length) return finish({ mode: 'not_found', message: notFoundMessage(lang), citations: [], cached: false })

    const fallback = (reason: string, extra: Record<string, unknown> = {}): Response => {
      const citations: Citation[] = units.map((u, i) => ({ ...citationFor(u, i + 1, config.siteUrl), snippet: snippet(u) }))
      return finish({ mode: 'search', reason, message: '', citations, cached: false }, { reason, ...extra })
    }
    if (!config.enabled || !config.apiKey) return fallback('disabled')
    if ((inFlight.get(ip) ?? 0) >= 1) {
      record({ ...base, status: 429, reason: 'per_ip_concurrent' })
      return c.json({ error: 'One question at a time', reason: 'per_ip_concurrent', retryAfter: 5 }, 429)
    }
    if (calls >= config.maxConcurrent) return fallback('busy')
    if (store.count(ipKey, `d:${day}`) >= config.perIpPerDay) {
      record({ ...base, status: 429, reason: 'per_ip_day' })
      c.header('Retry-After', String(secondsToNextDay(t)))
      return c.json({ error: 'Daily question limit reached', reason: 'per_ip_day', retryAfter: secondsToNextDay(t) }, 429)
    }
    // No await between these checks and the two counter writes, so they cannot interleave.
    if (store.count('site', `d:${day}`) >= config.globalPerDay) return fallback('global_limit')
    if (!breaker.allow(t)) return fallback('breaker_open')
    store.hit('site', `d:${day}`, 2 * DAY, t)
    store.hit(ipKey, `d:${day}`, 2 * DAY, t)

    inFlight.set(ip, (inFlight.get(ip) ?? 0) + 1)
    calls++
    try {
      const result = await callDeepSeek({ baseUrl: config.baseUrl, apiKey: config.apiKey, request: chatRequest(config.model, buildMessages(q, lang, units)), timeoutMs: config.timeoutMs, fetch: deps.fetch })
      breaker.success()
      const usage = { inTokens: result.inputTokens, outTokens: result.outputTokens }
      const parsed = parseAnswer(result.content, units, config.siteUrl)
      if (!parsed) return fallback('unverified', usage)
      if (!parsed.found) return finish({ mode: 'not_found', message: notFoundMessage(lang), citations: [], cached: false }, usage)
      return finish({ mode: 'answer', title: parsed.title, points: parsed.points, citations: parsed.citations, cached: false }, usage)
    } catch (error) {
      breaker.failure(now())
      return fallback('upstream_error', { upstream: error instanceof UpstreamError ? error.kind : 'unknown' })
    } finally {
      calls--
      const left = (inFlight.get(ip) ?? 1) - 1
      if (left) inFlight.set(ip, left)
      else inFlight.delete(ip)
    }
  })
  app.all('/api/ask', c => { c.header('Allow', 'POST'); return c.json({ error: 'Method not allowed' }, 405) })
  app.all('*', c => c.json({ error: 'Not found' }, 404))
  return app
}

/** One unit per original link: a post beats our summary or note of the same post. Methodology
 * chunks are never merged (several steps can cite the same post). */
function dedupe(units: Unit[]): Unit[] {
  const rank: Record<Unit['kind'], number> = { method: 0, post: 1, note: 2, page: 3, summary: 4 }
  const keyOf = (u: Unit) => u.kind === 'method' ? u.id : u.sourceUrl ?? u.sitePath ?? u.id
  const best = new Map<string, Unit>()
  for (const u of units) {
    const seen = best.get(keyOf(u))
    if (!seen || rank[u.kind] < rank[seen.kind]) best.set(keyOf(u), u)
  }
  return units.filter(u => best.get(keyOf(u)) === u)
}

/** Short excerpt for the search fallback: at most 25 words or 60 CJK characters. */
function snippet(unit: Unit) {
  const text = unit.text
  if (/\p{Script=Han}/u.test(text.slice(0, 40))) return [...text].length > 60 ? `${[...text].slice(0, 60).join('')}…` : text
  const words = text.split(/\s+/)
  return words.length > 25 ? `${words.slice(0, 25).join(' ')}…` : text
}
