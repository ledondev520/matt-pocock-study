import { parseAnswer, type AnswerDiagnostics, type RejectedField } from './answer'
import type { ChatMessage, ChatResult } from './deepseek'
import type { Unit } from './units'
import { setImmediate as yieldToRequests } from 'node:timers/promises'

// Leave five seconds for validation, serialization and the proxy, even if ASK_TIMEOUT_MS is
// configured above its default. Both upstream calls share this request-wide deadline.
export const ANSWER_BUDGET_MS = 25_000
export const MIN_REWRITE_MS = 1_000
export const MAX_FEEDBACK_FRAGMENTS = 12
export const MAX_FEEDBACK_FRAGMENT_CHARS = 40
export const MAX_FEEDBACK_OUTPUT_CHARS = 32_000
export const MAX_FEEDBACK_SOURCE_CHARS = 250_000
const MAX_NORMALIZED_OUTPUT_CHARS = 8_000
const MAX_SOURCE_PARTS = 2048
const MAX_FIELDS = 17
const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/ς/g, 'σ').replace(/\p{Cf}/gu, '')
const letters = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '')
interface Character { char: string; start: number; end: number; wordStart: number; wordEnd: number }
export interface FeedbackSpan { field: string; fragment: string; occurrences: number }

function mappedOutput(text: string, remaining: number): Character[] {
  const starts = new Int32Array(text.length), ends = new Int32Array(text.length)
  for (const word of text.matchAll(/[\p{L}\p{N}\p{M}\p{Cf}]+/gu)) {
    starts.fill(word.index, word.index, word.index + word[0].length)
    ends.fill(word.index + word[0].length, word.index, word.index + word[0].length)
  }
  const out: Character[] = []
  // Base + combining marks keeps canonical accents together while retaining raw offsets.
  for (const part of text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    for (const char of letters(normalize(part[0]))) {
      if (out.length >= remaining) return out
      out.push({ char, start: part.index, end: part.index + part[0].length,
        wordStart: ends[part.index] ? starts[part.index] : part.index,
        wordEnd: ends[part.index] || part.index + part[0].length })
    }
  }
  return out
}

function* windows(chars: string[]) {
  for (let i = 0; i < chars.length; i++) {
    if (i >= 4) yield { start: i - 4, end: i + 1, key: chars.slice(i - 4, i + 1).join('') }
    if (i >= 2 && chars.slice(i - 2, i + 1).some(c => /\p{Script=Han}/u.test(c))) {
      yield { start: i - 2, end: i + 1, key: chars.slice(i - 2, i + 1).join('') }
    }
  }
}

function* shortFragments(chars: Character[]) {
  for (let i = 0; i < chars.length; i++) {
    let key = ''
    const prefix = i === 0 || chars[i - 1].wordStart !== chars[i].wordStart
    for (let size = 1; size <= 4 && i + size <= chars.length; size++) {
      const c = chars[i + size - 1]
      if (c.wordStart !== chars[i].wordStart || !/^[a-z0-9]$/.test(c.char)) break
      key += c.char
      if (size >= 3 || prefix) yield { start: i, end: i + size, key }
    }
  }
}

function* sourceTexts(units: Unit[], quoteTexts: readonly string[]) {
  for (const unit of units) {
    yield unit.title
    yield unit.text
    for (const quote of unit.quotes ?? []) yield quote.text
  }
  yield* quoteTexts
}

/** Feedback only, never a validation predicate. O(output + sources): fixed-width windows,
 * monotone interval merging, and a twelve-entry ranked selection (no unbounded sort).
 * Raw AND normalized scans are capped; an incomplete hint cannot change a guard decision.
 * Every fragment is sliced from model output, never from source context. */
function* feedbackSpanWork(fields: RejectedField[], units: Unit[], quoteTexts: readonly string[]): Generator<void, FeedbackSpan[]> {
  let outputBudget = MAX_FEEDBACK_OUTPUT_CHARS, normalizedBudget = MAX_NORMALIZED_OUTPUT_CHARS
  const outputs = []
  for (const field of fields.slice(0, MAX_FIELDS)) {
    const text = field.text.slice(0, outputBudget)
    outputBudget -= text.length
    const chars = mappedOutput(text, normalizedBudget)
    normalizedBudget -= chars.length
    outputs.push({ field: field.name, text, chars })
    yield
  }
  const wanted = new Set<string>(), wantedShort = new Set<string>()
  let work = 0
  for (const { chars } of outputs) {
    for (const w of windows(chars.map(c => c.char))) { wanted.add(w.key); if (++work % 4096 === 0) yield }
    for (const w of shortFragments(chars)) { wantedShort.add(w.key); if (++work % 4096 === 0) yield }
  }
  if (!wanted.size && !wantedShort.size) return []
  const matched = new Set<string>(), matchedShort = new Set<string>()
  let sourceBudget = MAX_FEEDBACK_SOURCE_CHARS, sourceNormalizedBudget = MAX_FEEDBACK_SOURCE_CHARS, parts = 0
  sourceScan: for (const source of sourceTexts(units, quoteTexts)) {
    if (++parts > MAX_SOURCE_PARTS || sourceBudget <= 0 || sourceNormalizedBudget <= 0) break
    let tail: string[] = [], wordTail = ''
    const size = Math.min(source.length, sourceBudget)
    sourceBudget -= size
    for (let offset = 0; offset < size && sourceNormalizedBudget > 0; offset += 256) {
      const normalized = normalize(source.slice(offset, Math.min(offset + 256, size))).slice(0, sourceNormalizedBudget)
      sourceNormalizedBudget -= normalized.length
      const chars = [...tail, ...letters(normalized)]
      for (const w of windows(chars)) {
        if (wanted.has(w.key)) matched.add(w.key)
        if (++work % 4096 === 0) yield
      }
      tail = chars.slice(-4)
      const words = wordTail + normalized
      wordTail = ''
      for (const word of words.matchAll(/[\p{L}\p{N}]+/gu)) {
        if (word.index + word[0].length === words.length) wordTail = word[0].slice(0, 5)
        else if (wantedShort.has(word[0])) matchedShort.add(word[0])
      }
      // Source occurrence counts do not affect ranking. Once all requested keys have been
      // found, scanning more source text cannot improve the output-side evidence.
      if (matched.size === wanted.size && matchedShort.size === wantedShort.size) break sourceScan
      yield
    }
    if (wantedShort.has(wordTail)) matchedShort.add(wordTail)
  }
  const candidates = new Map<string, FeedbackSpan & { overlap: number; phrase: boolean }>()
  for (const { field, text, chars } of outputs) {
    const delta = new Int32Array(chars.length + 1)
    for (const w of windows(chars.map(c => c.char))) {
      if (matched.has(w.key)) { delta[w.start]++; delta[w.end]-- }
      if (++work % 4096 === 0) yield
    }
    for (const w of shortFragments(chars)) {
      if (matchedShort.has(w.key)) { delta[w.start]++; delta[w.end]-- }
      if (++work % 4096 === 0) yield
    }
    const covered = new Uint8Array(chars.length)
    let hits = 0
    for (let i = 0; i < chars.length; i++) { hits += delta[i]; covered[i] = hits > 0 ? 1 : 0 }
    const ranges: { start: number; end: number }[] = []
    for (let i = 0; i < chars.length;) {
      if (!covered[i]) { i++; continue }
      const first = i
      while (i < chars.length && covered[i]) i++
      const start = chars[first].wordStart, end = chars[i - 1].wordEnd
      const last = ranges.at(-1)
      if (last && start <= last.end) last.end = Math.max(last.end, end)
      else ranges.push({ start, end })
    }
    let cursor = 0
    for (const range of ranges) for (let start = range.start; start < range.end;) {
      let end = Math.min(start + MAX_FEEDBACK_FRAGMENT_CHARS, range.end)
      if (end < text.length && /[\uDC00-\uDFFF]/.test(text[end])) end--
      // Prefer complete words. An individual word longer than the cap must be split.
      let boundary = end
      while (boundary > start && /[\p{L}\p{N}\p{M}\p{Cf}]/u.test(text[boundary] ?? '')) boundary--
      if (boundary > start && end < range.end) end = boundary
      const fragment = text.slice(start, end).trim()
      let overlap = 0
      while (cursor < chars.length && chars[cursor].start < end) {
        if (chars[cursor].end > start) overlap += covered[cursor]
        cursor++
      }
      if (overlap && fragment) {
        const key = letters(normalize(fragment))
        // Generic textual features, never term exceptions: multiword spans and long runs
        // should be visible before repeated short words consume the feedback slots.
        const phrase = overlap >= 20 || (fragment.match(/[\p{L}\p{N}]+/gu)?.length ?? 0) >= 2
        const previous = candidates.get(key)
        if (previous) { previous.occurrences++; previous.overlap = Math.max(previous.overlap, overlap); previous.phrase ||= phrase }
        else candidates.set(key, { field, fragment, occurrences: 1, overlap, phrase })
      }
      start = end
      if (++work % 64 === 0) yield
    }
  }
  const ranked: (FeedbackSpan & { overlap: number; phrase: boolean })[] = []
  for (const candidate of candidates.values()) {
    const score = candidate.overlap * candidate.occurrences
    const at = ranked.findIndex(c => candidate.phrase !== c.phrase ? candidate.phrase
      : candidate.phrase && candidate.overlap !== c.overlap ? candidate.overlap > c.overlap
        : score > c.overlap * c.occurrences || (score === c.overlap * c.occurrences && candidate.overlap > c.overlap))
    ranked.splice(at < 0 ? ranked.length : at, 0, candidate)
    if (ranked.length > MAX_FEEDBACK_FRAGMENTS) ranked.pop()
  }
  return ranked.map(({ field, fragment, occurrences }) => ({ field, fragment, occurrences }))
}

export function feedbackSpans(fields: RejectedField[], units: Unit[], quoteTexts: readonly string[] = []): FeedbackSpan[] {
  const work = feedbackSpanWork(fields, units, quoteTexts)
  for (;;) {
    const step = work.next()
    if (step.done) return step.value
  }
}

async function cooperativeFeedbackSpans(fields: RejectedField[], units: Unit[]): Promise<FeedbackSpan[]> {
  const work = feedbackSpanWork(fields, units, [])
  for (;;) {
    const step = work.next()
    if (step.done) return step.value
    await yieldToRequests()
  }
}

/** The first parser rejection can precede point checks. Hints therefore scan the original
 * title and every point field within the existing field/character budgets, including fields
 * absent from diagnostics. This helper never determines whether an answer can be returned. */
function wholeAnswerFields(content: string): RejectedField[] {
  if (content.length > MAX_FEEDBACK_OUTPUT_CHARS) return []
  let raw: { title?: unknown; points?: unknown } | null
  try { raw = JSON.parse(content) } catch { return [] }
  if (!raw || typeof raw !== 'object') return []
  const fields: RejectedField[] = []
  if (typeof raw.title === 'string' && raw.title) fields.push({ name: 'answer title', text: raw.title })
  if (Array.isArray(raw.points)) for (const [index, point] of raw.points.entries()) {
    if (fields.length >= MAX_FIELDS) break
    if (!point || typeof point !== 'object') continue
    for (const key of ['title', 'text'] as const) {
      if (fields.length >= MAX_FIELDS) break
      if (typeof point[key] === 'string' && point[key]) fields.push({ name: `point ${index + 1} ${key}`, text: point[key] })
    }
  }
  return fields
}

export async function buildRewriteMessages(messages: ChatMessage[], content: string, diagnostics: AnswerDiagnostics, units: Unit[]): Promise<ChatMessage[]> {
  const fields = diagnostics.fields ?? []
  const fragments = await cooperativeFeedbackSpans(wholeAnswerFields(content), units)
  const feedback = [
    diagnostics.scope === 'joint' ? 'These retained fields were rejected because their combined overlap is too high:'
      : diagnostics.scope === 'title' ? 'The answer title failed its source-independence check:'
        : 'These points failed their isolated source-independence checks; their title and text fields are listed:',
    JSON.stringify(fields.map(f => f.name)),
    'The listed spans overlap the source wording; rephrase them. These are your own output words from the whole first answer:',
    JSON.stringify(fragments),
    'Rewrite in your own words; technical terms (product, library, command names) may be kept.',
    'The check counts overlap across the whole answer. Keep at most 4 points: drop the points listed as failing or the least important points rather than rewording them lightly. The rewrite may have fewer points than the first answer.',
    'Keep each point text to one or two short sentences. Mention names, product/library names, years and version numbers at most once in the whole answer, and do not start titles with them. Keep the title short and generic.',
    'Omit quote markers (quotes count as overlap). Do not reuse any listed span or close paraphrases of whole source sentences.',
    'Return the same JSON shape and language. Source IDs may only come from those originally provided. Keep the quote-marker rules if a marker is present: only supplied chunk_id and valid UTF-16 start/end offsets; never write quote text. Do not include this feedback in the answer.',
  ].join('\n')
  return [...messages, { role: 'assistant', content }, { role: 'user', content: feedback }]
}

/** Request-local classification only; no model content is included in cache eligibility. */
export interface RewriteOutcome { rejection?: 'guard' | 'rewrite_skipped' }

/** One repair attempt, only after an independence rejection. The caller gates the real call
 * with time/cost/breaker limits. Every candidate goes through the identical parser. */
export async function answerWithRewrite(opts: {
  content: string
  units: Unit[]
  siteUrl: string
  messages: ChatMessage[]
  rewrite: (messages: ChatMessage[]) => Promise<ChatResult | undefined>
  rewriteDiagnostics?: AnswerDiagnostics
  outcome?: RewriteOutcome
}) {
  if (opts.outcome) delete opts.outcome.rejection
  const rejected = (rejection: RewriteOutcome['rejection']) => {
    if (opts.outcome) opts.outcome.rejection = rejection
    return undefined
  }
  const diagnostics: AnswerDiagnostics = {}
  const parsed = await parseAnswer(opts.content, opts.units, opts.siteUrl, diagnostics)
  if (parsed) return parsed
  if (diagnostics.reason !== 'independence') return rejected('guard')
  const rewritten = await opts.rewrite(await buildRewriteMessages(opts.messages, opts.content, diagnostics, opts.units))
  if (!rewritten) return rejected('rewrite_skipped')
  const repaired = await parseAnswer(rewritten.content, opts.units, opts.siteUrl, opts.rewriteDiagnostics)
  return repaired ?? rejected('guard')
}
