import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { create } from 'fontkit'
import subsetFont from 'subset-font'
import { outputPath, writeOutput } from './output-path.mjs'

const require = createRequire(import.meta.url)
const fontsource = dirname(require.resolve('@fontsource/noto-sans-sc/package.json'))
export const fontWeights = [400, 700]
// scripts/ and server/ render labels into HTML (code toolbar, exercise headings, 404).
const roots = ['content', 'data', 'src', 'scripts', 'server', 'diagrams', 'public/art']
const extensions = new Set(['.md', '.json', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.svg', '.html'])

// Latin, shared punctuation and symbols continue to use the preceding Latin
// families/system fallback. Only CJK text is eligible to trigger Noto downloads.
// Script_Extensions, not Script: marks shared by kana (U+30FC ー, U+3099 ゙, U+309B ゛) are
// Script=Common but are Hiragana/Katakana by extension, and Noto covered them before.
// Shared with the browser coverage check (e2e/font-coverage.ts), which runs it in the page.
export const notoPattern = '[\\p{Script_Extensions=Han}\\p{Script_Extensions=Hiragana}\\p{Script_Extensions=Katakana}\\p{Script_Extensions=Hangul}\\p{Script_Extensions=Bopomofo}\\u3000-\\u303f\\uff00-\\uffef]'
const notoRegExp = new RegExp(notoPattern, 'u')
export function notoCharacter(character) {
  return notoRegExp.test(character)
}

// Source collection only decides which glyphs go into the subset; over-collecting is
// harmless. It reads literal characters, plus the parsed keys and strings of JSON files.
// Whether every character the built site actually renders is covered is checked in the browser (e2e/font-coverage.pw.ts), not here.
export async function collectCharacters(root = '.') {
  const characters = new Set()
  function add(text) {
    for (const character of text) if (notoCharacter(character)) characters.add(character)
  }
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = outputPath(directory, entry.name)
      if (entry.isDirectory()) await walk(file)
      else if (entry.isFile() && extensions.has(extname(file))) {
        const text = await readFile(file, 'utf8')
        add(text)
        // JSON data (the corpus the server pages and searches through) is shown as its
        // parsed values, which may be written as \u escapes. Collect keys and strings as parsed.
        if (extname(file) === '.json') JSON.parse(text, (key, value) => { add(key); if (typeof value === 'string') add(value); return value })
      }
    }
  }
  for (const directory of roots) await walk(outputPath(root, directory))
  return new Set([...characters].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)))
}

export function checkCoverage(buffer, characters, label = 'subset') {
  const font = create(buffer)
  const missing = [...characters].filter(character => !font.hasGlyphForCodePoint(character.codePointAt(0)))
  if (missing.length) throw new Error(`${label} cmap missing: ${missing.map(c => `U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(', ')}`)
}

function unicodeRange(characters) {
  return [...characters].map(c => `U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(',')
}

export async function buildFonts(root = '.', output = 'generated/fonts') {
  const characters = await collectCharacters(root)
  if (!characters.size) throw new Error('No CJK characters collected')
  const css = []
  let bytes = 0
  for (const weight of fontWeights) {
    // HarfBuzz (WASM) keeps GSUB/GPOS, so CJK punctuation spacing (halt/palt, used by
    // text-spacing-trim) and kerning survive. Coverage is then re-checked with fontkit.
    const source = await readFile(resolve(fontsource, `files/noto-sans-sc-chinese-simplified-${weight}-normal.woff2`))
    // preserveNameIds keeps the OFL licence description (13) and URL (14) in the name table.
    const buffer = Buffer.from(await subsetFont(source, [...characters].join(''), { targetFormat: 'woff2', preserveNameIds: [13, 14] }))
    checkCoverage(buffer, characters, `${weight}`)
    const file = `noto-sans-sc-${weight}.woff2`
    await writeOutput(output, file, buffer)
    bytes += buffer.length
    css.push(`@font-face {\n  font-family: 'Noto Sans SC';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url('./${file}') format('woff2');\n  unicode-range: ${unicodeRange(characters)};\n}`)
  }
  await writeOutput(output, 'noto-sans-sc.css', css.join('\n\n') + '\n')
  await writeOutput(output, 'OFL.txt', await readFile(resolve(fontsource, 'LICENSE')))
  console.log(`Noto Sans SC: ${characters.size} characters, ${fontWeights.length} WOFF2 files, ${bytes} bytes total.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildFonts()
  // Vite copies public assets so the distributed site includes the license.
  await writeOutput('public/fonts', 'OFL.txt', await readFile(resolve(fontsource, 'LICENSE')))
}
