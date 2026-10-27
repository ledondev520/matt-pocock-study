import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { create } from 'fontkit'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildFonts, checkCoverage, collectCharacters, fontWeights, notoCharacter } from '../scripts/fonts.mjs'
import { parseFontFaces, type NotoFace } from './font-faces'

const fontsource = dirname(createRequire(import.meta.url).resolve('@fontsource/noto-sans-sc/package.json'))
const roots = ['content', 'data', 'src', 'scripts', 'server', 'diagrams', 'public/art']
async function inputs(root: string, text: string) {
  for (const directory of roots) await mkdir(join(root, directory), { recursive: true })
  await writeFile(join(root, 'content/page.md'), text)
}
const hex = (character: string) => `U+${character.codePointAt(0)!.toString(16).toUpperCase()}`

let temporary: string
let output: string
beforeAll(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'font-subset-'))
  output = join(temporary, 'fonts')
  await buildFonts('.', output)
}, 30_000)
afterAll(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }) })

describe('Noto Sans SC subsets', () => {
  it('covers every collected site character: the subset cmap, or a fallback slice when the source font lacks it', async () => {
    const characters = await collectCharacters()
    expect(characters.size).toBeGreaterThan(1000)
    const css = await readFile(join(output, 'noto-sans-sc.css'), 'utf8')
    const faces = parseFontFaces(css, './')
    // Every @font-face is parsed, and each has the family, swap and a unicode-range.
    expect(faces.length).toBe(css.match(/@font-face/g)!.length)
    expect(css.match(/font-family: 'Noto Sans SC'/g)).toHaveLength(faces.length)
    expect(css.match(/font-display: swap/g)).toHaveLength(faces.length)
    expect(css.match(/unicode-range:/g)).toHaveLength(faces.length)
    const subsetFaces = faces.filter(face => face.kind === 'subset')
    expect(subsetFaces.map(face => face.weight)).toEqual(fontWeights)
    // The subset faces come last: the last-defined matching face is tried first.
    expect(faces.slice(-fontWeights.length)).toEqual(subsetFaces)
    for (const weight of fontWeights) {
      const font = await readFile(join(output, `noto-sans-sc-${weight}.woff2`))
      expect(font.toString('ascii', 0, 4)).toBe('wOF2')
      // Well-formed WOFF2 header: declared length matches, padded to 4 bytes.
      expect(font.length % 4).toBe(0)
      expect(font.readUInt32BE(8)).toBe(font.length)
      const source = create(await readFile(join(fontsource, `files/noto-sans-sc-chinese-simplified-${weight}-normal.woff2`)))
      // Every collected character the source font has is in the subset; only the rest falls back.
      const inSource = [...characters].filter(character => source.hasGlyphForCodePoint(character.codePointAt(0)!))
      const outside = [...characters].filter(character => !inSource.includes(character))
      expect(outside.length).toBeLessThan(20)
      expect(() => checkCoverage(font, inSource, `${weight}`)).not.toThrow()
      const subset = subsetFaces.find(face => face.weight === weight)!
      expect([...subset.codes].sort((a, b) => a - b)).toEqual(inSource.map(character => character.codePointAt(0)!))
      const fallbacks = faces.filter(face => face.kind === 'fallback' && face.weight === weight)
      expect(fallbacks.length).toBeGreaterThan(50)
      assertDisjoint(faces.filter(face => face.weight === weight))
      for (const face of fallbacks) {
        // Only Noto characters (English pages never request Noto) that the subset lacks.
        expect([...face.codes].filter(code => !notoCharacter(String.fromCodePoint(code))), face.file).toEqual([])
        // The slice file ships next to the CSS and is the unmodified Fontsource slice.
        expect(face.file).toBe(`noto-sans-sc-fallback-${face.slice}-${weight}.woff2`)
        expect(await readFile(join(output, face.file))).toEqual(await readFile(join(fontsource, `files/noto-sans-sc-${face.slice}-${weight}-normal.woff2`)))
      }
      for (const character of outside) {
        const face = fallbacks.find(f => f.codes.has(character.codePointAt(0)!))
        expect(face, hex(character)).toBeDefined()
        expect(create(await readFile(join(output, face!.file))).hasGlyphForCodePoint(character.codePointAt(0)!), hex(character)).toBe(true)
      }
    }
    // The output directory holds exactly the files the CSS references, plus the CSS and licence.
    expect((await readdir(output)).sort()).toEqual([...faces.map(face => face.file), 'OFL.txt', 'noto-sans-sc.css'].sort())
    expect([...characters].every(character => character.codePointAt(0)! > 127)).toBe(true)
  }, 60_000)

  it('falls back to the full Fontsource slice for a character the subset source lacks, never for subset characters', async () => {
    const root = join(temporary, 'fallback-inputs')
    // 丂 and 〜 are not in the chinese-simplified source but are in Fontsource slices [85]/[86].
    await inputs(root, '中文丂〜')
    const out = join(root, 'out')
    await buildFonts(root, out)
    const faces = parseFontFaces(await readFile(join(out, 'noto-sans-sc.css'), 'utf8'), './')
    for (const weight of fontWeights) {
      const own = faces.filter(face => face.weight === weight)
      assertDisjoint(own)
      const subset = own.find(face => face.kind === 'subset')!
      expect([...subset.codes].sort((a, b) => a - b)).toEqual([0x4e2d, 0x6587])
      for (const [character, slice] of [['丂', 85], ['〜', 86]] as const) {
        const face = own.find(f => f.codes.has(character.codePointAt(0)!))!
        expect(face.kind, character).toBe('fallback')
        expect(face.slice, character).toBe(slice)
      }
      // 中 and 文 are only in the subset face, so they never pull a slice.
      for (const character of '中文') expect(own.filter(f => f.codes.has(character.codePointAt(0)!)).map(f => f.kind)).toEqual(['subset'])
    }
  }, 30_000)

  it('fails closed on a collected character that neither the subset nor any fallback slice draws', async () => {
    const root = join(temporary, 'uncovered-inputs')
    // U+4E12 丒 is in no Noto Sans SC slice.
    await inputs(root, '中\u4e12')
    await expect(buildFonts(root, join(root, 'out'))).rejects.toThrow('U+4E12')
  }, 30_000)

  it('collects literal CJK from both languages, corpus data, UI, build/server labels, diagrams and SVG', async () => {
    const root = join(temporary, 'inputs')
    const files = {
      'content/zh/page.md': '中',
      'content/en/page.md': '英文',
      'data/corpus-index.json': '{"summary":{"zh":"语","en":"料"}}',
      'src/ui.tsx': 'const text = "界"; const view = <span>面</span>; const message = `显${text}示`;',
      'src/style.css': '.example::after { content: "式"; }',
      'scripts/render.tsx': 'const label = lang === "zh" ? "复" : "Copy";',
      'server/app.ts': 'const notFound = "找";',
      'diagrams/src/example.json': '{"label":"图"}',
      'public/art/example.svg': '<svg xmlns="http://www.w3.org/2000/svg"><text>画字</text></svg>',
    }
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(root, path, '..'), { recursive: true })
      await writeFile(join(root, path), content)
    }
    expect(await collectCharacters(root)).toEqual(new Set([...'中英文语料界面显示式复找图画字']))
    // Escaped spellings in source code are not decoded here: the browser gate catches anything
    // the site renders that the subset lacks (e2e/font-coverage.pw.ts).
  })

  it('collects corpus data as parsed, so records reached only by paging or search are in the subset', async () => {
    // A record the first page never shows, written with JSON escapes (key and value).
    const root = join(temporary, 'json-inputs')
    for (const directory of ['content', 'data', 'src', 'scripts', 'server', 'diagrams', 'public/art']) await mkdir(join(root, directory), { recursive: true })
    await writeFile(join(root, 'data/corpus-index.json'), '[{"summary":{"zh":"\\u4e02\\ud842\\udfb7"},"metrics":{"\\u4e03":1}}]')
    expect(await collectCharacters(root)).toEqual(new Set(['丂', '七', '\u{20BB7}']))
  })

  it('generates byte-identical fonts and CSS from the same inputs', async () => {
    const second = join(temporary, 'repeated')
    await buildFonts('.', second)
    const names = (await readdir(output)).sort()
    expect((await readdir(second)).sort()).toEqual(names)
    expect(names.filter(name => name.startsWith('noto-sans-sc-fallback-')).length).toBeGreaterThan(100)
    for (const name of names) {
      expect(await readFile(join(second, name))).toEqual(await readFile(join(output, name)))
    }
  }, 30_000)

  it('rejects a subset that lacks a collected character (cmap check used during generation)', async () => {
    const characters = await collectCharacters()
    let code = 0x4e00
    while (characters.has(String.fromCodePoint(code))) code++
    for (const weight of fontWeights) {
      const font = await readFile(join(output, `noto-sans-sc-${weight}.woff2`))
      expect(() => checkCoverage(font, new Set([String.fromCodePoint(code)]))).toThrow(`U+${code.toString(16).toUpperCase()}`)
    }
  })

  it('treats kana marks that are Script=Common but Hiragana/Katakana by extension as Noto characters', () => {
    // Covered by the previous Fontsource unicode-range; Script=Katakana alone misses them.
    for (const mark of ['ー', '\u3099', '゛']) expect(notoCharacter(mark)).toBe(true)
    for (const latin of ['A', '—', '→']) expect(notoCharacter(latin)).toBe(false)
  })

})

function assertDisjoint(faces: NotoFace[]) {
  const seen = new Map<number, string>()
  const overlaps: string[] = []
  for (const face of faces) for (const code of face.codes) {
    if (seen.has(code)) overlaps.push(`U+${code.toString(16).toUpperCase()} in ${face.file} and ${seen.get(code)}`)
    seen.set(code, face.file)
  }
  expect(overlaps).toEqual([])
}
