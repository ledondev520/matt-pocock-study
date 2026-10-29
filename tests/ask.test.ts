import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createAskApp, clientAddress } from '../server/ask/app'
import { checkQuote, parseAnswer, stripLinks, type Citation, type Point } from '../server/ask/answer'
import { loadConfig, type AskConfig } from '../server/ask/config'
import { CircuitBreaker } from '../server/ask/deepseek'
import { explanationsAreIndependent } from '../server/ask/excerpts'
import { chunkUnits } from '../server/ask/methodology-adapter'
import { openStore, type Store } from '../server/ask/store'
import type { Unit } from '../server/ask/units'
import { buildAskIndex } from '../scripts/ask-index'

const KEY = 'test-key-not-real-0000'
const POST_URL = 'https://x.com/mattpocockuk/status/1000000000000000001'
const units: Unit[] = [
  { id: 'post:1', kind: 'post', title: '', text: 'Split a big pull request into two: the first one ships everything behind a flag and is easy to roll back, the second flips the flag.', date: '2026-01-02', sourceUrl: POST_URL },
  { id: 'note:n1', kind: 'note', title: '把单向门 PR 拆成两个', text: '第一个 PR 可回滚,第二个 PR 才跨过单向门 pull request split rollback flag', date: '2026-10-27', sourceUrl: 'https://x.com/mattpocockuk/status/1000000000000000002', sitePath: '/zh/knowledge#n1' },
  { id: 'page:en:prs#small', kind: 'page', title: 'Pull requests · Keep them small', text: 'Small pull request changes are easy to review and roll back; split work by risk.', sitePath: '/en/prs#small' },
]
const QUESTION = 'How should I split a big pull request?'

function config(over: Partial<AskConfig> = {}): AskConfig {
  return { ...loadConfig({ ASK_ENABLED: '1', DEEPSEEK_API_KEY: KEY }), dbFile: ':memory:', timeoutMs: 200, minScore: 0, ...over }
}
/** Source id the server gave a unit, read from the prompt the mock received. */
const idOf = (prompt: string, attr: string) => prompt.match(new RegExp(`<source id="(S\\d+)"[^>]*${attr.replace(/[.?#/]/g, '\\$&')}`))?.[1]
const overBudgetAnswer = (prompt: string) => JSON.stringify({ found: true, title: 'Split by reversibility', points: [
  { title: 'Ship behind a flag first', text: 'Put everything in a first PR you can roll back. See https://evil.example/x and [here](https://evil.example).', quote: 'the first one ships everything behind a flag and is easy to roll back', sources: [idOf(prompt, POST_URL)] },
  { title: 'Flip in a second PR', text: 'The second PR crosses the one-way door.', quote: 'Matt never said this sentence at all', sources: [idOf(prompt, 'site="/zh/knowledge#n1"'), 'S9'] },
  { title: 'Unlinked', text: 'No usable source.', sources: ['S42'] },
] })
const goodAnswer = (prompt: string) => JSON.stringify({ found: true, title: 'Manage reversibility', points: [
  { title: 'Stage delivery', text: 'Prefer reversible increments. See https://evil.example/x and [here](https://evil.example).', quote: { chunk_id: idOf(prompt, POST_URL), start: 35, end: 104 }, sources: [idOf(prompt, POST_URL)] },
  { title: 'Delay irreversible decisions', text: 'Review risk before activation.', quote: 'Matt never said this sentence at all', sources: [idOf(prompt, 'site="/zh/knowledge#n1"'), 'S9'] },
  { title: 'Unlinked', text: 'No usable source.', sources: ['S42'] },
] })
function upstream(answer: string | ((prompt: string) => string) = goodAnswer) {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = []
  const fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    calls.push({ url, body, headers: init.headers as Record<string, string> })
    const content = typeof answer === 'string' ? answer : answer(body.messages[1].content)
    return new Response(JSON.stringify({ model: 'deepseek-flash', choices: [{ message: { content } }], usage: { prompt_tokens: 120, completion_tokens: 60 } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof globalThis.fetch
  return { fetch, calls }
}

const stores: Store[] = []
afterEach(() => { while (stores.length) stores.pop()!.close() })
function setup(over: Partial<AskConfig> = {}, fetch = upstream()) {
  const store = openStore(':memory:')
  stores.push(store)
  const logs: string[] = []
  let clock = Date.parse('2026-10-28T02:00:10Z')
  let ip = '203.0.113.7'
  const app = createAskApp({ config: config(over), units, store, fetch: fetch.fetch, log: l => logs.push(l), now: () => clock, peer: () => '127.0.0.1' })
  const ask = (q: string = QUESTION, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) => app.request('/api/ask', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip, ...headers }, body: JSON.stringify({ q, lang: 'en', ...extra }) })
  return { app, ask, logs, calls: fetch.calls, tick: (ms: number) => { clock += ms }, setIp: (v: string) => { ip = v } }
}

describe('POST /api/ask', () => {
  it.each([false, true])('drops the over-budget point and returns search only when no clean point remains (only copied=%s)', async onlyCopied => {
    const { ask, calls } = setup({ cacheDays: 0 }, upstream(prompt => {
      const answer = JSON.parse(overBudgetAnswer(prompt))
      if (onlyCopied) answer.points = answer.points.slice(0, 1)
      return JSON.stringify(answer)
    }))
    for (let i = 0; i < 2; i++) {
      const response = await ask()
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toMatchObject(onlyCopied ? { mode: 'search', reason: 'unverified', cached: false } : { mode: 'answer', cached: false })
      expect(JSON.stringify(body)).not.toContain('Ship behind a flag first')
      expect(JSON.stringify(body)).not.toContain('Put everything in a first PR you can roll back.')
      expect(body.citations.length).toBeGreaterThan(0)
      for (const citation of body.citations) {
        if (body.mode === 'search') expect(citation).not.toHaveProperty('title')
        expect(citation).not.toHaveProperty('snippet')
      }
      if (onlyCopied) expect(body).not.toHaveProperty('points')
      else {
        const points = body.points as Point[]
        expect(points).toEqual([{ title: 'Flip in a second PR', text: 'The second PR crosses the one-way door.', cites: [2] }])
        for (const point of points) expect(point.text.trim()).not.toBe('')
        const citations = body.citations as Citation[]
        const quotes = points.flatMap(p => p.quote && p.quoteUrl ? [{ text: p.quote, url: p.quoteUrl }] : [])
        expect(await explanationsAreIndependent([
          body.title, ...points.flatMap(p => [p.title, p.text]), ...citations.map(c => c.title ?? ''),
        ], units, [...citations.flatMap(c => c.sourceUrl ? [c.sourceUrl] : []), ...quotes.map(q => q.url)], quotes)).toBe(true)
      }
    }
    expect(calls).toHaveLength(2)
  })

  it('answers as a method with verified short quotes and links built by the server', async () => {
    const { ask, calls } = setup()
    const res = await ask()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.mode).toBe('answer')
    expect(body.points).toHaveLength(2)
    expect(body.points[0].quote).toBe('the first one ships everything behind a flag and is easy to roll back')
    expect(body.points[1].quote).toBeUndefined() // not in any post: dropped, never attributed to Matt
    expect(JSON.stringify(body)).not.toContain('evil.example')
    const urls = body.citations.flatMap((c: { sourceUrl?: string; siteUrl?: string }) => [c.sourceUrl, c.siteUrl].filter(Boolean))
    expect(urls).toContain(POST_URL)
    expect(urls).toContain('https://matt.withkeya.com/zh/knowledge#n1')
    for (const point of body.points) expect(point.cites.length).toBeGreaterThan(0)
    expect(calls).toHaveLength(1)
  })

  it('sends deepseek-flash with thinking disabled, JSON output and the original post URLs in context', async () => {
    const { ask, calls } = setup()
    await ask()
    const { url, body, headers } = calls[0]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect(body.model).toBe('deepseek-flash')
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.stream).toBe(false)
    const messages = body.messages as { role: string; content: string }[]
    expect(messages[0].content).toMatch(/json/)
    expect(messages[0].content).toMatch(/short quote/)
    expect(messages[1].content).toContain(`url="${POST_URL}"`)
    expect(messages[1].content).toContain('site="/zh/knowledge#n1"')
    expect(headers.Authorization).toBe(`Bearer ${KEY}`)
  })

  it('serves a repeated question from the cache without calling upstream or counting a call', async () => {
    const { ask, calls, app } = setup({ perIpPerDay: 1 })
    expect((await (await ask()).json()).cached).toBe(false)
    const again = await (await ask(' how should i split a BIG pull request ')).json()
    expect(again.cached).toBe(true)
    expect(again.mode).toBe('answer')
    expect(calls).toHaveLength(1)
    expect((await (await app.request('/healthz')).json()).today.calls).toBe(1)
  })

  it('limits each IP to 10 requests a minute, cache hits included', async () => {
    const { ask, tick } = setup()
    for (let i = 0; i < 10; i++) expect((await ask()).status).toBe(200)
    const res = await ask()
    expect(res.status).toBe(429)
    expect((await res.json()).reason).toBe('per_ip_minute')
    expect(res.headers.get('Retry-After')).toBeTruthy()
    tick(60_000)
    expect((await ask()).status).toBe(200)
  })

  it('limits each IP to 100 model calls a day, separately from other IPs', async () => {
    const { ask, tick, setIp, calls } = setup({ perIpPerMinute: 1000 })
    for (let i = 0; i < 100; i++) expect((await ask(`${QUESTION} ${i}`)).status).toBe(200)
    const res = await ask(`${QUESTION} 100`)
    expect(res.status).toBe(429)
    expect((await res.json()).reason).toBe('per_ip_day')
    expect(calls).toHaveLength(100)
    setIp('198.51.100.9')
    expect((await ask(`${QUESTION} other ip`)).status).toBe(200)
    setIp('203.0.113.7')
    tick(24 * 3_600_000) // next day in UTC+8
    expect((await ask(`${QUESTION} tomorrow`)).status).toBe(200)
  })

  it('stops calling the model after 1000 calls site-wide and falls back to search results', async () => {
    const { ask, setIp, calls } = setup({ perIpPerMinute: 1000, perIpPerDay: 1000 })
    for (let i = 0; i < 1000; i++) {
      setIp(`10.0.${Math.floor(i / 250)}.${i % 250}`)
      expect((await (await ask(`${QUESTION} ${i}`)).json()).mode).toBe('answer')
    }
    setIp('192.0.2.1')
    const body = await (await ask(`${QUESTION} one more`)).json()
    expect(body.mode).toBe('search')
    expect(body.reason).toBe('global_limit')
    expect(body.citations.length).toBeGreaterThan(0)
    expect(calls).toHaveLength(1000)
  }, 60_000)

  it('accepts 300 characters and rejects 301, empty and control characters', async () => {
    const { ask } = setup()
    const q300 = `split pull request ${'字'.repeat(281)}`
    expect([...q300]).toHaveLength(300)
    expect((await ask(q300)).status).toBe(200)
    expect((await ask(q300 + '字')).status).toBe(400)
    expect((await ask('   ')).status).toBe(400)
    expect((await ask('split\u0007pull request')).status).toBe(400)
    expect((await ask(QUESTION, { lang: 'fr' })).status).toBe(400)
  })

  it('says nothing was found, without calling the model, when no passage matches', async () => {
    const { ask, calls } = setup()
    const body = await (await ask('best pizza in Rome')).json()
    expect(body).toMatchObject({ mode: 'not_found', citations: [] })
    expect(calls).toHaveLength(0)
  })

  it('passes on the model saying the passages do not answer', async () => {
    const { ask } = setup({}, upstream(JSON.stringify({ found: false })))
    expect((await (await ask()).json()).mode).toBe('not_found')
  })

  it('falls back to search results when the model output has no usable citation', async () => {
    const { ask } = setup({}, upstream(JSON.stringify({ found: true, points: [{ title: 'x', text: 'y', sources: ['S99'] }] })))
    expect(await (await ask()).json()).toMatchObject({ mode: 'search', reason: 'unverified' })
  })

  it('falls back on upstream timeout and HTTP errors', async () => {
    const hang = { calls: [], fetch: ((_: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))) as unknown as typeof fetch }
    const slow = setup({ timeoutMs: 50 }, hang)
    expect(await (await slow.ask()).json()).toMatchObject({ mode: 'search', reason: 'upstream_error' })
    expect(slow.logs.at(-1)).toContain('"upstream":"timeout"')
    const failing = { calls: [], fetch: (async () => new Response('busy', { status: 503 })) as unknown as typeof fetch }
    const err = setup({}, failing)
    expect(await (await err.ask()).json()).toMatchObject({ mode: 'search', reason: 'upstream_error' })
    expect(err.logs.at(-1)).toContain('"upstream":"http"')
  })

  it('opens the circuit after 5 consecutive failures, then lets one trial through after the cool-down', async () => {
    let attempts = 0, healthy = false
    const flaky = { calls: [], fetch: (async () => { attempts++; return healthy ? upstream(JSON.stringify({ found: true, points: [{ title: 't', text: 'x', sources: ['S1'] }] })).fetch('', { body: JSON.stringify({ messages: [{}, { content: '' }] }) }) : new Response('', { status: 500 }) }) as unknown as typeof fetch }
    const { ask, tick } = setup({ perIpPerMinute: 1000 }, flaky)
    for (let i = 0; i < 5; i++) expect((await (await ask(`${QUESTION} ${i}`)).json()).reason).toBe('upstream_error')
    expect((await (await ask(`${QUESTION} 5`)).json()).reason).toBe('breaker_open')
    expect(attempts).toBe(5)
    tick(300_000)
    healthy = true
    expect((await (await ask(`${QUESTION} 6`)).json()).mode).toBe('answer')
    expect((await (await ask(`${QUESTION} 7`)).json()).mode).toBe('answer')
    expect(attempts).toBe(7)
  })

  it('never logs or caches the question text, the client address or the key', async () => {
    const { ask, logs } = setup()
    const secretQuestion = 'How should I split a big pull request for my-private-project-zeta?'
    await ask(secretQuestion)
    await ask(secretQuestion)
    await ask('best pizza in Rome')
    expect(logs).toHaveLength(3)
    for (const line of logs) {
      const entry = JSON.parse(line)
      expect(entry.q).toMatch(/^[0-9a-f]{16}$/)
      expect(entry.ip).toMatch(/^[0-9a-f]{16}$/)
      expect(line).not.toMatch(/zeta|pizza|split|203\.0\.113\.7/i)
      expect(line).not.toContain(KEY)
    }
  })

  it('degrades to search results when answers are off or no key is set', async () => {
    const { ask, calls } = setup({ enabled: false, apiKey: undefined })
    expect(await (await ask()).json()).toMatchObject({ mode: 'search', reason: 'disabled', message: '' })
    expect(calls).toHaveLength(0)
    expect(loadConfig({ ASK_ENABLED: '1' }).enabled).toBe(false)
  })

  it('accepts POST only and answers no other path', async () => {
    const { app } = setup()
    const get = await app.request('/api/ask')
    expect(get.status).toBe(405)
    expect(get.headers.get('Allow')).toBe('POST')
    expect((await app.request('/api/ask', { method: 'POST', body: 'q=x' })).status).toBe(415)
    expect((await app.request('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: 'x'.repeat(5000) }) })).status).toBe(413)
    expect((await app.request('/api/pages')).status).toBe(404)
  })
})

describe('client address', () => {
  it('trusts X-Real-IP only from a loopback peer and counts IPv6 per /64', () => {
    expect(clientAddress('127.0.0.1', '203.0.113.7')).toBe('203.0.113.7')
    expect(clientAddress('198.51.100.1', '203.0.113.7')).toBe('198.51.100.1')
    expect(clientAddress('127.0.0.1', 'not-an-ip')).toBe('unknown')
    expect(clientAddress('127.0.0.1', '2001:db8:1:2:3:4:5:6')).toBe(clientAddress('127.0.0.1', '2001:db8:1:2:ffff::1'))
  })
})

describe('answer checks', () => {
  it('keeps only short quotes found verbatim in a post', async () => {
    expect(checkQuote({ chunk_id: 'S1', start: 87, end: 104 }, [units[0]])).toEqual({ text: 'easy to roll back', url: POST_URL })
    expect(checkQuote('easy to roll back', [units[1]])).toBeUndefined() // our note, not Matt's words
    expect(checkQuote(units[0].text + ' '.repeat(2) + units[0].text, [units[0]])).toBeUndefined()
    expect(stripLinks('see [docs](https://a.dev) and https://b.example/x <b>now</b>')).toBe('see docs and now')
    expect(await parseAnswer('not json', units, 'https://s')).toBeUndefined()
  })

  it('drops a point whose sources have no original-post link', async () => {
    const pageOnly = JSON.stringify({ found: true, points: [{ title: 'a', text: 'b', sources: ['S3'] }] })
    expect(await parseAnswer(pageOnly, units, 'https://s')).toBeUndefined()
  })

  it('adapts methodology chunks: checked quotes with their post, method page anchor', async () => {
    const [unit] = chunkUnits([{ chunk_id: 'm.pr-review#s4', kind: 'step', title: { zh: 'PR 方法论 · 第 4 步' }, text: 'Split the PR by door type.', stance_status: 'current',
      quotes: [{ text: 'one-way door PRs go second', url: POST_URL, date: '2026-10-27' }, { text: 'bad', url: 'https://evil.example/x' }] }])
    expect(unit).toMatchObject({ kind: 'method', sourceUrl: POST_URL, sitePath: '/zh/methods/pr-review#s4' })
    expect(unit.quotes).toHaveLength(1)
    expect(checkQuote({ chunk_id: 'S1:Q1', start: 0, end: 26 }, [unit])).toEqual({ text: 'one-way door PRs go second', url: POST_URL })
    expect(checkQuote('Split the PR by door type', [unit])).toBeUndefined() // our wording, not a quote
    const answer = await parseAnswer(JSON.stringify({ found: true, points: [{ title: 's4', text: 't', quote: { chunk_id: 'S1:Q1', start: 0, end: 26 }, sources: ['S1'] }] }), [unit], 'https://s')
    expect(answer).toMatchObject({ found: true, points: [{ quote: 'one-way door PRs go second', quoteUrl: POST_URL, cites: [1] }], citations: [{ sourceUrl: POST_URL, siteUrl: 'https://s/zh/methods/pr-review#s4' }] })
  })

  it('breaker stays closed below the threshold', () => {
    const b = new CircuitBreaker(5, 1000)
    for (let i = 0; i < 4; i++) b.failure(0)
    expect(b.allow(0)).toBe(true)
    b.success()
    b.failure(0)
    expect(b.state(0)).toBe('closed')
  })
})

describe('config and process', () => {
  it('refuses to listen anywhere but loopback', () => {
    expect(loadConfig({}).host).toBe('127.0.0.1')
    expect(() => loadConfig({ ASK_HOST: '0.0.0.0' })).toThrow(/loopback/)
    expect(() => loadConfig({ ASK_HOST: '::' })).toThrow(/loopback/)
  })

  it('starts on 127.0.0.1 only and is not reachable on other interfaces', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ask-proc-'))
    const port = await new Promise<number>(resolve => { const s = createServer().listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => resolve(p)) }) })
    await writeFile(join(dir, 'index.json'), JSON.stringify({ version: 1, units }))
    await writeFile(join(dir, 'pages.json'), JSON.stringify({ version: 1, paths: ['/zh', '/en'] }))
    const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/ask/index.ts'], { env: { PATH: process.env.PATH, ASK_PORT: String(port), ASK_INDEX: join(dir, 'index.json'), ASK_PAGE_MANIFEST: join(dir, 'pages.json'), ASK_DB: join(dir, 'ask.sqlite') }, stdio: ['ignore', 'pipe', 'pipe'] })
    try {
      const line = await new Promise<string>((resolve, reject) => {
        child.stdout.on('data', (d: Buffer) => resolve(d.toString()))
        child.on('exit', code => reject(new Error(`exited ${code}`)))
      })
      expect(JSON.parse(line)).toMatchObject({ event: 'listening', host: '127.0.0.1', port, enabled: false })
      expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(200)
      const external = Object.values(networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address
      if (external) await expect(fetch(`http://${external}:${port}/healthz`)).rejects.toThrow()
    } finally {
      child.kill('SIGTERM')
      await rm(dir, { recursive: true, force: true })
    }
  }, 30_000)

  it('builds the public index from the site only: no private posts, written outside dist/', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ask-index-'))
    await writeFile(join(dir, 'content.json'), JSON.stringify([{ lang: 'en', slug: 'prs', title: 'PRs', markdown: 'Intro\n\n## Keep them small\n\nSmall PRs.', toc: [{ id: 'keep-them-small', title: 'Keep them small' }], updated: '2026-10-01' }]))
    const out = join(dir, 'server-data', 'ask-index.json')
    const index = await buildAskIndex(dir, out)
    expect(index.units.some(u => u.kind === 'post')).toBe(false)
    expect(index.units.find(u => u.kind === 'page' && u.sitePath === '/en/prs#keep-them-small')).toBeTruthy()
    expect(JSON.parse(await readFile(out, 'utf8')).version).toBe(1)
    await rm(dir, { recursive: true, force: true })
  })
})
