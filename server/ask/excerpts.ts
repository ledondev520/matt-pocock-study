// Explicit extracts and confirmed prose matches share per-original budgets.
// All scans are bounded and yield so concurrent requests can keep making progress.
import { setImmediate as yieldToRequests } from 'node:timers/promises'
import { originalPost, type Unit } from './units'

export const MAX_QUOTE_CHARS = 240
const MAX_WORDS = 25
const MAX_CJK = 50
const MAX_SENTENCES = 2
export const sourceKey = (url: string) => url.split(/[?#]/)[0].replace(/\/$/, '')
export interface Extract { text: string; url: string }

function measure(text: string) {
  return {
    chars: [...text].length,
    cjk: (text.match(/\p{Script=Han}/gu) ?? []).length,
    words: (text.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []).length,
    sentences: Math.max(1, (text.match(/[^.!?。！？\n]+(?:[.!?。！？\n]+|$)/gu) ?? []).filter(s => /[\p{L}\p{N}]/u.test(s)).length),
  }
}

/** Each rendered extract consumes budget, even if another chunk or marker overlaps it. */
export function quotesWithinBudget(quotes: Extract[]): boolean {
  const totals = new Map<string, ReturnType<typeof measure>>()
  for (const quote of quotes) {
    // UTF-16 bounds also bound work before allocating code points or applying regexes.
    if (!quote.text.trim() || quote.text.length > MAX_QUOTE_CHARS * 2) return false
    const count = measure(quote.text)
    const key = sourceKey(quote.url)
    const total = totals.get(key) ?? { chars: 0, cjk: 0, words: 0, sentences: 0 }
    for (const field of ['chars', 'cjk', 'words', 'sentences'] as const) total[field] += count[field]
    if (total.chars > MAX_QUOTE_CHARS || total.cjk > MAX_CJK || total.words > MAX_WORDS || total.sentences > MAX_SENTENCES) return false
    totals.set(key, total)
  }
  return true
}

export const shortEnough = (text: string) => quotesWithinBudget([{ text, url: 'excerpt' }])

// Fixed-size character hashes, independent of word boundaries. Removing punctuation and
// format characters catches inserted punctuation/zero-width characters. Hash collisions can
// only cause a conservative downgrade. A separate symbol stream protects punctuation-only
// sources; it is never used to calculate an excerpt allowance.
export const removeFormatCharacters = (text: string) => text.replace(/\p{Cf}/gu, '')
const normalize = (text: string) => removeFormatCharacters(text.normalize('NFKC')).toLowerCase().replace(/ς/g, 'σ')
  .replace(/[‘’‚‛ʼ`´‹›]/gu, "'").replace(/[“”„‟«»「」『』\u301d\u301e\u301f]/gu, '"')
  .replace(/[\p{Dash_Punctuation}−]/gu, '-')
const letters = (text: string) => text.replace(/[^\p{L}\p{N}]/gu, '')
const symbols = (text: string) => text.replace(/[\p{L}\p{N}\p{M}\s\p{Cf}]/gu, '')
const MAX_SOURCE_UNITS = 1_000_000
const MAX_PROSE_UNITS = 24_000
const QUANTUM = 4096
export function contextFits(units: Unit[]): boolean {
  let size = 0
  for (const unit of units) {
    size += unit.title.length + unit.text.length
    for (const quote of unit.quotes ?? []) {
      size += quote.text.length
      if (size > MAX_SOURCE_UNITS) return false
    }
    if (size > MAX_SOURCE_UNITS) return false
  }
  return true
}

// All evidence uses this normalization, with small raw slices even when NFKC expands.
// Reject ambiguous seams rather than silently dropping a combining mark or surrogate.
async function* normalizedSlices(raw: string): AsyncGenerator<string | undefined> {
  for (let offset = 0; offset < raw.length; offset += 256) {
    await yieldToRequests()
    if (offset && /[\p{M}\uDC00-\uDFFF]/u.test(raw[offset])) { yield undefined; return }
    yield normalize(raw.slice(offset, offset + 256))
  }
}

// Keep the entire normalized output bounded, including compatibility-character expansion.
async function normalizedProse(fields: string[]): Promise<string | undefined> {
  if (fields.reduce((sum, text) => sum + text.length, 0) > MAX_PROSE_UNITS) return undefined
  const parts: string[] = []
  let size = 0
  // Preserve word boundaries; the letter stream still catches a source word split
  // between fields because it removes these separators before fingerprinting.
  for await (const part of normalizedSlices(fields.join('\n'))) {
    if (part === undefined) return undefined
    size += part.length
    if (size > MAX_PROSE_UNITS) return undefined
    parts.push(part)
  }
  return parts.join('')
}

// Function words can complete a copied phrase, but are not evidence on their own.
const FUNCTION_WORDS = new Set('a an the and or but as at by for from in into of on to with is are was were be been being it its this that these those i we you your our their they he she if then than so do does did can could would should will not no'.split(' '))
const significant = (word: string) => word.length >= 3 && !FUNCTION_WORDS.has(word)
const isHan = (word: string) => /^\p{Script=Han}$/u.test(word)
const tokens = (text: string) => text.replace(/\p{Script=Han}/gu, ' $& ').match(/[\p{L}\p{N}]+/gu) ?? []
interface Match { start: number; end: number; word: string }
interface Affix { before: number; after: number; key: string }
interface Original {
  sentences: Map<string, string[]>
  windows: Map<string, string[]>
  words: Set<string>
  tail: string[]
  decorations: Map<string, Set<string>>
}

// Find the first emitted occurrence at or after a previous match, without a quadratic
// scan when either the source or the response repeats the same short word many times.
function atOrAfter(matches: Match[], start: number): Match | undefined {
  let low = 0, high = matches.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (matches[mid].start < start) low = mid + 1; else high = mid
  }
  return matches[low]
}

/** Confirm source runs in emission order. Extra prose may separate their words/Han,
 * and punctuation, format characters or affixes may disguise their spelling. Neither
 * a bag of shared topic words nor short prefixes such as "a" in "array" proves copying.
 * Complete source sentences always participate in the shared sentence budget.
 */
async function independentSourceMatches(output: string, sources: { text: string; url?: string }[], linked: Set<string> | undefined, quotes: Extract[]): Promise<boolean> {
  const outputLetters = letters(output)
  const outputSymbols = symbols(output)
  const runs = (text: string, size: number) => new Set(Array.from({ length: Math.max(0, text.length - size + 1) }, (_, i) => text.slice(i, i + size)))
  const longRuns = [runs(outputLetters, 40), runs(outputSymbols, 20)]
  const wordRuns = new Set((output.match(/[\p{L}\p{N}]+/gu) ?? []).flatMap(word => [...runs(word, 20)]))
  // Map compact letters back to their rendered tokens. An identical affix on
  // neighboring content words can confirm an obfuscated function word ("toX"),
  // while an unrelated prefix in "array" carries no such evidence.
  let offset = 0
  const rawStarts: number[] = []
  const rawEnds: number[] = []
  const tokenStarts: number[] = []
  const tokenEnds: number[] = []
  for (const part of output.matchAll(/[\p{L}\p{N}]+/gu)) {
    for (let i = 0; i < part[0].length; i++) {
      rawStarts.push(part.index)
      rawEnds.push(part.index + part[0].length)
      tokenStarts.push(offset)
      tokenEnds.push(offset + part[0].length)
    }
    offset += part[0].length
  }
  const occurrences = new Map<string, Match[]>()
  let work = 0
  const matchesFor = async (word: string): Promise<Match[]> => {
    const cached = occurrences.get(word)
    if (cached) return cached
    const matches: Match[] = []
    for (let start = outputLetters.indexOf(word); start !== -1; start = outputLetters.indexOf(word, start + word.length)) {
      if (++work % QUANTUM === 0) await yieldToRequests()
      const end = start + word.length
      matches.push({ start, end, word })
    }
    occurrences.set(word, matches)
    return matches
  }
  const affixFor = (match: Match): Affix => ({
    before: match.start - tokenStarts[match.start], after: tokenEnds[match.end - 1] - match.end,
    key: JSON.stringify([outputLetters.slice(tokenStarts[match.start], match.start), outputLetters.slice(match.end, tokenEnds[match.end - 1])]),
  })
  const hasAffix = (match: Match, affixes: Affix[]) => {
    const before = match.start - tokenStarts[match.start], after = tokenEnds[match.end - 1] - match.end
    if (!before && !after) return true
    // Compare lengths before allocating strings, even for a tiny word inside a
    // 24k-character token. Affixes are reconstructed only for plausible alignments.
    return affixes.some(affix => affix.before === before && affix.after === after && affix.key === affixFor(match).key)
  }
  const originals = new Map<string, Original>()
  let normalizedSize = 0
  for (const { text, url } of sources) {
    const key = url ? sourceKey(url) : ''
    let original = originals.get(key)
    if (!original) {
      original = { sentences: new Map(), windows: new Map(), words: new Set(), tail: [], decorations: new Map() }
      originals.set(key, original)
    }
    const parts: string[] = []
    for await (const part of normalizedSlices(text)) {
      if (part === undefined) return false
      normalizedSize += part.length
      if (normalizedSize > MAX_SOURCE_UNITS) return false
      parts.push(part)
    }
    const normalized = parts.join('')
    // Preserve the previous guard's sustained letter/symbol-run protection, including
    // punctuation-only copying and a long source run inside one obfuscated output token.
    for (const [index, stream] of [letters(normalized), symbols(normalized)].entries()) {
      for (let i = 0; i < stream.length; i++) {
        if (++work % QUANTUM === 0) await yieldToRequests()
        if (longRuns[index].has(stream.slice(i, i + (index ? 20 : 40)))) return false
        if (!index && wordRuns.has(stream.slice(i, i + 20))) return false
      }
    }
    for (const sentence of normalized.split(/[.!?。！？\n]+/u)) {
      const words = tokens(sentence)
      if (words.some(word => significant(word) || isHan(word)) && words.join('').length <= MAX_PROSE_UNITS) original.sentences.set(words.join(''), words)
    }
    // Record punctuation attached to source words. Charge it only at an actual
    // emitted token boundary; explanatory asides and invented suffixes are not copied.
    for (const part of normalized.matchAll(/[^\s]+/gu)) {
      if (++work % QUANTUM === 0) await yieldToRequests()
      const decorated = part[0].match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}]+)([^\p{L}\p{N}]*)$/u)
      if (!decorated) continue
      const [, before, word, after] = decorated
      let decorations = original.decorations.get(word)
      if (!decorations) { decorations = new Set(); original.decorations.set(word, decorations) }
      decorations.add(JSON.stringify([before.slice(-MAX_QUOTE_CHARS), after.slice(0, MAX_QUOTE_CHARS)]))
    }
    // Keep adjacency across same-original anchor chunks. A word run needs three
    // content words; a Han run needs six characters. Mixed runs can supply both.
    for (const word of tokens(normalized)) {
      if (++work % QUANTUM === 0) await yieldToRequests()
      if ((await matchesFor(word)).length) original.words.add(word)
      original.tail.push(word)
      if (original.tail.length > 6) original.tail.shift()
      for (let size = 3; size <= original.tail.length; size++) {
        const window = original.tail.slice(-size)
        const words = window.filter(significant).length
        const han = window.filter(isHan).length
        if ((words >= 3 || han >= 6 || (words >= 1 && han >= 3)) && window.every(word => original!.words.has(word))) {
          original.windows.set(window.join(' '), window)
          break
        }
      }
    }
  }

  for (const [url, original] of originals) {
    const total = quotes.filter(q => sourceKey(q.url) === url).map(q => measure(q.text)).reduce((sum, q) => ({ chars: sum.chars + q.chars, cjk: sum.cjk + q.cjk, words: sum.words + q.words, sentences: sum.sentences + q.sentences }), { chars: 0, cjk: 0, words: 0, sentences: 0 })
    const compatible = new Map<string, Match[]>()
    const forAffixes = (word: string, affixes: Affix[]) => {
      const matches = occurrences.get(word)!
      if (significant(word) || isHan(word)) return matches
      const key = JSON.stringify([word, affixes.map(affix => affix.key).sort()])
      let filtered = compatible.get(key)
      if (!filtered) {
        filtered = matches.filter(match => hasAffix(match, affixes))
        compatible.set(key, filtered)
      }
      return filtered
    }
    // Reuse the same actual-string alignment for whole sentences and budgeted
    // fragments. This also catches sentences whose words all carry added suffixes.
    const alignedRuns = async (words: string[], disjoint = false) => {
      const found = new Map<string, Match[]>()
      if (words.reduce((sum, word) => sum + word.length, 0) > outputLetters.length) return found
      let nextRunStart = 0
      const lists: Match[][] = []
      for (const word of words) {
        const list = await matchesFor(word)
        if (!list.length) return found
        lists.push(list)
      }
      for (const first of lists[0]) {
        if (++work % QUANTUM === 0) await yieldToRequests()
        const run = [first]
        for (const list of lists.slice(1)) {
          if (++work % QUANTUM === 0) await yieldToRequests()
          const next = atOrAfter(list, run[run.length - 1].end)
          if (!next) break
          run.push(next)
        }
        if (run.length !== words.length) continue
        const affixes = words.some(word => !significant(word) && !isHan(word)) ? run.filter(match => significant(match.word)).map(affixFor) : []
        const supported = words.map(word => forAffixes(word, affixes))
        // Rebuild with supported weak words so an incidental prefix cannot hide
        // the real suffixed word later in the emitted run.
        run.length = 0
        let nextStart = first.start
        for (const list of supported) {
          if (++work % QUANTUM === 0) await yieldToRequests()
          const next = atOrAfter(list, nextStart)
          if (!next) break
          run.push(next)
          nextStart = next.end
        }
        if (run.length !== words.length) continue
        // Select one tight alignment for each emitted run. Many incidental "a"s
        // before the same pair of content words must not all become copied words.
        for (let i = run.length - 1; i >= 0; i--) {
          if (++work % QUANTUM === 0) await yieldToRequests()
          const limit = i === run.length - 1 ? run[i].end : run[i + 1].start
          const list = supported[i]
          let low = 0, high = list.length
          while (low < high) {
            const mid = (low + high) >>> 1
            if (list[mid].end <= limit) low = mid + 1; else high = mid
          }
          if (!low) { run.length = 0; break }
          run[i] = list[low - 1]
        }
        const actualAffixes = run.some(match => !significant(match.word) && !isHan(match.word)) ? run.filter(match => significant(match.word)).map(affixFor) : []
        if (run.length && run.every(match => significant(match.word) || isHan(match.word) || hasAffix(match, actualAffixes))) {
          if (disjoint && run[0].start < nextRunStart) continue
          nextRunStart = run[run.length - 1].end
          found.set(`${run[0].start}:${nextRunStart}`, run)
          // Three disjoint emitted sentences already exceed any remaining allowance.
          if (disjoint && found.size > MAX_SENTENCES) return found
        }
      }
      return found
    }
    for (const [sentence, words] of original.sentences) {
      if (++work % QUANTUM === 0) await yieldToRequests()
      const ranges = new Set<string>()
      // The compact stream preserves cross-field word splits and arbitrary inserted
      // punctuation even when it creates spurious output sentence boundaries.
      for (let start = outputLetters.indexOf(sentence); start !== -1; start = outputLetters.indexOf(sentence, start + sentence.length)) {
        ranges.add(`${start}:${start + sentence.length}`)
        if (total.sentences + ranges.size > MAX_SENTENCES) return false
      }
      for (const key of (await alignedRuns(words, true)).keys()) ranges.add(key)
      if (ranges.size && linked && !linked.has(url)) return false
      let end = -1
      for (const [start, nextEnd] of [...ranges].map(key => key.split(':').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
        if (start < end) continue
        total.sentences++
        end = nextEnd
      }
      if (total.sentences > MAX_SENTENCES) return false
    }
    const confirmed = new Map<string, Match>()
    const confirm = (match: Match) => confirmed.set(`${match.start}:${match.end}`, match)
    for (const window of original.windows.values()) {
      for (const run of (await alignedRuns(window)).values()) for (const match of run) confirm(match)
    }
    // Re-emitting the same content word consecutively is also a source run, even
    // when it occurred only once in the original. Other matched vocabulary breaks it.
    const emitted: Match[] = []
    for (const word of original.words) {
      if (significant(word)) emitted.push(...await matchesFor(word))
    }
    emitted.sort((a, b) => a.start - b.start || b.end - a.end)
    let repeated: Match[] = []
    let end = -1
    for (const match of emitted) {
      if (++work % QUANTUM === 0) await yieldToRequests()
      if (match.start < end) continue
      end = match.end
      if (repeated[0]?.word !== match.word) repeated = []
      repeated.push(match)
      if (repeated.length === 3) for (const item of repeated) confirm(item)
      else if (repeated.length > 3) confirm(match)
    }
    // Charge non-overlapping word/Han matches once per emitted occurrence.
    // Later occurrences consume budget again, without a source-frequency cap.
    end = -1
    const copiedSeparators = new Set<number>()
    for (const match of [...confirmed.values()].sort((a, b) => a.start - b.start || b.end - a.end)) {
      if (++work % QUANTUM === 0) await yieldToRequests()
      if (match.start < end) continue
      end = match.end
      total.chars += [...match.word].length
      if (isHan(match.word)) total.cjk++
      else {
        total.words++
        const start = rawStarts[match.start], end = rawEnds[match.end - 1]
        for (const decoration of original.decorations.get(match.word) ?? []) {
          const [before, after] = JSON.parse(decoration) as [string, string]
          if (output.slice(Math.max(0, start - before.length), start) === before) {
            for (let i = start - before.length; i < start; i++) copiedSeparators.add(i)
          }
          if (output.slice(end, end + after.length) === after) {
            for (let i = end; i < end + after.length; i++) copiedSeparators.add(i)
            if (/\s/u.test(output[end + after.length] ?? '')) copiedSeparators.add(end + after.length)
          }
        }
      }
    }
    total.chars += [...copiedSeparators].filter(position => !/[\uDC00-\uDFFF]/u.test(output[position])).length
    if (total.words > MAX_WORDS || total.cjk > MAX_CJK || total.chars > MAX_QUOTE_CHARS) return false
  }
  return true
}

/** Every retrieved original is checked, including uncited posts and verified anchors.
 * Oversized inputs fail closed; no unchecked tail is silently discarded. */
export async function explanationsAreIndependent(fields: string[], units: Unit[], linkedUrls?: string[], quotes: Extract[] = []): Promise<boolean> {
  if (!contextFits(units)) return false
  const sources: { text: string; url?: string }[] = []
  for (const unit of units) {
    if (unit.kind === 'post') {
      const original = originalPost(unit)
      sources.push({ text: original.title, url: unit.sourceUrl }, { text: original.text, url: unit.sourceUrl })
    }
    for (const quote of unit.quotes ?? []) sources.push({ text: quote.text, url: quote.url })
  }
  const output = await normalizedProse(fields)
  if (output === undefined) return false
  return independentSourceMatches(output, sources, linkedUrls && new Set(linkedUrls.map(sourceKey)), quotes)
}
