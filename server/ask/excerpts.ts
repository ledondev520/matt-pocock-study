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

// Fixed-size character hashes, independent of word boundaries. Shared normalization
// removes inserted marks, format characters and punctuation. Hash collisions can
// only cause a conservative downgrade. A separate symbol stream protects punctuation-only
// sources; it is never used to calculate an excerpt allowance.
export const removeFormatCharacters = (text: string) => text.replace(/\p{Cf}/gu, '')
const removeInvisibleCharacters = (text: string) => text.replace(/[\p{Mn}\p{Me}\p{Cf}]/gu, '')
const normalize = (text: string) => removeInvisibleCharacters(text.normalize('NFKC')).toLowerCase().replace(/ς/g, 'σ')
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
async function* normalizedSlices(raw: string): AsyncGenerator<{ text: string; sentenceText: string } | undefined> {
  let afterLetter = false
  let pending: string[] = []
  let size = 0
  for (let offset = 0; offset < raw.length; offset += 256) {
    await yieldToRequests()
    if (offset && /[\p{M}\uDC00-\uDFFF]/u.test(raw[offset])) { yield undefined; return }
    const normalized = normalize(raw.slice(offset, offset + 256))
    size += normalized.length
    if (size > MAX_SOURCE_UNITS) { yield undefined; return }
    const output: string[] = []
    for (const char of normalized) {
      // Delay punctuation after a letter until its right neighbour is known. This
      // joins co~de and co_de across slices too, while retaining standalone symbols
      // and punctuation before whitespace. Every evidence stream sees it; retain
      // sentence delimiters separately so cleanup cannot merge original sentences.
      if (afterLetter && /[\p{P}\p{S}]/u.test(char)) { pending.push(char); continue }
      const isLetter = /[\p{L}\p{N}]/u.test(char)
      if (pending.length) {
        if (!isLetter) {
          if (pending.length <= 256) output.push(pending.join(''))
          else {
            yield { text: output.join(''), sentenceText: '' }
            output.length = 0
            for (let offset = 0; offset < pending.length; offset += 256) {
              await yieldToRequests()
              yield { text: pending.slice(offset, offset + 256).join(''), sentenceText: '' }
            }
          }
        }
        pending = []
      }
      output.push(char)
      afterLetter = isLetter
    }
    yield { text: output.join(''), sentenceText: normalized }
  }
  // Flush long trailing symbol runs cooperatively as well.
  for (let offset = 0; offset < pending.length; offset += 256) {
    await yieldToRequests()
    yield { text: pending.slice(offset, offset + 256).join(''), sentenceText: '' }
  }
}

// Keep the entire normalized output bounded, including compatibility-character expansion.
async function normalizedProse(fields: string[]): Promise<{ text: string; sentenceText: string } | undefined> {
  if (fields.reduce((sum, text) => sum + text.length, 0) > MAX_PROSE_UNITS) return undefined
  const parts: string[] = []
  const sentenceParts: string[] = []
  let size = 0
  // A source word can be split between response fields.
  for (const field of fields) {
    for await (const part of normalizedSlices(field)) {
      if (part === undefined) return undefined
      size += part.sentenceText.length
      if (size > MAX_PROSE_UNITS) return undefined
      parts.push(part.text)
      sentenceParts.push(part.sentenceText)
    }
  }
  return { text: parts.join(''), sentenceText: sentenceParts.join('') }
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
    yield word.slice(start, start + size)
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

/** O(total retrieved characters + explanation characters), with bounded synchronous slices.
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
  const normalizedOutput = await normalizedProse(fields)
  if (normalizedOutput === undefined) return false
  const output = normalizedOutput.text
  const outputSentences = [...sentences(normalizedOutput.sentenceText, { parts: [], size: 0 }, true)]
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
        normalizedSize += normalized.sentenceText.length
        if (normalizedSize > MAX_SOURCE_UNITS) return false
        if (index === 0) {
          if (evidence) {
            for (const sentence of sentences(normalized.sentenceText, sentenceState)) {
              if (wantedSentences.has(sentence)) evidence.matchedSentences.add(sentence)
            }
          }
          for (const word of shortWords(normalized.text, wordState)) {
            if (!wantedWords.has(word)) continue
            matchedWords.add(word)
            evidence?.words.add(word)
          }
        }
        const text = [...tail, ...codes(stream(normalized.text))]
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
      if (suspicious(hits) || unlinkedHits >= 6) return false
      for (const evidence of quoted.values()) {
        if (!evidence.matched.has(entry.key)) continue
        countHit(evidence.hits, entry)
        if (suspicious({
          ordinary: evidence.hits.ordinary + evidence.bonus.ordinary,
          han: evidence.hits.han + evidence.bonus.han,
          singleHan: evidence.hits.singleHan + evidence.bonus.singleHan,
        })) return false
      }
    }
    if (index === 0) {
      for (const sentence of outputSentences) {
        if (++work % QUANTUM === 0) await yieldToRequests()
        for (const evidence of quoted.values()) {
          if (evidence.matchedSentences.has(sentence) && ++evidence.sentenceCount > MAX_SENTENCES) return false
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
          if (words > MAX_WORDS || chars > MAX_QUOTE_CHARS) return false
          for (const [evidence, length] of quotedLengths) {
            if (position < (quotedNext.get(evidence) ?? 0)) continue
            quotedNext.set(evidence, position + length)
            evidence.wordCount++
            evidence.charCount += length
            if (evidence.wordCount > MAX_WORDS || evidence.charCount > MAX_QUOTE_CHARS) return false
          }
        }
      }
    }
  }
  return true
}
