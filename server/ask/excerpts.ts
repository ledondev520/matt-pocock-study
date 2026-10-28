// Explicit extracts have exact budgets. Explanations use a conservative, cooperative guard;
// it deliberately makes no attempt to reconstruct or count copied source intervals.
import { setImmediate as yieldToRequests } from 'node:timers/promises'
import type { Unit } from './units'

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
const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/ς/g, 'σ')
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
function fingerprints(chars: number[], symbolStream = false) {
  const keys: { key: number; han: boolean; singleHan?: boolean }[] = []
  for (let i = 0; i < chars.length; i++) {
    // Five characters suffice for English; three retain short Chinese sentence anchors.
    if (!symbolStream && han(chars[i])) keys.push({ key: gram(chars, i, 1), han: false, singleHan: true })
    if (i >= 4) keys.push({ key: gram(chars, i - 4, 5), han: false })
    if (!symbolStream && i >= 2 && chars.slice(i - 2, i + 1).some(han)) keys.push({ key: gram(chars, i - 2, 3), han: true })
  }
  return keys
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

/** O(total retrieved characters + explanation characters), with bounded synchronous slices.
 * Oversized inputs fail closed; no unchecked tail is silently discarded. Check every retrieved
 * original, including uncited posts and verified anchors. Fingerprint thresholds are
 * suspicion signals, not copied-character accounting.
 */
export async function explanationsAreIndependent(fields: string[], units: Unit[], linkedUrls?: string[]): Promise<boolean> {
  if (!contextFits(units)) return false
  const sources: { text: string; url?: string }[] = []
  for (const unit of units) {
    if (unit.kind === 'post') sources.push({ text: unit.title, url: unit.sourceUrl }, { text: unit.text, url: unit.sourceUrl })
    for (const quote of unit.quotes ?? []) sources.push({ text: quote.text, url: quote.url })
  }
  const linked = linkedUrls && new Set(linkedUrls.map(sourceKey))
  if (fields.reduce((sum, text) => sum + text.length, 0) > MAX_PROSE_UNITS) return false
  // No separator: catch a source word split between response fields.
  const output = normalize(fields.join(''))
  const streams = [letters, symbols]
  for (const [index, stream] of streams.entries()) {
    const keys = fingerprints(codes(stream(output)), index === 1)
    const wanted = new Set(keys.map(k => k.key))
    if (!wanted.size) continue
    const matched = new Set<number>()
    const unlinked = new Set<number>()
    for (const { text: source, url } of sources) {
      let tail: number[] = []
      for (let offset = 0; offset < source.length; offset += QUANTUM) {
        await yieldToRequests()
        // Fail closed at ambiguous Unicode seams rather than losing half a grapheme.
        if (offset && /[\p{M}\uDC00-\uDFFF]/u.test(source[offset])) return false
        const text = [...tail, ...codes(stream(normalize(source.slice(offset, offset + QUANTUM))))]
        for (const { key } of fingerprints(text, index === 1)) {
          if (!wanted.has(key)) continue
          matched.add(key)
          if (linked && (!url || !linked.has(sourceKey(url)))) unlinked.add(key)
        }
        // Carry across arbitrarily long removed punctuation/format runs as well.
        tail = text.slice(-4)
      }
    }
    let hits = 0
    let hanHits = 0
    let singleHanHits = 0
    let unlinkedHits = 0
    for (const entry of keys) {
      if (!matched.has(entry.key)) continue
      if (entry.singleHan) singleHanHits++; else if (entry.han) hanHits++; else hits++
      if (unlinked.has(entry.key)) unlinkedHits++
      // Allow ordinary reuse of a topic word in our own explanation. A shorter copied phrase
      // without its original link still fails closed. Repeated emitted positions count again.
      if (hits >= 16 || hanHits >= 3 || singleHanHits >= 24 || unlinkedHits >= 6) return false
    }
  }
  return true
}
