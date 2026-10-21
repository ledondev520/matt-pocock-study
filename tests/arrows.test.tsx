import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { Arrow, arrowDirections, ArrowText } from '../src/Arrow'
import { renderArrows } from '../scripts/arrows'
import { renderMarkdown } from '../scripts/content'
import { buildContent } from '../scripts/content'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

it('renders each arrow as consistent SVG geometry with decorative or meaningful accessibility', () => {
  const shapes = new Set<string>()
  for (const [glyph, dir] of Object.entries(arrowDirections)) {
    const doc = new JSDOM(renderToStaticMarkup(<><Arrow dir={dir} /><Arrow dir={dir} label={glyph} /></>)).window.document
    const [decorative, meaningful] = doc.querySelectorAll('svg')
    expect(decorative.getAttribute('aria-hidden')).toBe('true')
    expect(decorative.hasAttribute('role')).toBe(false)
    expect(meaningful.getAttribute('role')).toBe('img')
    expect(meaningful.getAttribute('aria-label')).toBe(glyph)
    expect(meaningful.hasAttribute('aria-hidden')).toBe(false)
    for (const svg of [decorative, meaningful]) {
      for (const [name, value] of Object.entries({ viewBox: '0 0 16 16', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none', width: '1em', height: '1em' })) expect(svg.getAttribute(name)).toBe(value)
      expect(svg.textContent).toBe('')
    }
    shapes.add(decorative.querySelector('path')!.getAttribute('d')!)
  }
  expect(shapes.size).toBe(4)
  const text = new JSDOM(renderToStaticMarkup(<ArrowText>A → B ← C ↓ D ↗ E</ArrowText>)).window.document
  expect(text.body.textContent).toBe('A  B  C  D  E')
  expect(text.querySelectorAll('svg[role="img"]')).toHaveLength(4)
})

it('replaces rendered article arrows, including components, code and tables, but preserves Markdown', async () => {
  const source = 'A → B ← C ↓ D ↗ E\n\n`A → B`\n\n| Flow |\n| --- |\n| A → B |\n\n```cards\n- **A → B** Follow ↓\n- **C ← D** Open ↗\n```\n\n```note\nkind: tip\nA → B\n```\n'
  const { html, markdown } = await renderMarkdown(source, 'en')
  const doc = new JSDOM(html).window.document
  expect(doc.body.textContent).not.toMatch(/[←→↓↗]/)
  expect(doc.querySelectorAll('svg[role="img"][aria-label]')).toHaveLength(11)
  for (const glyph of Object.keys(arrowDirections)) expect(markdown).toContain(glyph)
  expect(markdown).toContain('`A → B`')
  expect(markdown).not.toContain('<svg')
})

it('leaves attributes intact and isolates SVG text symbols from the CJK webfont', () => {
  const html = renderArrows('<a href="/en/example?arrow=→" title="A → B">A → B</a><svg><text>A → B<tspan>↓</tspan></text><desc>A → B</desc></svg>')
  const doc = new JSDOM(html).window.document
  expect(doc.querySelector('a')!.getAttribute('href')).toBe('/en/example?arrow=→')
  expect(doc.querySelector('a')!.textContent).toBe('A  B')
  const arrows = [...doc.querySelectorAll('text tspan[font-family]')]
  expect(arrows.map(n => n.textContent)).toEqual(['→', '↓'])
  for (const arrow of arrows) expect(arrow.getAttribute('font-family')).toBe('system-ui, sans-serif')
  expect(doc.querySelector('desc')!.textContent).toBe('A → B')
})

it('preserves all four characters in .md, llms.txt and llms-full.txt exports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'arrow-exports-'))
  const arrows = 'A ← B → C ↓ D ↗ E'
  try {
    for (const lang of ['zh', 'en']) {
      await mkdir(join(root, 'content', lang), { recursive: true })
      await writeFile(join(root, 'content', lang, 'arrows.md'), `---\nslug: arrows\nnumber: 1\norder: 1\nsection: start\ntitle: ${arrows}\nsubtitle: ${arrows}\nsummary: ${arrows}\nhead: card\nupdated: 2026-10-21\n---\n\n${arrows}\n`)
    }
    const pages = await buildContent(join(root, 'content'), join(root, 'out'))
    for (const page of pages) {
      expect(new JSDOM(page.html).window.document.body.textContent).not.toMatch(/[←→↓↗]/)
      const base = page.lang === 'en' ? join(root, 'out') : join(root, 'out', 'zh')
      for (const file of [join(root, 'out', page.lang, 'arrows.md'), join(base, 'llms.txt'), join(base, 'llms-full.txt')]) {
        const exported = await readFile(file, 'utf8')
        expect(exported).toContain(arrows)
        expect(exported).not.toContain('<svg')
      }
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
