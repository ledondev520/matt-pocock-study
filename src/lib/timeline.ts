import type { Segment } from '../../scripts/kb/feed'

/** The timeline view (/zh/timeline, /en/timeline); not a content page. */
export const timelineSlug = 'timeline'

/**
 * One moment on the timeline. `learned` is what the site already says we learned (our own words) and
 * is always shown; `original` is Matt's post and is shown only when the reader turns it on.
 * Built at build time from the lessons' quotes and the knowledge base (scripts/timeline.ts).
 */
export interface TimelineItem {
  /** Stable anchor, unique on the page. */
  id: string
  /** YYYY-MM-DD: the original post's date for a lesson quote, the note's date for a study note. */
  date: string
  kind: 'lesson' | 'note'
  learned: {
    title: string
    /** Plain text; for a study note its body segments (links are only links when originals are shown). */
    text: string | Segment[]
    /** Where the point is explained on this site (a lesson section or a knowledge base note). */
    href: string
    /** The lesson title, or the knowledge base label. */
    from: string
  }
  original: { url: string; quote?: string; note?: string }
}

export interface TimelineYear { year: string; items: TimelineItem[] }

/** Items grouped by year, newest year first; order inside a year is kept (newest first). */
export function byYear(items: TimelineItem[]): TimelineYear[] {
  const years: TimelineYear[] = []
  for (const item of items) {
    const year = item.date.slice(0, 4)
    if (years.at(-1)?.year === year) years.at(-1)!.items.push(item)
    else years.push({ year, items: [item] })
  }
  return years
}

/** The DOM id of a year's section, the scrubber's jump target. */
export const yearId = (year: string) => `year-${year}`

/**
 * Which of `count` evenly spaced years sits under a pointer at `offset` px along a track `length` px
 * long (index 0 at the top). Positions outside the track clamp to the first or last year.
 */
export function yearIndexAt(offset: number, length: number, count: number) {
  if (count <= 0) return -1
  if (!(length > 0)) return 0
  return Math.min(count - 1, Math.max(0, Math.floor((offset / length) * count)))
}

/**
 * The year index after a key press on the scrubber (index 0 = newest, at the top), or undefined when
 * the key is not ours. It is an ARIA slider whose value is the year: Up/Right and Page Up go to newer
 * years, Down/Left and Page Down to older ones, Home to the oldest (minimum) and End to the newest.
 */
export function yearIndexForKey(key: string, index: number, count: number): number | undefined {
  const last = count - 1
  const step: Record<string, number> = { ArrowDown: 1, ArrowLeft: 1, ArrowUp: -1, ArrowRight: -1, PageDown: 3, PageUp: -3 }
  if (key === 'Home') return last
  if (key === 'End') return 0
  if (key in step) return Math.min(last, Math.max(0, index + step[key]))
  return undefined
}
