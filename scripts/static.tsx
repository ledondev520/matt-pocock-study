import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { renderToString } from 'react-dom/server'
import { Site } from '../src/Site'
import type { Model, Page } from '../src/lib/content'
import { metadata } from '../src/lib/metadata'
import { routeInfo } from '../src/lib/lang'
import { siteUrl } from '../src/lib/site'
import { escapeHtml } from './figures'
import { createIndex } from '../server/db'
import { importCorpus, loadCorpus, queryCorpus, corpusTags } from '../server/corpus'

export function pageModel(model: Model, pages: Page[], path: string): Model {
  const { lang, slug, home } = routeInfo(path)
  const currentPage = pages.find(p => p.lang === lang && p.slug === slug)
  const ids = home ? ['home-hero', 'home-corpus', 'home-routes'] : slug === 'corpus' ? ['spot-empty'] : currentPage ? [] : ['spot-404']
  return { ...model, currentPage,
    figures: { zh: {}, en: {}, [lang]: Object.fromEntries(ids.map(id => [id, model.figures[lang][id]])) },
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
    const meta = `<title>${e(m.title)}</title><meta name="description" content="${e(m.description)}"><link rel="canonical" href="${e(m.url)}"><link rel="alternate" hreflang="${m.lang}" href="${e(m.url)}"><link rel="alternate" hreflang="${m.lang === 'zh' ? 'en' : 'zh'}" href="${e(m.alternate)}"><meta property="og:title" content="${e(m.title)}"><meta property="og:description" content="${e(m.description)}"><meta property="og:url" content="${e(m.url)}"><meta property="og:image" content="${e(m.image)}"><meta name="twitter:card" content="summary_large_image">${path.endsWith('/404') ? '<meta name="robots" content="noindex">' : ''}`
    const data = JSON.stringify(scoped).replace(/</g, () => '\\u003c')
    const html = template.replace('<html lang="en">', () => `<html lang="${m.lang}">`).replace('<!--page-meta-->', () => meta).replace('<div id="root"></div>', () => `<div id="root">${renderToString(<Site model={scoped} path={path} />)}</div>`).replace('<!--site-data-->', () => `<script id="site-data" type="application/json">${data}</script>`)
    const target = path.endsWith('/404') ? join(root, path.slice(1) + '.html') : join(root, path.slice(1), 'index.html')
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, html)
    await writeFile(path.endsWith('/404') ? target.replace(/\.html$/, '.json') : path === '/' || path === '/zh' || path === '/en' ? join(root, path.slice(1), 'index.json') : join(root, path.slice(1) + '.json'), JSON.stringify(scoped))
  }
  return model
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await staticPages()
