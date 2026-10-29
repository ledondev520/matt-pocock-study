import { createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { cacheKey, createAskApp } from '../server/ask/app'
import { parseAnswer } from '../server/ask/answer'
import { loadConfig } from '../server/ask/config'
import { explanationsAreIndependent } from '../server/ask/excerpts'
import { openStore } from '../server/ask/store'
import type { Unit } from '../server/ask/units'

const url = 'https://x.com/mattpocockuk/status/1000000000000000001'
const natural = Array(8).fill('Read each diff with care then test each path keep work easy and move only when safe').join(' ').split(' ')
const han = Array.from({ length: 120 }, (_, i) => String.fromCodePoint(0x4e00 + i))
const englishAside = (words: string[]) => words.map((w, i) => w + (i % 3 === 2 ? ' Our observation.' : '')).join(' ')
const hanAside = (chars: string[]) => chars.map((c, i) => c + (i % 6 === 5 ? '这是解释' : '')).join('')
interface Fixture { name: string; source: string; text: string; title?: string; pointTitle?: string; quote?: { start: number; end: number }; lang?: 'zh' | 'en' }
const singletonWords = 'api cli dom ast cpu ram ssd hdd tcp udp dns tls ssh url uri sql css xml csv tsv npm npx git vim awk sed tar zip'.split(' ')
const fixtures: Fixture[] = [
  { name: 'P1-a partial English copying', source: natural.join(' '), text: englishAside(natural.slice(0, 60)) },
  { name: 'P1-a partial Han copying', source: han.join(''), text: hanAside(han.slice(0, 60)), lang: 'zh' },
  ...['code', 'codeX', 'co\u200bdeｘ'].map(word => ({ name: `P1-a short word ${word}`, source: Array(100).fill('code').join(' '), text: Array(61).fill(word).join(' Our thought. ') })),
  { name: 'P1-a shared word allowance with quote', source: Array(100).fill('code').join(' '), text: Array(25).fill('code').join(' Our thought. '), quote: { start: 0, end: 4 } },
  { name: 'P1-a shared Han allowance with quote', source: han.join(''), text: hanAside(han.slice(0, 50)), quote: { start: 50, end: 51 }, lang: 'zh' },
  { name: 'P1-b repeated English source', source: natural.slice(0, 18).join(' '), text: Array(5).fill(englishAside(natural.slice(0, 18))).join(' ') },
  { name: 'P1-b repeated Han source', source: han.slice(0, 40).join(''), text: Array(3).fill(hanAside(han.slice(0, 40))).join(''), lang: 'zh' },
  { name: 'P1-b repeated long word inside a token', source: Array(25).fill('abcdefghij').join(' '), text: 'abcdefghijX'.repeat(25) },
  { name: 'P1-c punctuation inside English words', source: 'Start small. Adjust quickly. Build trust.', text: 'Bu-ild tr-ust.', quote: { start: 0, end: 28 } },
  { name: 'P1-c split word across fields', source: 'Start small. Adjust quickly. Build trust. Extra context.', title: 'Start sm', text: 'all. Adjust quickly.', quote: { start: 29, end: 41 } },
  { name: 'P1-c punctuation inside Han sentence', source: '先分拆。再验证。后发布。', text: '后-发-布。', quote: { start: 0, end: 8 }, lang: 'zh' },
  { name: 'P1-c split Han sentence across fields', source: '先分拆。再验证。后发布。额外背景。', title: '先分', text: '拆。再验证。', quote: { start: 8, end: 12 }, lang: 'zh' },
]
fixtures.push(
  { name: 'R3 repeated complete sentence with affixed function words', source: 'code a type.', text: Array(3).fill('codeX aX typeX.').join(' My annotation. ') },
  ...['', 'X', 'ｘ'].map(suffix => ({ name: `R1 ordered run ending in function words ${suffix}`, source: [...singletonWords.slice(0, 24), 'to', 'a'].join(' '), text: [...singletonWords.slice(0, 24), 'to', 'a'].map(word => word + suffix).join(' My annotation. ') })),
  ...['', 'X', 'ｘ'].map(suffix => ({ name: `R1 ordered singleton short words with suffix ${suffix}`, source: singletonWords.join(' '), text: singletonWords.map(word => word + suffix).join(' My annotation. ') })),
  { name: 'R1 repeated singleton with suffix', source: 'cat dog fox', text: Array(30).fill('catX').join(' My annotation. ') },
  ...['Ship gra.dua-lly.', 'Sh!ip gra?dually.', 'Sh\u200dip gra.dua-lly.', 'ShipX graduallyX.', 'Sh!ipｘ gra?duallyｘ.'].map(text => ({ name: `R3 in-word sentence punctuation ${text}`, source: 'Map risks. Check assumptions. Ship gradually.', text, quote: { start: 0, end: 29 } })),
)
for (const lang of ['en', 'zh'] as const) {
  for (const field of ['title', 'pointTitle'] as const) fixtures.push({
    name: `P1-a ${lang} copying in ${field}`, lang,
    source: lang === 'en' ? natural.join(' ') : han.join(''), text: 'Inspect risk independently.',
    [field]: lang === 'en' ? englishAside(natural.slice(0, 60)) : hanAside(han.slice(0, 60)),
  })
}
const config = () => ({ ...loadConfig({ ASK_ENABLED: '1', DEEPSEEK_API_KEY: 'test-placeholder' }), minScore: 0 })

for (const fixture of fixtures) {
  it(`rejects ${fixture.name} in parser, API and cache`, async () => {
    const unit: Unit = { id: 'post:hotfix', kind: 'post', title: '', text: fixture.source, sourceUrl: url }
    const quote = fixture.quote && { chunk_id: 'S1', ...fixture.quote }
    const content = JSON.stringify({ found: true, title: fixture.title ?? '', points: [{ title: fixture.pointTitle ?? '', text: fixture.text, quote, sources: ['S1'] }] })
    expect(await explanationsAreIndependent([fixture.title ?? '', fixture.pointTitle ?? '', fixture.text], [unit], [url], fixture.quote ? [{ text: fixture.source.slice(fixture.quote.start, fixture.quote.end), url }] : [])).toBe(false)
    const parsed = await parseAnswer(content, [unit], 'https://site.example')
    if (fixture.quote) expect(parsed).toMatchObject({ found: true, degraded: true, title: '', points: [{ title: '', text: '' }] })
    else expect(parsed).toBeUndefined()
    const store = openStore(':memory:')
    const writes = vi.spyOn(store, 'putCache')
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] })))
    try {
      const app = createAskApp({ config: config(), units: [unit], store, fetch, log: () => {} })
      for (let i = 0; i < 2; i++) {
        const response = await app.request('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: fixture.source.match(/^[a-z]+/i)?.[0] ?? fixture.source.slice(0, 6), lang: fixture.lang ?? 'en' }) })
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ mode: 'search', reason: 'unverified', message: '', citations: [{ n: 1, kind: 'post', sourceUrl: url }], cached: false })
      }
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(writes).not.toHaveBeenCalled()
    } finally { store.close() }
  })
}

it('isolates unsafe answers persisted under the v10 verification policy', async () => {
  const fixture = fixtures[0]
  const unit: Unit = { id: 'post:hotfix', kind: 'post', title: '', text: fixture.source, sourceUrl: url }
  const cfg = config()
  const q = fixture.source.slice(0, 30)
  const digest = createHash('sha256').update(JSON.stringify([[unit.id, 'post', '', unit.text, null, url, null, []]])).digest('hex')
  const store = openStore(':memory:')
  store.putCache(cacheKey(q, 'en', `${digest}:${cfg.model}:methodology-v10-verified-overlap`), JSON.stringify({ mode: 'answer', title: '', points: [{ title: '', text: fixture.text, cites: [1] }], citations: [{ n: 1, kind: 'post', sourceUrl: url }], cached: false }), 86_400_000, Date.now())
  const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ found: true, title: '', points: [{ title: '', text: fixture.text, sources: ['S1'] }] }) } }] })))
  try {
    const app = createAskApp({ config: cfg, units: [unit], store, fetch, log: () => {} })
    for (let i = 0; i < 2; i++) {
      const response = await app.request('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, lang: 'en' }) })
      expect(await response.json()).toEqual({ mode: 'search', reason: 'unverified', message: '', citations: [{ n: 1, kind: 'post', sourceUrl: url }], cached: false })
    }
    expect(fetch).toHaveBeenCalledTimes(2)
  } finally { store.close() }
})

it('isolates unsafe answers persisted under the v11 verification policy', async () => {
  const fixture = fixtures.find(fixture => fixture.name === 'R1 ordered singleton short words with suffix X')!
  const unit: Unit = { id: 'post:hotfix', kind: 'post', title: '', text: fixture.source, sourceUrl: url }
  const cfg = config()
  const digest = createHash('sha256').update(JSON.stringify([[unit.id, 'post', '', unit.text, null, url, null, []]])).digest('hex')
  const store = openStore(':memory:')
  store.putCache(cacheKey('api', 'en', `${digest}:${cfg.model}:methodology-v11-emitted-overlap`), JSON.stringify({ mode: 'answer', title: 'Unsafe v11', points: [{ title: '', text: fixture.text, cites: [1] }], citations: [], cached: false }), 86_400_000, Date.now())
  const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ found: true, title: '', points: [{ title: '', text: fixture.text, sources: ['S1'] }] }) } }] })))
  try {
    const app = createAskApp({ config: cfg, units: [unit], store, fetch, log: () => {} })
    for (let i = 0; i < 2; i++) {
      const response = await app.request('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: 'api', lang: 'en' }) })
      expect(await response.json()).toEqual({ mode: 'search', reason: 'unverified', message: '', citations: [{ n: 1, kind: 'post', sourceUrl: url }], cached: false })
    }
    expect(fetch).toHaveBeenCalledTimes(2)
  } finally { store.close() }
})
