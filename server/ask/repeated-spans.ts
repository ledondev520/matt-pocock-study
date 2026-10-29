// The old five-character threshold is sixteen hits: a complete span under twenty
// letters cannot reach it on its first occurrence. Only later identical occurrences
// of one such span per original may be redundant. A sole isolated span contributes
// one signal. Short-word, quote-backed, uncited, CJK and symbol accounting is untouched.
const MAX_SPAN = 19
interface Span { text: string; start: number; end: number; word?: boolean }

/** Streaming complete ASCII tokens; Han delimits terms, other scripts/marks block them.
 * Capped tokens and at most two tokens per span bound work independently of word length.
 */
class Tokens {
  private token = ''
  private blocked = false
  private offset = 0
  private previous: Span | undefined
  constructor(private emit: (span: Span) => void) {}
  private flush() {
    const text = this.token
    if (!this.blocked && text) {
      const token = { text, start: this.offset - text.length, end: this.offset, word: true }
      if (text.length >= 5) this.emit(token)
      if (this.previous && this.previous.text.length + text.length <= MAX_SPAN) {
        this.emit({ text: this.previous.text + text, start: this.previous.start, end: token.end })
      }
      this.previous = token
    } else if (this.blocked) this.previous = undefined
    this.token = ''
    this.blocked = false
  }
  feed(text: string) {
    for (const char of text) {
      const code = char.charCodeAt(0)
      if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
        this.offset++
        if (this.token.length < MAX_SPAN) this.token += char
        else this.blocked = true
      } else if (/\p{Script=Han}/u.test(char)) {
        this.flush()
        this.previous = undefined
        this.offset++
      } else if (/[\p{L}\p{N}\p{M}]/u.test(char)) {
        this.blocked = true
        if (/[\p{L}\p{N}]/u.test(char)) this.offset++
      } else this.flush()
    }
  }
  finish() { this.flush() }
}

export class RepeatedSpans {
  private words = new Set<string>()
  private copiedWords = new Map<string, Set<string>>()
  private candidates = new Map<string, Span[]>()
  private matches = new Map<string, Set<string>>()
  private selections = new Map<string, string>()
  private prefixes = new Map<string, Span[]>()
  private firsts = new Map<string, Span>()
  private duplicates: Uint8Array
  private isolated: Uint8Array
  constructor(output: string) {
    this.duplicates = new Uint8Array([...output].length)
    this.isolated = new Uint8Array(this.duplicates.length)
    const tokens = new Tokens(span => {
      if (span.word) this.words.add(span.text)
      const positions = this.candidates.get(span.text) ?? []
      positions.push(span)
      this.candidates.set(span.text, positions)
      // Index bounded token-prefix spans as well; these are used only after the SAME
      // span has two complete output occurrences and a complete source occurrence.
      for (let size = 5; size <= span.text.length; size++) {
        const prefix = span.text.slice(0, size)
        const entries = this.prefixes.get(prefix) ?? []
        entries.push({ text: prefix, start: span.start, end: span.start + size })
        this.prefixes.set(prefix, entries)
      }
    })
    tokens.feed(output)
    tokens.finish()
    for (const [text, spans] of this.candidates) if (spans.length < 2) this.candidates.delete(text)
  }
  source(url?: string) {
    const matches = url ? this.matches.get(url) ?? new Set<string>() : undefined
    if (url && matches) this.matches.set(url, matches)
    const copied = url ? this.copiedWords.get(url) ?? new Set<string>() : undefined
    if (url && copied) this.copiedWords.set(url, copied)
    return new Tokens(span => {
      if (span.word && this.words.has(span.text)) copied?.add(span.text)
      if (this.candidates.has(span.text)) matches?.add(span.text)
    })
  }
  finish() {
    const marked = new Set<string>()
    for (const [url, matches] of this.matches) {
      let selected: string | undefined
      let savings = 0
      for (const text of matches) {
        const spans = this.candidates.get(text)!
        const score = (spans.length - 1) * (text.length - 4)
        if (score > savings) { selected = text; savings = score }
      }
      if (!selected) continue
      this.selections.set(url, selected)
      if (marked.has(selected)) continue
      marked.add(selected)
      this.firsts.set(selected, this.candidates.get(selected)![0])
      // Retain the complete first occurrence, even for internally repeated letters.
      // Every discounted window must fit wholly inside a later complete occurrence.
      const first = this.firsts.get(selected)!
      for (const span of this.prefixes.get(selected) ?? []) {
        if (span.start === first.start) continue
        for (let i = span.start; i <= span.end - 5; i++) this.duplicates[i] = 1
      }
    }
    this.candidates.clear()
    this.matches.clear()
    this.prefixes.clear()
  }
  isolate(text: string) {
    const first = this.firsts.get(text)!
    // One isolated term supplies one independent signal, not a stack of overlapping
    // windows. This applies only if ALL ordinary matches for that original fit it.
    for (let i = first.start + 1; i <= first.end - 5; i++) this.isolated[i] = 1
  }
  single(start: number) { return this.isolated[start] === 1 }
  // Five different complete words of at least five letters supply additional
  // cumulative evidence even when padding destroys every cross-word fingerprint.
  scatteredCopy() { return [...this.copiedWords.values()].some(words => words.size >= 5) }
  shortEvidence(covered: number) { return covered <= MAX_SPAN }
  selected(url?: string) { return url ? this.selections.get(url) : undefined }
  redundant(start: number) { return this.duplicates[start] === 1 }
}
