import { renderToString } from 'react-dom/server'
import { expect, it } from 'vitest'
import { askQuestion, safeHref } from '../src/lib/ask'
import { AskPanel } from '../src/AskPanel'

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch

it('posts to the same-origin /api/ask and maps every outcome', async () => {
  let seen: [string, RequestInit] | undefined
  const ok = (async (url: string, init: RequestInit) => { seen = [url, init]; return new Response(JSON.stringify({ mode: 'answer', title: 't', points: [], citations: [], cached: false })) }) as unknown as typeof fetch
  expect((await askQuestion(' 怎么拆 PR ', 'zh', ok)).mode).toBe('answer')
  expect(seen![0]).toBe('/api/ask')
  expect(JSON.parse(String(seen![1].body))).toEqual({ q: '怎么拆 PR', lang: 'zh' })
  expect(await askQuestion('x', 'en', reply(429, { reason: 'per_ip_minute', retryAfter: 30 }))).toEqual({ mode: 'limited', reason: 'per_ip_minute', retryAfter: 30 })
  expect((await askQuestion('x', 'en', reply(502, {}))).mode).toBe('unavailable')
  expect((await askQuestion('x', 'en', (async () => { throw new Error('offline') }) as unknown as typeof fetch)).mode).toBe('unavailable')
  expect((await askQuestion('字'.repeat(301), 'zh', ok)).mode).toBe('invalid')
  expect(safeHref('javascript:alert(1)')).toBeUndefined()
})

it('renders the panel without any link of its own', () => {
  const html = renderToString(<AskPanel lang="zh" />)
  expect(html).toContain('maxLength="300"')
  expect(html).not.toContain('href=')
})


it('quietly rejects missing, malformed and non-JSON API responses', async () => {
  const html404 = (async () => new Response('<h1>Not found</h1>', { status: 404 })) as typeof fetch
  for (const fetcher of [html404, reply(503, {}), reply(200, null), reply(200, { mode: 'answer' }), reply(200, { mode: 'answer', title: 't', citations: [], points: [null] }), reply(200, { mode: 'search', citations: [] })]) {
    expect(await askQuestion('review', 'en', fetcher)).toEqual({ mode: 'unavailable' })
  }
  expect(await askQuestion('review', 'en', reply(200, { mode: 'not_found', message: 'Nothing found.', citations: [] }))).toMatchObject({ mode: 'not_found' })
  expect(await askQuestion('review', 'en', reply(200, { mode: 'search', message: 'unused', citations: [] }))).toMatchObject({ mode: 'search' })
})

it('accepts only extracted quote text paired with its original link', async () => {
  const quoteUrl = 'https://x.com/mattpocockuk/status/1000000000000000001'
  const body = (extra: object) => ({ mode: 'answer', title: '', points: [{ title: '', text: '', cites: [1], ...extra }], citations: [{ n: 1, kind: 'post', sourceUrl: quoteUrl }], cached: false })
  expect((await askQuestion('review', 'en', reply(200, body({ quote: 'Start small.', quoteUrl })))).mode).toBe('answer')
  for (const extra of [{ quote: 'Start small.' }, { quoteUrl }, { quote: { chunk_id: 'S1', start: 0, end: 12 }, quoteUrl }, { quote: 'Start small.', quoteUrl: 'javascript:alert(1)' }]) {
    expect(await askQuestion('review', 'en', reply(200, body(extra)))).toEqual({ mode: 'unavailable' })
  }
})
