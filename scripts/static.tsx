import { embedsArchify, archifyAppendix } from './licences.mjs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { renderToString } from 'react-dom/server'
import { Site } from '../src/Site'
import type { Model, Page } from '../src/lib/content'
import { metadata } from '../src/lib/metadata'
import { routeInfo } from '../src/lib/lang'
import { siteUrl } from '../src/lib/site'
import { markdownPath } from '../src/lib/agent'
import { escapeHtml } from './figures'
import { outputPath, writeOutput } from './output-path.mjs'
import { createIndex } from '../server/db'
import { importCorpus, loadCorpus, queryCorpus, corpusTags } from '../server/corpus'

export function pageModel(model: Model, pages: Page[], path: string): Model {
  const { lang, slug, home } = routeInfo(path)
  const currentPage = pages.find(p => p.lang === lang && p.slug === slug)
  const ids = home ? ['home-hero', 'home-corpus', 'home-routes'] : slug === 'corpus' ? ['spot-empty'] : currentPage ? [] : ['spot-404']
  const figures = Object.fromEntries(ids.map(id => [id, model.figures[lang][id]]))
  // Views outside articles get Archify's full licence when one of their figures is an Archify diagram.
  const licenceHtml = Object.values(figures).some(html => embedsArchify(html ?? '')) ? archifyAppendix(lang).html : undefined
  return { ...model, currentPage, licenceHtml,
    figures: { zh: {}, en: {}, [lang]: figures },
    corpusItems: slug === 'corpus' ? model.corpusItems : [], corpusTags: slug === 'corpus' ? model.corpusTags : [],
  }
}
export async function staticPages(root = 'dist') {
  const template = await readFile(join(root, 'index.html'), 'utf8')
  const db = createIndex([])
  importCorpus(db, loadCorpus())
  const corpus = queryCorpus(db, { limit: 20 })
  const pages: Page[] = JSON.parse(await readFile(join(root, 'content.json'), 'utf8'))
  // Navigation needs metadata only. Bodies are sent with their own route.
  const summaries = pages.map(({ lang, slug, title, subtitle, section, number, order, summary, head, updated }) => ({ lang, slug, title, subtitle, section, number, order, summary, head, updated }))
  const model: Model = { pages: summaries, figures: JSON.parse(await readFile(join(root, 'figures.json'), 'utf8')), corpusCount: corpus.total, corpusItems: corpus.items, corpusTags: corpusTags(db), siteUrl: siteUrl() }
  db.close()
  const paths = ['/', '/zh', '/en', ...pages.map(p => `/${p.lang}/${p.slug}`), '/404', '/zh/404', '/en/404']
  for (const path of paths) {
    const scoped = pageModel(model, pages, path)
    const m = metadata(scoped, path)
    const e = escapeHtml
    const meta = `<title>${e(m.title)}</title><meta name="description" content="${e(m.description)}"><link rel="canonical" href="${e(m.url)}"><link rel="alternate" hreflang="${m.lang}" href="${e(m.url)}"><link rel="alternate" hreflang="${m.lang === 'zh' ? 'en' : 'zh'}" href="${e(m.alternate)}"><meta property="og:title" content="${e(m.title)}"><meta property="og:description" content="${e(m.description)}"><meta property="og:url" content="${e(m.url)}"><meta property="og:image" content="${e(m.image)}"><meta name="twitter:card" content="summary_large_image">${path.endsWith('/404') ? '<meta name="robots" content="noindex">' : `<link rel="alternate" type="text/markdown" href="${e(markdownPath(path))}">`}`
    const data = JSON.stringify(scoped).replace(/</g, () => '\\u003c')
    const html = template.replace('<html lang="en">', () => `<html lang="${m.lang}">`).replace('<!--page-meta-->', () => meta).replace('<div id="root"></div>', () => `<div id="root">${renderToString(<Site model={scoped} path={path} />)}</div>`).replace('<!--site-data-->', () => `<script id="site-data" type="application/json">${data}</script>`)
    const target = path.endsWith('/404') ? outputPath(root, path.slice(1) + '.html') : outputPath(root, path.slice(1), 'index.html')
    await writeOutput(root, target, html)
    await writeOutput(root, path.endsWith('/404') ? target.replace(/\.html$/, '.json') : path === '/' || path === '/zh' || path === '/en' ? outputPath(root, path.slice(1), 'index.json') : outputPath(root, path.slice(1) + '.json'), JSON.stringify(scoped))
  }
  // Crawlers and agents: every indexable route (by its canonical URL) with its other-language twin.
  const entries = new Map<string, { alternate: string; lang: string; updated?: string }>()
  for (const path of paths.filter(p => !p.endsWith('/404'))) {
    const m = metadata(pageModel(model, pages, path), path)
    const { slug } = routeInfo(path)
    const updated = slug ? pages.find(p => p.lang === m.lang && p.slug === slug)?.updated : pages.filter(p => p.lang === m.lang).map(p => p.updated).sort().at(-1)
    entries.set(m.url, { alternate: m.alternate, lang: m.lang, updated })
  }
  const x = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const urls = [...entries].map(([url, { alternate, lang, updated }]) => `  <url>\n    <loc>${x(url)}</loc>${updated ? `\n    <lastmod>${x(updated)}</lastmod>` : ''}\n    <xhtml:link rel="alternate" hreflang="${lang}" href="${x(url)}"/>\n    <xhtml:link rel="alternate" hreflang="${lang === 'zh' ? 'en' : 'zh'}" href="${x(alternate)}"/>\n  </url>`)
  await writeOutput(root, 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`)
  // Nothing is blocked: search engines, AI crawlers and coding agents are all welcome.
  await writeOutput(root, 'robots.txt', `# Public, read-only study notes. All crawlers and AI agents are welcome.\n# Coding agents: start at ${model.siteUrl}/llms.txt (Chinese: ${model.siteUrl}/zh/llms.txt)\nUser-agent: *\nAllow: /\n\nSitemap: ${model.siteUrl}/sitemap.xml\n`)
  return model
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await staticPages()
