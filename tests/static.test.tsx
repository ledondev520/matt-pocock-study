import { execFileSync } from 'node:child_process'
import { readdir, readFile, stat, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, afterAll, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { renderToString } from 'react-dom/server'
import { staticPages } from '../scripts/static'
import { metadata } from '../src/lib/metadata'
import type { Page } from '../src/lib/content'
import { Site } from '../src/Site'
import type { Model } from '../src/lib/content'
import { siteUrl } from '../src/lib/site'
import { createApp } from '../server/app'
import { createIndex } from '../server/db'

let model: Model
const db = createIndex([])
let app: ReturnType<typeof createApp>
beforeAll(async () => {
  execFileSync('npm', ['run', 'build'], { stdio: 'pipe', timeout: 120000 })
  const html = await readFile('dist/en/index.html', 'utf8')
  const document = new JSDOM(html).window.document
  app = createApp(db, 'dist')
  model = JSON.parse(document.getElementById('site-data')!.textContent!)
}, 130000)
afterAll(() => db.close())
async function files(root: string): Promise<string[]> {
  const results: string[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) results.push(...await files(path))
    else if (entry.name.endsWith('.html')) results.push(path)
  }
  return results
}
async function resolves(href: string, base: string) {
  const url = new URL(href, siteUrl() + base)
  if (url.origin !== new URL(siteUrl()).origin) return
  const path = resolve('dist', '.' + decodeURIComponent(url.pathname))
  expect(path.startsWith(resolve('dist')), href).toBe(true)
  const info = await stat(path).catch(() => null)
  expect(info, `Dead link ${href} on ${base}`).not.toBeNull()
  if (info?.isDirectory()) expect(await stat(join(path, 'index.html')).catch(() => null), href).not.toBeNull()
  if (url.hash) {
    const target = info?.isDirectory() ? join(path, 'index.html') : path
    const html = await readFile(target, 'utf8')
    const id = decodeURIComponent(url.hash.slice(1))
    expect(html.includes(`id="${id}"`), `Missing fragment ${href} on ${base}`).toBe(true)
  }
}
it('writes complete, localized HTML and absolute metadata for all routes', async () => {
  for (const lang of ['zh', 'en']) for (const slug of ['', ...model.pages.filter(p => p.lang === lang).map(p => p.slug)]) {
    const path = `/${lang}${slug ? '/' + slug : ''}`
    const html = await readFile(`dist${path}/index.html`, 'utf8')
    const doc = new JSDOM(html).window.document
    expect(doc.documentElement.lang).toBe(lang)
    expect(doc.querySelector('h1')?.textContent).toBeTruthy()
    expect(doc.querySelectorAll('h1')).toHaveLength(1)
    expect(doc.querySelector('title')?.textContent).toBeTruthy()
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(siteUrl() + path)
    expect(doc.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(siteUrl() + path)
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')).toMatch(new RegExp('^' + siteUrl().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/og/'))
    expect(doc.querySelectorAll('link[rel="alternate"]')).toHaveLength(2)
    expect(doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image')
    const page = model.pages.find(p => p.lang === lang && p.slug === slug)
    if (page) {
      expect(doc.querySelector('h1')!.textContent).toBe(page.title)
      expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(page.summary)
    }
  }
})
it('resolves every internal href in generated and React-rendered HTML', async () => {
  const generated = await files('dist')
  for (const file of generated) {
    const html = await readFile(file, 'utf8')
    const base = '/' + file.replace(/^dist\//, '').replace(/index\.html$/, '')
    const doc = new JSDOM(html).window.document
    for (const node of doc.querySelectorAll('[href]')) await resolves(node.getAttribute('href')!, base)
  }
  for (const path of ['/', '/zh', '/en', '/zh/corpus', '/en/corpus', ...model.pages.map(p => `/${p.lang}/${p.slug}`)]) {
    const dataFile = path === '/' || path === '/zh' || path === '/en' ? `dist${path}/index.json` : `dist${path}.json`
    const scoped: Model = JSON.parse(await readFile(dataFile, 'utf8'))
    const doc = new JSDOM(renderToString(<Site model={scoped} path={path} />)).window.document
    for (const node of doc.querySelectorAll('[href]')) await resolves(node.getAttribute('href')!, path)
  }
}, 30000)
it('serves static pages, downloads and assets and gives unknown paths a real 404', async () => {
  for (const path of ['/', '/zh', '/zh/specs-and-tickets', '/en/specs-and-tickets.md', '/llms.txt', '/zh/llms-full.txt', '/zh/corpus', '/og/zh/specs-and-tickets.png']) expect((await app.request(path)).status, path).toBe(200)
  for (const path of ['/zh/nope', '/en/nope', '/unknown', '/zh/not/a/page']) {
    const response = await app.request(path)
    expect(response.status).toBe(404)
    expect(await response.text()).toContain(path.startsWith('/zh/') ? '这个地址没有页面' : 'Page not found')
  }
})

it('keeps every built page under 200 KB and embeds only its own body', async () => {
  const pages: Page[] = JSON.parse(await readFile('dist/content.json', 'utf8'))
  for (const file of await files('dist')) {
    const html = await readFile(file, 'utf8')
    expect(Buffer.byteLength(html), file).toBeLessThan(200000)
    const doc = new JSDOM(html).window.document
    const scoped: Model = JSON.parse(doc.getElementById('site-data')!.textContent!)
    for (const summary of scoped.pages) {
      for (const key of ['html', 'headHtml', 'markdown', 'toc']) expect(summary).not.toHaveProperty(key)
    }
    const bodies = pages.filter(p => p.html === scoped.currentPage?.html)
    expect(bodies).toHaveLength(scoped.currentPage ? 1 : 0)
    for (const other of pages.filter(p => p.html !== scoped.currentPage?.html)) {
      expect(doc.getElementById('site-data')!.textContent).not.toContain(JSON.stringify(other.html).slice(1, -1).replace(/</g, () => '\\u003c'))
    }
  }
})
it('round-trips replacement tokens through metadata, rendered HTML and embedded JSON', async () => {
  const root = await mkdtemp(join(tmpdir(), 'static-tokens-'))
  try {
    const pages: Page[] = JSON.parse(await readFile('dist/content.json', 'utf8'))
    const special = '$& $\' $` <safe> & "quoted"'
    const page = pages.find(p => p.lang === 'en' && p.slug === 'specs-and-tickets')!
    page.title = special; page.summary = special
    await writeFile(join(root, 'content.json'), JSON.stringify(pages))
    await writeFile(join(root, 'figures.json'), await readFile('dist/figures.json'))
    await writeFile(join(root, 'index.html'), '<!doctype html><html lang="en"><head><!--page-meta--></head><body><div id="root"></div><!--site-data--></body></html>')
    await staticPages(root)
    const doc = new JSDOM(await readFile(join(root, 'en/specs-and-tickets/index.html'), 'utf8')).window.document
    expect(doc.querySelector('h1')!.textContent).toBe(special)
    expect(doc.title).toBe(special + ' · Matt Study Notes')
    expect(doc.querySelector('meta[name="description"]')!.getAttribute('content')).toBe(special)
    const embedded: Model = JSON.parse(doc.getElementById('site-data')!.textContent!)
    expect(embedded.currentPage!.title).toBe(special)
    expect(embedded.currentPage!.summary).toBe(special)
    expect(JSON.parse(await readFile(join(root, 'en/specs-and-tickets.json'), 'utf8'))).toEqual(embedded)
  } finally { await rm(root, { recursive: true, force: true }) }
})
it.each(['/zh/a/b', '/zh/a_b', '/zh/不存在'])('shares Chinese 404 rendering and metadata for %s', async path => {
  const response = await app.request(path)
  expect(response.status).toBe(404)
  const scoped: Model = JSON.parse(new JSDOM(await response.text()).window.document.getElementById('site-data')!.textContent!)
  expect(renderToString(<Site model={scoped} path={path} />)).toBe(renderToString(<Site model={scoped} path="/zh/404" />))
  expect(metadata(scoped, path).lang).toBe('zh')
  expect(metadata(scoped, path).title).toContain('页面不存在')
})
