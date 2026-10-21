import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CorpusRecord } from '../server/corpus'

const records = JSON.parse(readFileSync('data/corpus-index.json', 'utf8')) as CorpusRecord[]

describe('data/corpus-index.json', () => {
  it('has unique ids and https source links', () => {
    expect(new Set(records.map((r) => r.id)).size).toBe(records.length)
    for (const r of records) expect(new URL(r.url).protocol).toBe('https:')
  })
  it('only contains records with our own short bilingual summaries (no original text fields)', () => {
    for (const r of records) {
      expect(Object.keys(r).sort()).toEqual(['date', 'id', 'metrics', 'summary', 'tags', 'type', 'url'])
      expect(r.summary.zh.trim().length).toBeGreaterThan(0)
      expect([...r.summary.zh].length).toBeLessThanOrEqual(40)
      expect(r.summary.en.trim().split(/\s+/).length).toBeLessThanOrEqual(25)
    }
  })
})
