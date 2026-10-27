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
import registry from '../data/figures.json'

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
it('build writes Brotli q11 and gzip siblings for all eligible dist files', async () => {
  const { brotliCompressSync, brotliDecompressSync, constants, gunzipSync } = await import('node:zlib')
  for (const file of await walk('dist', '')) {
    if (!/\.(html|css|js|mjs|svg|json|txt|md|xml)$/i.test(file)) continue
    const bytes = await readFile(file)
    if (bytes.length < 1024) continue
    const br = await readFile(file + '.br')
    expect(br, file).toEqual(brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }))
    expect(brotliDecompressSync(br), file).toEqual(bytes)
    expect(gunzipSync(await readFile(file + '.gz')), file).toEqual(bytes)
  }
}, 120000)
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
    // hreflang: this language, the other language and x-default (the Chinese twin), all absolute.
    const alternates = Object.fromEntries([...doc.querySelectorAll('link[rel="alternate"][hreflang]')].map(link => [link.getAttribute('hreflang'), link.getAttribute('href')]))
    const twin = `/${lang === 'zh' ? 'en' : 'zh'}${slug ? '/' + slug : ''}`
    expect(alternates).toEqual({ [lang]: siteUrl() + path, [lang === 'zh' ? 'en' : 'zh']: siteUrl() + twin, 'x-default': siteUrl() + `/zh${slug ? '/' + slug : ''}` })
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
it('inlines every placed diagram in the built pages in both languages', async () => {
  const diagrams = new Set(registry.figures.filter(f => f.owner === 'diagram').map(f => f.id))
  for (const lang of ['zh', 'en']) {
    for (const page of model.pages.filter(p => p.lang === lang)) {
      const source = await readFile(`content/${lang}/${page.slug}.md`, 'utf8')
      const ids = [page.head, ...[...source.matchAll(/```figure\s*\nid:\s*([a-z0-9-]+)\s*\n```/g)].map(m => m[1])].filter(id => diagrams.has(id))
      const window = new JSDOM(await readFile(`dist/${lang}/${page.slug}/index.html`, 'utf8')).window
      try {
        for (const id of ids) {
          if (id === 'home-hero') expect(window.document.querySelector('.chain-figure svg'), `${lang}/${page.slug}`).not.toBeNull()
          else {
            const figures = window.document.querySelectorAll(`[data-figure="${id}"]`)
            expect(figures.length, `${lang}/${page.slug}: ${id}`).toBeGreaterThan(0)
            for (const figure of figures) {
              expect(figure.querySelector(`svg.arch-${id}-${lang}`)).not.toBeNull()
              expect(figure.querySelector('img, .figure-placeholder')).toBeNull()
            }
          }
        }
      } finally { window.close() }
    }
    const home = new JSDOM(await readFile(`dist/${lang}/index.html`, 'utf8')).window
    try {
      expect(home.document.querySelector('.chain-figure svg')).not.toBeNull()
      expect(home.document.querySelector(`[data-figure="home-corpus"] svg.arch-home-corpus-${lang}`)).not.toBeNull()
    } finally { home.close() }
  }
})
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

it.each(['/index.html', '/zh/index.html', '/en/specs-and-tickets/index.html', '/zh/%73pecs-and-tickets', '/%7ah/specs-and-tickets'])('returns real 404 HTML matching client rendering for alias %s', async path => {
  for (const method of ['GET', 'HEAD']) {
    const response = await app.request(path, { method })
    expect(response.status).toBe(404)
    if (method === 'HEAD') continue
    const doc = new JSDOM(await response.text()).window.document
    const scoped: Model = JSON.parse(doc.getElementById('site-data')!.textContent!)
    const client = new JSDOM(renderToString(<Site model={scoped} path={path} />)).window.document
    expect(doc.querySelector('h1')!.textContent).toBe(client.querySelector('h1')!.textContent)
    expect(doc.documentElement.lang).toBe(metadata(scoped, path).lang)
  }
})

// Archify reuse, derived from the built site itself: every HTML page whose DOM has an inline <svg>
// with an arch-* class links to /licenses (which holds Archify's full licence), its Markdown export
// and language bundle carry the full text, and every shipped .svg file whose root has one starts
// with it. No list of pages or files is written down here.
async function walk(root: string, suffix: string): Promise<string[]> {
  const results: string[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) results.push(...await walk(path, suffix))
    else if (entry.name.endsWith(suffix)) results.push(path)
  }
  return results
}
const isArchify = (svg: Element) => [...svg.classList].some(name => name.startsWith('arch-'))
const licenceFiles = ['third_party/mattpocock-skills/LICENSE', 'third_party/archify/LICENSE']
const fontFiles = ['public/font-licenses/inter.txt', 'public/font-licenses/space-grotesk.txt', 'public/font-licenses/jetbrains-mono.txt', 'public/font-licenses/noto-sans-sc.txt']
it('every built page and SVG file that embeds Archify CSS points to or carries the Archify licence in full', async () => {
  const licence = await readFile('third_party/archify/LICENSE', 'utf8')
  const pagesWithArchify: string[] = []
  for (const file of await files('dist')) {
    const doc = new JSDOM(await readFile(file, 'utf8')).window.document
    if (![...doc.querySelectorAll('svg')].some(isArchify)) continue
    pagesWithArchify.push(file)
    const lang = doc.documentElement.lang === 'zh' ? 'zh' : 'en'
    expect([...doc.querySelectorAll('footer a')].map(a => a.getAttribute('href')), `${file} links to the licences`).toContain(`/${lang}/licenses`)
    // Article routes also export Markdown; it and the language bundle must carry the text.
    const route = /^dist\/(zh|en)\/([a-z0-9-]+)\/index\.html$/.exec(file)
    if (route && model.pages.some(p => p.lang === route[1] && p.slug === route[2])) {
      expect(await readFile(`dist/${route[1]}/${route[2]}.md`, 'utf8'), `${route[2]}.md`).toContain(licence.trimEnd())
    }
  }
  // Both home pages show Archify diagrams; the rule above must therefore have reached them.
  expect(pagesWithArchify).toEqual(expect.arrayContaining(['dist/index.html', 'dist/zh/index.html', 'dist/en/index.html']))
  for (const lang of ['zh', 'en']) expect(await readFile(lang === 'en' ? 'dist/llms-full.txt' : 'dist/zh/llms-full.txt', 'utf8')).toContain(licence.trimEnd())

  const svgFiles: string[] = []
  for (const file of await walk('dist', '.svg')) {
    const source = await readFile(file, 'utf8')
    const body = source.replace(/^<!--[\s\S]*?-->\n/, '')
    const root = new JSDOM(body, { contentType: 'image/svg+xml' }).window.document.documentElement
    if (!isArchify(root)) continue
    svgFiles.push(file)
    const comment = /^<!--\n([\s\S]*?)-->\n/.exec(source)
    expect(comment?.[1], `${file} licence comment`).toContain(licence)
  }
  // The rule must reach every committed Archify diagram as shipped under /diagrams.
  const committed = (await readdir('public/diagrams')).filter(name => name.endsWith('.svg'))
  expect(committed.length).toBeGreaterThan(0)
  for (const name of committed) expect(svgFiles).toContain(`dist/diagrams/${name}`)
})

// /zh/licenses and /en/licenses hold every notice, byte for byte: both MIT LICENSE files (each with
// its upstream repository and LICENSE link) and the four font OFL files, in the static HTML and in
// the view's JSON (the client renders from it).
it('the licences pages show each MIT and font licence byte-identical to its file, with its upstream links', async () => {
  const expected = await Promise.all([...licenceFiles, ...fontFiles].map(file => readFile(file)))
  const upstream = [['https://github.com/mattpocock/skills', 'https://github.com/mattpocock/skills/blob/2817544484ea89558aabd8a0360e042888fad713/LICENSE'], ['https://github.com/tt-a1i/archify', 'https://github.com/tt-a1i/archify/blob/7a16d30322f5bd09c832386faa95d8c9a933f0c0/LICENSE']]
  for (const lang of ['zh', 'en'] as const) {
    const html = await readFile(`dist/${lang}/licenses/index.html`, 'utf8')
    const doc = new JSDOM(html).window.document
    expect(doc.documentElement.lang).toBe(lang)
    expect(doc.querySelector('h1')!.textContent).toBe(lang === 'zh' ? '许可' : 'Licenses')
    expect(doc.querySelector('link[rel="canonical"]')!.getAttribute('href')).toBe(`${siteUrl()}/${lang}/licenses`)
    expect(doc.querySelector('meta[name="robots"]')).toBeNull()
    // The intro states what the texts match: the upstream LICENSE as it stood when the material was
    // taken (Archify's has since changed), not whatever the repository holds today.
    expect(doc.querySelector('.licenses-page > p')!.textContent).toContain(lang === 'zh' ? '按 MIT 要求在此保留其版权声明和许可全文（与取用时上游的 LICENSE 一字不差）。' : 'their copyright notices and full licence texts are kept here, identical to each upstream LICENSE as it stood when the material was taken.')
    expect(doc.querySelector('.licenses-page > p')!.textContent).not.toMatch(/原仓库 LICENSE 一字不差|identical to the repository LICENSE/)
    const shown = [...doc.querySelectorAll('pre.license-text')].map(pre => Buffer.from(pre.textContent ?? '', 'utf8'))
    expect(shown).toHaveLength(expected.length)
    shown.forEach((bytes, i) => expect(bytes.equals(expected[i]), `${lang} licence ${i} is byte-identical`).toBe(true))
    const entries = [...doc.querySelectorAll('.license-entry')]
    upstream.forEach(([repo, licence], i) => {
      const hrefs = [...entries[i].querySelectorAll('a')].map(a => a.getAttribute('href'))
      expect(hrefs).toEqual(expect.arrayContaining([repo, licence]))
    })
    fontFiles.forEach((file, i) => expect([...entries[licenceFiles.length + i].querySelectorAll('a')].map(a => a.getAttribute('href'))).toContain(file.replace(/^public/, '')))
    const scoped: Model = JSON.parse(await readFile(`dist/${lang}/licenses.json`, 'utf8'))
    expect([...scoped.licences!.mit, ...scoped.licences!.fonts].map((item, i) => Buffer.from(item.text, 'utf8').equals(expected[i]))).toEqual(Array(licenceFiles.length + fontFiles.length).fill(true))
    expect((await app.request(`/${lang}/licenses`)).status).toBe(200)
  }
})

// Both licence links point at the commit the LICENSE was taken from. Archify's main branch has since
// moved to Apache-2.0, so a link to main would contradict "identical to the upstream LICENSE"; skills
// is pinned the same way so a later upstream change cannot do the same. Checked over every built file
// (pages, JSON, .md exports, llms files), not only the licences page.
it('no built file links a licence on an upstream main branch', async () => {
  const texts = (await walk('dist', '')).filter(file => /\.(html|json|md|txt|xml|js|svg)$/i.test(file))
  expect(texts).toEqual(expect.arrayContaining(['dist/llms-full.txt', 'dist/zh/llms-full.txt', 'dist/en/about-and-copyright.md', 'dist/zh/about-and-copyright.md']))
  for (const file of texts) {
    const text = await readFile(file, 'utf8')
    expect(text.includes('archify/blob/main/LICENSE'), `${file} links Archify's LICENSE on main`).toBe(false)
    expect(text.includes('mattpocock/skills/blob/main/LICENSE'), `${file} links skills' LICENSE on main`).toBe(false)
  }
  for (const file of ['dist/en/about-and-copyright.md', 'dist/zh/about-and-copyright.md', 'dist/llms-full.txt', 'dist/zh/llms-full.txt']) {
    expect(await readFile(file, 'utf8'), file).toContain('https://github.com/tt-a1i/archify/blob/7a16d30322f5bd09c832386faa95d8c9a933f0c0/LICENSE')
  }
})

// Every page: the footer is one quiet line (disclaimer + a single licences link); the body shows no
// licence text, no closing disclaimer and no Markdown download. The .md twins and llms.txt files
// stay: they are generated, served and announced to agents in <head>.
it('every built page has a one-line footer with one licences link, and no licence text or download in the body', async () => {
  const notices = (await Promise.all([...licenceFiles, ...fontFiles].map(file => readFile(file, 'utf8')))).map(text => text.split('\n').find(line => line.length > 40)!)
  for (const file of await files('dist')) {
    const doc = new JSDOM(await readFile(file, 'utf8')).window.document
    const zh = doc.documentElement.lang === 'zh'
    const footer = doc.querySelector('footer')!
    const note = footer.querySelector('.footer-note')!
    expect(note.textContent, file).toBe(zh ? '非官方、非商业的学习整理，与 Matt Pocock 无隶属或背书关系；所引作品版权归原作者。 许可' : 'Unofficial, non-commercial study notes; not affiliated with or endorsed by Matt Pocock. Quoted works belong to their authors. Licenses')
    const links = [...note.querySelectorAll('a')]
    expect(links.map(a => [a.getAttribute('href'), a.textContent]), file).toEqual([[zh ? '/zh/licenses' : '/en/licenses', zh ? '许可' : 'Licenses']])
    // Only brand, source link and that line remain in the footer.
    expect([...footer.querySelectorAll('a')].map(a => a.getAttribute('href')), file).toEqual(['https://github.com/ledondev520/matt-pocock-study', links[0].getAttribute('href')])
    const main = doc.querySelector('main')!
    const text = main.textContent ?? ''
    expect(main.querySelector('.licence-text, details.licence-text'), file).toBeNull()
    if (!/\/licenses\/index\.html$/.test(file)) {
      expect(text, file).not.toContain('Permission is hereby granted')
      for (const line of notices) expect(text.includes(line), `${file} shows a licence`).toBe(false)
    }
    expect(text, file).not.toMatch(/非官方、非商业的学习整理，与|Unofficial, non-commercial study notes|Independent, unofficial, non-?commercial study notes/)
    expect(doc.querySelectorAll('a[download]'), file).toHaveLength(0)
    for (const a of doc.querySelectorAll('a[href]')) {
      const url = new URL(a.getAttribute('href')!, siteUrl() + '/')
      if (url.origin === new URL(siteUrl()).origin) expect(url.pathname, `${file} links a download`).not.toMatch(/^\/(?:(?:zh|en)\/[a-z0-9-]+\.md|(?:zh\/)?llms(?:-full)?\.txt)$/)
    }
    expect(doc.getElementById('root')!.textContent, file).not.toMatch(/下载 ?(\.md|Markdown)|Download (\.md|Markdown)/)
    expect(doc.querySelector('link[rel="describedby"]')?.getAttribute('href'), file).toBe('/llms.txt')
  }
  // The agent entry points are still built and served.
  for (const page of model.pages) {
    const response = await app.request(`/${page.lang}/${page.slug}.md`)
    expect(response.status, `${page.lang}/${page.slug}.md`).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8')
  }
  for (const path of ['/llms.txt', '/llms-full.txt', '/zh/llms.txt', '/zh/llms-full.txt']) expect((await app.request(path)).status, path).toBe(200)
})

// Pages carry no licence or adaptation notices: no "MIT", no "Copyright (c)" line and no sentence
// saying a structure was adapted from skills (or Archify). Those live on /licenses and in the .md and
// llms-full exports. Checked on the built HTML, so a notice section that leaks back onto a page (for
// example "本页改编的结构来自…" / "The structure adapted here comes from…") fails here, not only in
// a unit test. Exempt: the licences pages, about-and-copyright (the copyright register itself) and
// open-source-guide (each repository's licence is its subject). Text inside inline <svg> diagrams is
// left out: those files are locked byte for byte by the Archify test above.
const noticeExempt = /^dist\/(?:zh|en)\/(?:licenses|about-and-copyright|open-source-guide)\/index\.html$/
const adaptation = /改编|adapt/i, upstream = /\bskills\b|SKILL\.md|mattpocock|Matt Pocock|Archify/
it('no built page outside the licences, copyright and open-source guide pages shows MIT, a copyright line or an adaptation notice', async () => {
  let checked = 0
  for (const file of await files('dist')) {
    if (noticeExempt.test(file)) continue
    const doc = new JSDOM(await readFile(file, 'utf8')).window.document
    doc.querySelectorAll('script, style, template, svg').forEach(node => node.remove())
    const text = (doc.body.textContent ?? '').replace(/\s+/g, ' ')
    expect(text.match(/.{0,40}\bMIT\b.{0,40}/)?.[0], `${file} shows MIT`).toBeUndefined()
    expect(text.match(/.{0,40}Copyright \(c\).{0,40}/i)?.[0], `${file} shows a copyright line`).toBeUndefined()
    for (const block of doc.body.querySelectorAll('p, li, td, th, h2, h3, h4, dt, dd, figcaption, summary, blockquote')) {
      const line = (block.textContent ?? '').replace(/\s+/g, ' ')
      expect(adaptation.test(line) && upstream.test(line) ? line : undefined, `${file} shows an adaptation notice`).toBeUndefined()
    }
    checked++
  }
  // Every article in both languages, the homes and the 404s were read (and the exemptions were few).
  expect(checked).toBeGreaterThanOrEqual(model.pages.length - 4)
})

// "/" is the Chinese home page in its first HTML response: no English, no client redirect. Only a
// reader who chose English (stored preference) is sent to /en, by a script in <head> that runs
// before the body is parsed.
it('serves the Chinese home page at / with /zh as canonical and a pre-paint redirect only for a stored English choice', async () => {
  const response = await app.request('/')
  expect(response.status).toBe(200)
  const html = await response.text()
  expect(html).toBe(await readFile('dist/index.html', 'utf8'))
  const doc = new JSDOM(html).window.document
  expect(doc.documentElement.lang).toBe('zh')
  expect(doc.querySelector('h1')!.textContent).toBe('想清楚，再动手。')
  expect(doc.querySelector('main')!.textContent).not.toMatch(/Think clearly|Start here|Build better/)
  expect(doc.querySelector('link[rel="canonical"]')!.getAttribute('href')).toBe(siteUrl() + '/zh')
  expect(doc.querySelector('meta[property="og:url"]')!.getAttribute('content')).toBe(siteUrl() + '/zh')
  const scoped: Model = JSON.parse(doc.getElementById('site-data')!.textContent!)
  expect(new JSDOM(renderToString(<Site model={scoped} path="/" />)).window.document.querySelector('h1')!.textContent).toBe('想清楚，再动手。')
  expect(new JSDOM(renderToString(<Site model={scoped} path="/" />)).window.document.body.textContent).toBe(doc.getElementById('root')!.textContent)
  // The redirect script is the first script in <head>, and only acts on "/" with a stored "en".
  const first = doc.head.querySelector('script')!
  expect(first.textContent).toBe("try{if(location.pathname==='/'&&localStorage.getItem('lang')==='en')location.replace('/en')}catch(e){}")
  for (const [stored, path, redirected] of [[null, '/', false], ['zh', '/', false], ['en', '/', true], ['en', '/zh', false]] as const) {
    let target: string | undefined
    const scope = { location: { pathname: path, replace: (to: string) => { target = to } }, localStorage: { getItem: () => stored } }
    new Function('location', 'localStorage', first.textContent!)(scope.location, scope.localStorage)
    expect(target, `${stored} at ${path}`).toBe(redirected ? '/en' : undefined)
  }
})
