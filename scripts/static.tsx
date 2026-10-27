import { licencesView } from './licences.mjs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { renderToString } from 'react-dom/server'
import { Site } from '../src/Site'
import type { Model, Page } from '../src/lib/content'
import { kbSlug, licensesSlug, metadata } from '../src/lib/metadata'
import { validateFeed } from './kb/feed'
import { routeInfo } from '../src/lib/lang'
import { siteUrl } from '../src/lib/site'
import { escapeHtml } from './figures'
import { outputPath, writeOutput } from './output-path.mjs'
import { createIndex } from '../server/db'
import { importCorpus, loadCorpus, queryCorpus, corpusTags } from '../server/corpus'

export function pageModel(model: Model, pages: Page[], path: string): Model {
  const { lang, slug, home } = routeInfo(path)
  const currentPage = pages.find(p => p.lang === lang && p.slug === slug)
  const licenses = slug === licensesSlug, kb = slug === kbSlug
  const ids = home ? ['home-hero', 'home-corpus', 'home-routes'] : slug === 'corpus' ? ['spot-empty'] : currentPage || licenses || kb ? [] : ['spot-404']
  const figures = Object.fromEntries(ids.map(id => [id, model.figures[lang][id]]))
  // Every licence text is shown on /licenses only; other views link to it from the footer.
  return { ...model, currentPage, licences: licenses ? licencesView() : undefined,
    figures: { zh: {}, en: {}, [lang]: figures },
    corpusItems: slug === 'corpus' ? model.corpusItems : [], corpusTags: slug === 'corpus' ? model.corpusTags : [],
    knowledge: kb ? model.knowledge : undefined,
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
    knowledge: validateFeed(JSON.parse(await readFile(kbFile, 'utf8'))).entries }
  db.close()
  if (pages.some(p => p.slug === kbSlug)) throw new Error(`content/*/${kbSlug}.md would collide with the knowledge base view`)
  const paths = ['/', '/zh', '/en', ...pages.map(p => `/${p.lang}/${p.slug}`), `/zh/${licensesSlug}`, `/en/${licensesSlug}`, `/zh/${kbSlug}`, `/en/${kbSlug}`, '/404', '/zh/404', '/en/404']
  for (const path of paths) {
    const scoped = pageModel(model, pages, path)
    const m = metadata(scoped, path)
    const e = escapeHtml
    const meta = `<title>${e(m.title)}</title><meta name="description" content="${e(m.description)}"><link rel="canonical" href="${e(m.url)}"><link rel="alternate" hreflang="${m.lang}" href="${e(m.url)}"><link rel="alternate" hreflang="${m.lang === 'zh' ? 'en' : 'zh'}" href="${e(m.alternate)}"><link rel="alternate" hreflang="x-default" href="${e(m.xDefault)}"><meta property="og:title" content="${e(m.title)}"><meta property="og:description" content="${e(m.description)}"><meta property="og:url" content="${e(m.url)}"><meta property="og:image" content="${e(m.image)}"><meta name="twitter:card" content="summary_large_image">${path.endsWith('/404') ? '<meta name="robots" content="noindex">' : ''}`
    const data = JSON.stringify(scoped).replace(/</g, () => '\\u003c')
    const html = template.replace('<html lang="en">', () => `<html lang="${m.lang}">`).replace('<!--page-meta-->', () => meta).replace('<div id="root"></div>', () => `<div id="root">${renderToString(<Site model={scoped} path={path} />)}</div>`).replace('<!--site-data-->', () => `<script id="site-data" type="application/json">${data}</script>`)
    const target = path.endsWith('/404') ? outputPath(root, path.slice(1) + '.html') : outputPath(root, path.slice(1), 'index.html')
    await writeOutput(root, target, html)
    await writeOutput(root, path.endsWith('/404') ? target.replace(/\.html$/, '.json') : path === '/' || path === '/zh' || path === '/en' ? outputPath(root, path.slice(1), 'index.json') : outputPath(root, path.slice(1) + '.json'), JSON.stringify(scoped))
  }
  return model
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await staticPages()
