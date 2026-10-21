import { mkdtemp, readFile, rm, writeFile, mkdir, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, describe } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { Site } from '../src/Site'
import { marked } from 'marked'
import { buildContent, readPages, renderMarkdown } from '../scripts/content'
import registry from '../data/figures.json'
import { siteUrl } from '../src/lib/site'

// One parser window, used only for each page's single heading; parsing all 44 full pages cost most of this test's time.
const htmlParser = new (new JSDOM('').window.DOMParser)()

it('exports every present page with absolute indexes and readable components', async () => {
  const output = await mkdtemp(join(tmpdir(), 'study-content-'))
  try {
    const pages = await buildContent('content', output)
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
        const html = renderToString(createElement(Site, { model, path: `/${lang}/${page.slug}` }))
        // Count every <h1 start tag in the server markup (stricter than a DOM query: comments and
        // raw-text content count too), then parse only the heading to read its text.
        const headings = [...html.matchAll(/<h1[\s>/][\s\S]*?<\/h1>/gi)]
        expect(html.match(/<h1[\s>/]/gi) ?? []).toHaveLength(1)
        expect(headings).toHaveLength(1)
        expect(htmlParser.parseFromString(headings[0][0], 'text/html').body.textContent).toBe(page.title)
        expect(markdown).not.toContain('slug:')
        expect(markdown).not.toMatch(/```(?:quote|cards|exercise|figure|note)/)
      }
    }
  } finally { await rm(output, { recursive: true, force: true }) }
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
    const pages = await readPages('content')
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
