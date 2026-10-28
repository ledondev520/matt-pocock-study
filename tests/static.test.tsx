import { execFileSync } from 'node:child_process'
import { readdir, readFile, stat, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { beforeAll, afterAll, expect, it, vi } from 'vitest'
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
import { disclaimerPattern } from '../scripts/content'
import { siteNotice } from '../src/lib/notice'
import { auditSite } from '../scripts/audit/non-content-text.mjs'
import { searchItems, type SearchItem } from '../src/lib/search'
import registry from '../data/figures.json'
import { collectCharacters, fontWeights } from '../scripts/fonts.mjs'
import { parseFontFaces, type NotoFace } from './font-faces'
import { methodSlugs } from './method-slugs'

// Tests that read every built page grow with the page count (62 methodology pages); 5 s is too
// little on CI runners.
vi.setConfig({ testTimeout: 60000 })

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
for (const lang of ['zh', 'en'] as const) it(`${lang} timeline page data excludes originals, which have a separate payload`, async () => {
  const html = await readFile(`dist/${lang}/timeline/index.html`, 'utf8')
  const doc = new JSDOM(html).window.document
  const embedded: Model = JSON.parse(doc.getElementById('site-data')!.textContent!)
  const json = await readFile(`dist/${lang}/timeline.json`, 'utf8')
  expect(JSON.parse(json)).toEqual(embedded)
  expect(embedded.timeline!.length).toBeGreaterThan(0)
  expect(embedded.currentPage).toBeUndefined()
  expect(embedded.knowledge).toBeUndefined()
  expect(json).not.toMatch(/"original"|x\.com/)
  expect(doc.querySelector('main blockquote, main a[href*="x.com"]')).toBeNull()

  const response = await app.request(`/${lang}/timeline-originals.json`)
  expect(response.status).toBe(200)
  expect(response.headers.get('Content-Type')).toContain('application/json')
  const originals = await response.json() as Record<string, { url: string; quote?: string; note?: string; segments?: { text: string; href?: string }[] }>
  expect(Object.keys(originals)).toEqual(embedded.timeline!.map(item => item.id))
  const pages: Page[] = JSON.parse(await readFile('dist/content.json', 'utf8'))
  const expected = pages.filter(page => page.lang === lang && page.slug !== 'corpus').flatMap(page => page.quotes)
  const actual = Object.values(originals).filter(original => original.quote)
  expect(actual.map(original => [original.url, original.quote, original.note]).sort()).toEqual(expected.map(quote => [quote.url, quote.text, quote.note]).sort())
  for (const quote of expected) {
    expect(JSON.stringify(embedded)).not.toContain(JSON.stringify(quote.text))
    expect(doc.getElementById('root')!.textContent).not.toContain(quote.text)
  }
  if (lang === 'zh') {
    const feed = JSON.parse(await readFile('data/knowledge-base.json', 'utf8'))
    for (const entry of feed.entries) {
      const original = originals[`note-${entry.id}`]
      expect(original.url).toBe(entry.url)
      // Source links survive the existing count-removal step applied to note prose.
      expect(original.segments!.filter(segment => segment.href)).toEqual(entry.body.filter((segment: { href?: string }) => segment.href))
    }
  } else expect(JSON.stringify(originals)).not.toMatch(/\p{Script_Extensions=Han}/u)
})
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
  for (const lang of ['zh', 'en']) for (const slug of ['', ...model.pages.filter(p => p.lang === lang).map(p => p.slug), 'knowledge', 'timeline', 'methods', ...methodSlugs.map(slug => `methods/${slug}`)]) {
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
    // Exactly three hreflang links (no duplicate collapsed by fromEntries) plus one Markdown twin.
    expect(doc.querySelectorAll('link[rel="alternate"][hreflang]')).toHaveLength(3)
    expect(doc.querySelectorAll('link[rel="alternate"][type="text/markdown"]')).toHaveLength(1)
    expect(doc.querySelector('link[rel="alternate"][type="text/markdown"]')!.getAttribute('href')).toBe(`/${lang}/${slug || 'index'}.md`)
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
it('generates and serves exactly 31 method pages in each language, preserving example attribution', async () => {
  for (const lang of ['zh', 'en']) {
    const entries = await readdir(`dist/${lang}/methods`, { withFileTypes: true })
    expect(entries.filter(e => e.isDirectory()).map(e => e.name).sort()).toEqual(methodSlugs)
    for (const slug of methodSlugs) {
      const path = `/${lang}/methods/${slug}`
      const response = await app.request(path)
      expect(response.status, path).toBe(200)
      const doc = new JSDOM(await response.text()).window.document
      const article = doc.querySelector('.method-article')!
      expect(article, path).not.toBeNull()
      expect(doc.querySelector('.method-nav [aria-current="page"]')?.getAttribute('href'), path).toBe(path)
      const twin = await readFile(`dist${path}.md`, 'utf8')
      expect(markdownHeadings(twin, /^#{1,3} (.+)$/), path).toEqual([...article.querySelectorAll('h1, h2, h3')].map(h => plain(h.textContent ?? '')))
      const data: Model = JSON.parse(await readFile(`dist${path}.json`, 'utf8'))
      expect(data.methods?.current?.id, path).toBe(`m.${slug}`)
      for (const example of data.methods?.current?.examples ?? []) {
        if (!example.title?.zh.startsWith('本站示例:')) continue
        const title = example.title[lang === 'zh' ? 'zh' : 'en']
        expect(title, path).toMatch(lang === 'zh' ? /^本站示例:/ : /^Our example:/)
        expect(plain(article.textContent ?? ''), path).toContain(plain(title))
        expect(twin, path).toContain(title)
      }
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
  for (const path of ['/', '/zh', '/en', '/zh/corpus', '/en/corpus', '/zh/knowledge', '/en/knowledge', '/zh/timeline', '/en/timeline', ...model.pages.map(p => `/${p.lang}/${p.slug}`)]) {
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
          {
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
      // The home page is search, today's entries, the notes index and the copy line: no figures.
      expect(home.document.querySelectorAll('main figure, main svg[class^="arch-"], main img').length).toBe(0)
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
    expect(href, file).toMatch(/^\/(zh|en)\/(?:methods\/)?[a-z0-9-]+\.md$/)
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
  // Home pages, the corpus, licences and knowledge base pages are covered too, not only articles.
  expect(indexable).toEqual(expect.arrayContaining(['dist/index.html', 'dist/zh/index.html', 'dist/en/index.html', 'dist/zh/corpus/index.html', 'dist/en/corpus/index.html', 'dist/zh/licenses/index.html', 'dist/en/licenses/index.html', 'dist/zh/knowledge/index.html', 'dist/en/knowledge/index.html', 'dist/zh/timeline/index.html', 'dist/en/timeline/index.html']))
  // "/" is the Chinese home: its Markdown twin is the Chinese one.
  expect(new JSDOM(await readFile('dist/index.html', 'utf8')).window.document.querySelector('link[rel="alternate"][type="text/markdown"]')!.getAttribute('href')).toBe('/zh/index.md')
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
// paragraph of the article body appears in the Markdown. Home twins list every note the home page links;
// the licences twins repeat the licences page's text, links and every licence verbatim; the knowledge
// base twins repeat its dates, notes and links (the English one: dates and original posts only).
// Arrows (→ ← ↗ …) are drawn as SVG on the page, so they are left out of the comparison.
const plain = (text: string) => text.replace(/[\u2190-\u21ff]/g, ' ').replace(/\s+/g, ' ').trim()
const markdownText = (markdown: string) => plain(markdown.replace(/```[\s\S]*?```/g, ' ').replace(/!?\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/g, '$1').replace(/[*`]/g, '').replace(/^>\s?/gm, ''))
const markdownHeadings = (markdown: string, depth: RegExp) => markdown.replace(/```[\s\S]*?```/g, '').split('\n').flatMap(line => { const m = line.match(depth); return m ? [plain(m[1].replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*`]/g, ''))] : [] })
// Where a page link points in a twin: site pages become their .md twin, other links stay absolute.
const twinHref = (href: string) => /^\/(zh|en)(\/[a-z0-9-]+)?$/.test(href) ? `${site()}${href}${href.split('/').length === 2 ? '/index' : ''}.md` : new URL(href, site() + '/').href
it('every Markdown twin matches its HTML page', async () => {
  let articles = 0, homes = 0, licenses = 0, knowledge = 0, timeline = 0
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
    } else if (doc.querySelector('main .home')) {
      homes++
      const lang = doc.documentElement.lang === 'zh' ? 'zh' : 'en'
      const linked = [...doc.querySelectorAll('.home-notes a')].map(a => a.getAttribute('href')!)
      expect(linked.length, file).toBeGreaterThan(10)
      for (const page of linked) expect(markdown, `${href} lists ${page}`).toContain(`](${site()}${page}.md)`)
      expect(markdown, `${href} carries the copy line`).toContain(doc.getElementById('agent-prompt-text')!.textContent!)
      expect(markdown.startsWith(`# ${lang === 'zh' ? 'Matt Pocock 学习笔记' : 'Matt Pocock study notes'}\n`), href).toBe(true)
    } else if (doc.querySelector('.licenses-page')) {
      // The licences twin: same title, intro, headings in order, links, and every licence text verbatim.
      licenses++
      const page = doc.querySelector('.licenses-page')!
      expect(markdownHeadings(markdown, /^# (.+)$/)[0], `${href} title`).toBe(h1)
      expect(markdownHeadings(markdown, /^#{2,3} (.+)$/), `${href} headings`).toEqual([...page.querySelectorAll('h2, h3')].map(h => plain(h.textContent ?? '')))
      const text = markdownText(markdown)
      for (const p of page.querySelectorAll(':scope > p, .license-entry > p')) expect(text, `${href} paragraph`).toContain(plain(p.textContent ?? ''))
      for (const a of page.querySelectorAll('a[href]')) expect(markdown, `${href} links ${a.getAttribute('href')}`).toContain(`](${twinHref(a.getAttribute('href')!)})`)
      const fences = [...markdown.matchAll(/```text\n([\s\S]*?)\n```/g)].map(m => m[1])
      expect(fences, `${href} licence texts`).toEqual([...page.querySelectorAll('pre.license-text')].map(pre => (pre.textContent ?? '').trimEnd()))
    } else if (doc.querySelector('.kb-reader')) {
      // The knowledge base twin: same title, lede, dates and note titles in order, every note body,
      // and every link in the lede and the notes (original posts and links inside the notes; the
      // "back home" link is navigation, not content).
      knowledge++
      const page = doc.querySelector('.kb-reader')!
      expect(markdownHeadings(markdown, /^# (.+)$/)[0], `${href} title`).toBe(h1)
      expect(markdownHeadings(markdown, /^#{2,3} (.+)$/), `${href} headings`).toEqual([...page.querySelectorAll('h2, h3')].map(h => plain(h.textContent ?? '')))
      const text = markdownText(markdown)
      for (const p of page.querySelectorAll('p')) expect(text, `${href} paragraph`).toContain(plain(p.textContent ?? ''))
      for (const a of page.querySelectorAll('.kb-lede a[href], .kb-list a[href]')) expect(markdown, `${href} links ${a.getAttribute('href')}`).toContain(`](${twinHref(a.getAttribute('href')!)})`)
      expect(page.querySelectorAll('.kb-entry').length, `${href} has notes`).toBeGreaterThan(0)
      expect(markdown.split('](https://x.com/').length - 1, `${href} links every original post`).toBeGreaterThanOrEqual(page.querySelectorAll('.kb-source').length)
      // Each note's own original-post link, with its label, right under that note (not only links in the body).
      const zh = doc.documentElement.lang === 'zh'
      for (const [i, link] of [...page.querySelectorAll('.kb-entry .kb-source')].entries()) {
        const entry = link.closest('.kb-entry')!
        const line = zh ? `[查看原帖](${link.getAttribute('href')})` : `- [${plain(link.textContent ?? '')}](${link.getAttribute('href')})`
        expect(plain(link.textContent ?? ''), `${href} note ${i} link text`).toMatch(zh ? /^查看原帖$/ : /^(?:Matt notes|Team notes): original post \d+$/)
        if (zh) {
          const title = plain(entry.querySelector('h3')!.textContent ?? '')
          const sections = markdown.split(/^### /m).filter(part => plain(part.split('\n')[0]) === title)
          expect(sections.length, `${href} has a section for ${title}`).toBeGreaterThan(0)
          expect(sections.some(part => part.split('\n').includes(line)), `${href} "${title}" carries its original-post link`).toBe(true)
        } else expect(markdown.split('\n'), `${href} lists ${line}`).toContain(line)
      }
    } else if (doc.querySelector('.tl-page')) {
      // The timeline twin: same title, years and item titles in order, every item's text and its
      // link to where it is explained; like the page by default, no original posts.
      timeline++
      const page = doc.querySelector('.tl-page')!
      expect(markdownHeadings(markdown, /^# (.+)$/)[0], `${href} title`).toBe(h1)
      expect(markdownHeadings(markdown, /^#{2,3} (.+)$/), `${href} headings`).toEqual([...page.querySelectorAll('h2, h3')].map(h => plain(h.textContent ?? '')))
      expect(page.querySelectorAll('.tl-item').length, `${href} has items`).toBeGreaterThan(0)
      const text = markdownText(markdown)
      for (const p of page.querySelectorAll('.tl-learned')) expect(text, `${href} item text`).toContain(plain(p.textContent ?? ''))
      for (const a of page.querySelectorAll('.tl-from')) expect(markdown, `${href} links ${a.getAttribute('href')}`).toContain(`](${twinHref(a.getAttribute('href')!.split('#')[0])})`)
      expect(page.querySelector('a[href*="x.com"]'), `${href} shows no original post by default`).toBeNull()
      expect(markdown, `${href} has no original post`).not.toContain('x.com')
    } else expect(markdownHeadings(markdown, /^# (.+)$/)[0], `${href} title`).toBe(h1)
  }
  expect(articles).toBeGreaterThan(30)
  expect(homes).toBe(3)
  expect(licenses).toBe(2)
  expect(knowledge).toBe(2)
  expect(timeline).toBe(2)
})
// The home page's copy line: one quiet hint and a real button with an accessible name; the prompt it
// copies is ready to use (full llms.txt address, no editing instructions or placeholders) and stays
// hidden until a manual copy needs it. No CJK characters anywhere in the English home (a single one
// would load the Chinese font).
const instructionWords = /替换|换掉|换成|说话就行|改成|填入|中间那句|swap|replace|placeholder|fill in|\{|\}|<|>|…|\.\.\./i
it('home pages show a quiet copy line whose prompt is ready to paste', async () => {
  for (const [file, lang] of [['dist/zh/index.html', 'zh'], ['dist/en/index.html', 'en'], ['dist/index.html', 'zh']] as const) {
    const doc = new JSDOM(await readFile(file, 'utf8')).window.document
    const line = doc.querySelector('.agent-copy')!
    expect(line.querySelector('.agent-copy-hint')!.textContent, file).toBe(lang === 'zh' ? '点一下复制，丢给你的 agent' : 'Copy and paste into your agent')
    const prompt = doc.getElementById('agent-prompt-text')!
    expect(prompt.hasAttribute('hidden'), `${file} keeps the prompt out of sight`).toBe(true)
    const text = prompt.textContent ?? ''
    expect(text, file).toContain('https://matt.withkeya.com/llms.txt')
    expect(text, file).not.toMatch(instructionWords)
    const button = line.querySelector('button')!
    expect(button.getAttribute('type'), file).toBe('button')
    expect(button.getAttribute('aria-label'), file).toBe(lang === 'zh' ? '复制给 agent 的提示' : 'Copy the prompt for your agent')
    expect(button.getAttribute('aria-label'), 'visible label is part of the accessible name').toContain(button.textContent)
    if (lang === 'en') expect(doc.querySelector('main')!.textContent, file).not.toMatch(/[\u3000-\u9fff\uff00-\uffef]/)
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
// Every sitemap entry names itself in its own language, its twin in the other language and x-default
// (the Chinese page, same as the page's <head>), and the twin names it back. The language is the one the page itself declares in <html lang>.
it('sitemap hreflang pairs point at each other across languages', async () => {
  const doc = new JSDOM(await readFile('dist/sitemap.xml', 'utf8'), { contentType: 'application/xml' }).window.document
  const entries = new Map<string, Record<string, string>>()
  for (const url of doc.getElementsByTagName('url')) {
    const links = Object.fromEntries([...url.getElementsByTagName('xhtml:link')].map(link => [link.getAttribute('hreflang')!, link.getAttribute('href')!]))
    entries.set(url.getElementsByTagName('loc')[0].textContent!, links)
  }
  expect(entries.size).toBeGreaterThan(40)
  for (const [loc, links] of entries) {
    const html = await (await app.request(new URL(loc).pathname)).text()
    const page = new JSDOM(html).window.document
    const lang = page.documentElement.lang
    const other = lang === 'zh' ? 'en' : 'zh'
    expect(Object.keys(links).sort(), loc).toEqual(['en', 'x-default', 'zh'])
    // x-default is the Chinese page, as in the page's own <head>.
    expect(links['x-default'], `${loc} x-default`).toBe(links.zh)
    expect(page.querySelector('link[hreflang="x-default"]')!.getAttribute('href'), `${loc} x-default matches <head>`).toBe(links['x-default'])
    expect(links[lang], `${loc} names itself as ${lang}`).toBe(loc)
    expect(links[other], `${loc} twin is a different page`).not.toBe(loc)
    expect(entries.has(links[other]), `${loc} twin ${links[other]} is in the sitemap`).toBe(true)
    expect(entries.get(links[other])![lang], `${links[other]} points back to ${loc}`).toBe(loc)
    expect(entries.get(links[other])![other], `${links[other]} names itself as ${other}`).toBe(links[other])
  }
})
// English agent files stay English: a stray CJK character means a Chinese string leaked into the English build.
it('English agent files contain no CJK characters', async () => {
  const targets = ['dist/llms.txt', 'dist/llms-full.txt', ...(await walk('dist/en', '.md'))]
  expect(targets).toEqual(expect.arrayContaining(['dist/en/index.md', 'dist/en/licenses.md', 'dist/en/knowledge.md', 'dist/en/timeline.md']))
  for (const file of targets) expect(await readFile(file, 'utf8'), file).not.toMatch(/[\u3000-\u9fff\uff00-\uffef]/)
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
it('static rendering refuses a knowledge base feed with a gate finding', async () => {
  const root = await mkdtemp(join(tmpdir(), 'static-kb-'))
  try {
    await writeFile(join(root, 'content.json'), await readFile('dist/content.json'))
    await writeFile(join(root, 'figures.json'), await readFile('dist/figures.json'))
    await writeFile(join(root, 'index.html'), '<!doctype html><html lang="en"><head><!--page-meta--></head><body><div id="root"></div><!--site-data--></body></html>')
    const post = 'https://x.com/mattpocockuk/status/1'
    await writeFile(join(root, 'kb.json'), JSON.stringify({ version: 2, entries: [{ id: 'matt-notes-2099-01-02-1', date: '2099-01-02', source: 'matt-notes', title: '样例 a@b.co', url: post, body: [{ text: '原帖', href: post }] }] }))
    await expect(staticPages(root, join(root, 'kb.json'))).rejects.toThrow(/gate findings/)
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
  // Article pages in both languages show Archify diagrams; the rule above must therefore have reached them.
  expect(pagesWithArchify.filter(file => /^dist\/zh\/[a-z0-9-]+\/index\.html$/.test(file)).length).toBeGreaterThan(0)
  expect(pagesWithArchify.filter(file => /^dist\/en\/[a-z0-9-]+\/index\.html$/.test(file)).length).toBeGreaterThan(0)
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
    const intro = [...doc.querySelectorAll('.licenses-page > p')].map(p => p.textContent).join('\n')
    expect(intro).toContain(lang === 'zh' ? '下列 MIT 项目的版权声明和许可全文按 MIT 要求原样保留（与取用时上游的 LICENSE 一字不差）。' : 'the projects below keep their copyright notices and full licence texts, identical to each upstream LICENSE as it stood when the material was taken.')
    expect(intro).not.toMatch(/原仓库 LICENSE 一字不差|identical to the repository LICENSE/)
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
  expect(texts).toEqual(expect.arrayContaining(['dist/llms-full.txt', 'dist/zh/llms-full.txt', 'dist/en/licenses.md', 'dist/zh/licenses.md']))
  for (const file of texts) {
    const text = await readFile(file, 'utf8')
    expect(text.includes('archify/blob/main/LICENSE'), `${file} links Archify's LICENSE on main`).toBe(false)
    expect(text.includes('mattpocock/skills/blob/main/LICENSE'), `${file} links skills' LICENSE on main`).toBe(false)
  }
  // The pinned link now sits in the licences twins only (llms-full used to get it from the deleted
  // about-and-copyright page; it still carries the Archify licence text itself, see the Archify test).
  for (const file of ['dist/en/licenses.md', 'dist/zh/licenses.md']) {
    expect(await readFile(file, 'utf8'), file).toContain('https://github.com/tt-a1i/archify/blob/7a16d30322f5bd09c832386faa95d8c9a933f0c0/LICENSE')
  }
})

// Every page: the footer is one quiet licences link and nothing else; the body shows no licence
// text, no site notice (it lives on /licenses only) and no Markdown download. The .md twins and llms.txt files
// stay: they are generated, served and announced to agents in <head>.
it('every built page has a one-line footer with one licences link, and no licence text or download in the body', async () => {
  const notices = (await Promise.all([...licenceFiles, ...fontFiles].map(file => readFile(file, 'utf8')))).map(text => text.split('\n').find(line => line.length > 40)!)
  for (const file of await files('dist')) {
    const doc = new JSDOM(await readFile(file, 'utf8')).window.document
    const zh = doc.documentElement.lang === 'zh'
    const footer = doc.querySelector('footer')!
    expect(footer.textContent, file).toBe(zh ? '许可' : 'Licenses')
    expect([...footer.querySelectorAll('a')].map(a => [a.getAttribute('href'), a.textContent, a.className]), file).toEqual([[zh ? '/zh/licenses' : '/en/licenses', zh ? '许可' : 'Licenses', 'footer-licenses']])
    expect(footer.querySelectorAll('svg, img, p, strong').length, file).toBe(0)
    const main = doc.querySelector('main')!
    const text = main.textContent ?? ''
    expect(main.querySelector('.licence-text, details.licence-text'), file).toBeNull()
    if (!/\/licenses\/index\.html$/.test(file)) {
      expect(text, file).not.toContain('Permission is hereby granted')
      for (const line of notices) expect(text.includes(line), `${file} shows a licence`).toBe(false)
    }
    if (!/\/licenses\/index\.html$/.test(file)) expect(doc.body.textContent, file).not.toMatch(disclaimerPattern)
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
// a unit test. Exempt: the licences pages (which now also carry the adaptation register) and
// open-source-guide (each repository's licence is its subject). Text inside inline <svg> diagrams is
// left out: those files are locked byte for byte by the Archify test above.
const noticeExempt = /^dist\/(?:zh|en)\/(?:licenses|open-source-guide)\/index\.html$/
const adaptation = /改编|adapt/i, upstream = /\bskills\b|SKILL\.md|mattpocock|Matt Pocock|Archify/
it('no built page outside the licences and open-source guide pages shows MIT, a copyright line or an adaptation notice', async () => {
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
  expect(doc.querySelector('h1')!.textContent).toBe('今天学什么')
  expect(doc.querySelector('main')!.textContent).not.toMatch(/What to learn today|Copy and paste into your agent/)
  expect(doc.querySelector('link[rel="canonical"]')!.getAttribute('href')).toBe(siteUrl() + '/zh')
  expect(doc.querySelector('meta[property="og:url"]')!.getAttribute('content')).toBe(siteUrl() + '/zh')
  const scoped: Model = JSON.parse(doc.getElementById('site-data')!.textContent!)
  expect(new JSDOM(renderToString(<Site model={scoped} path="/" />)).window.document.querySelector('h1')!.textContent).toBe('今天学什么')
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

it('build ships the Noto subset faces and the full Fontsource fallback slices, all self-hosted (option A)', async () => {
  const fontsource = dirname(createRequire(import.meta.url).resolve('@fontsource/noto-sans-sc/package.json'))
  const sheets = (await readdir('dist/assets')).filter(name => name.endsWith('.css'))
  const faces: NotoFace[] = []
  for (const sheet of sheets) faces.push(...parseFontFaces(await readFile(join('dist/assets', sheet), 'utf8'), '/assets/'))
  // The HTML links the stylesheet that carries the faces (no extra request for the fallback).
  const html = await readFile('dist/zh/index.html', 'utf8')
  const linked = sheets.filter(sheet => html.includes(`/assets/${sheet}`))
  expect(linked).toHaveLength(1)
  expect(faces.length).toBeGreaterThan(0)
  const linkedFaces = parseFontFaces(await readFile(join('dist/assets', linked[0]), 'utf8'), '/assets/')
  expect(linkedFaces).toHaveLength(faces.length)
  const generated = parseFontFaces(await readFile('generated/fonts/noto-sans-sc.css', 'utf8'), './')
  const characters = await collectCharacters()
  for (const weight of fontWeights) {
    const own = faces.filter(face => face.weight === weight)
    const subset = own.filter(face => face.kind === 'subset')
    const fallbacks = own.filter(face => face.kind === 'fallback')
    expect(subset).toHaveLength(1)
    expect(fallbacks.length).toBeGreaterThan(50)
    // Same faces and ranges as the generated CSS (the minifier must not drop or merge any).
    const expected = generated.filter(face => face.weight === weight)
    expect(own.map(face => [face.kind, face.slice, [...face.codes].sort((a, b) => a - b).join()])).toEqual(expected.map(face => [face.kind, face.slice, [...face.codes].sort((a, b) => a - b).join()]))
    // Ranges are disjoint: a subset character can never pull a fallback slice.
    const owner = new Map<number, string>()
    const overlaps: string[] = []
    for (const face of own) for (const code of face.codes) { if (owner.has(code)) overlaps.push(`U+${code.toString(16)}`); owner.set(code, face.file) }
    expect(overlaps).toEqual([])
    // Every collected character has a face: the subset, or a fallback slice.
    expect([...characters].filter(character => !owner.has(character.codePointAt(0)!))).toEqual([])
    const subsetBytes = await readFile(join('dist/assets', subset[0].file))
    expect(subsetBytes.toString('ascii', 0, 4)).toBe('wOF2')
    for (const face of fallbacks) {
      // The shipped file exists and is the unmodified Fontsource slice for that id and weight.
      const shipped = await readFile(join('dist/assets', face.file)).catch(() => null)
      expect(shipped, face.file).not.toBeNull()
      expect(shipped!.equals(await readFile(join(fontsource, `files/noto-sans-sc-${face.slice}-${weight}-normal.woff2`))), face.file).toBe(true)
    }
  }
  // No other Noto files ship (e.g. a leftover Fontsource import with its 100+ slices and woff copies).
  const shippedNoto = (await readdir('dist/assets')).filter(name => /^noto-sans-sc/.test(name)).sort()
  expect(shippedNoto).toEqual(faces.map(face => face.file).sort())
}, 60000)

// ---- PR #8 batch: one site notice, a quiet home, no self-description ----

// Sentences and labels this batch deleted. None may come back on any built page (HTML body or the
// page's JSON); the site notice itself is allowed on /licenses only.
// The old notice wording, allowed on /licenses only (its merged notice reuses some of these words).
const oldNotice = ['原话和语境以原帖为准', '本站解读不代表原作者观点', 'not the authors’ view', 'Our reading is not']
const deleted = [
  '非官方 · 非商业', 'UNOFFICIAL · NON-COMMERCIAL', '独立学习笔记', 'INDEPENDENT FIELD NOTE', '一句话要点', 'KEY POINT',
  '一份持续生长的语料库', 'A growing public corpus', '条公开资料', 'PUBLIC SOURCES', '探索语料库', 'Explore the corpus',
  '想学别的，把中间那句换掉就行', 'Swap in whatever you want to learn', '已复制，发给 agent 就行', 'Paste it into your agent.',
  '想清楚，', 'Think clearly.', '从这里开始', 'Start here', '给你的 Coding Agent', 'FOR YOUR CODING AGENT',
  '向他的分享致敬', 'a tribute to his sharing', '欢迎关注他', 'Follow Matt and learn',
  '搜索中英文摘要与标签', 'Search bilingual summaries and tags', '换个关键词，去掉类型或标签筛选', 'remove a type or tag filter',
  '课程整理中', 'In preparation', '更新于', '关于本站与版权', 'About & copyright', '互动最高', '以上顺序由本站设计', '这是我们的实践方法',
  "This is our practice rule", '以上字段由本站编写', 'This field list is ours', "These route sequences are this site's design",
]
it('no built page shows a deleted notice, statistic, self-description or instruction', async () => {
  const corpus: Model = JSON.parse(await readFile('dist/zh/corpus.json', 'utf8'))
  for (const file of await files('dist')) {
    const doc = new JSDOM(await readFile(file, 'utf8')).window.document
    doc.querySelectorAll('script, style, template').forEach(node => node.remove())
    const text = doc.body.textContent ?? ''
    for (const phrase of /\/licenses\/index\.html$/.test(file) ? deleted : [...oldNotice, ...deleted]) expect(text.includes(phrase) ? phrase : undefined, `${file} shows "${phrase}"`).toBeUndefined()
    if (!/\/licenses\/index\.html$/.test(file)) expect(text.match(disclaimerPattern)?.[0], `${file} shows the site notice`).toBeUndefined()
    // Engagement counts from the knowledge feed are dropped at build (the data file keeps them).
    expect(text.match(/\d[\d.,]*\s*万?\s*(?:赞|浏览|转发)|\d[\d.,]*\s*(?:likes|views)\b/i)?.[0], `${file} shows an engagement count`).toBeUndefined()
  }
  // The home pages show no corpus block and none of its numbers.
  for (const file of ['dist/index.html', 'dist/zh/index.html', 'dist/en/index.html']) {
    const main = new JSDOM(await readFile(file, 'utf8')).window.document.querySelector('main')!
    expect(main.querySelector('.corpus-section, [data-figure], .hero, .stat'), file).toBeNull()
    expect(main.textContent, file).not.toContain(String(corpus.corpusCount ?? 441))
    expect(main.textContent, file).not.toContain('441')
  }
  for (const slug of ['learn-from-matt', 'about-and-copyright']) for (const lang of ['zh', 'en']) expect((await app.request(`/${lang}/${slug}`)).status, `${lang}/${slug}`).toBe(404)
})

// The site notice is said once: on the licences page (HTML and its .md twin), next to the MIT texts.
// Every other built text (pages, .md twins, llms.txt, llms-full.txt, index.md) carries none of it.
it('the site notice appears once, on the licences page and its twin, next to the MIT texts', async () => {
  const notices = {
    zh: '本站是非官方、非商业的学习整理，与 Matt Pocock 无隶属或背书关系。引文和链接的作品版权归原作者；本站解读不代表原作者观点，原话与语境以原文为准。',
    en: 'Unofficial, non-commercial study notes, not affiliated with or endorsed by Matt Pocock. Quoted and linked works belong to their authors; our reading is not their view, and the originals are authoritative.',
  }
  const mit = await readFile('third_party/mattpocock-skills/LICENSE', 'utf8')
  for (const lang of ['zh', 'en'] as const) {
    expect(siteNotice(lang)).toBe(notices[lang])
    const document = new JSDOM(await readFile(`dist/${lang}/licenses/index.html`, 'utf8')).window.document
    const page = document.querySelector('.licenses-page')!
    expect(page.querySelector('.licenses-note')!.textContent).toBe(notices[lang])
    expect(document.body.textContent!.split(notices[lang]).length - 1, `${lang}/licenses/index.html`).toBe(1)
    expect(page.textContent).toContain(mit.trimEnd())
    const twin = await readFile(`dist/${lang}/licenses.md`, 'utf8')
    expect(twin.split(notices[lang]).length - 1, `${lang}/licenses.md`).toBe(1)
    expect(twin).toContain(mit.trimEnd())
  }
  // Generated agent texts only (dist/font-licenses/*.txt are the fonts' own licence files).
  const texts = (await walk('dist', '')).filter(file => /\.md$|\/llms(?:-full)?\.txt$/.test(file) && !/\/licenses\.md$/.test(file))
  expect(texts).toEqual(expect.arrayContaining(['dist/llms.txt', 'dist/llms-full.txt', 'dist/zh/llms.txt', 'dist/zh/llms-full.txt', 'dist/zh/index.md', 'dist/en/knowledge.md']))
  for (const file of texts) {
    // Licence texts quoted in fences are legal text, not our notice (the OFL says "endorse").
    const prose = (await readFile(file, 'utf8')).replace(/```text\n[\s\S]*?\n```/g, '')
    expect(prose.match(disclaimerPattern)?.[0], `${file} repeats the site notice`).toBeUndefined()
  }
})

// Home: search box on top, then "what to learn today" (each item opens the entry it names), then the
// notes index; nothing else in <main> besides the copy line.
it('home pages lead with search and what to learn today, then the notes', async () => {
  for (const [file, lang] of [['dist/zh/index.html', 'zh'], ['dist/en/index.html', 'en'], ['dist/index.html', 'zh']] as const) {
    const doc = new JSDOM(await readFile(file, 'utf8')).window.document
    const home = doc.querySelector('main .home')!
    expect([...home.children].map(node => node.className.split(' ')[0]), file).toEqual(['site-search', 'today', 'home-notes', 'agent-copy'])
    const input = home.querySelector<HTMLInputElement>('form[role="search"] input[type="search"]')!
    expect(input.getAttribute('aria-label'), file).toBe(lang === 'zh' ? '搜索' : 'Search')
    expect(home.querySelector('.today h1')!.textContent, file).toBe(lang === 'zh' ? '今天学什么' : 'What to learn today')
    const items = [...home.querySelectorAll('.today li')]
    expect(items.length, file).toBeGreaterThan(0)
    for (const item of items) {
      const link = item.querySelector('h2 a')!
      expect(link.getAttribute('href'), file).toMatch(new RegExp(`^/${lang}/methods/[a-z0-9-]+$`))
    }
    // Every note page; the corpus index sits in the header navigation.
    expect(home.querySelectorAll('.home-notes a').length, file).toBe(model.pages.filter(p => p.lang === lang && p.slug !== 'corpus').length)
  }
})

// The static search index: one file per language, built from the same learning source as the home
// page, found on the same origin (no CSP change) and only fetched when the box is used.
it('builds a per-language search index that finds Chinese and English entries without word breaks', async () => {
  const zh: SearchItem[] = JSON.parse(await readFile('dist/search/zh.json', 'utf8'))
  const en: SearchItem[] = JSON.parse(await readFile('dist/search/en.json', 'utf8'))
  expect(zh.some(item => item.kind === 'step') && zh.some(item => item.kind === 'note')).toBe(true)
  expect(en.every(item => !/[\u3000-\u9fff]/.test(item.title + item.text)), 'English index has no Chinese text').toBe(true)
  // A Chinese title fragment from the middle of a word is found; so is an English word.
  const entry = zh.find(item => item.kind === 'overview')!
  const fragment = [...entry.title].slice(1, 4).join('')
  expect(searchItems(zh, fragment).map(item => item.href)).toContain(entry.href)
  expect(searchItems(en, 'review').some(item => item.href === '/en/review-and-pr')).toBe(true)
  expect(searchItems(zh, 'zzqqxx 不存在的词')).toEqual([])
  for (const item of [...zh, ...en]) expect(item.href, item.title).toMatch(/^\/(zh|en)\//)
  for (const item of zh) expect((item.title + item.text).match(/\d[\d.,]*\s*万?\s*(?:赞|浏览|转发)/)?.[0], item.href).toBeUndefined()
  const head = new JSDOM(await readFile('dist/zh/index.html', 'utf8')).window.document
  expect(head.querySelector('link[href^="/search/"]'), 'the index is not preloaded').toBeNull()
  expect((await app.request('/search/zh.json')).status).toBe(200)
})

// The launch check: every built page shows only content, titles, navigation, search, the copy line
// and the footer licences link. Anything else is listed by scripts/audit/non-content-text.mjs.
it('no built page shows non-content text', async () => {
  const report = await auditSite('dist')
  expect(Object.keys(report).length).toBeGreaterThan(40)
  expect(Object.fromEntries(Object.entries(report).filter(([, items]) => items.length))).toEqual({})
}, 60000)
