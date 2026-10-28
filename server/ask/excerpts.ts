// Public excerpts share one budget per original URL, across chunks and response fields.
import type { Unit } from './units'

const MAX_WORDS = 25
const MAX_CJK = 50
const MAX_CHARS = 240
const sentences = (text: string) => (text.match(/[^.!?。！？\n]+(?:[.!?。！？\n]+|$)/gu) ?? []).filter(s => /[\p{L}\p{N}]/u.test(s))

function measure(text: string) {
  const cjk = (text.match(/\p{Script=Han}/gu) ?? []).length
  const words = (text.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []).length
  return { cjk, words, chars: [...text].length, sentences: sentences(text).length }
}

function withinLimits(count: ReturnType<typeof measure>): boolean {
  return count.cjk <= MAX_CJK && count.words <= MAX_WORDS && count.chars <= MAX_CHARS && count.sentences <= 2
}

export function shortEnough(text: string): boolean {
  return withinLimits(measure(text))
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

/** Locate copied runs despite case, spacing or punctuation changes. Complete source sentences
 * also mark excerpt boundaries, even when the output omits their punctuation.
 * Fields are joined before matching to catch copied runs spanning fields. */
function copiedExcerpts(output: string, sources: string[]): { text: string; sentenceCount: number }[] {
  const words = tokens(output)
  const marked = new Set<number>()
  const ends = new Set<number>()
  const windows = new Map<number, Map<string, boolean>>()
  const add = (parts: string[], sentenceEnd = false) => {
    if (!parts.length || parts.length > words.length) return
    let set = windows.get(parts.length)
    if (!set) { set = new Map(); windows.set(parts.length, set) }
    const id = key(parts)
    set.set(id, sentenceEnd || set.get(id) === true)
  }
  for (const source of sources) {
    const text = normalized(source)
    const parts = tokens(text).map(t => t[0])
    for (let i = 0; i + 4 <= parts.length; i++) add(parts.slice(i, i + 4))
    for (const sentence of sentences(text)) {
      const short = tokens(sentence).map(t => t[0])
      add(short, true)
    }
  }
  for (const [size, set] of windows) {
    for (let i = 0; i + size <= words.length; i++) {
      const id = key(words.slice(i, i + size).map(t => t[0]))
      if (set.has(id)) {
        for (let j = i; j < i + size; j++) marked.add(j)
        if (set.get(id)) ends.add(i + size - 1)
      }
    }
  }
  const excerpts: { text: string; sentenceCount: number }[] = []
  for (let i = 0; i < words.length; i++) {
    if (!marked.has(i)) continue
    const start = words[i].index!
    let sentenceCount = 1
    while (marked.has(i + 1)) {
      if (ends.has(i)) sentenceCount++
      i++
    }
    excerpts.push({ text: output.slice(start, words[i].index! + words[i][0].length), sentenceCount })
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
  const used = new Map<string, ReturnType<typeof measure>>()
  const take = (url: string, text: string, sentenceCount = 1) => {
    const id = sourceKey(url)
    const previous = used.get(id)
    const count = measure(text)
    // Every disconnected match consumes at least one sentence. Never infer a zero cost
    // from missing punctuation; repeated excerpts and chunks consume the budget again.
    const total = {
      words: (previous?.words ?? 0) + count.words,
      cjk: (previous?.cjk ?? 0) + count.cjk,
      chars: (previous?.chars ?? 0) + count.chars + (previous ? 1 : 0),
      sentences: (previous?.sentences ?? 0) + Math.max(sentenceCount, count.sentences),
    }
    used.set(id, total)
    return withinLimits(total)
  }
  for (const quote of quotes) if (!take(quote.url, quote.text)) return false
  const output = normalized(fields.join('\n'))
  const linked = linkedUrls && new Set(linkedUrls.map(sourceKey))
  for (const [url, texts] of sources) {
    // Count every overlapping token, including isolated words/Han characters and
    // repeated occurrences. Ambiguous common words consume the budget too; neither
    // sentence punctuation nor a minimum matching run can bypass these hard totals.
    const vocabulary = new Set(texts.flatMap(text => tokens(normalized(text)).map(t => t[0])))
    const overlap = measure(tokens(output).filter(t => vocabulary.has(t[0])).map(t => t[0]).join(' '))
    const quoted = used.get(url)
    if (overlap.words + (quoted?.words ?? 0) > MAX_WORDS || overlap.cjk + (quoted?.cjk ?? 0) > MAX_CJK) return false
    const excerpts = copiedExcerpts(output, texts)
    if (excerpts.length && linked && !linked.has(url)) return false
    for (const excerpt of excerpts) if (!take(url, excerpt.text, excerpt.sentenceCount)) return false
  }
  return true
}
