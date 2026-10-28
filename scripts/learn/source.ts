import type { Lang } from '../../src/lib/lang'
import type { PageSummary } from '../../src/lib/content'
import type { Chunk, LearnSource, MethodologySummary, TodayItem } from '../../src/lib/learn'
import type { SearchItem } from '../../src/lib/search'
import { kbSlug } from '../../src/lib/metadata'
import { byDate, SOURCES, type KbEntry } from '../kb/feed'

// The one place that decides where "what to learn today" and the search index come from.
// Today: an interim source over the knowledge base and the note pages. When the methodology module
// lands (data/methods, listMethodologies / getMethodology / chunks), implement LearnSource over it
// and return that from learnSource(); todayItems and searchIndex stay as they are.
export function learnSource(input: { knowledge: KbEntry[]; pages: PageSummary[] }): LearnSource {
  return interimSource(input)
}

/** Interim: the newest knowledge base day stands in for the methodology list (Chinese text, so the
 * English list keeps only the original-post links); knowledge entries and notes are the chunks. */
export function interimSource({ knowledge, pages }: { knowledge: KbEntry[]; pages: PageSummary[] }): LearnSource {
  const latest = byDate(knowledge).sort((a, b) => b.date.localeCompare(a.date))[0]
  const list = (lang: Lang): MethodologySummary[] => (latest?.entries ?? []).map((entry, i) => lang === 'zh'
    ? { id: entry.id, title: entry.title, question: entry.body.map(s => s.text).join(''), rich: entry.body, href: `/zh/${kbSlug}#${entry.id}`, dateLast: entry.date, label: SOURCES[entry.source].label[0], sourceUrl: entry.url }
    : { id: entry.id, title: `${SOURCES[entry.source].label[1]}: original post ${i + 1}`, question: '', href: entry.url, dateLast: entry.date })
  return {
    listMethodologies: list,
    getMethodology: () => undefined,
    chunks: (lang: Lang): Chunk[] => [
      ...(lang === 'zh' ? knowledge.map(entry => ({ id: entry.id, kind: 'post', title: entry.title, text: entry.body.map(s => s.text).join(''), href: `/zh/${kbSlug}#${entry.id}` })) : []),
      ...pages.filter(p => p.lang === lang).map(p => ({ id: `${lang}/${p.slug}`, kind: 'note', title: p.title, text: p.subtitle === p.title ? p.summary : `${p.subtitle} ${p.summary}`, href: `/${lang}/${p.slug}` })),
    ],
  }
}

/** "What to learn today": the most recently updated methodologies, newest first. */
export function todayItems(source: LearnSource, lang: Lang, limit = 6): TodayItem[] {
  return source.listMethodologies(lang).map((item, i) => ({ item, i }))
    .sort((a, b) => b.item.dateLast.localeCompare(a.item.dateLast) || a.i - b.i).slice(0, limit).map(({ item }) => item)
}

/** The static search index for one language (written to /search/<lang>.json). */
export function searchIndex(source: LearnSource, lang: Lang): SearchItem[] {
  return source.chunks(lang).map(chunk => ({ kind: chunk.kind, title: chunk.title, text: chunk.text, href: chunk.href }))
}
