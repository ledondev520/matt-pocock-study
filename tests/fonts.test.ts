import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildFonts, checkCoverage, collectCharacters, fontWeights, notoCharacter } from '../scripts/fonts.mjs'

let temporary: string
let output: string
beforeAll(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'font-subset-'))
  output = join(temporary, 'fonts')
  await buildFonts('.', output)
}, 30_000)
afterAll(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }) })

describe('Noto Sans SC subsets', () => {
  it('covers every collected site character in both WOFF2 cmaps', async () => {
    const characters = await collectCharacters()
    expect(characters.size).toBeGreaterThan(1000)
    for (const weight of fontWeights) {
      const font = await readFile(join(output, `noto-sans-sc-${weight}.woff2`))
      expect(font.toString('ascii', 0, 4)).toBe('wOF2')
      // Well-formed WOFF2 header: declared length matches, padded to 4 bytes.
      expect(font.length % 4).toBe(0)
      expect(font.readUInt32BE(8)).toBe(font.length)
      expect(() => checkCoverage(font, characters, `${weight}`)).not.toThrow()
    }
    const css = await readFile(join(output, 'noto-sans-sc.css'), 'utf8')
    expect(css.match(/@font-face/g)).toHaveLength(2)
    expect(css.match(/font-family: 'Noto Sans SC'/g)).toHaveLength(2)
    expect(css.match(/font-display: swap/g)).toHaveLength(2)
    expect(css.match(/unicode-range:/g)).toHaveLength(2)
    for (const character of characters) expect(css).toContain(`U+${character.codePointAt(0)!.toString(16).toUpperCase()}`)
    expect([...characters].every(character => character.codePointAt(0)! > 127)).toBe(true)
  })

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
    // Escaped spellings are deliberately not decoded here: the browser gate catches anything
    // the site renders that the subset lacks (e2e/font-coverage.pw.ts).
  })

  it('generates byte-identical fonts and CSS from the same inputs', async () => {
    const second = join(temporary, 'repeated')
    await buildFonts('.', second)
    for (const name of ['noto-sans-sc-400.woff2', 'noto-sans-sc-700.woff2', 'noto-sans-sc.css', 'OFL.txt']) {
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
