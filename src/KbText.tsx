import { ArrowText } from './Arrow'
import type { Segment } from '../scripts/kb/feed'

// A knowledge base note's body. Every string comes from data/knowledge-base.json, which the build
// validates and gate-checks; React escapes all text and links point only at allow-listed hosts. A
// link and the punctuation right after it stay on one line, so no line starts with a closing mark.
// With `links` off (the timeline before originals are shown) a link's text is kept as plain text.
const SPACED_CLOSE = /([^\s"'“”‘’]["'“”‘’]*\s+[。，、；：！？）」』”’,.;:!?)\]]+)/u
const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : undefined
export function KbText({ segments, links = true }: { segments: Segment[]; links?: boolean }) {
  const out = []
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    if (!s.href) {
      // Keep one non-quote character before the quotes and spaced closing punctuation.
      s.text.split(SPACED_CLOSE).forEach((part, j) => { if (part) out.push(j % 2 ? <span className="kb-keep" key={`${i}-${j}`}>{part}</span> : <ArrowText key={`${i}-${j}`}>{part}</ArrowText>) })
      continue
    }
    const next = segments[i + 1], lead = next && !next.href ? /^\s*[。，、；：！？）」』”’,.;:!?)\]]+/.exec(next.text)?.[0] ?? '' : ''
    const split = !!(links && lead && s.text)
    let text = <ArrowText>{s.text}</ArrowText>
    if (split) {
      const tail = graphemes ? Array.from(graphemes.segment(s.text)).at(-1)!.segment : Array.from(s.text).at(-1)!
      text = <><span className="kb-head"><ArrowText>{s.text.slice(0, -tail.length)}</ArrowText></span><span className="kb-tail"><ArrowText>{tail}</ArrowText></span></>
    }
    out.push(<span className="kb-keep" key={i}>{links ? <a href={s.href} target="_blank" rel="noreferrer" className={split ? 'kb-split' : undefined}>{text}</a> : <span><ArrowText>{s.text}</ArrowText></span>}{lead}</span>)
    if (lead) { segments = [...segments.slice(0, i + 1), { text: next.text.slice(lead.length) }, ...segments.slice(i + 2)] }
  }
  return <>{out}</>
}
