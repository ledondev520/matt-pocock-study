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
    expect(doc.querySelectorAll('link[rel="alternate"][hreflang]')).toHaveLength(2)
    expect(doc.querySelectorAll('link[rel="alternate"][type="text/markdown"]')).toHaveLength(1)
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

// Agent-readable gate, derived from dist/ (no route list here): every indexable HTML page links its
// Markdown twin, the twin exists and is plain Markdown, it is listed in that language's llms.txt, and
// the page's canonical URL is in sitemap.xml. A new route that skips any of these fails the build.
const site = () => siteUrl()
const stripCode = (markdown: string) => markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
it('every indexable page has a Markdown twin that is in llms.txt and sitemap.xml', async () => {
  const sitemap = await readFile('dist/sitemap.xml', 'utf8')
  const llms = { en: await readFile('dist/llms.txt', 'utf8'), zh: await readFile('dist/zh/llms.txt', 'utf8') }
  const indexable: string[] = []
  for (const file of await files('dist')) {
    const doc = new JSDOM(await readFile(file, 'utf8')).window.document
    if (doc.querySelector('meta[name="robots"][content~="noindex"]')) continue
    indexable.push(file)
    const lang = doc.documentElement.lang === 'zh' ? 'zh' : 'en'
    const links = doc.querySelectorAll('link[rel="alternate"][type="text/markdown"]')
    expect(links, `${file} links its .md`).toHaveLength(1)
    const href = links[0].getAttribute('href')!
    expect(href, file).toMatch(/^\/(zh|en)\/[a-z0-9-]+\.md$/)
    const markdown = await readFile(`dist${href}`, 'utf8').catch(() => '')
    expect(markdown, `${file}: dist${href}`).toMatch(/^# \S/)
    expect(stripCode(markdown), `${href} has no HTML tags outside code`).not.toMatch(/<\/?(?:div|span|p|a|img|svg|section|aside|details|summary|table|tr|td|th|br|figure|script|style)\b[^>]*>/i)
    expect(llms[lang], `${href} in ${lang} llms.txt`).toContain(`](${site()}${href})`)
    const canonical = doc.querySelector('link[rel="canonical"]')!.getAttribute('href')!
    expect(sitemap, `${canonical} in sitemap.xml`).toContain(`<loc>${canonical}</loc>`)
    const response = await app.request(href)
    expect(response.status, href).toBe(200)
    expect(response.headers.get('Content-Type'), href).toBe('text/markdown; charset=utf-8')
  }
  // Home pages and the corpus page are covered too, not only articles.
  expect(indexable).toEqual(expect.arrayContaining(['dist/index.html', 'dist/zh/index.html', 'dist/en/index.html', 'dist/zh/corpus/index.html', 'dist/en/corpus/index.html']))
  // Reverse direction: the sitemap lists only real pages, and every llms.txt link resolves.
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
  expect(new Set(locs).size).toBe(locs.length)
  for (const loc of locs) await resolves(loc, '/')
  for (const [lang, index] of Object.entries(llms)) {
    expect(index, `${lang} llms.txt explains how to use the site`).toMatch(lang === 'zh' ? /\n## 怎么用/ : /\n## How to use/)
    for (const [, href] of index.matchAll(/\]\(([^)\s]+)\)/g)) await resolves(href, '/')
    for (const url of index.match(/https?:\/\/[^\s)`，。；]+/g) ?? []) if (!url.includes('/api/')) await resolves(url, '/')
  }
})
// The .md twin says what the page says: same title, same headings in the same order, and every plain
// paragraph of the article body appears in the Markdown. Home twins list every note the home page links.
// Arrows (→ ← ↗ …) are drawn as SVG on the page, so they are left out of the comparison.
const plain = (text: string) => text.replace(/[\u2190-\u21ff]/g, ' ').replace(/\s+/g, ' ').trim()
const markdownText = (markdown: string) => plain(markdown.replace(/```[\s\S]*?```/g, ' ').replace(/!?\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/g, '$1').replace(/[*`]/g, '').replace(/^>\s?/gm, ''))
const markdownHeadings = (markdown: string, depth: RegExp) => markdown.replace(/```[\s\S]*?```/g, '').split('\n').flatMap(line => { const m = line.match(depth); return m ? [plain(m[1].replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*`]/g, ''))] : [] })
it('every Markdown twin matches its HTML page', async () => {
  let articles = 0, homes = 0
  for (const file of await files('dist')) {
    const doc = new JSDOM(await readFile(file, 'utf8')).window.document
    const href = doc.querySelector('link[rel="alternate"][type="text/markdown"]')?.getAttribute('href')
    if (!href) continue
    const markdown = await readFile(`dist${href}`, 'utf8')
    const h1 = plain(doc.querySelector('h1')?.textContent ?? '')
    const body = doc.querySelector('.article-body')
    if (body) {
      articles++
      expect(markdownHeadings(markdown, /^# (.+)$/)[0], `${href} title`).toBe(h1)
      const htmlHeadings = [...body.querySelectorAll('h2[id], h3[id]')].filter(h => !h.closest('figure, aside, details')).map(h => plain(h.textContent ?? ''))
      expect(markdownHeadings(markdown, /^#{2,3} (.+)$/).filter(h => htmlHeadings.includes(h)), `${href} headings`).toEqual(htmlHeadings)
      const text = markdownText(markdown)
      for (const p of body.querySelectorAll(':scope > p')) expect(text, `${href} paragraph`).toContain(plain(p.textContent ?? ''))
    } else if (doc.querySelector('.hero')) {
      homes++
      const lang = doc.documentElement.lang === 'zh' ? 'zh' : 'en'
      const linked = [...doc.querySelectorAll('.reading-section .topic-card a')].map(a => a.getAttribute('href')!)
      expect(linked.length, file).toBeGreaterThan(10)
      for (const page of linked) expect(markdown, `${href} lists ${page}`).toContain(`](${site()}${page}.md)`)
      expect(markdown, `${href} carries the copy line`).toContain(doc.getElementById('agent-prompt-text')!.textContent!)
      expect(markdown.startsWith(`# ${lang === 'zh' ? 'Matt Pocock 学习笔记' : 'Matt Pocock study notes'}\n`), href).toBe(true)
    } else expect(markdownHeadings(markdown, /^# (.+)$/)[0], `${href} title`).toBe(h1)
  }
  expect(articles).toBeGreaterThan(30)
  expect(homes).toBe(3)
})
// The home page's copy line: the same text in both languages' HTML, a real button with an accessible
// name, and no CJK characters anywhere in the English home (a single one would load the Chinese font).
it('home pages show a copyable agent line with a labelled button', async () => {
  for (const [file, lang] of [['dist/zh/index.html', 'zh'], ['dist/en/index.html', 'en'], ['dist/index.html', 'en']] as const) {
    const doc = new JSDOM(await readFile(file, 'utf8')).window.document
    const text = doc.getElementById('agent-prompt-text')?.textContent ?? ''
    expect(text, file).toContain(`${site()}${lang === 'zh' ? '/zh/llms.txt' : '/llms.txt'}`)
    expect(text, file).toMatch(lang === 'zh' ? /^去 / : /^Go read /)
    const button = doc.querySelector('.agent-prompt button')!
    expect(button.getAttribute('type'), file).toBe('button')
    expect(button.getAttribute('aria-label'), file).toBe(lang === 'zh' ? '复制这句话' : 'Copy the line for your agent')
    expect(button.getAttribute('aria-label'), 'visible label is part of the accessible name').toContain(button.textContent)
    expect(button.getAttribute('aria-describedby'), file).toBe('agent-prompt-text')
    if (lang === 'en') expect(doc.querySelector('.agent-prompt')!.textContent, file).not.toMatch(/[\u3000-\u9fff\uff00-\uffef]/)
  }
})
// The .md twins are for agents (head link, llms.txt, sitemap); pages show no Markdown download link.
it('pages show no visible link to their Markdown twins', async () => {
  for (const file of await files('dist')) {
    const doc = new JSDOM(await readFile(file, 'utf8')).window.document
    const visible = [...doc.querySelectorAll('body a[href]')].map(a => a.getAttribute('href')!).filter(href => /^\/(?:zh|en)\/[^#?]*\.md$/.test(href) || href.startsWith(siteUrl()) && href.endsWith('.md'))
    expect(visible, file).toEqual([])
    expect(doc.querySelectorAll('body a[download]').length, file).toBe(0)
  }
})
it('robots.txt blocks no crawler and points to the sitemap', async () => {
  const robots = await readFile('dist/robots.txt', 'utf8')
  expect(robots).toMatch(/^User-agent: \*$/m)
  expect(robots).not.toMatch(/^\s*Disallow:\s*\S/im)
  expect(robots).toContain(`Sitemap: ${site()}/sitemap.xml`)
  for (const path of ['/robots.txt', '/sitemap.xml']) {
    const response = await app.request(path)
    expect(response.status, path).toBe(200)
  }
  expect(new JSDOM(await readFile('dist/sitemap.xml', 'utf8'), { contentType: 'application/xml' }).window.document.querySelector('parsererror')).toBeNull()
})
it('files written for agents carry no addresses, local paths or key-shaped strings', async () => {
  const targets = ['dist/llms.txt', 'dist/llms-full.txt', 'dist/zh/llms.txt', 'dist/zh/llms-full.txt', 'dist/robots.txt', 'dist/sitemap.xml', ...(await walk('dist', '.md'))]
  for (const file of targets) {
    const text = await readFile(file, 'utf8')
    expect(text, `${file}: IPv4 address`).not.toMatch(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)
    expect(text, `${file}: email address`).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/)
    expect(text, `${file}: local path`).not.toMatch(/(?:^|[\s"'(])\/(?:workspace|home|root|srv|Users)\//m)
    expect(text, `${file}: key-shaped string`).not.toMatch(/\b(?:sk|ghp|gho|xox[bp])[-_][A-Za-z0-9_-]{16,}/)
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
// with an arch-* class, and every shipped .svg file whose root has one, must carry Archify's full
// licence. No list of pages or files is written down here.
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
it('every built page and SVG file that embeds Archify CSS carries the Archify licence in full', async () => {
  const licence = await readFile('third_party/archify/LICENSE', 'utf8')
  const pagesWithArchify: string[] = []
  for (const file of await files('dist')) {
    const doc = new JSDOM(await readFile(file, 'utf8')).window.document
    if (![...doc.querySelectorAll('svg')].some(isArchify)) continue
    pagesWithArchify.push(file)
    const blocks = [...doc.querySelectorAll('.licence-text pre')].map(pre => pre.textContent)
    expect(blocks.filter(block => block === licence), `${file} Archify licence`).toHaveLength(1)
    // Article routes also export Markdown; it and the language bundle must carry the text.
    const route = /^dist\/(zh|en)\/([a-z0-9-]+)\/index\.html$/.exec(file)
    if (route && model.pages.some(p => p.lang === route[1] && p.slug === route[2])) {
      expect(await readFile(`dist/${route[1]}/${route[2]}.md`, 'utf8'), `${route[2]}.md`).toContain(licence.trimEnd())
    }
  }
  // Both home pages show Archify diagrams; the rule above must therefore have reached them.
  expect(pagesWithArchify).toEqual(expect.arrayContaining(['dist/zh/index.html', 'dist/en/index.html']))
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

// Licence texts are folded: each block on a built page is a closed native <details> whose only
// summary names the source, and whose <pre> is still the exact upstream text.
it('every licence block on a built page is a closed <details> with a one-line summary and the verbatim text', async () => {
  const texts = await Promise.all(['third_party/mattpocock-skills/LICENSE', 'third_party/archify/LICENSE'].map(file => readFile(file, 'utf8')))
  const summaries = { zh: ['完整许可：mattpocock/skills（MIT）', '完整许可：Archify（MIT）'], en: ['Full licence: mattpocock/skills (MIT)', 'Full licence: Archify (MIT)'] }
  let count = 0
  for (const file of await files('dist')) {
    const doc = new JSDOM(await readFile(file, 'utf8')).window.document
    const lang = doc.documentElement.lang.startsWith('zh') ? 'zh' : 'en'
    for (const block of doc.querySelectorAll('.licence-text')) {
      count++
      expect(block.tagName, file).toBe('DETAILS')
      expect(block.hasAttribute('open'), `${file} licence starts closed`).toBe(false)
      expect([...block.children].map(child => child.tagName), file).toEqual(['SUMMARY', 'PRE'])
      const index = texts.indexOf(block.querySelector('pre')!.textContent ?? '')
      expect(index, `${file} licence text is verbatim`).toBeGreaterThanOrEqual(0)
      expect(block.querySelector('summary')!.textContent, file).toBe(summaries[lang][index])
    }
  }
  expect(count).toBeGreaterThan(0)
})
