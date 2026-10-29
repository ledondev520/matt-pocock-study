import { execFileSync } from 'node:child_process'
import ts from 'typescript'
import { afterEach, expect, it, vi } from 'vitest'
import { createAskApp, dayOf } from '../server/ask/app'
import { buildMessages, parseAnswer, type AnswerDiagnostics } from '../server/ask/answer'
import { loadConfig, type AskConfig } from '../server/ask/config'
import { callDeepSeek, chatRequest, CircuitBreaker, type ChatRequest } from '../server/ask/deepseek'
import * as excerpts from '../server/ask/excerpts'
import { answerWithRewrite, buildRewriteMessages } from '../server/ask/rewrite'
import { openStore, type Store } from '../server/ask/store'
import * as unitModule from '../server/ask/units'
import type { Unit } from '../server/ask/units'
import { rewriteCases } from './fixtures/ask-rewrite-cases'

const url = 'https://x.com/mattpocockuk/status/1000000000000000001'
const source = 'Crimson lanterns guide harbor crews safely beyond winter shoals.'
const units: Unit[] = [{ id: 'post:synthetic', kind: 'post', title: '', text: source, sourceUrl: url }]
const output = (text: string, title = '', pointTitle = '') => JSON.stringify({ found: true, title, points: [{ title: pointTitle, text, sources: ['S1'] }] })
const copied = output(source)
const clean = output('先检查当前条件，再选择成本较低的方案。')
const upstream = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 12, completion_tokens: 7 } }))
const stores: Store[] = []
afterEach(() => { for (const store of stores.splice(0)) store.close(); vi.restoreAllMocks() })

function setup(replies: (string | ((init: RequestInit) => Promise<Response>))[] = [copied, clean], over: Partial<AskConfig> = {}) {
  let clock = Date.parse('2026-10-29T02:00:00Z')
  const store = openStore(':memory:'); stores.push(store)
  const writes = vi.spyOn(store, 'putCache')
  const hits = vi.spyOn(store, 'hit')
  const logs: string[] = [], requests: ChatRequest[] = [], signals: AbortSignal[] = []
  const config = { ...loadConfig({ ASK_ENABLED: '1', DEEPSEEK_API_KEY: 'test-placeholder' }), minScore: 0, ...over }
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body))); signals.push(init!.signal!)
    const reply = replies[requests.length - 1]
    if (reply === undefined) throw Error('Unexpected upstream call')
    return typeof reply === 'string' ? upstream(reply) : reply(init!)
  }) as unknown as typeof globalThis.fetch
  const app = createAskApp({ config, store, units, fetch, now: () => clock, log: l => logs.push(l), peer: () => '127.0.0.1' })
  const ask = (q = 'crimson lanterns', ip = '198.51.100.1') => app.request('/api/ask', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip }, body: JSON.stringify({ q, lang: 'zh' }),
  })
  return { app, ask, store, writes, hits, logs, requests, signals, tick: (ms: number) => { clock += ms } }
}

it('regression: rewrites a rejected answer once, caches only the clean result and keeps feedback private', async () => {
  const s = setup(undefined, { perIpPerDay: 1 })
  const response = await (await s.ask()).json()
  expect(response).toMatchObject({ mode: 'answer', cached: false, points: [{ text: '先检查当前条件，再选择成本较低的方案。' }] })
  expect(s.requests).toHaveLength(2)
  const messages = s.requests[1].messages
  expect(messages.slice(0, 2)).toEqual(s.requests[0].messages)
  expect(messages[2]).toEqual({ role: 'assistant', content: copied })
  const feedback = messages[3].content
  expect(feedback).toContain('point 1 text')
  expect(feedback).toContain('Rewrite in your own words; technical terms (product, library, command names) may be kept.')
  const fragments = JSON.parse(feedback.split('\n')[3]) as { field: string; fragment: string }[]
  expect(fragments).toEqual([
    { field: 'point 1 text', fragment: 'Crimson lanterns guide harbor crews', occurrences: 1 },
    { field: 'point 1 text', fragment: 'safely beyond winter shoals', occurrences: 1 },
  ])
  expect(s.writes).toHaveBeenCalledTimes(1)
  for (const visible of [JSON.stringify(response), JSON.stringify(s.writes.mock.calls), s.logs.join('\n')]) {
    expect(visible).not.toContain(feedback)
    expect(visible).not.toContain('Short fragments')
    expect(visible).not.toContain(source)
    for (const fragment of fragments) expect(visible).not.toContain(fragment.fragment)
  }
  expect(JSON.parse(s.logs[0])).toMatchObject({ rewrite: true, rewriteMs: 0, inTokens: 24, outTokens: 14 })
  expect((await (await s.app.request('/healthz')).json()).today.calls).toBe(2)
  expect(s.hits.mock.calls.filter(c => c[0].startsWith('ip:'))).toHaveLength(1)
  expect(await (await s.ask()).json()).toEqual({ ...response, cached: true })
  expect(s.requests).toHaveLength(2)
  expect((await s.ask('crimson lanterns next')).status).toBe(429)
})

it('regression: 重写仍抄时返回 search，且不缓存', async () => {
  const s = setup([copied, copied, copied, copied])
  for (let i = 0; i < 2; i++) expect(await (await s.ask()).json()).toMatchObject({ mode: 'search', reason: 'unverified', cached: false })
  expect(s.requests).toHaveLength(4)
  expect(s.writes).not.toHaveBeenCalled()
})

it('regression: accepts a clean rewrite with fewer points and the original source IDs', async () => {
  const first = JSON.stringify({ found: true, title: '', points: Array.from({ length: 5 }, () => ({ title: '', text: source, sources: ['S1'] })) })
  const reduced = JSON.stringify({ found: true, title: '核查条件', points: [
    { title: '判断', text: '先核实约束，再选择方向。', sources: ['S1'] },
    { title: '验证', text: '用小步试验确认效果。', sources: ['S1'] },
  ] })
  const s = setup([first, reduced])
  const body = await (await s.ask()).json()
  expect(body).toMatchObject({ mode: 'answer', cached: false })
  expect(body.points).toHaveLength(2)
  expect(body.points).toEqual([
    { title: '判断', text: '先核实约束，再选择方向。', cites: [1] },
    { title: '验证', text: '用小步试验确认效果。', cites: [1] },
  ])
  expect(body.citations).toEqual([{ n: 1, kind: 'post', sourceUrl: url }])
  expect(s.requests).toHaveLength(2)
  const feedback = s.requests[1].messages.at(-1)!.content
  expect(feedback).toContain('Keep at most 4 points')
  expect(feedback).toContain('drop the points listed as failing')
  expect(feedback).toContain('fewer points than the first answer')
  expect(await (await s.ask()).json()).toEqual({ ...body, cached: true })
  expect(s.requests).toHaveLength(2)
  for (const visible of [JSON.stringify(body), JSON.stringify(s.writes.mock.calls), s.logs.join('\n')]) expect(visible).not.toContain(feedback)
})

it('regression: a clean first answer needs one upstream call', async () => {
  const s = setup([clean])
  expect(await (await s.ask()).json()).toMatchObject({ mode: 'answer' })
  expect(s.requests).toHaveLength(1)
  expect(JSON.parse(s.logs[0]).rewrite).toBe(false)
})

it.each([
  ['JSON shape', '{bad json', 'search'],
  ['missing points', '{"found":true}', 'search'],
  ['found false', '{"found":false}', 'not_found'],
  ['missing sources', JSON.stringify({ found: true, points: [{ text: source, sources: ['S99'] }] }), 'search'],
])('regression: %s does not trigger a rewrite', async (_name, content, mode) => {
  const s = setup([content])
  expect(await (await s.ask()).json()).toMatchObject({ mode })
  expect(s.requests).toHaveLength(1)
})

it('regression: quote-budget-only rejection does not trigger a rewrite', async () => {
  const text = 'Start small. Adjust quickly. Build trust.'
  const local: Unit[] = [{ ...units[0], text }]
  const content = JSON.stringify({ found: true, title: '', points: [
    { text: '检查风险。', sources: ['S1'], quote: { chunk_id: 'S1', start: 0, end: 28 } },
    { text: '继续确认。', sources: ['S1'], quote: { chunk_id: 'S1', start: 29, end: text.length } },
  ] })
  const diagnostics: AnswerDiagnostics = {}, rewrite = vi.fn()
  expect(await parseAnswer(content, local, 'https://site.example', diagnostics)).toBeUndefined()
  expect(diagnostics.reason).toBe('quote_budget')
  expect(await answerWithRewrite({ content, units: local, siteUrl: 'https://site.example', messages: [], rewrite })).toBeUndefined()
  expect(rewrite).not.toHaveBeenCalled()
})

it('regression: skips rewriting when less than one second remains', async () => {
  const s = setup([async () => { s.tick(24_001); return upstream(copied) }])
  expect(await (await s.ask()).json()).toMatchObject({ mode: 'search', reason: 'unverified' })
  expect(s.requests).toHaveLength(1)
})

it('regression: caps the first call and gives the rewrite only the remaining shared budget', async () => {
  const timeouts: number[] = []
  const original = AbortSignal.timeout.bind(AbortSignal)
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => { timeouts.push(ms); return original(ms) })
  const s = setup([async () => { s.tick(15_000); return upstream(copied) }, clean], { timeoutMs: 120_000 })
  expect(await (await s.ask()).json()).toMatchObject({ mode: 'answer' })
  expect(timeouts).toEqual([25_000, 10_000])
})

it.each(['http', 'timeout'] as const)('regression: rewrite %s error falls back and counts toward the breaker', async kind => {
  const s = setup([copied, async init => {
    if (kind === 'http') return new Response('', { status: 503 })
    return new Promise<Response>((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))
  }], { timeoutMs: 1_000, breakerFailures: 1 })
  expect(await (await s.ask()).json()).toMatchObject({ mode: 'search', reason: 'upstream_error' })
  expect(s.requests).toHaveLength(2)
  expect(JSON.parse(s.logs[0])).toMatchObject({ rewrite: true, upstream: kind })
  expect((await (await s.app.request('/healthz')).json()).breaker).toBe('open')
  expect(await (await s.ask('crimson lanterns next')).json()).toMatchObject({ reason: 'breaker_open' })
  expect(s.writes).not.toHaveBeenCalled()
})

it('regression: reaching the global daily limit prevents the rewrite', async () => {
  const s = setup([copied], { globalPerDay: 1 })
  expect(await (await s.ask()).json()).toMatchObject({ mode: 'search', reason: 'unverified' })
  expect(s.requests).toHaveLength(1)
  expect((await (await s.app.request('/healthz')).json()).today.calls).toBe(1)
})

it('regression: checks the breaker again before charging or starting the rewrite', async () => {
  const allow = vi.spyOn(CircuitBreaker.prototype, 'allow').mockReturnValueOnce(true).mockReturnValueOnce(false)
  const s = setup([copied])
  expect(await (await s.ask()).json()).toMatchObject({ mode: 'search', reason: 'unverified' })
  expect(allow).toHaveBeenCalledTimes(2)
  expect(s.requests).toHaveLength(1)
  expect((await (await s.app.request('/healthz')).json()).today.calls).toBe(1)
})

it('regression: rewrite accounting uses the day at the actual call', async () => {
  const s = setup([async () => { s.tick(5_000); return upstream(copied) }, clean], { globalPerDay: 1 })
  s.tick(Date.parse('2026-10-29T15:59:58Z') - Date.parse('2026-10-29T02:00:00Z'))
  expect(await (await s.ask()).json()).toMatchObject({ mode: 'answer' })
  expect(s.store.count('site', `d:${dayOf(Date.parse('2026-10-29T15:59:58Z'))}`)).toBe(1)
  expect(s.store.count('site', 'd:2026-10-30')).toBe(1)
})

it('regression: keeps the original concurrency slot throughout rewriting and releases it afterward', async () => {
  let release!: (response: Response) => void, entered!: () => void
  const waiting = new Promise<void>(resolve => { entered = resolve })
  const s = setup([copied, async () => { entered(); return new Promise<Response>(resolve => { release = resolve }) }, clean], { maxConcurrent: 1 })
  const pending = s.ask()
  await waiting
  expect((await s.ask('crimson lanterns another')).status).toBe(429)
  expect(await (await s.ask('crimson lanterns other client', '198.51.100.2')).json()).toMatchObject({ reason: 'busy' })
  release(upstream(clean))
  expect(await (await pending).json()).toMatchObject({ mode: 'answer' })
  expect(await (await s.ask('crimson lanterns after')).json()).toMatchObject({ mode: 'answer' })
  expect(s.requests).toHaveLength(3)
})

it('regression: feedback names title fields and caps overlapping fragments without source context', async () => {
  const diagnostics: AnswerDiagnostics = { reason: 'independence', fields: Array.from({ length: 17 }, (_, i) => ({
    name: i === 0 ? 'answer title' : `point ${Math.ceil(i / 2)} ${i % 2 ? 'title' : 'text'}`, text: `Own${String.fromCharCode(65 + i)}word`.repeat(10),
  })) }
  const local = [{ ...units[0], text: diagnostics.fields!.map(f => f.text).join(' ') }]
  const content = JSON.stringify({ found: true, title: diagnostics.fields![0].text, points: Array.from({ length: 8 }, (_, i) => ({
    title: diagnostics.fields![i * 2 + 1].text, text: diagnostics.fields![i * 2 + 2].text, sources: ['S1'],
  })) })
  const feedback = (await buildRewriteMessages([], content, diagnostics, local)).at(-1)!.content
  const fragments = JSON.parse(feedback.split('\n')[3]) as { field: string; fragment: string }[]
  expect(fragments).toHaveLength(12)
  for (const f of fragments) {
    expect(f.fragment.length).toBeLessThanOrEqual(40)
    expect(diagnostics.fields!.find(field => field.name === f.field)!.text).toContain(f.fragment)
  }
  expect(feedback).toContain('answer title')
  expect(feedback).toContain('point 1 title')
  expect(feedback).toContain('point 1 text')
  expect(feedback).toContain('Mention names, product/library names, years and version numbers at most once in the whole answer, and do not start titles with them')
  expect(feedback).toContain('Keep the title short and generic')
  expect(feedback).toContain('Omit quote markers (quotes count as overlap)')
})

// Compile the actual immutable revision with the same dependency modules. This avoids a
// hand-maintained imitation of the reference parser or storing baseline implementation code.
function referenceParser(): typeof parseAnswer {
  const source = execFileSync('git', ['show', 'ff83488:server/ask/answer.ts'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports: { parseAnswer?: typeof parseAnswer } = {}
  new Function('require', 'exports', js)((name: string) => {
    if (name === './excerpts') return excerpts
    if (name === './units') return unitModule
    throw Error(`Unexpected baseline dependency ${name}`)
  }, exports)
  return exports.parseAnswer!
}

it('regression: parseAnswer return values equal ff83488 across all synthetic counterexamples and controls', async () => {
  const baseline = referenceParser()
  const guard = vi.spyOn(excerpts, 'explanationsAreIndependent')
  const controls = [clean, copied, '{', 'null', '[]', '{}', '{"found":false}', '{"found":true}', output(''), output('检查条件。', source), output(source, '', source)]
  for (const f of [...rewriteCases, ...controls.map((content, i) => ({ name: `control ${i}`, content, units, siteUrl: 'https://site.example' }))]) {
    guard.mockClear()
    const before = await baseline(f.content, f.units, f.siteUrl)
    const beforeCalls = guard.mock.calls.slice()
    guard.mockClear()
    expect(await parseAnswer(f.content, f.units, f.siteUrl), f.name).toEqual(before)
    expect(guard.mock.calls, `${f.name} guard order/arguments`).toEqual(beforeCalls)
    guard.mockClear()
    expect(await parseAnswer(f.content, f.units, f.siteUrl, {}), `${f.name} diagnostics`).toEqual(before)
    expect(guard.mock.calls, `${f.name} diagnostics guard order/arguments`).toEqual(beforeCalls)
  }
})

it('regression: preserves the baseline decision end to end with either copied rewrite variant', async () => {
  const baseline = referenceParser()
  let baselineExceptions = 0
  for (const f of rewriteCases) {
    const before = await baseline(f.content, f.units, f.siteUrl)
    if (before) baselineExceptions++
    const recopy = JSON.parse(f.content)
    const altered = (s: string) => [...s].map(c => /[a-z]/.test(c) ? c.toUpperCase() : c).join('\u200b')
    recopy.title = altered(recopy.title)
    for (const p of recopy.points) { p.title = altered(p.title); p.text = altered(p.text) }
    for (const variant of [f.content, JSON.stringify(recopy)]) {
      const fetch = vi.fn(async () => upstream(variant))
      const result = await answerWithRewrite({ ...f, messages: buildMessages('synthetic question', 'en', f.units), rewrite: messages => callDeepSeek({
        baseUrl: 'https://upstream.example', apiKey: 'test-placeholder', request: chatRequest('synthetic-model', messages), timeoutMs: 1000, fetch: fetch as typeof globalThis.fetch,
      }) })
      expect(result, `${f.group}: ${f.name}`).toEqual(before)
      expect(fetch.mock.calls.length).toBeLessThanOrEqual(1)
      if (before) expect(fetch).not.toHaveBeenCalled()
    }
  }
  // User-approved baseline exceptions are reported by the external verifier. No names or
  // special cases affect production behavior; every baseline rejection must remain rejected.
  expect(baselineExceptions).toBe(4)
})
