import { mkdtemp, mkdir, writeFile, rm, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import registry from '../data/figures.json'
import { validateSvg } from '../scripts/import-art.mjs'
import { figureHtml, buildFigures } from '../scripts/figures'

it('renders intentional placeholders with real dimensions and bilingual alternative text', async () => {
  const html = await figureHtml('spot-empty', 'en', '.cache/nonexistent-art-fixture')
  expect(html).toContain('aspect-ratio:800/500')
  expect(html).toContain('spot-empty · 800×500')
  expect(html).toContain('无结果时')
  expect(html).toContain('Try another keyword')
})
it('inlines themeable diagram SVGs and swaps illustrated artwork with a light fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'figure-assets-'))
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" class="fixture"><style>.fixture text{fill:var(--foreground)}</style><text>Original diagram</text></svg>'
  try {
    await mkdir(join(root, 'diagrams')); await mkdir(join(root, 'art'))
    await writeFile(join(root, 'diagrams/d02-failure-sort.en.svg'), svg)
    const inline = await figureHtml('d02-failure-sort', 'en', root)
    expect(inline).toContain('<svg'); expect(inline).toContain('var(--foreground)'); expect(inline).not.toContain('<img')
    await writeFile(join(root, 'art/spot-empty.zh.svg'), svg)
    const light = await figureHtml('spot-empty', 'zh', root)
    expect(light.match(/src="\/art\/spot-empty.zh.svg"/g)).toHaveLength(2)
    await writeFile(join(root, 'art/spot-empty.zh-dark.svg'), svg)
    const dark = await figureHtml('spot-empty', 'zh', root)
    expect(dark).toContain('class="art-dark" src="/art/spot-empty.zh-dark.svg"')
    await writeFile(join(root, 'art/s06-tracer.en.svg'), svg)
    expect(await figureHtml('s06-tracer', 'en', root)).not.toContain('tracer-panels')
    expect(await figureHtml('s06-tracer', 'zh', root)).toContain('tracer-panels')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it.each([
  '<set attributeName="href" to="javascript:alert(1)"/>',
  '<animate attributeName="href" values="javascript:alert(1)"/>',
  '<style><![CDATA[</style><img src="x" onerror="alert(1)">]]></style>',
  '<path xmlns="http://www.w3.org/1999/xhtml"/>',
  '<use href="data:image/svg+xml;base64,PHN2Zy8+"/>',
  '<use href="relative.svg"/>', '<?xml-stylesheet href="x.css"?>',
])('rejects unsafe SVG at the actual inline diagram boundary: %s', async inner => {
  const root = await mkdtemp(join(tmpdir(), 'unsafe-diagram-'))
  try {
    await mkdir(join(root, 'diagrams'))
    await writeFile(join(root, 'diagrams/d02-failure-sort.en.svg'), `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`)
    await expect(figureHtml('d02-failure-sort', 'en', root)).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
})


// The home hero figure and its six links were deleted in PR #8 (the home page has no figures now).
it('validates every shipped fallback/download SVG', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shipped-figures-'))
  try {
    expect(validateSvg(await readFile('public/favicon.svg', 'utf8'))).toContain('<svg')
    const result = await buildFigures(root)
    expect(await readdir(join(root, 'figures'))).toHaveLength(registry.figures.length * 2)
    for (const lang of ['zh', 'en'] as const) {
      for (const figure of registry.figures) {
        const source = await readFile(join(root, 'figures', `${figure.id}.${lang}.svg`), 'utf8')
        expect(validateSvg(source, { profile: figure.owner === 'diagram' ? 'diagram' : 'art', lang })).toContain('<svg')
        expect(result[lang][figure.id]).toBeTruthy()
      }
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
