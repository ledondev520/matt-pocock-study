import type { KbEntry, Segment } from './feed'

// The site shows no engagement statistics. The committed feed (data/knowledge-base.json, written by
// the daily sync) still carries like and view counts in its prose; they are taken out of the text
// segments when the pages, Markdown twins and search index are built. The feed file is unchanged.
const COUNT = /[，、]?\s*约?\s*\d[\d.,]*\s*万?\s*(?:赞|浏览|转发|likes?|views?)/gu
const SENTENCE = /[^。！？]*互动最高[^。！？]*[。！？]/gu
export function withoutCounts(text: string) {
  return text.replace(SENTENCE, '').replace(COUNT, '').replace(/\s*（\s*）|\s*\(\s*\)/g, '').replace(/。\s*。/g, '。')
}
export function dropCounts(entry: KbEntry): KbEntry {
  const body = entry.body.map((s): Segment => s.href ? s : { text: withoutCounts(s.text) }).filter(s => s.href || s.text)
  return { ...entry, title: withoutCounts(entry.title), body }
}
