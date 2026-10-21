import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildFonts, checkCoverage, checkDist, checkFonts, collectCharacters, fontWeights } from '../scripts/fonts.mjs'

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
    await expect(checkFonts('.', output)).resolves.toBeUndefined()
    const css = await readFile(join(output, 'noto-sans-sc.css'), 'utf8')
    expect(css.match(/@font-face/g)).toHaveLength(2)
    expect(css.match(/font-family: 'Noto Sans SC'/g)).toHaveLength(2)
    expect(css.match(/font-display: swap/g)).toHaveLength(2)
    expect(css.match(/unicode-range:/g)).toHaveLength(2)
    for (const character of characters) expect(css).toContain(`U+${character.codePointAt(0)!.toString(16).toUpperCase()}`)
    expect([...characters].every(character => character.codePointAt(0)! > 127)).toBe(true)
  })

  it('collects both languages, client corpus data, UI escapes, diagrams and SVG text', async () => {
    const root = join(temporary, 'inputs')
    const files = {
      'content/zh/page.md': '中',
      'content/en/page.md': '英 &#x6587;',
      'data/corpus-index.json': '{"summary":{"zh":"\\u8bed","en":"料"}}',
      'src/ui.tsx': 'const text = "\\u754c"; const view = <span>面</span>; const message = `\\u663e${text}示`;',
      'src/style.css': '.example::after { content: "\\5f0f "; }',
      'scripts/render.tsx': 'const label = lang === "zh" ? "复" : "Copy";',
      'server/app.ts': 'const notFound = "找";',
      'diagrams/src/example.json': '{"label":"图"}',
      'public/art/example.svg': '<svg xmlns="http://www.w3.org/2000/svg"><text>画&#x5b57;</text></svg>',
    }
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(root, path, '..'), { recursive: true })
      await writeFile(join(root, path), content)
    }
    expect(await collectCharacters(root)).toEqual(new Set([...'中英文语料界面显示式复找图画字']))
  })

  it('rejects a Han character added to temporary content after generation (mutation)', async () => {
    const root = join(temporary, 'mutation')
    for (const directory of ['content/zh', 'content/en', 'data', 'src', 'scripts', 'server', 'diagrams', 'public/art']) {
      await mkdir(join(root, directory), { recursive: true })
    }
    const file = join(root, 'content/zh/page.md')
    await writeFile(file, '中文')
    await expect(checkFonts(root, output)).resolves.toBeUndefined()
    const characters = await collectCharacters()
    // Find an unused BMP Han, rather than relying on a permanently rare fixture.
    let code = 0x4e00
    while (characters.has(String.fromCodePoint(code))) code++
    const added = String.fromCodePoint(code)
    expect(added).toMatch(/\p{Script=Han}/u)
    await writeFile(file, `中文${added}`)
    for (const weight of fontWeights) {
      const font = await readFile(join(output, `noto-sans-sc-${weight}.woff2`))
      expect(() => checkCoverage(font, new Set([added]))).toThrow(`U+${code.toString(16).toUpperCase()}`)
    }
    await expect(checkFonts(root, output)).rejects.toThrow(/cmap missing/)
  })

  it('generates byte-identical fonts and CSS from the same inputs', async () => {
    const second = join(temporary, 'repeated')
    await buildFonts('.', second)
    for (const name of ['noto-sans-sc-400.woff2', 'noto-sans-sc-700.woff2', 'noto-sans-sc.css', 'OFL.txt']) {
      expect(await readFile(join(second, name))).toEqual(await readFile(join(output, name)))
    }
  }, 30_000)

  it('fails the post-build check when shipped output contains a character outside the subset (mutation)', async () => {
    const dist = join(temporary, 'dist')
    await mkdir(join(dist, 'zh'), { recursive: true })
    // Labels rendered by scripts/ (code toolbar, exercise heading) must be covered too.
    await writeFile(join(dist, 'zh', 'index.html'), '<button>复制</button><span>动手练习</span>')
    await expect(checkDist(dist, output)).resolves.toBeGreaterThan(0)
    const characters = await collectCharacters()
    let code = 0x4e00
    while (characters.has(String.fromCodePoint(code))) code++
    await writeFile(join(dist, 'zh', 'extra.json'), JSON.stringify({ title: String.fromCodePoint(code) }))
    await expect(checkDist(dist, output)).rejects.toThrow(`U+${code.toString(16).toUpperCase()}`)
  })
})
