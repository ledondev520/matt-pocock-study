import type { Lang } from './lang'

/** One searchable item (a chunk from the learn source). Built at build time (scripts/learn/source.ts). */
export interface SearchItem { kind: string; title: string; text: string; href: string }

/** Where the home page search gets its results. */
export interface SearchSource { search(query: string, lang: Lang): Promise<SearchItem[]>; prepare?(lang: Lang): void }

/** The per-language index the build writes to dist (fetched on first use, same origin). */
export const searchIndexPath = (lang: Lang) => `/search/${lang}.json`

/** Folded for matching only: NFKC (full-width letters and digits), lower case, collapsed spaces. */
export const fold = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

/** Substring match on every space-separated term, so Chinese needs no word segmentation. Title hits
 * rank first; ties keep index order. Method passages share one result per page, so one long
 * method cannot crowd all the notes out of the results. Knowledge entries keep separate links. */
export function searchItems(items: SearchItem[], query: string, limit = 8): SearchItem[] {
  const q = fold(query)
  if (!q) return []
  const terms = q.split(' ')
  const hits: { item: SearchItem; score: number; i: number }[] = []
  items.forEach((item, i) => {
    const title = fold(item.title), body = `${title} ${fold(item.text)}`
    if (!terms.every(term => body.includes(term))) return
    hits.push({ item, i, score: (title.includes(q) ? 4 : 0) + terms.filter(term => title.includes(term)).length })
  })
  const seen = new Set<string>()
  return hits.sort((a, b) => b.score - a.score || a.i - b.i).filter(({ item }) => {
    const key = /^\/(zh|en)\/methods\//.test(item.href) ? item.href.split('#')[0] : item.href
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, limit).map(hit => hit.item)
}

/** The static index source: one request per language, made on first use and then cached. */
export function localSource(load: (lang: Lang) => Promise<SearchItem[]> = async lang => {
  const response = await fetch(searchIndexPath(lang))
  if (!response.ok) throw new Error('Search index unavailable')
  return response.json() as Promise<SearchItem[]>
}): SearchSource {
  const cache = new Map<Lang, Promise<SearchItem[]>>()
  const index = (lang: Lang) => {
    let loaded = cache.get(lang)
    if (!loaded) { loaded = load(lang); cache.set(lang, loaded); loaded.catch(() => cache.delete(lang)) }
    return loaded
  }
  return { search: async (query, lang) => searchItems(await index(lang), query), prepare: lang => { void index(lang).catch(() => undefined) } }
}
