import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app'
import { createIndex } from '../server/db'
import type { CorpusRecord } from '../server/corpus'

const records: CorpusRecord[] = [
  { id: 'a', type: 'post', url: 'https://example.org/a', date: '2026-01-02', tags: ['ai-coding'], metrics: { likes: 10 }, summary: { zh: '先对齐再动手', en: 'Align before building' } },
  { id: 'b', type: 'repo', url: 'https://example.org/b', date: '2026-03-04', tags: ['typescript'], metrics: { stars: 500 }, summary: { zh: '类型重置', en: 'A types reset' } },
  { id: 'c', type: 'post', url: 'https://example.org/c', date: '2026-05-06', tags: ['ai-coding'], metrics: { likes: 99 }, summary: { zh: '小步提交', en: 'Small steps' } },
]
const app = createApp(createIndex([]), undefined, records)
const get = async (q: string) => (await app.request('/api/corpus' + q)).json()

describe('/api/corpus', () => {
  it('sorts by engagement by default', async () => {
    expect((await get('')).items.map((r: CorpusRecord) => r.id)).toEqual(['b', 'c', 'a'])
  })
  it('filters by type, tag and date, sorts by date', async () => {
    expect((await get('?type=post&tag=ai-coding&sort=date')).items.map((r: CorpusRecord) => r.id)).toEqual(['c', 'a'])
    expect((await get('?from=2026-02-01&to=2026-04-01')).total).toBe(1)
  })
  it('searches our summaries', async () => {
    expect((await get('?q=align')).items[0].id).toBe('a')
  })
  it('rejects bad parameters', async () => {
    expect((await app.request('/api/corpus?type=tweet')).status).toBe(400)
    expect((await app.request('/api/corpus?limit=0')).status).toBe(400)
  })
})
