import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app'
import { createIndex } from '../server/db'
import { readPages } from '../scripts/content'

let db: ReturnType<typeof createIndex>
let app: ReturnType<typeof createApp>
beforeAll(async () => {
  db = createIndex(await readPages('content'))
  app = createApp(db)
})
afterAll(() => db.close())

describe('API (Hono app.request, no listening port)', () => {
  it('reports health', async () => {
    const response = await app.request('/api/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })
  it.each([['zh-CN', 'zh'], ['en-US', 'en']])('hints %s as %s', async (header, lang) => {
    const response = await app.request('/api/lang-hint', { headers: { 'Accept-Language': header } })
    expect(await response.json()).toEqual({ lang })
  })
  it('lists only the selected language, in content order', async () => {
    const response = await app.request('/api/pages?lang=zh')
    const pages = await response.json()
    expect(pages.map((p: { lang: string; slug: string }) => ({ lang: p.lang, slug: p.slug }))).toEqual([
      { lang: 'zh', slug: 'corpus' },
      { lang: 'zh', slug: 'learn-from-matt' },
      { lang: 'zh', slug: 'core-principles' },
      { lang: 'zh', slug: 'punch-lines' },
      { lang: 'zh', slug: 'ai-coding-workflow' },
      { lang: 'zh', slug: 'alignment-and-prototypes' },
      { lang: 'zh', slug: 'specs-and-tickets' },
      { lang: 'zh', slug: 'implementation-and-feedback' },
      { lang: 'zh', slug: 'review-and-pr' },
      { lang: 'zh', slug: 'context-and-handoff' },
      { lang: 'zh', slug: 'agent-documents' },
      { lang: 'zh', slug: 'standards-and-checks' },
      { lang: 'zh', slug: 'decisions-and-retrospectives' },
      { lang: 'zh', slug: 'typescript-foundations' },
      { lang: 'zh', slug: 'practical-type-tools' },
      { lang: 'zh', slug: 'state-and-module-boundaries' },
      { lang: 'zh', slug: 'writing-to-teach' },
      { lang: 'zh', slug: 'feedback-and-attribution' },
      { lang: 'zh', slug: 'open-source-guide' },
      { lang: 'zh', slug: 'cheat-sheets' },
      { lang: 'zh', slug: 'learning-path' },
      { lang: 'zh', slug: 'about-and-copyright' },
    ])
    const english = await (await app.request('/api/pages?lang=en')).json()
    expect(english.map((p: { lang: string; slug: string }) => ({ lang: p.lang, slug: p.slug }))).toEqual([
      { lang: 'en', slug: 'corpus' },
      { lang: 'en', slug: 'learn-from-matt' },
      { lang: 'en', slug: 'core-principles' },
      { lang: 'en', slug: 'punch-lines' },
      { lang: 'en', slug: 'ai-coding-workflow' },
      { lang: 'en', slug: 'alignment-and-prototypes' },
      { lang: 'en', slug: 'specs-and-tickets' },
      { lang: 'en', slug: 'implementation-and-feedback' },
      { lang: 'en', slug: 'review-and-pr' },
      { lang: 'en', slug: 'context-and-handoff' },
      { lang: 'en', slug: 'agent-documents' },
      { lang: 'en', slug: 'standards-and-checks' },
      { lang: 'en', slug: 'decisions-and-retrospectives' },
      { lang: 'en', slug: 'typescript-foundations' },
      { lang: 'en', slug: 'practical-type-tools' },
      { lang: 'en', slug: 'state-and-module-boundaries' },
      { lang: 'en', slug: 'writing-to-teach' },
      { lang: 'en', slug: 'feedback-and-attribution' },
      { lang: 'en', slug: 'open-source-guide' },
      { lang: 'en', slug: 'cheat-sheets' },
      { lang: 'en', slug: 'learning-path' },
      { lang: 'en', slug: 'about-and-copyright' },
    ])
    expect(pages[0]).not.toHaveProperty('markdown')
  })
  it('searches English and Chinese through SQLite', async () => {
    const english = await app.request('/api/search?lang=en&q=tracer')
    expect(await english.json()).toMatchObject([{ lang: 'en', slug: 'specs-and-tickets' }])
    const branded = await app.request('/api/search?lang=en&q=branded')
    expect(await branded.json()).toMatchObject([{ lang: 'en', slug: 'practical-type-tools' }])
    const chinese = await app.request(`/api/search?${new URLSearchParams({ lang: 'zh', q: '卡点' })}`)
    expect(await chinese.json()).toMatchObject([{ lang: 'zh', slug: 'learn-from-matt' }])
  })
  // Pages whose English title or body contains the literal character (not a LIKE wildcard).
  const literalMatches: Record<string, string[]> = {
    '%': ['cheat-sheets'],
    // Exact set of English pages whose text contains a literal underscore (the old THIRD_PARTY_NOTICES
    // sentence left the licence notices when the full licence text replaced it).
    '_': ['standards-and-checks', 'practical-type-tools', 'cheat-sheets'],
  }
  it.each(['', '%', '_', "' OR 1=1 --", 'no-such-note'])('handles empty or literal search %s', async (q) => {
    const response = await app.request(`/api/search?${new URLSearchParams({ lang: 'en', q })}`)
    expect(response.status).toBe(200)
    expect((await response.json()).map((page: { slug: string }) => page.slug)).toEqual(literalMatches[q] ?? [])
  })
  it('rejects oversized search input and unknown API routes', async () => {
    expect((await app.request(`/api/search?q=${'x'.repeat(201)}`)).status).toBe(400)
    expect((await app.request('/api/missing')).status).toBe(404)
  })
})

it.each(['\0', '\t', '\n', '\r', '\x1f', '\x7f', '\u0085'])('rejects search control character %j', async q => {
  expect((await app.request('/api/search?' + new URLSearchParams({ q: 'a' + q + 'b' }))).status).toBe(400)
})
