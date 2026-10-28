import { licencesView } from './licences.mjs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { renderToString } from 'react-dom/server'
import { Site } from '../src/Site'
import type { Model, Page } from '../src/lib/content'
import { kbSlug, licensesSlug, metadata } from '../src/lib/metadata'
import { validateFeed } from './kb/feed'
import { dropCounts } from './kb/counts'
import { searchIndexPath } from '../src/lib/search'
import { learnSource, searchIndex, todayItems } from './learn/source'
import { knowledgeMarkdown } from './kb/markdown'
import { timelineItems, timelineMarkdown } from './timeline'
import { timelineSlug } from '../src/lib/timeline'
import { routeInfo } from '../src/lib/lang'
import { siteUrl } from '../src/lib/site'
import { markdownPath } from '../src/lib/agent'
import { escapeHtml } from './figures'
import { outputPath, writeOutput } from './output-path.mjs'
import { createIndex } from '../server/db'
import { importCorpus, loadCorpus, queryCorpus, corpusTags } from '../server/corpus'
import { loadMethodologies } from './methods'
import { forDisplay, methodMarkdown, methodPath, methodsIndexMarkdown, methodsSlug, summarize, type Methodology } from '../src/lib/methods'

export function pageModel(model: Model, pages: Page[], path: string, sets: Methodology[] = []): Model {
  const { lang, slug, method, home } = routeInfo(path)
  const currentPage = pages.find(p => p.lang === lang && p.slug === slug)
  const licenses = slug === licensesSlug, kb = slug === kbSlug, timeline = slug === timelineSlug
  // Methods views carry the list (navigation) and, on a set's page, that set.
  const current = method ? sets.find(m => methodPath(lang, m.id) === path) : undefined
  const methods = slug === methodsSlug && (!method || current) ? { list: sets.map(m => summarize(m, lang)), current } : undefined
  const ids = home ? [] : slug === 'corpus' ? ['spot-empty'] : currentPage || licenses || kb || timeline || methods ? [] : ['spot-404']
  const figures = Object.fromEntries(ids.map(id => [id, model.figures[lang][id]]))
  // Every licence text is shown on /licenses only; other views link to it from the footer.
  return { ...model, currentPage, licences: licenses ? licencesView() : undefined,
    figures: { zh: {}, en: {}, [lang]: figures },
    corpusItems: slug === 'corpus' ? model.corpusItems : [], corpusTags: slug === 'corpus' ? model.corpusTags : [],
    knowledge: kb ? model.knowledge : undefined,
    today: home ? todayItems(learnSource({ knowledge: model.knowledge ?? [], pages: model.pages }), lang) : undefined,
    // Only our learning text travels with the page; originals have a separate on-demand payload.
    timeline: timeline ? timelineItems(lang, pages, model.knowledge ?? []).map(({ id, date, kind, learned }) => ({ id, date, kind,
      learned: { ...learned, text: typeof learned.text === 'string' ? learned.text : learned.text.map(({ text }) => ({ text })) },
    })) : undefined,
    methods,
  }
}
export async function staticPages(root = 'dist', kbFile = 'data/knowledge-base.json') {
  const template = await readFile(join(root, 'index.html'), 'utf8')
  const db = createIndex([])
  importCorpus(db, loadCorpus())
  const corpus = queryCorpus(db, { limit: 20 })
  const pages: Page[] = JSON.parse(await readFile(join(root, 'content.json'), 'utf8'))
  // Navigation needs metadata only. Bodies are sent with their own route.
  const summaries = pages.map(({ lang, slug, title, subtitle, section, number, order, summary, head, updated }) => ({ lang, slug, title, subtitle, section, number, order, summary, head, updated }))
  const model: Model = { pages: summaries, figures: JSON.parse(await readFile(join(root, 'figures.json'), 'utf8')), corpusCount: corpus.total, corpusItems: corpus.items, corpusTags: corpusTags(db), siteUrl: siteUrl(),
    // Committed, gate-checked feed; an invalid file or any gate finding fails the build.
    knowledge: validateFeed(JSON.parse(await readFile(kbFile, 'utf8'))).entries.map(dropCounts) }
  db.close()
  const learn = learnSource({ knowledge: model.knowledge ?? [], pages: summaries })
  for (const view of [kbSlug, timelineSlug]) if (pages.some(p => p.slug === view)) throw new Error(`content/*/${view}.md would collide with the ${view} view`)
  const sets = loadMethodologies().map(forDisplay)
  if (pages.some(p => p.slug === methodsSlug)) throw new Error(`content/*/${methodsSlug}.md would collide with the methods view`)
  const paths = ['/', '/zh', '/en', ...pages.map(p => `/${p.lang}/${p.slug}`), `/zh/${licensesSlug}`, `/en/${licensesSlug}`, `/zh/${kbSlug}`, `/en/${kbSlug}`, `/zh/${timelineSlug}`, `/en/${timelineSlug}`,
    ...(['zh', 'en'] as const).flatMap(lang => [methodPath(lang), ...sets.map(m => methodPath(lang, m.id))]), '/404', '/zh/404', '/en/404']
  for (const path of paths) {
    const scoped = pageModel(model, pages, path, sets)
    const m = metadata(scoped, path)
    const e = escapeHtml
    const meta = `<title>${e(m.title)}</title><meta name="description" content="${e(m.description)}"><link rel="canonical" href="${e(m.url)}"><link rel="alternate" hreflang="${m.lang}" href="${e(m.url)}"><link rel="alternate" hreflang="${m.lang === 'zh' ? 'en' : 'zh'}" href="${e(m.alternate)}"><link rel="alternate" hreflang="x-default" href="${e(m.xDefault)}"><meta property="og:title" content="${e(m.title)}"><meta property="og:description" content="${e(m.description)}"><meta property="og:url" content="${e(m.url)}"><meta property="og:image" content="${e(m.image)}"><meta name="twitter:card" content="summary_large_image">${path.endsWith('/404') ? '<meta name="robots" content="noindex">' : `<link rel="alternate" type="text/markdown" href="${e(markdownPath(path))}">`}`
    const data = JSON.stringify(scoped).replace(/</g, () => '\\u003c')
    const html = template.replace('<html lang="en">', () => `<html lang="${m.lang}">`).replace('<!--page-meta-->', () => meta).replace('<div id="root"></div>', () => `<div id="root">${renderToString(<Site model={scoped} path={path} />)}</div>`).replace('<!--site-data-->', () => `<script id="site-data" type="application/json">${data}</script>`)
    const target = path.endsWith('/404') ? outputPath(root, path.slice(1) + '.html') : outputPath(root, path.slice(1), 'index.html')
    await writeOutput(root, target, html)
    await writeOutput(root, path.endsWith('/404') ? target.replace(/\.html$/, '.json') : path === '/' || path === '/zh' || path === '/en' ? outputPath(root, path.slice(1), 'index.json') : outputPath(root, path.slice(1) + '.json'), JSON.stringify(scoped))
  }
  // Home page search: one static index per language, fetched on first focus.
  for (const lang of ['zh', 'en'] as const) await writeOutput(root, outputPath(root, searchIndexPath(lang).slice(1)), JSON.stringify(searchIndex(learn, lang)))
  // The knowledge base and timeline views' Markdown twins (the feed is only read here, not in build:content).
  for (const lang of ['zh', 'en'] as const) {
    const items = timelineItems(lang, pages, model.knowledge ?? [])
    await writeOutput(root, outputPath(root, lang, `${timelineSlug}-originals.json`), JSON.stringify(Object.fromEntries(items.map(({ id, original }) => [id, original]))))
    await writeOutput(root, outputPath(root, lang, `${kbSlug}.md`), knowledgeMarkdown(lang, model.knowledge ?? []))
    await writeOutput(root, outputPath(root, lang, `${timelineSlug}.md`), timelineMarkdown(lang, items, model.siteUrl))
  }
  // The methods views' Markdown twins.
  for (const lang of ['zh', 'en'] as const) {
    const list = sets.map(m => summarize(m, lang)), localized = pages.filter(p => p.lang === lang)
    await writeOutput(root, outputPath(root, lang, `${methodsSlug}.md`), methodsIndexMarkdown(list, lang, model.siteUrl))
    for (const m of sets) await writeOutput(root, outputPath(root, methodPath(lang, m.id).slice(1) + '.md'), methodMarkdown(m, lang, model.siteUrl, list, localized))
  }
  // Crawlers and agents: every indexable route (by its canonical URL) with its other-language twin and
  // x-default (the Chinese page, as in each page's <head>). "/" shares /zh's canonical, so it is listed once.
  const entries = new Map<string, { alternate: string; xDefault: string; lang: string; updated?: string }>()
  for (const path of paths.filter(p => !p.endsWith('/404'))) {
    const m = metadata(pageModel(model, pages, path, sets), path)
    const { slug, method } = routeInfo(path)
    const set = method ? sets.find(s => methodPath(m.lang, s.id) === path) : undefined
    const updated = slug === methodsSlug ? set ? set.updated ?? set.date_last : sets.map(s => s.updated ?? s.date_last).sort().at(-1) : slug === kbSlug ? model.knowledge?.map(e => e.date).sort().at(-1) : slug === timelineSlug ? timelineItems(m.lang, pages, model.knowledge ?? []).map(e => e.date).sort().at(-1) : slug ? pages.find(p => p.lang === m.lang && p.slug === slug)?.updated : pages.filter(p => p.lang === m.lang).map(p => p.updated).sort().at(-1)
    entries.set(m.url, { alternate: m.alternate, xDefault: m.xDefault, lang: m.lang, updated })
  }
  const x = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const urls = [...entries].map(([url, { alternate, xDefault, lang, updated }]) => `  <url>\n    <loc>${x(url)}</loc>${updated ? `\n    <lastmod>${x(updated)}</lastmod>` : ''}\n    <xhtml:link rel="alternate" hreflang="${lang}" href="${x(url)}"/>\n    <xhtml:link rel="alternate" hreflang="${lang === 'zh' ? 'en' : 'zh'}" href="${x(alternate)}"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="${x(xDefault)}"/>\n  </url>`)
  await writeOutput(root, 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`)
  // Nothing is blocked: search engines, AI crawlers and coding agents are all welcome.
  await writeOutput(root, 'robots.txt', `# Public, read-only study notes. All crawlers and AI agents are welcome.\n# Coding agents: start at ${model.siteUrl}/llms.txt (Chinese: ${model.siteUrl}/zh/llms.txt)\nUser-agent: *\nAllow: /\n\nSitemap: ${model.siteUrl}/sitemap.xml\n`)
  return model
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await staticPages()
