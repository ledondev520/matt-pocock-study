import { setImmediate as yieldToRequests } from 'node:timers/promises'

// Same-source substring evidence for ordinary prose. No vocabulary or retrieval-frequency
// exceptions: each key is an exact contiguous run in both the output and one original.
const plain = (text: string) => text.replace(/[^\p{L}\p{N}]/gu, '')
const QUANTUM = 4096
const MEDIUM = 5
const LONG = 20
const TOTAL = 40
interface QuoteEvidence { text: string; url: string; sentences: number; chars: number }

export class ProseRuns {
  private output: string
  private substrings?: Substrings
  private wanted = new Set<string>()
  private long = new Set<string>()
  private sources = new Map<string, Set<string>>()
  private affixWords = new Map<string, Set<string>>()
  private quoteBonuses = new Map<string, number>()
  private tokens: string[]
  private affixTokens: string[]
  private phrases = new Set<string>()
  private words = new Map<string, Set<string>>()
  private wantedWords: Set<string>
  private anonymous = 0
  private sentenceMatches = new Map<string, Set<string>>()
  private sentenceTotals = new Map<string, number>()
  private fieldEnds: number[]
  repeatsQuote = false

  private constructor(output: string, private linked: Set<string> | undefined, quotes: QuoteEvidence[], private maxSentences: number, fields: string[]) {
    this.output = plain(output)
    this.tokens = output.match(/[\p{L}\p{N}]+/gu) ?? []
    // Han prose has no mandatory spaces around a Latin name. Script boundaries are
    // word boundaries for the affix signal; the separate Han guards remain unchanged.
    this.affixTokens = output.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+/gu) ?? []
    this.wantedWords = new Set(this.tokens.filter(word => word.length >= MEDIUM))
    let end = 0
    this.fieldEnds = [0, ...fields.map(field => end += plain(field).length)]
    for (const quote of quotes) {
      this.quoteBonuses.set(quote.url, Math.min(4, (this.quoteBonuses.get(quote.url) ?? 0) + quote.chars))
      this.sentenceTotals.set(quote.url, (this.sentenceTotals.get(quote.url) ?? 0) + quote.sentences)
    }
  }

  static async create(output: string, linked: Set<string> | undefined, quotes: QuoteEvidence[], maxSentences: number, fields: string[]) {
    const result = new ProseRuns(output, linked, quotes, maxSentences, fields)
    for (let i = 0; i < result.output.length; i++) {
      if (i % QUANTUM === 0) await yieldToRequests()
      if (i + MEDIUM <= result.output.length) result.wanted.add(result.output.slice(i, i + MEDIUM))
      if (i + LONG <= result.output.length) result.long.add(result.output.slice(i, i + LONG))
    }
    if (quotes.some(q => result.wanted.has(plain(q.text).slice(0, MEDIUM)))) await result.indexSubstrings()
    result.repeatsQuote = quotes.some(q => plain(q.text).length >= MEDIUM && result.contains(plain(q.text)))
    return result
  }

  private async indexSubstrings() {
    if (this.substrings) return
    this.substrings = new Substrings()
    await this.substrings.index(this.output)
  }

  private contains(text: string) {
    return this.wanted.has(text.slice(0, MEDIUM)) && !!this.substrings?.has(text)
  }

  source(url?: string) {
    const key = url?.split(/[?#]/)[0].replace(/\/$/, '') ?? `anonymous:${this.anonymous++}`
    let matched = this.sources.get(key)
    if (!matched) { matched = new Set(); this.sources.set(key, matched) }
    let sourceWords = this.words.get(key)
    if (!sourceWords) { sourceWords = new Set(); this.words.set(key, sourceWords) }
    let affixWords = this.affixWords.get(key)
    if (!affixWords) { affixWords = new Set(); this.affixWords.set(key, affixWords) }
    let phraseTail = ''
    const previous: string[] = []
    const phrases = (text: string, final = false) => {
      const joined = phraseTail + text
      phraseTail = ''
      for (const token of joined.matchAll(/\S+/gu)) {
        if (!final && token.index + token[0].length === joined.length) { phraseTail = token[0].slice(0, LONG + 1); continue }
        const word = plain(token[0])
        if (!word || word.length > LONG) { previous.length = 0; continue }
        previous.push(word)
        if (previous.length > 3) previous.shift()
        if (previous.length === 3) {
          const phrase = previous.join('')
          if (phrase.length >= 8 && this.contains(phrase)) this.phrases.add(key)
        }
      }
    }
    let wordTail = ''
    const words = (text: string, final = false) => {
      const joined = wordTail + text
      wordTail = ''
      for (const token of joined.matchAll(/[\p{L}\p{N}]+/gu)) {
        if (!final && token.index + token[0].length === joined.length) wordTail = token[0].slice(0, LONG)
        else {
          if (this.wantedWords.has(token[0])) sourceWords.add(token[0])
          if (token[0].length >= MEDIUM && token[0].length < LONG && this.contains(token[0])) affixWords.add(token[0])
        }
      }
    }
    let tail = ''
    return {
      finish: () => { words('', true); phrases('', true) },
      feed: async (normalized: string) => {
        const text = tail + plain(normalized)
        for (let i = 0; i + MEDIUM <= text.length; i++) {
          const medium = text.slice(i, i + MEDIUM)
          if (!this.wanted.has(medium)) continue
          matched.add(medium)
          if (i + LONG <= text.length && this.long.has(text.slice(i, i + LONG))) return false
        }
        if (matched.size) await this.indexSubstrings()
        words(normalized)
        phrases(normalized)
        tail = text.slice(-(LONG - 1))
        return true
      },
      sentence: (sentence: string) => {
        if (sentence.length < MEDIUM || !this.contains(sentence)) return true
        let seen = this.sentenceMatches.get(key)
        if (!seen) { seen = new Set(); this.sentenceMatches.set(key, seen) }
        if (seen.has(sentence)) return true
        seen.add(sentence)
        if (this.linked && !this.linked.has(key) && sentence.length >= 10) return false
        let total = this.sentenceTotals.get(key) ?? 0
        let offset = 0
        while ((offset = this.output.indexOf(sentence, offset)) >= 0) {
          total++
          offset += sentence.length
          if (total > this.maxSentences) return false
        }
        this.sentenceTotals.set(key, total)
        return true
      },
    }
  }

  private async affixesAreIndependent(candidates: Set<string>, bonus = 0) {
    if (!candidates.size) return true
    let hits = bonus
    let work = 0
    for (const token of this.affixTokens) {
      // An exact source token supplies no evidence of an affix transformation. Longer
      // tokens retain every non-overlapping embedded source word, including repetitions.
      if (candidates.has(token)) continue
      for (let start = 0; start + MEDIUM <= token.length; start++) {
        for (let length = Math.min(LONG - 1, token.length - start); length >= MEDIUM; length--) {
          if (++work % QUANTUM === 0) await yieldToRequests()
          if (!candidates.has(token.slice(start, start + length))) continue
          hits += length - MEDIUM + 1
          if (hits >= LONG - MEDIUM + 1) return false
          start += length - 1
          break
        }
      }
    }
    return true
  }

  async independent() {
    let work = 0
    const affixes = new Set<string>()
    for (const candidates of this.affixWords.values()) for (const word of candidates) {
      affixes.add(word)
      if (++work % QUANTUM === 0) await yieldToRequests()
    }
    if (!await this.affixesAreIndependent(affixes)) return false
    const linkedGrams = new Set<string>()
    for (const [key, matched] of this.sources) if (this.linked?.has(key)) {
      for (const gram of matched) {
        linkedGrams.add(gram)
        if (++work % QUANTUM === 0) await yieldToRequests()
      }
    }
    for (const [key, matched] of this.sources) {
      if (!await this.affixesAreIndependent(this.affixWords.get(key) ?? new Set(), this.quoteBonuses.get(key) ?? 0)) return false
      // Distinct source words retain evidence from short runs separated by commentary;
      // graph overlap alone can merge different words with coincidentally shared stems.
      if ([...(this.words.get(key) ?? [])].reduce((sum, word) => sum + word.length, 0) >= TOTAL) return false
      if (!matched.size) continue
      // Overlap-connected 5-grams describe the same evidence, even when inflections or
      // field seams give it different maximal-run spellings. Count their union once.
      const parents = new Map<string, string>()
      const root = (key: string): string => {
        let top = key
        while (parents.get(top) !== top) top = parents.get(top)!
        while (key !== top) { const next = parents.get(key)!; parents.set(key, top); key = next }
        return top
      }
      let components = 0
      for (const gram of matched) {
        if (++work % QUANTUM === 0) await yieldToRequests()
        const left = gram.slice(0, -1), right = gram.slice(1)
        for (const key of [left, right]) if (!parents.has(key)) { parents.set(key, key); components++ }
        const a = root(left), b = root(right)
        if (a !== b) { parents.set(a, b); components-- }
      }
      const unique = matched.size + (MEDIUM - 1) * components
      const unlinkedHits = new Map<string, number>()
      const intervals = new Int32Array(this.output.length + 1)
      for (let i = 0; i + MEDIUM <= this.output.length; i++) {
        if (++work % QUANTUM === 0) await yieldToRequests()
        const gram = this.output.slice(i, i + MEDIUM)
        if (matched.has(gram)) {
          if (this.linked && !this.linked.has(key) && !linkedGrams.has(gram)) {
            const component = root(gram.slice(0, -1))
            const hits = (unlinkedHits.get(component) ?? 0) + 1
            unlinkedHits.set(component, hits)
            if (hits >= 6) return false
          }
          intervals[i]++
          intervals[i + MEDIUM]--
        }
      }
      const coverage = new Uint32Array(this.output.length + 1)
      let depth = 0
      for (let i = 0; i < this.output.length; i++) {
        if (++work % QUANTUM === 0) await yieldToRequests()
        depth += intervals[i]
        coverage[i + 1] = coverage[i] + Number(depth > 0)
      }
      const dense = (start: number, end: number) => {
        const covered = coverage[end] - coverage[start]
        return covered >= TOTAL && covered * 2 >= end - start
      }
      // Many different medium runs, or repeated runs occupying most of the answer,
      // remain evidence of copying even if no individual run reaches LONG.
      if (unique >= TOTAL || (this.phrases.has(key) && unique >= LONG) || dense(0, this.output.length)) return false
      // Padding with clean fields must not dilute a copied title/body pair. The global
      // check above still sees all fields together, including copies split across points.
      for (let i = 0; i + 2 < this.fieldEnds.length; i++) {
        if (dense(this.fieldEnds[i], this.fieldEnds[i + 2])) return false
      }
    }
    return true
  }
}

// A suffix automaton answers source-sentence membership in O(sentence length), rather
// than searching the whole answer for each of potentially many source sentences.
class Substrings {
  private states: { next: Map<string, number>; link: number; length: number }[] = [{ next: new Map(), link: -1, length: 0 }]

  async index(text: string) {
    let last = 0
    // Code units match the bounded substring keys above, including surrogate halves.
    for (let i = 0; i < text.length; i++) {
      if (i % QUANTUM === 0) await yieldToRequests()
      const char = text[i]
      const current = this.states.length
      this.states.push({ next: new Map(), link: 0, length: this.states[last].length + 1 })
      let p = last
      while (p >= 0 && !this.states[p].next.has(char)) {
        this.states[p].next.set(char, current)
        p = this.states[p].link
      }
      if (p >= 0) {
        const q = this.states[p].next.get(char)!
        if (this.states[p].length + 1 === this.states[q].length) this.states[current].link = q
        else {
          const clone = this.states.length
          this.states.push({ next: new Map(this.states[q].next), link: this.states[q].link, length: this.states[p].length + 1 })
          while (p >= 0 && this.states[p].next.get(char) === q) {
            this.states[p].next.set(char, clone)
            p = this.states[p].link
          }
          this.states[q].link = this.states[current].link = clone
        }
      }
      last = current
    }
  }

  has(text: string) {
    let state = 0
    for (let i = 0; i < text.length; i++) {
      const next = this.states[state].next.get(text[i])
      if (next === undefined) return false
      state = next
    }
    return true
  }
}
