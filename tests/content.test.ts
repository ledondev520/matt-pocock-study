import { mkdtemp, readFile, rm, writeFile, mkdir, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, describe, beforeAll, afterAll } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { Site } from '../src/Site'
import { marked } from 'marked'
import { buildContent, readPages, renderMarkdown } from '../scripts/content'
import registry from '../data/figures.json'
import { siteUrl } from '../src/lib/site'
import type { Page } from '../src/lib/content'
import { licences } from '../scripts/licences'

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

it('every page that cites a reused MIT source ships that source\'s full licence text', async () => {
  // A page cites a reused MIT source when it states that source's copyright line (the notice every
  // adaptation carries). Pages that only link or describe an MIT repository reuse nothing.
  const cited: string[] = []
  for (const page of pages) {
    const source = await readFile(`content/${page.lang}/${page.slug}.md`, 'utf8')
    for (const [id, entry] of Object.entries(licences)) {
      const copyrightLines = (await readFile(entry.file, 'utf8')).match(/^Copyright .*$/gm) ?? []
      expect(copyrightLines.length).toBeGreaterThan(0)
      // Any line that says it adapts this repository must also carry the notice.
      const adapts = source.split('\n').some(line => (line.includes(entry.repo) || line.includes('][skills]') && id === 'mattpocock-skills') && /改编|adapt/i.test(line))
      const states = copyrightLines.some(line => source.includes(line))
      if (adapts) expect(states, `${page.lang}/${page.slug} adapts ${id} without its copyright line`).toBe(true)
      if (!states) continue
      cited.push(`${page.lang}/${page.slug}:${id}`)
      const text = await readFile(entry.file, 'utf8')
      expect(text.startsWith('MIT License\n\nCopyright ')).toBe(true)
      expect(text).toContain('The above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.')
      // HTML: a licence section whose <pre> holds the exact text.
      const blocks = [...new JSDOM(page.html).window.document.querySelectorAll('.licence-text pre')].map(pre => pre.textContent)
      expect(blocks, `${page.lang}/${page.slug} HTML`).toContain(text)
      // Downloads: single-page Markdown and the language bundle carry it too.
      expect(await readFile(join(output, page.lang, `${page.slug}.md`), 'utf8'), `${page.lang}/${page.slug}.md`).toContain(text)
      expect(await readFile(join(page.lang === 'en' ? output : join(output, 'zh'), 'llms-full.txt'), 'utf8')).toContain(text)
    }
  }
  // Every page that reuses skills material (both languages) and the copyright page for Archify.
  expect(cited.sort()).toEqual(['about-and-copyright', 'agent-documents', 'cheat-sheets', 'context-and-handoff', 'learning-path', 'review-and-pr', 'writing-to-teach']
    .flatMap(slug => ['en', 'zh'].map(lang => `${lang}/${slug}:mattpocock-skills`))
    .concat(['en/about-and-copyright:archify', 'zh/about-and-copyright:archify']).sort())
})

it('licence text is fixed by hash and rejected when edited or unknown', async () => {
  const { licenceText } = await import('../scripts/licences')
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
