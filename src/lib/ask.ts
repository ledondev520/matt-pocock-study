// Browser client for POST /api/ask (same origin; the site's CSP allows connect-src 'self' only).
// Failures become typed results so the home page can quietly return to local search.
import type { Lang } from './lang'

export const ASK_MAX_CHARS = 300

export interface AskCitation { n: number; kind: string; date?: string; title?: string; snippet?: string; sourceUrl?: string; siteUrl?: string }
export interface AskPoint { title: string; text: string; quote?: string; quoteUrl?: string; cites: number[] }
export type AskResult =
  | { mode: 'answer'; title: string; points: AskPoint[]; citations: AskCitation[]; cached: boolean }
  | { mode: 'not_found'; message: string; citations: AskCitation[] }
  | { mode: 'search'; reason: string; message: string; citations: AskCitation[] }
  | { mode: 'limited'; reason: string; retryAfter?: number }
  | { mode: 'invalid'; error: string }
  | { mode: 'unavailable' }

export async function askQuestion(q: string, lang: Lang, fetchImpl: typeof fetch = fetch): Promise<AskResult> {
  if (!q.trim()) return { mode: 'invalid', error: 'empty' }
  if ([...q.trim()].length > ASK_MAX_CHARS) return { mode: 'invalid', error: 'too_long' }
  let response: Response
  try {
    response = await fetchImpl('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: q.trim(), lang }), signal: AbortSignal.timeout(20_000) })
  } catch { return { mode: 'unavailable' } }
  const body = await response.json().catch(() => undefined) as Record<string, unknown> | undefined
  if (response.status === 429) return { mode: 'limited', reason: String(body?.reason ?? 'limit'), retryAfter: typeof body?.retryAfter === 'number' ? body.retryAfter : undefined }
  if (response.status === 400) return { mode: 'invalid', error: String(body?.error ?? 'invalid') }
  if (!response.ok || !body || !['answer', 'not_found', 'search'].includes(String(body.mode))) return { mode: 'unavailable' }
  if (!validReply(body)) return { mode: 'unavailable' }
  return body as unknown as AskResult
}

// Reject incomplete or unexpected JSON before a component tries to render its arrays.
function validReply(body: Record<string, unknown>) {
  const citations = body.citations
  if (!Array.isArray(citations) || !citations.every(c => c && typeof c === 'object' && Number.isInteger(c.n) && typeof c.kind === 'string' &&
    ['date', 'title', 'snippet', 'sourceUrl', 'siteUrl'].every(key => c[key] === undefined || typeof c[key] === 'string'))) return false
  if (body.mode === 'answer') return typeof body.title === 'string' && Array.isArray(body.points) && body.points.every(p =>
    p && typeof p === 'object' && typeof p.title === 'string' && typeof p.text === 'string' &&
    Array.isArray(p.cites) && p.cites.every(Number.isInteger) && ['quote', 'quoteUrl'].every(key => p[key] === undefined || typeof p[key] === 'string') &&
    (p.quote === undefined ? p.quoteUrl === undefined : !!p.quote && !!safeHref(p.quoteUrl)))
  return typeof body.message === 'string'
}

/** Only HTTPS links built by the server become hrefs. */
export const safeHref = (url: string | undefined) => url && /^https:\/\//.test(url) ? url : undefined
