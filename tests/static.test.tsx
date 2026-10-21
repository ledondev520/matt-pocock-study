import { execFileSync } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { beforeAll, afterAll, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { renderToString } from 'react-dom/server'
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
    expect(doc.querySelector('title')?.textContent).toBeTruthy()
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(siteUrl() + path)
    expect(doc.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(siteUrl() + path)
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')).toMatch(new RegExp('^' + siteUrl().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/og/'))
    expect(doc.querySelectorAll('link[rel="alternate"]')).toHaveLength(2)
    expect(doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image')
    const page = model.pages.find(p => p.lang === lang && p.slug === slug)
    if (page) expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(page.summary)
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
    const doc = new JSDOM(renderToString(<Site model={model} path={path} />)).window.document
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
