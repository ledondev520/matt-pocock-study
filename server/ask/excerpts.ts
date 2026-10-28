// Public excerpts share one budget per original URL, across chunks and response fields.
import type { Unit } from './units'

const MAX_WORDS = 25
const MAX_CJK = 60
const MAX_CHARS = 240
const sentences = (text: string) => (text.match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)/gu) ?? []).filter(s => /[\p{L}\p{N}]/u.test(s))

export function shortEnough(text: string): boolean {
  const cjk = (text.match(/\p{Script=Han}/gu) ?? []).length
  const words = (text.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []).length
  return cjk <= MAX_CJK && words <= MAX_WORDS && [...text].length <= MAX_CHARS && sentences(text).length <= 2
}

/** Truncate before the first character that would exceed the shared excerpt limits. */
export function shortExcerpt(text: string): string {
  let result = ''
  for (const char of text.trim()) {
    if (!shortEnough(result + char)) break
    result += char
  }
  return result.trimEnd()
}

const sourceKey = (url: string) => url.split(/[?#]/)[0].replace(/\/$/, '')
const normalized = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'")
const tokens = (text: string) => [...text.matchAll(/\p{Script=Han}|(?:(?!\p{Script=Han})[\p{L}\p{N}])+(?:'(?:(?!\p{Script=Han})[\p{L}\p{N}])+)?/gu)]
const key = (words: string[]) => JSON.stringify(words)

/** Locate copied runs despite case, spacing or punctuation changes. Four-token windows catch
 * long passages; complete shorter source sentences catch stitched short sentences as well.
 * Fields are joined before matching to catch copied runs spanning fields. */
function copiedExcerpts(output: string, sources: string[]): string[] {
  const words = tokens(output)
  const marked = new Set<number>()
  const windows = new Map<number, Set<string>>()
  const add = (parts: string[]) => {
    let set = windows.get(parts.length)
    if (!set) { set = new Set(); windows.set(parts.length, set) }
    set.add(key(parts))
  }
  for (const source of sources) {
    const text = normalized(source)
    const parts = tokens(text).map(t => t[0])
    for (let i = 0; i + 4 <= parts.length; i++) add(parts.slice(i, i + 4))
    for (const sentence of sentences(text)) {
      const short = tokens(sentence).map(t => t[0])
      if (short.length > 0 && short.length < 4) add(short)
    }
  }
  for (const [size, set] of windows) {
    for (let i = 0; i + size <= words.length; i++) {
      if (set.has(key(words.slice(i, i + size).map(t => t[0])))) {
        for (let j = i; j < i + size; j++) marked.add(j)
      }
    }
  }
  const excerpts: string[] = []
  for (let i = 0; i < words.length; i++) {
    if (!marked.has(i)) continue
    const start = words[i].index!
    while (marked.has(i + 1)) i++
    excerpts.push(output.slice(start, words[i].index! + words[i][0].length))
  }
  return excerpts
}

/** Reject over-budget answers, including copied prose outside the explicit quote field.
 * All retrieved originals are checked, even if the model omits their source ids. */
export function withinExcerptBudget(fields: string[], units: Unit[], quotes: { text: string; url: string }[] = [], linkedUrls?: string[]): boolean {
  const sources = new Map<string, string[]>()
  const add = (url: string | undefined, text: string) => {
    if (!url || !text) return
    const id = sourceKey(url)
    sources.set(id, [...(sources.get(id) ?? []), text])
  }
  for (const unit of units) {
    if (unit.kind === 'post') {
      const original = unit.sourceUrl ?? `unlinked:${unit.id}`
      add(original, unit.text); add(original, unit.title)
    }
    for (const quote of unit.quotes ?? []) add(quote.url, quote.text)
  }
  const used = new Map<string, string[]>()
  const take = (url: string, text: string) => {
    const id = sourceKey(url)
    const excerpts = [...(used.get(id) ?? []), text]
    used.set(id, excerpts)
    return shortEnough(excerpts.join('\n'))
  }
  for (const quote of quotes) if (!take(quote.url, quote.text)) return false
  const output = normalized(fields.join('\n'))
  const linked = linkedUrls && new Set(linkedUrls.map(sourceKey))
  for (const [url, texts] of sources) {
    const excerpts = copiedExcerpts(output, texts)
    if (excerpts.length && linked && !linked.has(url)) return false
    for (const excerpt of excerpts) if (!take(url, excerpt)) return false
  }
  return true
}
