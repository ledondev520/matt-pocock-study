import type { KbEntry, Segment } from './feed'

// The site shows no engagement statistics. The committed feed (data/knowledge-base.json, written by
// the daily sync) still carries like and view counts in its prose; they are taken out of the text
// segments when the pages, Markdown twins and search index are built. The feed file is unchanged.
const COUNT = /[，、]?\s*约?\s*\d[\d.,]*\s*万?\s*(?:赞|浏览|转发|likes?|views?)/gu
const SENTENCE = /[^。！？]*互动最高[^。！？]*[。！？]/gu
// Only separators belonging to a leading count are removed. A dot followed by an
// identifier character starts content such as .NET or .env, even after another separator.
const SEPARATORS = String.raw`(?:\s*(?:[。，、；：！？,;:!?…]|\.(?![\p{L}\p{N}_])))*\s*`
const COUNT_PARENS = new RegExp(`\\s*[（(]\\s*(?:${COUNT.source})(?:${SEPARATORS}(?:${COUNT.source}))*${SEPARATORS}[）)]`, 'gu')
const LEADING_COUNT = new RegExp(`^\\s*(?:${COUNT.source}|${COUNT_PARENS.source})${SEPARATORS}`, 'u')
export function withoutCounts(text: string) {
  let clean = text.replace(SENTENCE, '')
  // Consume the entire leading run, including count-only parentheses. Only this
  // removed span owns its trailing separators; content and link punctuation stay intact.
  for (;;) {
    const rest = clean.replace(LEADING_COUNT, '')
    if (rest === clean) break
    clean = rest
  }
  return clean.replace(COUNT_PARENS, '').replace(COUNT, '').replace(/。\s*。/g, '。')
}
export function dropCounts(entry: KbEntry): KbEntry {
  const body = entry.body.map((s): Segment => s.href ? s : { text: withoutCounts(s.text) }).filter(s => s.href || s.text)
  return { ...entry, title: withoutCounts(entry.title), body }
}
