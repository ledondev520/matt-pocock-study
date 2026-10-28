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

export function shortEnough(text: string): boolean {
  return withinExcerptBudget([], [], [{ text, url: 'excerpt' }])
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
const atoms = (text: string) => [...tokens(text), ...text.matchAll(/[^\p{L}\p{N}\s]/gu)].sort((a, b) => a.index - b.index)
const key = (words: string[]) => JSON.stringify(words)
type Range = { start: number; end: number }

/** Folding is for detection only. Every folded code unit retains its original character offset. */
function indexed(text: string) {
  let folded = ''
  const offsets: Range[] = []
  let start = 0
  for (const char of text) {
    const value = normalized(char)
    folded += value
    for (let i = 0; i < value.length; i++) offsets.push({ start, end: start + char.length })
    start += char.length
  }
  return { folded, offsets }
}

function union(ranges: Range[]): Range[] {
  const merged: Range[] = []
  for (const range of ranges.sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = merged.at(-1)
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
    } else merged.push({ ...range })
  }
  return merged
}

/** All shared words, Han characters and symbols count, even isolated/common ones.
 * Extend each occurrence into matching original whitespace and punctuation.
 * Taking the union in answer coordinates prevents overlapping source chunks/windows charging twice. */
function copiedRanges(output: string, sources: string[]): Range[] {
  const words = atoms(output)
  const occurrences = new Map<string, { text: string; start: number; end: number; left: number; right: number }[]>()
  for (const text of sources) {
    const parts = atoms(text)
    for (let i = 0; i < parts.length; i++) {
      const word = parts[i]
      const occurrence = { text, start: word.index, end: word.index + word[0].length,
        left: i ? parts[i - 1].index + parts[i - 1][0].length : 0,
        right: parts[i + 1]?.index ?? text.length }
      const matches = occurrences.get(word[0]) ?? []
      matches.push(occurrence)
      occurrences.set(word[0], matches)
    }
  }
  const ranges: Range[] = []
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    let first = word.index
    let last = first + word[0].length
    const matches = occurrences.get(word[0])
    if (!matches) continue
    for (const source of matches) {
      let start = word.index
      let end = start + word[0].length
      let left = source.start
      let right = source.end
      const before = i ? words[i - 1].index + words[i - 1][0].length : 0
      const after = words[i + 1]?.index ?? output.length
      while (start > before && left > source.left && output[start - 1] === source.text[left - 1]) { start--; left-- }
      while (end < after && right < source.right && output[end] === source.text[right]) { end++; right++ }
      // Every candidate contains this occurrence: retain their union without
      // materialising one interval per repeated symbol in every source chunk.
      first = Math.min(first, start)
      last = Math.max(last, end)
    }
    ranges.push({ start: first, end: last })
  }
  return ranges
}

/** Locate copied runs despite case, spacing or punctuation changes. Complete source sentences
 * also mark excerpt boundaries, even when the output omits their punctuation.
 * Fields are joined before matching to catch copied runs spanning fields. */
function copiedSentences(output: string, sources: string[]): (Range & { sentenceCount: number })[] {
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
    const parts = tokens(source).map(t => t[0])
    for (let i = 0; i + 4 <= parts.length; i++) add(parts.slice(i, i + 4))
    for (const sentence of sentences(source)) {
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
  const excerpts: (Range & { sentenceCount: number })[] = []
  for (let i = 0; i < words.length; i++) {
    if (!marked.has(i)) continue
    const start = words[i].index!
    let sentenceCount = 1
    while (marked.has(i + 1)) {
      if (ends.has(i)) sentenceCount++
      i++
    }
    excerpts.push({ start, end: words[i].index! + words[i][0].length, sentenceCount })
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
  // Quotes are separate rendered fields, not a second charge for the same output span.
  const rendered = [...fields, ...quotes.map(q => q.text)]
  const separators = new Set<number>()
  const quoteRanges = new Map<string, Range[]>()
  let cursor = 0
  for (let i = 0; i < rendered.length; i++) {
    if (i) separators.add(cursor++)
    const quote = quotes[i - fields.length]
    if (quote) {
      const id = sourceKey(quote.url)
      quoteRanges.set(id, [...(quoteRanges.get(id) ?? []), { start: cursor, end: cursor + rendered[i].length }])
      if (!sources.has(id)) sources.set(id, [])
    }
    cursor += rendered[i].length
  }
  const output = rendered.join('\n')
  const { folded, offsets } = indexed(output)
  const prose = indexed(fields.join('\n')).folded
  const originalRange = ({ start, end }: Range): Range => ({ start: offsets[start]?.start ?? 0, end: offsets[end - 1]?.end ?? 0 })
  const linked = linkedUrls && new Set(linkedUrls.map(sourceKey))
  for (const [url, texts] of sources) {
    const originals = texts.map(text => indexed(text).folded)
    const detected = copiedRanges(folded, originals)
    const runs = copiedSentences(prose, originals)
    if (runs.length && linked && !linked.has(url)) return false
    const explicit = quoteRanges.get(url) ?? []
    const ranges = union([...detected.map(originalRange), ...explicit])
    const total = { words: 0, cjk: 0, chars: 0, sentences: 0 }
    for (const range of ranges) {
      const count = measure(output.slice(range.start, range.end))
      total.words += count.words
      total.cjk += count.cjk
      // Artificial field separators are not characters copied into the answer.
      total.chars += count.chars
      for (const position of separators) if (position >= range.start && position < range.end) total.chars--
    }
    // Sentence detection still catches complete source sentences without punctuation and
    // four-token runs. It annotates the same output; it never charges characters again.
    for (const run of runs) {
      const range = originalRange(run)
      total.sentences += Math.max(run.sentenceCount, measure(output.slice(range.start, range.end)).sentences)
    }
    for (const range of explicit) total.sentences += Math.max(1, measure(output.slice(range.start, range.end)).sentences)
    if (total.words > MAX_WORDS || total.cjk > MAX_CJK || total.chars > MAX_CHARS || total.sentences > 2) return false
  }
  return true
}
