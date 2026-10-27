import { mkdtemp, readFile, rm, writeFile, mkdir, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, describe, beforeAll, afterAll } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { Site } from '../src/Site'
import { marked, type Tokens } from 'marked'
import { buildContent, codespanHtml, disclaimerPattern, readPages, renderMarkdown } from '../scripts/content'
import registry from '../data/figures.json'
import { siteUrl } from '../src/lib/site'
import type { Page } from '../src/lib/content'
import { licences, licenceText } from '../scripts/licences.mjs'

// One content build is shared by every test in this file that reads the real pages; building is
// the slow part, so it runs once. Hooks keep Vitest's default timeout.
let output = ''
let pages: Page[] = []
beforeAll(async () => {
  output = await mkdtemp(join(tmpdir(), 'study-content-'))
  pages = await buildContent('content', output)
})
afterAll(async () => { if (output) await rm(output, { recursive: true, force: true }) })

// The page export test reads headings from a full jsdom document, exactly as before. These cases
// come from review: a parse5 tree walk missed a second h1 inside <noscript> (parse5 defaults to
// scripting enabled, jsdom does not) and dropped text inside an SVG <template>.
const pageDocument = (html: string) => new JSDOM(html).window.document
it('page heading check counts an h1 inside <noscript>', () => {
  expect(pageDocument('<h1>T</h1><noscript><h1>X</h1></noscript>').querySelectorAll('h1')).toHaveLength(2)
})
it('page heading check keeps text inside an SVG <template>', () => {
  expect(pageDocument('<h1>T<svg><template>X</template></svg></h1>').querySelector('h1')!.textContent).toBe('TX')
})

it('exports every present page with absolute indexes and readable components', async () => {
  expect(pages).toHaveLength(44)
  expect(JSON.parse(await readFile(join(output, 'content.json'), 'utf8'))).toEqual(pages)
  for (const lang of ['en', 'zh']) {
    const base = lang === 'en' ? output : join(output, lang)
    const index = await readFile(join(base, 'llms.txt'), 'utf8')
    const full = await readFile(join(base, 'llms-full.txt'), 'utf8')
    expect(index).toContain('\n## ')
    expect(index).toMatch(/^# .+\n\n> /)
    for (const page of pages.filter(item => item.lang === lang)) {
      expect(index).toContain(`${siteUrl()}/${lang}/${page.slug}.md`)
      expect(index).toContain(page.summary)
      expect(full).toContain(page.markdown)
      const markdown = await readFile(join(output, lang, `${page.slug}.md`), 'utf8')
      expect(markdown).toBe(`# ${page.title}\n\n${page.summary}\n\n${page.markdown}`)
      const model = { pages, currentPage: page, figures: { zh: {}, en: {} }, corpusCount: 0, corpusItems: [], corpusTags: [], siteUrl: siteUrl() }
      const doc = pageDocument(renderToString(createElement(Site, { model, path: `/${lang}/${page.slug}` })))
      expect(doc.querySelectorAll('h1')).toHaveLength(1)
      expect(doc.querySelector('h1')!.textContent).toBe(page.title)
      expect(markdown).not.toContain('slug:')
      expect(markdown).not.toMatch(/```(?:quote|cards|exercise|figure|note)/)
    }
  }
})

// Inline code is escaped first and only gains markup: <wbr> after "/" between path segments and a
// span keeping " }" together. Neither adds text, so the copied text is the source text.
it('inline code markup adds break points without adding text or unescaped HTML', () => {
  expect(codespanHtml('skills/productivity/teach/SKILL.md')).toBe('<code>skills/<wbr>productivity/<wbr>teach/<wbr>SKILL.md</code>')
  expect(codespanHtml('{ seats: 3 }')).toBe('<code>{ seats: 3<span class="code-keep"> }</span></code>')
  for (const text of ['skills/productivity/teach/SKILL.md', '{ seats: "3" }', 'https://example.com/a/b/', '//x//', 'a & b/c\'d"e', '</code><b>x</b>', '<span class="code-keep"> }</span>', '<wbr>/&lt;']) {
    const body = new JSDOM(`<p>${codespanHtml(text)}</p>`).window.document.body
    expect(body.textContent, text).toBe(text)
    expect(body.querySelectorAll('code'), text).toHaveLength(1)
    const elements = [...body.querySelectorAll('code *')]
    expect(elements.every(el => (el.tagName === 'WBR' && !el.attributes.length) || (el.tagName === 'SPAN' && el.getAttributeNames().join() === 'class' && el.className === 'code-keep' && !el.children.length)), text).toBe(true)
    expect(elements.filter(el => el.tagName === 'WBR').every(wbr => wbr.previousSibling?.textContent?.endsWith('/')), text).toBe(true)
  }
})

it('break points in inline code change neither the copied text nor the .md and llms-full exports', async () => {
  let markedUp = 0
  for (const page of pages) {
    const exported = new Set<string>()
    marked.walkTokens(marked.lexer(page.markdown), token => { if (token.type === 'codespan') exported.add((token as Tokens.Codespan).text) })
    for (const code of pageDocument(page.html).querySelectorAll(':not(pre) > code')) {
      if (!code.querySelector('wbr, .code-keep')) continue
      markedUp++
      expect(exported, `${page.lang}/${page.slug}`).toContain(code.textContent)
    }
  }
  expect(markedUp).toBeGreaterThan(0)
  for (const lang of ['en', 'zh'] as const) {
    const base = lang === 'en' ? output : join(output, lang)
    const exports = [await readFile(join(base, 'llms-full.txt'), 'utf8'), ...await Promise.all(pages.filter(page => page.lang === lang).map(page => readFile(join(output, lang, `${page.slug}.md`), 'utf8')))]
    for (const text of exports) expect(text).not.toMatch(/<wbr|code-keep/)
    const foundations = await readFile(join(output, lang, 'typescript-foundations.md'), 'utf8')
    expect(foundations).toContain('`{ seats: number }`')
    expect(exports[0]).toContain('`{ seats: number }`')
  }
  const html = pages.find(page => page.lang === 'en' && page.slug === 'typescript-foundations')!.html
  const code = [...pageDocument(html).querySelectorAll('code')].find(el => el.textContent === '{ seats: number }')!
  expect(code.querySelectorAll('.code-keep')).toHaveLength(1)
})

// Rule, checked on the rendered page rather than through the build's own helper: an inline <svg>
// whose class list has an arch-* class was generated by Archify and embeds Archify CSS.
const embedsArchifyDiagram = (document: Document) => [...document.querySelectorAll('svg')].some(svg => [...svg.classList].some(name => name.startsWith('arch-')))

it('every page that cites a reused MIT source or embeds Archify CSS ships that source\'s full licence text in its exports, not on the page', async () => {
  // Each page is parsed once (head + body for the Archify rule, body text for the licence check) and
  // each file is read once; the assertions below are unchanged.
  const licenceFiles = Object.fromEntries(await Promise.all(Object.entries(licences).map(async ([id, entry]) => [id, await readFile(entry.file, 'utf8')] as const)))
  const bundles = { en: await readFile(join(output, 'llms-full.txt'), 'utf8'), zh: await readFile(join(output, 'zh', 'llms-full.txt'), 'utf8') }
  const parsed = new Map(pages.map(page => [page, {
    embeds: embedsArchifyDiagram(pageDocument(page.headHtml + page.html)),
    body: pageDocument(page.headHtml + page.html).body.textContent ?? '',
  }]))
  // A page cites a reused MIT source when it states that source's copyright line (the notice every
  // adaptation carries). Pages that only link or describe an MIT repository reuse nothing.
  // A page also reuses Archify when its body or head embeds an Archify diagram.
  const required = new Set<string>()
  for (const page of pages) {
    const source = await readFile(`content/${page.lang}/${page.slug}.md`, 'utf8')
    const { embeds: pageEmbeds } = parsed.get(page)!
    for (const [id, entry] of Object.entries(licences)) {
      const text = licenceFiles[id]
      const copyrightLines = text.match(/^Copyright .*$/gm) ?? []
      expect(copyrightLines.length).toBeGreaterThan(0)
      // Any line that says it adapts this repository must also carry the notice.
      const adapts = source.split('\n').some(line => (line.includes(entry.repo) || line.includes('][skills]') && id === 'mattpocock-skills') && /改编|adapt/i.test(line))
      const states = copyrightLines.some(line => source.includes(line))
      if (adapts) expect(states, `${page.lang}/${page.slug} adapts ${id} without its copyright line`).toBe(true)
      const embeds = id === 'archify' && pageEmbeds
      if (!states && !embeds) continue
      required.add(`${page.lang}/${page.slug}:${id}`)
      expect(text.startsWith('MIT License\n\nCopyright ')).toBe(true)
      expect(text).toContain('The above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.')
      // HTML: the page itself shows no licence text; /licenses holds it (tests/static.test.tsx).
      // Downloads: single-page Markdown and the language bundle carry it too.
      const markdown = await readFile(join(output, page.lang, `${page.slug}.md`), 'utf8')
      // The complete text, trailing newline included, then: exactly once.
      expect(markdown, `${page.lang}/${page.slug}.md`).toContain(text)
      expect(markdown.split(text).length - 1, `${page.lang}/${page.slug}.md`).toBe(1)
      const bundle = bundles[page.lang]
      expect(bundle).toContain(text)
      // ...and inside this page's own section of the bundle.
      const at = bundle.indexOf(page.markdown)
      expect(at, `${page.lang}/${page.slug} in llms-full`).toBeGreaterThanOrEqual(0)
      expect(bundle.slice(at, at + page.markdown.length), `${page.lang}/${page.slug} in llms-full`).toContain(text)
    }
  }
  // The set comes from the rules above; cross-check the Archify part against a second rule taken
  // from the sources: every page whose head or body uses a figure the registry assigns to Archify
  // (owner "diagram") must be in it, and nothing else.
  const diagramIds = new Set(registry.figures.filter(figure => figure.owner === 'diagram').map(figure => figure.id))
  const usesDiagram = (await Promise.all(pages.map(async page => {
    const source = await readFile(`content/${page.lang}/${page.slug}.md`, 'utf8')
    const ids = [...source.matchAll(/^head:\s*(\S+)$|^id:\s*(\S+)$/gm)].map(match => match[1] ?? match[2])
    return ids.some(id => diagramIds.has(id)) ? `${page.lang}/${page.slug}` : null
  }))).filter(Boolean)
  expect(usesDiagram.length).toBeGreaterThan(0)
  const embedding = pages.filter(page => parsed.get(page)!.embeds).map(page => `${page.lang}/${page.slug}`)
  expect(embedding.sort()).toEqual(usesDiagram.sort())
  for (const page of embedding) expect(required.has(`${page}:archify`)).toBe(true)
  // No page body shows any licence text, whole or in part, and no page exports one it has no reason for.
  for (const page of pages) {
    const { body } = parsed.get(page)!
    expect(body, `${page.lang}/${page.slug} HTML shows a licence`).not.toContain('Permission is hereby granted')
    expect(page.html, `${page.lang}/${page.slug} HTML`).not.toContain('licence-text')
    for (const [id, text] of Object.entries(licenceFiles)) {
      for (const line of text.match(/^Copyright .*$/gm)!) expect(body.includes(`${line}\n`), `${page.lang}/${page.slug} HTML shows the ${id} licence`).toBe(false)
      if (!required.has(`${page.lang}/${page.slug}:${id}`)) expect(await readFile(join(output, page.lang, `${page.slug}.md`), 'utf8'), `${page.lang}/${page.slug} has an unexplained ${id} licence`).not.toContain(text)
    }
  }
})

it('keeps the per-page licence notice and the closing disclaimer in the export but off the page', async () => {
  const source = '## Body\n\nKept [link][ref].\n\n## skills MIT notice\n\nAdapted from skills.\n\n```licence\nid: mattpocock-skills\n```\n\nUnofficial, non-commercial study notes. No affiliation.\n\n[ref]: https://example.org/\n'
  const result = await renderMarkdown(source, 'en')
  expect(result.toc.map(item => item.title)).toEqual(['Body'])
  expect(result.html).toContain('<a href="https://example.org/">link</a>')
  for (const hidden of ['skills MIT notice', 'Adapted from skills', 'Permission is hereby granted', 'Unofficial, non-commercial']) expect(result.html).not.toContain(hidden)
  for (const kept of ['## skills MIT notice', 'Adapted from skills.', licenceText('mattpocock-skills').trimEnd(), 'Unofficial, non-commercial study notes. No affiliation.']) expect(result.markdown).toContain(kept)
  // A disclaimer-like paragraph that is not the last block stays on the page.
  expect((await renderMarkdown('Unofficial, non-commercial notes first.\n\nThen more.\n', 'en')).html).toContain('Unofficial, non-commercial notes first.')
  // Every real page ends with the disclaimer the footer now carries, so the rule reaches all of them.
  for (const page of pages) {
    const source = await readFile(`content/${page.lang}/${page.slug}.md`, 'utf8')
    expect(disclaimerPattern.test(source.trimEnd().split('\n\n').at(-1)!), `${page.lang}/${page.slug} ends with the disclaimer`).toBe(true)
    expect(page.markdown.trimEnd().endsWith(source.trimEnd().split('\n\n').at(-1)!) || page.markdown.includes(source.trimEnd().split('\n\n').at(-1)!), `${page.lang}/${page.slug}.md keeps it`).toBe(true)
  }
})

it('licence text is fixed by hash and rejected when edited or unknown', async () => {
  expect(() => licenceText('nope')).toThrow(/Unknown licence id/)
  for (const [id, entry] of Object.entries(licences)) {
    const original = await readFile(entry.file, 'utf8')
    expect(licenceText(id)).toBe(original)
    // Same file, one changed year / one extra byte: the pinned hash must reject both.
    expect(() => licenceText(id, () => original.replace(/Copyright \(c\) (\d{4})/, (_, year) => `Copyright (c) ${Number(year) + 1}`))).toThrow(/Licence text changed/)
    expect(() => licenceText(id, () => original + ' ')).toThrow(/Licence text changed/)
  }
  await expect(renderMarkdown('```licence\nid: nope\n```', 'en')).rejects.toThrow(/Unknown licence id/)
})

describe('shared content contract', () => {
  it('renders all components and preserves their meaning in Markdown', async () => {
    const result = await renderMarkdown(`## A section

\`\`\`cards
- **First** An observable goal.
- **Second** Evidence of completion.
\`\`\`

<!-- compare -->
| Artifact | Purpose |
| --- | --- |
| Spec | Decisions |

\`\`\`quote
text: One short sentence.
author: Author
url: https://example.org/source
date: 2026-01-01
note: Context.
\`\`\`

\`\`\`exercise
title: Try a slice
- Test one path.
answer: Check the failure path too.
\`\`\`

\`\`\`figure
id: s06-tracer
\`\`\`

\`\`\`note
kind: inference
This is our inference.
\`\`\`

\`\`\`typescript
const x = 1;
\`\`\`
`, 'en')
    for (const fragment of ['key-cards', '<th scope="row">', 'punch-quote', '<details>', 'data-figure="s06-tracer"', '/art/s06-tracer.en.svg', '/art/s06-tracer.en-dark.svg', 'callout inference', 'code-window', 'data-copy']) expect(result.html).toContain(fragment)
    for (const fragment of ['- **First**', '> One short sentence.', 'Author', 'https://example.org/source', '2026-01-01', 'Figure:', '/art/s06-tracer.en.svg', 'Suggested approach', '**Our inference**']) expect(result.markdown).toContain(fragment)
    expect(result.toc).toEqual([{ id: 'a-section', title: 'A section' }])
  })
  it.each([
    ['quote', 'text: A sentence.\nauthor: Matt\ndate: 2026-01-01', /url/],
    ['quote', 'text: A sentence.\nauthor: Matt\nurl: javascript:alert(1)\ndate: 2026-01-01', /url/],
    ['figure', 'id: absent-figure', /Unknown figure/],
    ['cards', '- **Only** One item.', /2–4/],
    ['note', 'kind: invented\nText', /note kind/],
  ])('rejects malformed %s', async (kind, body, error) => {
    await expect(renderMarkdown(`\`\`\`${kind}\n${body}\n\`\`\``, 'en')).rejects.toThrow(error)
  })
  it('rejects invalid front matter and mismatched slug pairs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'study-contract-'))
    try {
      await mkdir(join(root, 'en')); await mkdir(join(root, 'zh'))
      await writeFile(join(root, 'en', 'broken.md'), '---\nslug: broken\n---\nText')
      await expect(readPages(root)).rejects.toThrow(/front matter/)
      await rm(join(root, 'en', 'broken.md'))
      await writeFile(join(root, 'en', 'learn-from-matt.md'), await readFile('content/en/learn-from-matt.md'))
      await expect(readPages(root)).rejects.toThrow(/same nonempty set/)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('keeps bilingual slugs, short paragraphs and valid figures and quotes', async () => {
    expect(pages.filter(p => p.lang === 'zh').map(p => p.slug).sort()).toEqual(pages.filter(p => p.lang === 'en').map(p => p.slug).sort())
    const ids = registry.figures.map(f => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const figure of registry.figures) {
      expect(figure.alt.zh.trim()).not.toBe(''); expect(figure.alt.en.trim()).not.toBe('')
      expect(figure.caption.zh.trim()).not.toBe(''); expect(figure.caption.en.trim()).not.toBe('')
      expect(figure.viewBox).toMatch(/^0 0 \d+ \d+$/)
    }
    for (const head of Object.values(registry.pageHeads)) if (head.type === 'figure') expect(ids).toContain(head.value)
    for (const lang of ['zh', 'en'] as const) for (const file of (await readdir(`content/${lang}`)).filter(file => file.endsWith('.md'))) {
      const source = (await readFile(`content/${lang}/${file}`, 'utf8')).replace(/^---\n[\s\S]*?\n---\n/, '')
      const checkLength = (text: string) => {
        const plain = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '')
        expect(lang === 'zh' ? [...plain].length : plain.trim().split(/\s+/).length, `${lang}/${file}: ${plain}`).toBeLessThanOrEqual(lang === 'zh' ? 110 : 55)
      }
      marked.walkTokens(marked.lexer(source), token => {
        if (token.type === 'paragraph') checkLength(token.text)
        if (token.type === 'code') {
          if (token.lang === 'figure') expect(ids).toContain(token.text.match(/^id:\s*(.*)$/m)?.[1])
          if (token.lang === 'quote') expect(token.text).toMatch(/^url: https?:\/\//m)
          if (['cards', 'exercise', 'note'].includes(token.lang ?? '')) for (const line of token.text.split('\n').filter(Boolean)) checkLength(line)
        }
      })
    }
  })
})
