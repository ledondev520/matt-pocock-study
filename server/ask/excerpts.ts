// Explicit extracts have exact budgets. Explanations use a conservative, cooperative guard;
// it deliberately makes no attempt to reconstruct or count copied source intervals.
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
const codes = (text: string) => [...text].map(c => c.codePointAt(0)!)
const han = (code: number) => (code >= 0x3400 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0x20000 && code <= 0x323af)
function gram(chars: number[], start: number, size: number) {
  let key = size
  for (let i = start; i < start + size; i++) key = Math.imul(key, 31) + chars[i] | 0
  return key
}
interface Fingerprint { key: number; han: boolean; singleHan?: boolean }
function* fingerprints(chars: number[], symbolStream = false): Generator<Fingerprint> {
  for (let i = 0; i < chars.length; i++) {
    // Five-character runs complement short whole words; three retain Chinese anchors.
    if (!symbolStream && han(chars[i])) yield { key: gram(chars, i, 1), han: false, singleHan: true }
    if (i >= 4) yield { key: gram(chars, i - 4, 5), han: false }
    if (!symbolStream && i >= 2 && chars.slice(i - 2, i + 1).some(han)) yield { key: gram(chars, i - 2, 3), han: true }
  }
}

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

// Source short words supplement the five-character stream. A capped tail preserves token
// boundaries across slices without repeatedly copying an arbitrarily long source word.
function* shortWords(text: string, state: { tail: string }, final = false): Generator<string> {
  const joined = state.tail + text
  state.tail = ''
  for (const match of joined.matchAll(/[\p{L}\p{N}]+/gu)) {
    const word = match[0]
    if (!final && match.index + word.length === joined.length) state.tail = word.slice(0, 5)
    else if (/^[a-z0-9]{1,4}$/.test(word)) yield word
  }
}

// Complete source sentences supply direct sentence-budget evidence, including very short
// sentences and prose repeating a sentence already quoted. Chunk arrays avoid quadratic tails.
function* sentences(text: string, state: { parts: string[]; size: number }, final = false): Generator<string> {
  const parts = text.split(/[.!?。！？\n]+/u)
  for (const [i, part] of parts.entries()) {
    if (state.size <= MAX_PROSE_UNITS) state.parts.push(part)
    state.size += part.length
    if (i === parts.length - 1 && !final) continue
    if (state.size <= MAX_PROSE_UNITS) {
      const sentence = letters(state.parts.join(''))
      if (sentence) yield sentence
    }
    state.parts = []
    state.size = 0
  }
}

// At most four candidates per character, including affixed short source words.
function* fragmentsAt(word: string, start: number): Generator<string> {
  for (let size = Math.min(4, word.length - start); size > 0; size--) {
    // One- and two-letter words are too common inside unrelated words; retain their
    // prefix matches so suffixes cannot hide them, and scan longer fragments anywhere.
    if (size >= 3 || start === 0) yield word.slice(start, start + size)
  }
}
function* shortFragments(word: string): Generator<string> {
  for (let i = 0; i < word.length; i++) yield* fragmentsAt(word, i)
}

interface Hits { ordinary: number; han: number; singleHan: number }
interface QuotedEvidence {
  bonus: Hits
  matched: Set<number>
  matchedSentences: Set<string>
  sentenceCount: number
  hits: Hits
  words: Set<string>
  wordCount: number
  charCount: number
}
const emptyHits = (): Hits => ({ ordinary: 0, han: 0, singleHan: 0 })
function countHit(hits: Hits, entry: Fingerprint) {
  if (entry.singleHan) hits.singleHan++; else if (entry.han) hits.han++; else hits.ordinary++
}
const suspicious = (hits: Hits) => hits.ordinary >= 16 || hits.han >= 3 || hits.singleHan >= 24

/** Fingerprints are candidate evidence, not proof of copying. Verify a rejection against
 * actual source strings: a sustained run, complete sentences sharing the quote allowance,
 * or reconstruction of almost all of an original from scattered words/characters.
 * The last check retains protection against interleaved/affixed short-word copying without
 * treating every occurrence of "at" in "parameter" as a copied source word.
 */
async function independentSourceMatches(output: string, sources: { text: string; url?: string }[], linked: Set<string> | undefined, quotes: Extract[]): Promise<boolean> {
  const tokens = (text: string) => text.replace(/\p{Script=Han}/gu, ' $& ').match(/[\p{L}\p{N}]+/gu) ?? []
  const outputLetters = letters(output)
  const outputTokens = ` ${tokens(output).join(' ')} `
  const outputSymbols = symbols(output)
  const runs = (text: string, size: number) => new Set(Array.from({ length: Math.max(0, text.length - size + 1) }, (_, i) => text.slice(i, i + size)))
  const longRuns = [runs(outputLetters, 40), runs(outputSymbols, 20)]
  const outputWords = output.match(/[a-z0-9]+/g) ?? []
  const wordRuns = new Set(outputWords.flatMap(word => [...runs(word, 20)]))
  const fragments = new Set<string>()
  let work = 0
  for (const word of outputWords) for (const fragment of shortFragments(word)) {
    fragments.add(fragment)
    if (++work % QUANTUM === 0) await yieldToRequests()
  }
  const outputHan = [...outputLetters].filter(c => han(c.codePointAt(0)!))
  const hanSet = new Set(outputHan)
  const originals = new Map<string, { sentences: Set<string>; words: Set<string>; counts: Map<string, number>; wordChars: Map<string, number>; han: Set<string>; size: number; covered: number }>()
  let normalizedSize = 0
  for (const { text, url } of sources) {
    const key = url ? sourceKey(url) : ''
    let original = originals.get(key)
    if (!original) {
      original = { sentences: new Set(), words: new Set(), counts: new Map(), wordChars: new Map(), han: new Set(), size: 0, covered: 0 }
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
    for (const token of normalized.match(/\S+/gu) ?? []) {
      const word = letters(token)
      original.wordChars.set(word, Math.max(original.wordChars.get(word) ?? 0, [...token].length + 1))
    }
    for (const [index, stream] of [letters(normalized), symbols(normalized)].entries()) {
      for (let i = 0; i < stream.length; i++) {
        if (++work % QUANTUM === 0) await yieldToRequests()
        if (longRuns[index].has(stream.slice(i, i + (index ? 20 : 40)))) return false
        if (!index && wordRuns.has(stream.slice(i, i + 20))) return false
      }
    }
    for (const sentence of normalized.split(/[.!?。！？\n]+/u)) {
      const words = tokens(sentence)
      if (words.length) original.sentences.add(` ${words.join(' ')} `)
    }
    // Require source words in their original order, per source passage and original URL,
    // rather than pooling unrelated fingerprints across posts and answer fields.
    let cursor = 0
    for (const word of tokens(normalized)) {
      if (++work % QUANTUM === 0) await yieldToRequests()
      original.size += word.length
      const isHan = /^\p{Script=Han}$/u.test(word)
      if (isHan) original.han.add(word); else original.words.add(word)
      original.counts.set(word, (original.counts.get(word) ?? 0) + 1)
      if (isHan ? hanSet.has(word) : word.length <= 4 ? fragments.has(word) : outputLetters.includes(word)) {
        const index = outputLetters.indexOf(word, cursor)
        if (index !== -1) { original.covered += word.length; cursor = index + word.length }
      }
    }
  }
  for (const [url, original] of originals) {
    const extracts = quotes.filter(q => sourceKey(q.url) === url).map(q => measure(q.text))
    const total = extracts.reduce((sum, q) => ({ chars: sum.chars + q.chars, cjk: sum.cjk + q.cjk, words: sum.words + q.words, sentences: sum.sentences + q.sentences }), { chars: 0, cjk: 0, words: 0, sentences: 0 })
    for (const sentence of original.sentences) {
      if (++work % QUANTUM === 0) await yieldToRequests()
      // Count emitted occurrences, including repeats of a sentence already quoted.
      for (let i = outputTokens.indexOf(sentence); i !== -1; i = outputTokens.indexOf(sentence, i + sentence.length - 1)) {
        if (linked && !linked.has(url)) return false
        if (++total.sentences > MAX_SENTENCES) return false
      }
    }
    if (!original.size || original.covered / original.size < 0.9) continue
    const remaining = new Map(original.counts)
    const consume = (word: string) => {
      const count = remaining.get(word) ?? 0
      if (count) remaining.set(word, count - 1)
      return count > 0
    }
    const copiedHan = outputHan.filter(c => original.han.has(c) && consume(c)).length
    total.cjk += copiedHan
    total.chars += copiedHan
    const longWords = [...original.words].filter(w => w.length > 4).sort((a, b) => b.length - a.length)
    const countWord = (word: string, chars = original.wordChars.get(word) ?? word.length + 1) => {
      if (consume(word)) { total.words++; total.chars += chars }
    }
    for (const word of outputWords) {
      if (++work % 128 === 0) await yieldToRequests()
      // Long exact words may have an added suffix or meet the next response field.
      const longWord = longWords.find(w => word.includes(w))
      if (longWord) { countWord(longWord); continue }
      if (original.words.has(word)) { countWord(word); continue }
      let next = 0
      for (let i = 0; i < word.length; i++) {
        if (++work % QUANTUM === 0) await yieldToRequests()
        if (i < next) continue
        const fragment = [...fragmentsAt(word, i)].find(f => original.words.has(f))
        if (fragment) {
          countWord(fragment, fragment.length)
          next = i + fragment.length
        }
      }
    }
    if (total.words > MAX_WORDS || total.cjk > MAX_CJK || total.chars > MAX_QUOTE_CHARS) return false
  }
  return true
}

/** Bounded fingerprint scan followed by source verification for suspicious overlap.
 * Oversized inputs fail closed; no unchecked tail is silently discarded. Check every retrieved
 * original, including uncited posts and verified anchors. Fingerprint thresholds are
 * suspicion signals, not copied-character accounting.
 */
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
  const linked = linkedUrls && new Set(linkedUrls.map(sourceKey))
  const output = await normalizedProse(fields)
  if (output === undefined) return false
  const outputSentences = [...sentences(output, { parts: [], size: 0 }, true)]
  const wantedSentences = new Set(outputSentences)
  const outputWords = output.match(/[a-z0-9]+/g) ?? []
  const wantedWords = new Set<string>()
  let work = 0
  for (const word of outputWords) {
    for (const fragment of shortFragments(word)) {
      wantedWords.add(fragment)
      if (++work % QUANTUM === 0) await yieldToRequests()
    }
  }
  const matchedWords = new Set<string>()
  const streams = [letters, symbols]
  for (const [index, stream] of streams.entries()) {
    const keys: Fingerprint[] = []
    const wanted = new Set<number>()
    for (const entry of fingerprints(codes(stream(output)), index === 1)) {
      keys.push(entry)
      wanted.add(entry.key)
      if (keys.length % QUANTUM === 0) await yieldToRequests()
    }
    if (!wanted.size && (index || !wantedWords.size)) continue
    const matched = new Set<number>()
    const unlinked = new Set<number>()
    // Extracts supply limited additional evidence only when prose matches the same original.
    // They cannot trigger a prose downgrade alone; ordinary reuse of a topic word still fits.
    const quoted = new Map<string, QuotedEvidence>()
    for (const quote of quotes) {
      const url = sourceKey(quote.url)
      let evidence = quoted.get(url)
      if (!evidence) {
        evidence = { bonus: emptyHits(), hits: emptyHits(), matched: new Set(), matchedSentences: new Set(), sentenceCount: 0, words: new Set(), wordCount: 0, charCount: 0 }
        quoted.set(url, evidence)
      }
      const count = measure(quote.text)
      evidence.wordCount += count.words
      evidence.charCount += count.chars
      evidence.sentenceCount += count.sentences
      // Fingerprints remain conservative partial-overlap evidence. Complete sentences
      // below share the actual sentence allowance with every extracted quote.
      evidence.bonus.ordinary += count.chars
      evidence.bonus.han += count.sentences
      evidence.bonus.singleHan += count.cjk
    }
    for (const evidence of quoted.values()) {
      evidence.bonus.ordinary = Math.min(4, evidence.bonus.ordinary)
      evidence.bonus.han = Math.min(2, evidence.bonus.han)
      evidence.bonus.singleHan = Math.min(8, evidence.bonus.singleHan)
    }
    let normalizedSize = 0
    for (const { text: source, url } of sources) {
      let tail: number[] = []
      const wordState = { tail: '' }
      const sentenceState = { parts: [] as string[], size: 0 }
      const evidence = url ? quoted.get(sourceKey(url)) : undefined
      for await (const normalized of normalizedSlices(source)) {
        if (normalized === undefined) return false
        normalizedSize += normalized.length
        if (normalizedSize > MAX_SOURCE_UNITS) return false
        if (index === 0) {
          if (evidence) {
            for (const sentence of sentences(normalized, sentenceState)) {
              if (wantedSentences.has(sentence)) evidence.matchedSentences.add(sentence)
            }
          }
          for (const word of shortWords(normalized, wordState)) {
            if (!wantedWords.has(word)) continue
            matchedWords.add(word)
            evidence?.words.add(word)
          }
        }
        const text = [...tail, ...codes(stream(normalized))]
        for (const { key } of fingerprints(text, index === 1)) {
          if (!wanted.has(key)) continue
          matched.add(key)
          evidence?.matched.add(key)
          if (linked && (!url || !linked.has(sourceKey(url)))) unlinked.add(key)
        }
        // Carry across arbitrarily long removed punctuation/format runs as well.
        tail = text.slice(-4)
      }
      if (index === 0) {
        if (evidence) {
          for (const sentence of sentences('', sentenceState, true)) {
            if (wantedSentences.has(sentence)) evidence.matchedSentences.add(sentence)
          }
        }
        for (const word of shortWords('', wordState, true)) {
          if (!wantedWords.has(word)) continue
          matchedWords.add(word)
          evidence?.words.add(word)
        }
      }
    }
    const hits = emptyHits()
    let unlinkedHits = 0
    for (const [position, entry] of keys.entries()) {
      if (position % QUANTUM === 0) await yieldToRequests()
      if (!matched.has(entry.key)) continue
      countHit(hits, entry)
      if (unlinked.has(entry.key)) unlinkedHits++
      if (suspicious(hits) || unlinkedHits >= 6) return independentSourceMatches(output, sources, linked, quotes)
      for (const evidence of quoted.values()) {
        if (!evidence.matched.has(entry.key)) continue
        countHit(evidence.hits, entry)
        if (suspicious({
          ordinary: evidence.hits.ordinary + evidence.bonus.ordinary,
          han: evidence.hits.han + evidence.bonus.han,
          singleHan: evidence.hits.singleHan + evidence.bonus.singleHan,
        })) return independentSourceMatches(output, sources, linked, quotes)
      }
    }
    if (index === 0) {
      for (const sentence of outputSentences) {
        if (++work % QUANTUM === 0) await yieldToRequests()
        for (const evidence of quoted.values()) {
          if (evidence.matchedSentences.has(sentence) && ++evidence.sentenceCount > MAX_SENTENCES) return independentSourceMatches(output, sources, linked, quotes)
        }
      }
      let words = 0
      let chars = 0
      // Count non-overlapping emitted matches, including repetitions within one token,
      // across same-source anchors. Affixes cannot hide repeated source words.
      for (const word of outputWords) {
        let next = 0
        const quotedNext = new Map<QuotedEvidence, number>()
        for (let position = 0; position < word.length; position++) {
          let length = 0
          const quotedLengths = new Map<QuotedEvidence, number>()
          for (const fragment of fragmentsAt(word, position)) {
            if (++work % QUANTUM === 0) await yieldToRequests()
            if (!matchedWords.has(fragment)) continue
            length = Math.max(length, fragment.length)
            for (const evidence of quoted.values()) {
              if (evidence.words.has(fragment)) quotedLengths.set(evidence, Math.max(quotedLengths.get(evidence) ?? 0, fragment.length))
            }
          }
          if (length && position >= next) { words++; chars += length; next = position + length }
          if (words > MAX_WORDS || chars > MAX_QUOTE_CHARS) return independentSourceMatches(output, sources, linked, quotes)
          for (const [evidence, length] of quotedLengths) {
            if (position < (quotedNext.get(evidence) ?? 0)) continue
            quotedNext.set(evidence, position + length)
            evidence.wordCount++
            evidence.charCount += length
            if (evidence.wordCount > MAX_WORDS || evidence.charCount > MAX_QUOTE_CHARS) return independentSourceMatches(output, sources, linked, quotes)
          }
        }
      }
    }
  }
  return true
}
