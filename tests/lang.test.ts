import { describe, expect, it } from 'vitest'
import { acceptLanguageHint, pickLang } from '../src/lib/lang'

describe('pickLang', () => {
  it.each([
    ['zh', 'en-US', 'zh'], ['en', 'zh-CN', 'en'],
    [null, 'zh-CN', 'zh'], [null, 'ZH-tw', 'zh'], [null, 'zh', 'zh'],
    ['invalid', 'zh-HK', 'zh'], ['EN', 'en-US', 'en'],
    [null, 'en-US', 'en'], [null, 'fr-FR', 'en'], [null, undefined, 'en'],
    ['', undefined, 'en'],
  ])('stored %s, navigator %s → %s', (stored, navigatorLanguage, expected) => {
    expect(pickLang(stored, navigatorLanguage)).toBe(expected)
  })
})

describe('Accept-Language hint', () => {
  it.each([
    ['zh-CN', 'zh'], ['ZH-TW, en;q=0.8', 'zh'], [' zh-HK ;q=0.9,en;q=0.5', 'zh'],
    ['en-US,zh;q=0.9', 'en'], ['fr,zh-CN;q=0.9', 'en'], ['', 'en'], [undefined, 'en'],
  ])('%s → %s (first language, same zh prefix rule)', (header, expected) => {
    expect(acceptLanguageHint(header)).toBe(expected)
  })
})
