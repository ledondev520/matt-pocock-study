import type { Lang } from './lang'
import type { Segment } from '../../scripts/kb/feed'

// The data the home page ("what to learn today") and the site search are built from. Build-time
// code reads it through LearnSource (scripts/learn/source.ts), so the site can move to the
// methodology module by swapping one adapter; the page and search code do not change.

/** One methodology as listed: what the home page shows for "what to learn today". */
export interface MethodologySummary {
  id: string
  title: string
  /** The question it answers (or, for an interim entry, its text). */
  question: string
  href: string
  dateLast: string
  /** Short source label, e.g. a domain or "Matt notes". */
  label?: string
  /** Rich text with inline links, when the source has it. */
  rich?: Segment[]
  /** The original post, when the entry is tied to one. */
  sourceUrl?: string
}
export interface MethodologyStep { id: string; order: number; title: string; how: string }
export interface Methodology extends MethodologySummary { claim: string; steps: MethodologyStep[] }
/** A retrieval unit (overview, step, … or an interim note/post), the search index's input. */
export interface Chunk { id: string; kind: string; methodologyId?: string; title: string; text: string; href: string }

export interface LearnSource {
  listMethodologies(lang: Lang): MethodologySummary[]
  getMethodology(id: string, lang: Lang): Methodology | undefined
  chunks(lang: Lang): Chunk[]
}

/** What the home page receives: the items to learn today, newest first. */
export type TodayItem = MethodologySummary
