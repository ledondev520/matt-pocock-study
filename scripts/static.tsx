import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderToString } from 'react-dom/server'
import { Site } from '../src/Site'
import type { Model } from '../src/lib/content'
import { metadata } from '../src/lib/metadata'
import { siteUrl } from '../src/lib/site'
import { escapeHtml } from './figures'
import { createIndex } from '../server/db'
import { importCorpus, loadCorpus, queryCorpus, corpusTags } from '../server/corpus'

export async function staticPages(root = 'dist') {
  const template = await readFile(join(root, 'index.html'), 'utf8')
  const db = createIndex([])
  importCorpus(db, loadCorpus())
  const corpus = queryCorpus(db, { limit: 20 })
  const model: Model = { pages: JSON.parse(await readFile(join(root, 'content.json'), 'utf8')), figures: JSON.parse(await readFile(join(root, 'figures.json'), 'utf8')), corpusCount: corpus.total, corpusItems: corpus.items, corpusTags: corpusTags(db), siteUrl: siteUrl() }
  db.close()
  const paths = ['/', '/zh', '/en', '/zh/corpus', '/en/corpus', ...model.pages.filter(p => p.slug !== 'corpus').map(p => `/${p.lang}/${p.slug}`), '/404', '/zh/404', '/en/404']
  for (const path of paths) {
    const m = metadata(model, path)
    const e = escapeHtml
    const meta = `<title>${e(m.title)}</title><meta name="description" content="${e(m.description)}"><link rel="canonical" href="${e(m.url)}"><link rel="alternate" hreflang="${m.lang}" href="${e(m.url)}"><link rel="alternate" hreflang="${m.lang === 'zh' ? 'en' : 'zh'}" href="${e(m.alternate)}"><meta property="og:title" content="${e(m.title)}"><meta property="og:description" content="${e(m.description)}"><meta property="og:url" content="${e(m.url)}"><meta property="og:image" content="${e(m.image)}"><meta name="twitter:card" content="summary_large_image">${path.endsWith('/404') ? '<meta name="robots" content="noindex">' : ''}`
    const html = template.replace('<html lang="en">', `<html lang="${m.lang}">`).replace('<!--page-meta-->', meta).replace('<div id="root"></div>', `<div id="root">${renderToString(<Site model={model} path={path} />)}</div>`).replace('<!--site-data-->', `<script id="site-data" type="application/json">${JSON.stringify(model).replace(/</g, '\\u003c')}</script>`)
    const target = path.endsWith('/404') ? join(root, path.slice(1) + '.html') : join(root, path.slice(1), 'index.html')
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, html)
  }
  return model
}
await staticPages()
