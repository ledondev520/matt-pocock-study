import type { Lang } from '../../src/lib/lang'
import type { PageSummary } from '../../src/lib/content'
import type { Chunk, LearnSource, MethodologySummary, TodayItem } from '../../src/lib/learn'
import type { SearchItem } from '../../src/lib/search'
import { chunks as methodChunks, getMethodology as getSet, listMethodologies as listSets } from '../methods'
import { domainLabel, methodPath, withoutLicence } from '../../src/lib/methods'
import { kbSlug } from '../../src/lib/metadata'
import { byDate, SOURCES, type KbEntry } from '../kb/feed'

// The one place that decides where "what to learn today" and the search index come from:
// the methodology module (data/methods via scripts/methods.ts), plus the note pages for search.
export function learnSource(input: { knowledge: KbEntry[]; pages: PageSummary[] }): LearnSource {
  return methodsSource(input)
}

export function methodsSource({ pages }: { knowledge?: KbEntry[]; pages: PageSummary[] }): LearnSource {
  const summary = (lang: Lang) => (s: ReturnType<typeof listSets>[number]): MethodologySummary => ({
    id: s.id, title: s.title, question: s.question ?? s.claim, href: methodPath(lang, s.id), dateLast: s.date_last, label: domainLabel(s.domain, lang),
  })
  return {
    listMethodologies: lang => listSets(lang).map(summary(lang)),
    getMethodology: (id, lang) => {
      const m = getSet(id)
      if (!m) return undefined
      const s = listSets(lang).find(x => x.id === m.id)!
      return { ...summary(lang)(s), claim: m.claim.text[lang], steps: m.steps.map(step => ({ id: step.id, order: step.order, title: step.title[lang], how: step.how[lang] })) }
    },
    chunks: (lang: Lang): Chunk[] => [
      ...methodChunks(lang).map(c => ({ id: c.key, kind: c.kind, methodologyId: c.methodology_id, title: c.title, text: withoutLicence(c.text), href: c.sitePath })),
      ...pages.filter(p => p.lang === lang).map(p => ({ id: `${lang}/${p.slug}`, kind: 'note', title: p.title, text: p.subtitle === p.title ? p.summary : `${p.subtitle} ${p.summary}`, href: `/${lang}/${p.slug}` })),
    ],
  }
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
