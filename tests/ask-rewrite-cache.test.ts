import { createHash } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { createAskApp, dayOf } from '../server/ask/app'
import { loadConfig, type AskConfig } from '../server/ask/config'
import { CircuitBreaker, type ChatRequest } from '../server/ask/deepseek'
import { openStore, type Store } from '../server/ask/store'
import type { Unit } from '../server/ask/units'

const DAY = 86_400_000
const started = Date.parse('2026-10-29T02:00:00Z')
const url = 'https://x.com/mattpocockuk/status/1000000000000000001'
const source = 'Crimson lanterns guide harbor crews safely beyond winter shoals.'
const unit: Unit = { id: 'post:synthetic', kind: 'post', title: '', text: source, sourceUrl: url }
const copied = JSON.stringify({ found: true, title: '', points: [{ title: '', text: source, sources: ['S1'] }] })
const clean = JSON.stringify({ found: true, title: '', points: [{ title: '', text: '先核实条件，再选择方向。', sources: ['S1'] }] })
const response = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }))
const search = { mode: 'search', reason: 'unverified', message: '', citations: [{ n: 1, kind: 'post', sourceUrl: url }], cached: false }
const stores: Store[] = []
afterEach(() => { for (const store of stores.splice(0)) store.close(); vi.restoreAllMocks() })

function setup(over: Partial<AskConfig> = {}, reply: (request: ChatRequest, init: RequestInit) => Promise<Response> = async () => response(copied), units = [unit]) {
  let clock = started
  const config = { ...loadConfig({ ASK_ENABLED: '1', DEEPSEEK_API_KEY: 'test-placeholder' }), minScore: 0, perIpPerMinute: 1000, ...over }
  const store = openStore(':memory:'); stores.push(store)
  const writes = vi.spyOn(store, 'putCache')
  const requests: ChatRequest[] = [], logs: string[] = []
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const request: ChatRequest = JSON.parse(String(init?.body))
    requests.push(request)
    return reply(request, init!)
  }) as unknown as typeof globalThis.fetch
  const deps = { config, store, units, fetch, now: () => clock, log: (line: string) => logs.push(line), peer: () => '127.0.0.1' }
  const app = createAskApp(deps)
  const ask = (q = 'crimson lanterns', ip = '198.51.100.1') => app.request('/api/ask', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip }, body: JSON.stringify({ q, lang: 'en' }),
  })
  return { app, ask, store, writes, requests, logs, config, deps, tick: (ms: number) => { clock += ms } }
}

it('caches the search fallback when the rewrite is still rejected: second request makes 0 upstream calls', async () => {
  const s = setup()
  expect(await (await s.ask()).json()).toEqual(search)
  expect(s.requests).toHaveLength(2)
  expect(await (await s.ask(' CRIMSON LANTERNS? ')).json()).toEqual({ ...search, cached: true })
  expect(s.requests).toHaveLength(2)
  expect(s.writes).toHaveBeenCalledTimes(1)
  // Same existing corpus digest, prompt pin, normalized question, language and seven-day TTL.
  const sha = (text: string) => createHash('sha256').update(text).digest('hex')
  const index = sha(JSON.stringify([[unit.id, 'post', '', source, null, url, null, null, []]]))
  const key = sha(['crimson lanterns', 'en', `${index}:deepseek-flash:methodology-v18-rewrite-on-reject`].join('\u0000'))
  expect(s.writes.mock.calls[0]).toEqual([key, JSON.stringify(search), 7 * DAY, started])
  expect((await (await s.app.request('/healthz')).json()).today.calls).toBe(2)
  const restarted = createAskApp(s.deps)
  expect(await (await restarted.request('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: 'crimson lanterns', lang: 'en' }) })).json()).toEqual({ ...search, cached: true })
  expect(s.requests).toHaveLength(2)
})

it.each([
  ['model JSON shape', '{bad json'],
  ['no valid sources', JSON.stringify({ found: true, points: [{ text: source, sources: ['S99'] }] })],
  ['quote budget', JSON.stringify({ found: true, title: '', points: [
    { text: '核实条件。', sources: ['S1'], quote: { chunk_id: 'S1', start: 0, end: 28 } },
    { text: '再检查方向。', sources: ['S1'], quote: { chunk_id: 'S1', start: 29, end: 41 } },
  ] })],
])('caches a non-independence first rejection (%s): second request makes 0 upstream calls', async (kind, content) => {
  const units = kind === 'quote budget' ? [{ ...unit, text: 'Start small. Adjust quickly. Build trust.' }] : [unit]
  const s = setup({}, async () => response(content), units)
  const question = kind === 'quote budget' ? 'start small' : 'crimson lanterns'
  expect(await (await s.ask(question)).json()).toEqual(search)
  expect(s.requests).toHaveLength(1)
  expect(await (await s.ask(question)).json()).toEqual({ ...search, cached: true })
  expect(s.requests).toHaveLength(1)
  expect(s.writes).toHaveBeenCalledTimes(1)
})

it.each([
  ['first', 'timeout'], ['first', '500'], ['first', 'bad response'],
  ['rewrite', 'timeout'], ['rewrite', '500'], ['rewrite', 'bad response'],
] as const)('does not cache %s upstream %s: the second request calls upstream again', async (phase, kind) => {
  const failure = vi.spyOn(CircuitBreaker.prototype, 'failure')
  const s = setup({}, async request => {
    if (phase === 'rewrite' && request.messages.length === 2) return response(copied)
    if (kind === 'timeout') throw new DOMException('Synthetic timeout', 'TimeoutError')
    return kind === '500' ? new Response('', { status: 500 }) : new Response('{}')
  })
  for (let i = 0; i < 2; i++) {
    expect(await (await s.ask()).json()).toEqual({ ...search, reason: 'upstream_error' })
    expect(s.requests).toHaveLength((i + 1) * (phase === 'first' ? 1 : 2))
  }
  expect(s.writes).not.toHaveBeenCalled()
  expect(failure).toHaveBeenCalledTimes(2)
  expect(JSON.parse(s.logs.at(-1)!).upstream).toBe(kind === 'timeout' ? 'timeout' : kind === '500' ? 'http' : 'format')
  failure.mockRestore()
})

it('does not cache breaker_open: after cooldown the same question reaches upstream again', async () => {
  let healthy = false
  const s = setup({ breakerFailures: 1 }, async () => healthy ? response(copied) : new Response('', { status: 500 }))
  expect(await (await s.ask()).json()).toEqual({ ...search, reason: 'upstream_error' })
  for (let i = 0; i < 2; i++) expect(await (await s.ask()).json()).toEqual({ ...search, reason: 'breaker_open' })
  expect(s.requests).toHaveLength(1)
  expect(s.writes).not.toHaveBeenCalled()
  healthy = true
  s.tick(s.config.breakerCoolDownMs + 1)
  expect(await (await s.ask()).json()).toEqual(search)
  expect(s.requests).toHaveLength(3)
})

it('does not cache a budget-skipped rewrite: the second request calls upstream again', async () => {
  const s = setup({}, async () => { s.tick(24_001); return response(copied) })
  for (let i = 0; i < 2; i++) {
    expect(await (await s.ask()).json()).toEqual(search)
    expect(s.requests).toHaveLength(i + 1)
  }
  expect(s.writes).not.toHaveBeenCalled()
})

it('does not cache a daily-limit-skipped rewrite: after quota reset the second request calls upstream again', async () => {
  const s = setup({ globalPerDay: 1 })
  expect(await (await s.ask()).json()).toEqual(search)
  expect(s.requests).toHaveLength(1)
  expect(s.writes).not.toHaveBeenCalled()
  s.tick(DAY)
  expect(await (await s.ask()).json()).toEqual(search)
  expect(s.requests).toHaveLength(2)
  for (let i = 0; i < 2; i++) expect(await (await s.ask()).json()).toEqual({ ...search, reason: 'global_limit' })
  expect(s.requests).toHaveLength(2)
  expect(s.writes).not.toHaveBeenCalled()
  expect(s.store.count('site', `d:${dayOf(started + DAY)}`)).toBe(1)
})

it('does not cache a breaker-skipped rewrite: the second request can finish the rewrite', async () => {
  vi.spyOn(CircuitBreaker.prototype, 'allow').mockReturnValueOnce(true).mockReturnValueOnce(false).mockReturnValue(true)
  const s = setup()
  expect(await (await s.ask()).json()).toEqual(search)
  expect(s.requests).toHaveLength(1)
  expect(s.writes).not.toHaveBeenCalled()
  expect(await (await s.ask()).json()).toEqual(search)
  expect(s.requests).toHaveLength(3)
  expect(s.writes).toHaveBeenCalledTimes(1)
})

it('expires the search fallback after cacheDays and calls upstream again', async () => {
  const s = setup()
  expect(await (await s.ask()).json()).toEqual(search)
  s.tick(7 * DAY - 1)
  expect(await (await s.ask()).json()).toEqual({ ...search, cached: true })
  expect(s.requests).toHaveLength(2)
  s.tick(1)
  expect(await (await s.ask()).json()).toEqual(search)
  expect(s.requests).toHaveLength(4)
  expect(s.writes).toHaveBeenCalledTimes(2)
})

it('does not cache search fallback when ASK_CACHE_DAYS=0: both requests call upstream', async () => {
  const s = setup({ cacheDays: loadConfig({ ASK_CACHE_DAYS: '0' }).cacheDays })
  for (let i = 0; i < 2; i++) {
    expect(await (await s.ask()).json()).toEqual(search)
    expect(s.requests).toHaveLength((i + 1) * 2)
  }
  expect(s.writes).not.toHaveBeenCalled()
})

it('stores only the public search fallback without feedback, model text or diagnostic fields', async () => {
  const s = setup()
  const body = await (await s.ask()).json()
  expect(s.writes).toHaveBeenCalledTimes(1)
  const cached = JSON.parse(s.writes.mock.calls[0][1])
  expect(body).toEqual(search)
  expect(cached).toEqual(search)
  expect(Object.keys(cached).sort()).toEqual(['cached', 'citations', 'message', 'mode', 'reason'])
  const feedback = s.requests[1].messages.at(-1)!.content
  const spans = JSON.parse(feedback.split('\n')[3]) as { fragment: string }[]
  for (const visible of [JSON.stringify(body), JSON.stringify(cached), s.logs.join('\n')]) {
    expect(visible).not.toContain(feedback)
    expect(visible).not.toContain(copied)
    expect(visible).not.toContain(source)
    for (const span of spans) expect(visible).not.toContain(span.fragment)
  }
})

it('does not cache disabled or model-free context rejection', async () => {
  for (const [over, units, reason] of [
    [{ enabled: false }, [unit], 'disabled'],
    [{}, [{ ...unit, text: 'crimson lanterns '.repeat(70_000) }], 'unverified'],
  ] as [Partial<AskConfig>, Unit[], string][]) {
    const s = setup(over, async () => response(copied), units)
    for (let i = 0; i < 2; i++) expect(await (await s.ask()).json()).toEqual({ ...search, reason })
    expect(s.requests).toHaveLength(0)
    expect(s.writes).not.toHaveBeenCalled()
  }
})

it('does not cache busy: releasing the concurrent request permits a fresh call', async () => {
  let release!: (value: Response) => void, entered!: () => void
  const waiting = new Promise<void>(resolve => { entered = resolve })
  let first = true
  const s = setup({ maxConcurrent: 1 }, async () => {
    if (!first) return response(copied)
    first = false
    entered()
    return new Promise<Response>(resolve => { release = resolve })
  })
  const held = s.ask('crimson lanterns held')
  await waiting
  for (let i = 0; i < 2; i++) expect(await (await s.ask('crimson lanterns', '198.51.100.2')).json()).toEqual({ ...search, reason: 'busy' })
  expect(s.requests).toHaveLength(1)
  expect(s.writes).not.toHaveBeenCalled()
  release(response(clean))
  expect(await (await held).json()).toMatchObject({ mode: 'answer' })
  expect(await (await s.ask('crimson lanterns', '198.51.100.2')).json()).toEqual(search)
  expect(s.requests).toHaveLength(3)
})
