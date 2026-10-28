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
const normalized = (text: string) => text.normalize('NFKC')
  .replace(/[‘’‚‛ʼ`´‹›]/gu, "'").replace(/[“”„‟«»「」『』\u301d\u301e\u301f]/gu, '"')
  .replace(/[\p{Dash_Punctuation}−]/gu, '-')
const tokens = (text: string) => [...text.matchAll(/\p{Script=Han}|(?:(?!\p{Script=Han})[\p{L}\p{N}])+(?:'(?:(?!\p{Script=Han})[\p{L}\p{N}])+)?/gu)]
const key = (words: string[]) => JSON.stringify(words)
type Range = { start: number; end: number }

/** Each folded code unit maps back to a whole original grapheme/whitespace run.
 * Its weight preserves original character counts through NFKC expansion and space folding. */
function indexed(text: string) {
  let folded = ''
  let offsets: Range[] = []
  for (const { segment, index } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
    for (const char of normalized(segment)) {
      if (/\s/u.test(char)) {
        if (folded.endsWith(' ')) {
          offsets[offsets.length - 1].end = index + segment.length
          continue
        }
        folded += ' '
      } else folded += char
      for (let i = 0; i < char.length; i++) offsets.push({ start: index, end: index + segment.length })
    }
  }
  // Lowercase the complete string so contextual forms (such as final sigma) match.
  // Lowercase expansion keeps every produced code unit at its original position.
  const lowerOffsets: Range[] = []
  let cursor = 0
  for (const char of folded) {
    for (let i = 0; i < char.toLowerCase().length; i++) lowerOffsets.push(offsets[cursor])
    cursor += char.length
  }
  folded = folded.toLowerCase()
  offsets = lowerOffsets
  const weights = new Float64Array(folded.length)
  for (let i = 0; i < offsets.length;) {
    let end = i + 1
    while (end < offsets.length && offsets[end].start === offsets[i].start && offsets[end].end === offsets[i].end) end++
    const weight = [...text.slice(offsets[i].start, offsets[i].end)].length / (end - i)
    weights.fill(weight, i, end)
    i = end
  }
  return { text, folded, offsets, weights }
}

type Indexed = ReturnType<typeof indexed>
const originalRange = (text: Indexed, start: number, end: number): Range => ({
  start: text.offsets[start].start, end: text.offsets[end - 1].end,
})

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

/** Longest common character substrings; no word/token equality is needed.
 * Twelve characters anchor English runs, six suffice for Han. Short bounded runs,
 * Han characters and symbols retain the stricter isolated-overlap checks.
 * The rolling row uses O(source length) memory, including for repeated punctuation. */
function copiedSpans(output: Indexed, sources: Indexed[]) {
  const spans: { output: Range; source: Range; original: Indexed }[] = []
  const weights = new Float64Array(output.folded.length)
  const boundary = (char: string | undefined) => !char || !/[\p{L}\p{N}']/u.test(char)
  for (const source of sources) {
    const row = new Uint32Array(source.folded.length + 1)
    for (let end = 1; end <= output.folded.length; end++) {
      let diagonal = 0
      let longest = 0
      let sourceEnd = 0
      for (let j = 1; j <= source.folded.length; j++) {
        const previous = row[j]
        const length = output.folded[end - 1] === source.folded[j - 1] ? diagonal + 1 : 0
        row[j] = length
        diagonal = previous
        if (length <= longest) continue
        const start = end - length
        const sourceStart = j - length
        // Long anchors need no boundary inspection; keep work per DP cell constant.
        let matches = length >= 12
        if (!matches) {
          const run = output.folded.slice(start, end)
          if (!run.trim()) continue
          const bounded = (boundary(run[0]) || (boundary(output.folded[start - 1]) && boundary(source.folded[sourceStart - 1])))
            && (boundary(run.at(-1)) || (boundary(output.folded[end]) && boundary(source.folded[j])))
          matches = (length >= 6 && /\p{Script=Han}/u.test(run)) || bounded
            || (start === 0 && end === output.folded.length)
            || /^[^\p{L}\p{N}]*$/u.test(run) || /^\p{Script=Han}+$/u.test(run)
        }
        if (matches) {
          longest = length
          sourceEnd = j
        }
      }
      if (!longest) continue
      const start = end - longest
      const sourceStart = sourceEnd - longest
      spans.push({ output: originalRange(output, start, end), source: originalRange(source, sourceStart, sourceEnd), original: source })
      for (let i = start; i < end; i++) weights[i] = Math.max(weights[i], source.weights[sourceStart + i - start])
    }
  }
  return { spans, sourceChars: Math.ceil(weights.reduce((sum, weight) => sum + weight, 0) - 1e-9) }
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
  // Compare fields independently: inserted field separators are never source characters.
  const rendered = [...fields, ...quotes.map(q => q.text)].map(indexed)
  const prose = indexed(fields.join('\n'))
  for (const quote of quotes) if (!sources.has(sourceKey(quote.url))) sources.set(sourceKey(quote.url), [])
  const linked = linkedUrls && new Set(linkedUrls.map(sourceKey))
  for (const [url, texts] of sources) {
    const originals = texts.map(indexed)
    const runs = copiedSentences(prose.folded, originals.map(text => text.folded))
    const total = { words: 0, cjk: 0, chars: 0, sentences: 0 }
    for (let i = 0; i < rendered.length; i++) {
      const field = rendered[i]
      const detected = copiedSpans(field, originals)
      const explicit = quotes[i - fields.length]
      const isQuote = explicit && sourceKey(explicit.url) === url
      const ranges = union([...detected.spans.map(span => span.output), ...(isQuote ? [{ start: 0, end: field.text.length }] : [])])
      let chars = 0
      for (const range of ranges) {
        const count = measure(field.text.slice(range.start, range.end))
        total.words += count.words
        total.cjk += count.cjk
        chars += count.chars
      }
      // Overlapping substrings/chunks charge each rendered position once. Original-space
      // expansion still counts when normalization collapses it in the answer.
      total.chars += Math.max(chars, detected.sourceChars)
      if (isQuote) total.sentences += Math.max(1, measure(field.text).sentences)
    }
    if (runs.length && linked && !linked.has(url)) return false
    // Keep the existing sentence detector for punctuation-free complete sentences.
    for (const run of runs) {
      const range = originalRange(prose, run.start, run.end)
      total.sentences += Math.max(run.sentenceCount, measure(prose.text.slice(range.start, range.end)).sentences)
    }
    if (total.words > MAX_WORDS || total.cjk > MAX_CJK || total.chars > MAX_CHARS || total.sentences > 2) return false
  }
  return true
}
