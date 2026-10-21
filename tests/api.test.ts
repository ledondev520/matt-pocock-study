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
    const expected = (await readPages('content')).filter(p => p.lang === 'zh').map(p => p.slug)
    expect(pages.map((p: { slug: string }) => p.slug)).toEqual(expected)
    expect(pages[0]).not.toHaveProperty('markdown')
  })
  it('searches English and Chinese through SQLite', async () => {
    const english = await app.request('/api/search?lang=en&q=notebook')
    expect(await english.json()).toMatchObject([{ lang: 'en', slug: 'learn-from-matt' }])
    const chinese = await app.request(`/api/search?${new URLSearchParams({ lang: 'zh', q: '卡点' })}`)
    expect(await chinese.json()).toMatchObject([{ lang: 'zh', slug: 'learn-from-matt' }])
  })
  it.each(['', '%', '_', "' OR 1=1 --", 'no-such-note'])('handles empty or literal search %s', async (q) => {
    const response = await app.request(`/api/search?${new URLSearchParams({ lang: 'en', q })}`)
    expect(response.status).toBe(200)
    expect((await response.json()).map((page: { slug: string }) => page.slug)).toEqual(q === '_' ? ['learn-from-matt'] : [])
  })
  it('rejects oversized search input and unknown API routes', async () => {
    expect((await app.request(`/api/search?q=${'x'.repeat(201)}`)).status).toBe(400)
    expect((await app.request('/api/missing')).status).toBe(404)
  })
})
