import type { Page } from '../src/lib/content'
import type { Lang } from '../src/lib/lang'
import { kbSlug } from '../src/lib/metadata'
import { byYear, type TimelineItem } from '../src/lib/timeline'
import { SOURCES, type KbEntry, type Segment } from './kb/feed'

// The timeline's items, from what the site already publishes (nothing new, nothing external):
// - every short quote in the lessons, dated by the original post: what we learned is the lesson
//   section it sits in (heading, lesson title and summary, all our own words);
// - every knowledge base note, dated by the day it was written: what we learned is the note itself.
//   The notes are in Chinese and English pages carry no Chinese text, so only the Chinese timeline
//   lists them.
// Newest first; on one date, notes (in feed order) before lessons (in lesson order).
const statusId = (url: string) => /\/status\/(\d+)/.exec(url)?.[1] ?? url.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
export function timelineItems(lang: Lang, pages: Page[], knowledge: KbEntry[]): TimelineItem[] {
  const zh = lang === 'zh'
  const lessons = pages.filter(p => p.lang === lang && p.slug !== 'corpus').sort((a, b) => a.order - b.order)
  const fromLessons: TimelineItem[] = lessons.flatMap(page => page.quotes.map((quote, i) => {
    const section = page.toc.find(entry => entry.id === quote.section)
    return {
      id: `lesson-${page.slug}-${statusId(quote.url)}${page.quotes.slice(0, i).some(q => q.url === quote.url) ? `-${i + 1}` : ''}`,
      date: quote.date,
      kind: 'lesson' as const,
      learned: { title: section?.title ?? page.title, text: page.summary, href: `/${lang}/${page.slug}${section ? `#${section.id}` : ''}`, from: page.title },
      original: { url: quote.url, quote: quote.text, ...(quote.note ? { note: quote.note } : {}) },
    }
  }))
  const fromNotes: TimelineItem[] = zh ? knowledge.map(entry => ({
    id: `note-${entry.id}`,
    date: entry.date,
    kind: 'note' as const,
    learned: { title: entry.title, text: entry.body, href: `/zh/${kbSlug}#${entry.id}`, from: SOURCES[entry.source].label[0] },
    original: { url: entry.url },
  })) : []
  // Stable sort by date only: notes come first in the concatenation, so they lead on a shared date.
  return [...fromNotes, ...fromLessons].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

const plainText = (text: string | Segment[]) => typeof text === 'string' ? text : text.map(s => s.text).join('')
/** The Markdown twin of /<lang>/timeline: what the page shows by default (what we learned), by year. */
export function timelineMarkdown(lang: Lang, items: TimelineItem[], site: string) {
  const zh = lang === 'zh'
  // Site links point at the linked page's own twin (a twin has no section anchors).
  const absolute = (href: string) => `${site}${href.split('#')[0]}.md`
  const years = byYear(items)
  const body = years.length ? years.map(({ year, items }) => `## ${year}\n\n${items.map(item => `### ${item.learned.title}\n\n${item.date} · [${item.learned.from}](${absolute(item.learned.href)})\n\n${plainText(item.learned.text)}`).join('\n\n')}`).join('\n\n') : ''
  return `# ${zh ? '时间轴' : 'Timeline'}\n${body ? `\n${body}\n` : ''}`
}
