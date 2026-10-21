import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app'
import { createIndex } from '../server/db'
import type { CorpusRecord } from '../server/corpus'

const records: CorpusRecord[] = [
  { id: 'a', type: 'post', url: 'https://example.org/a', date: '2026-01-02', tags: ['ai-coding'], metrics: { likes: 10 }, summary: { zh: '先对齐再动手', en: 'Align before building' } },
  { id: 'b', type: 'repo', url: 'https://example.org/b', date: '2026-03-04T18:00:00.000Z', tags: ['typescript'], metrics: { stars: 500 }, summary: { zh: '类型重置', en: 'A types reset' } },
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

it('paginates, lists unique tags, searches CJK and treats SQL as literal text', async () => {
  expect((await get('?limit=1&offset=1')).items[0].id).toBe('c')
  expect((await get('?q=' + encodeURIComponent('对齐'))).items[0].id).toBe('a')
  expect((await get('?q=' + encodeURIComponent("' OR 1=1 --"))).total).toBe(0)
  expect(await (await app.request('/api/corpus/tags')).json()).toEqual(['ai-coding', 'typescript'])
})
it.each(['sort=wrong', 'limit=201', 'limit=1.5', 'offset=-1', 'from=nope', 'from=2026-02-31', 'from=2026-04-01&to=2026-01-01', 'q=' + 'x'.repeat(201)])('rejects %s', async params => {
  expect((await app.request('/api/corpus?' + params)).status).toBe(400)
})

it('includes timestamped records through the final day of a date range', async () => {
  expect((await get('?from=2026-03-04&to=2026-03-04')).items.map((r: CorpusRecord) => r.id)).toEqual(['b'])
})
