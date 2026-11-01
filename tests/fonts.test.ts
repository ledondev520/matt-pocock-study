import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { create } from 'fontkit'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildFonts, checkCoverage, collectCharacters, nonCjkCharacter, sourceFile } from '../scripts/fonts.mjs'
import { parseFontFaces } from './font-faces'

let temporary: string
let output: string
beforeAll(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'font-subset-'))
  output = join(temporary, 'fonts')
  await buildFonts('.', output)
}, 30_000)
afterAll(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }) })

const roots = ['content', 'data', 'src', 'scripts', 'server', 'diagrams', 'public/art']
async function inputs(name: string) {
  const root = join(temporary, name)
  for (const directory of roots) await mkdir(join(root, directory), { recursive: true })
  return root
}

describe('Source Sans 3 variable Latin subset', () => {
  it('covers all supported collected characters with exactly one precise swap WOFF2 face', async () => {
    const source = create(await readFile(sourceFile))
    const bytes = await readFile(join(output, 'source-sans-3-latin-wght.woff2'))
    const subset = create(bytes)
    const characters = await collectCharacters()
    const supported = [...characters].filter(c => source.hasGlyphForCodePoint(c.codePointAt(0)!))
    expect(() => checkCoverage(bytes, supported)).not.toThrow()
    expect(subset.characterSet.filter(code => subset.hasGlyphForCodePoint(code)).sort((a, b) => a - b)).toEqual(supported.map(c => c.codePointAt(0)!).sort((a, b) => a - b))
    expect(bytes.toString('ascii', 0, 4)).toBe('wOF2')
    expect(bytes.readUInt32BE(8)).toBe(bytes.length)
    expect(bytes.length % 4).toBe(0)
    const css = await readFile(join(output, 'source-sans-3.css'), 'utf8')
    const faces = parseFontFaces(css, './')
    expect(css.match(/@font-face/g)).toHaveLength(1)
    expect(css.match(/src:/g)).toHaveLength(1)
    expect(css.match(/url\(/g)).toHaveLength(1)
    expect(faces).toHaveLength(1)
    expect(faces[0]).toMatchObject({ family: 'Source Sans 3', weight: '200 900', file: 'source-sans-3-latin-wght.woff2' })
    expect(faces[0].codes).toEqual(new Set(subset.characterSet.filter(code => subset.hasGlyphForCodePoint(code))))
    expect(css).toContain('font-style: normal;')
    expect((await readdir(output)).sort()).toEqual(['source-sans-3-latin-wght.woff2', 'source-sans-3.css'])
  })

  it('preserves the source weight axis, licence names and functioning layout tables', async () => {
    const source = create(await readFile(sourceFile))
    const subset = create(await readFile(join(output, 'source-sans-3-latin-wght.woff2')))
    expect(source.variationAxes.wght).toMatchObject({ min: 200, max: 900 })
    expect(subset.variationAxes).toEqual(source.variationAxes)
    for (const key of ['license', 'licenseURL'] as const) {
      if (key === 'licenseURL') expect(source.name.records[key]).toBeDefined()
      expect(subset.name.records[key]).toEqual(source.name.records[key])
    }
    for (const table of ['GSUB', 'GPOS']) expect(subset.directory.tables[table]).toBeDefined()
    for (const text of ['AVATAR', 'office ffi']) {
      const layout = (font: typeof source) => font.layout(text).positions.map(p => [p.xAdvance, p.yAdvance, p.xOffset, p.yOffset])
      expect(layout(subset)).toEqual(layout(source))
    }
  })

  it('builds byte-identical fonts and CSS twice', async () => {
    const second = join(temporary, 'second')
    await buildFonts('.', second)
    expect(await readdir(second)).toEqual(await readdir(output))
    for (const name of await readdir(output)) expect(await readFile(join(second, name))).toEqual(await readFile(join(output, name)))
  }, 30_000)

  it('collects non-CJK from every source root and parses escaped JSON keys and values', async () => {
    const root = await inputs('collector')
    const markers = ['Ā', 'ā', 'Ă', 'ă', 'Ą', 'ą', 'Ć']
    for (const [i, directory] of roots.entries()) await writeFile(join(root, directory, `input.${['md', 'json', 'tsx', 'mjs', 'ts', 'json', 'svg'][i]}`), i === 1 || i === 5 ? JSON.stringify(markers[i] + '中文ー゛') : markers[i] + '中文ー゛')
    await writeFile(join(root, 'data/escaped.json'), '{"\\u0107":"\\u0108"}')
    const chars = await collectCharacters(root)
    for (const c of [...markers, 'ć', 'Ĉ']) expect(chars.has(c), c).toBe(true)
    for (const c of '中文ー゛') expect(chars.has(c), c).toBe(false)
    for (const [start, end] of [[0x20, 0x7e], [0xa0, 0xff], [0x2010, 0x2027], [0x2030, 0x203a], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x2190, 0x2193]]) {
      for (let code = start; code <= end; code++) expect(chars.has(String.fromCodePoint(code))).toBe(true)
    }
    for (const c of ['ー', '\u3099', '゛', '中', '한', 'ㄅ']) expect(nonCjkCharacter(c)).toBe(false)
    for (const c of ['A', '—', '→']) expect(nonCjkCharacter(c)).toBe(true)
  })

  it('collects CSS pseudo-element text and files in nested subdirectories', async () => {
    const root = await inputs('collector-nested')
    // Each marker appears in exactly one fixture file; expected values are explicit literals.
    await writeFile(join(root, 'src/style.css'), '.probe::after { content: "Ċ"; }\n') // U+010A
    for (const directory of ['content/zh', 'content/en', 'diagrams/src']) await mkdir(join(root, directory), { recursive: true })
    await writeFile(join(root, 'content/zh/nested.md'), 'ċ中文\n') // U+010B
    await writeFile(join(root, 'content/en/nested.md'), 'Č\n') // U+010C
    await writeFile(join(root, 'diagrams/src/nested.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="10">č</text></svg>\n') // U+010D
    const chars = await collectCharacters(root)
    for (const c of ['Ċ', 'ċ', 'Č', 'č']) expect(chars.has(c), c).toBe(true)
    for (const c of '中文') expect(chars.has(c), c).toBe(false)
  })

  it('allows unsupported characters to fall back but rejects missing supported subset glyphs', async () => {
    const root = await inputs('unsupported')
    await writeFile(join(root, 'content/page.md'), 'A\u{10ffff}中文')
    await expect(buildFonts(root, join(root, 'out'))).resolves.toBeUndefined()
    const bytes = await readFile(join(root, 'out/source-sans-3-latin-wght.woff2'))
    expect(() => checkCoverage(bytes, ['A'])).not.toThrow()
    const source = create(await readFile(sourceFile))
    const subset = create(bytes)
    const missing = source.characterSet.find(code => source.hasGlyphForCodePoint(code) && !subset.hasGlyphForCodePoint(code))!
    expect(missing).toBeDefined()
    expect(() => checkCoverage(bytes, [String.fromCodePoint(missing)])).toThrow(`U+${missing.toString(16).toUpperCase()}`)
    expect(subset.hasGlyphForCodePoint(0x10ffff)).toBe(false)
  })
})
