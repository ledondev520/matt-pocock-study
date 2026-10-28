import { readdir, readFile, rm } from 'node:fs/promises'
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

// Fallback (option A): the full Fontsource Noto Sans SC slices, self-hosted next to the
// subset. Each slice keeps its upstream file but its unicode-range is cut down to Noto
// characters (notoPattern) that the subset does not contain, so a character the subset has
// can never trigger a slice download, and English pages (arrows etc. are not notoPattern)
// still never request Noto. A character outside the subset (rare text, or one the
// chinese-simplified source lacks) is fetched from its slice on demand by unicode-range.
function parseRange(range) {
  const codes = []
  for (const part of range.split(',')) {
    const match = /^U\+([0-9a-f]+)(?:-([0-9a-f]+))?$/i.exec(part.trim())
    if (!match) throw new Error(`Bad unicode-range part: ${part}`)
    const start = parseInt(match[1], 16)
    const end = match[2] ? parseInt(match[2], 16) : start
    for (let code = start; code <= end; code++) codes.push(code)
  }
  return codes
}

function formatRange(codes) {
  const sorted = [...codes].sort((a, b) => a - b)
  const parts = []
  for (let i = 0; i < sorted.length; i++) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    const hex = code => code.toString(16).toUpperCase()
    parts.push(i === j ? `U+${hex(sorted[i])}` : `U+${hex(sorted[i])}-${hex(sorted[j])}`)
    i = j
  }
  return parts.join(',')
}

export async function fallbackSlices(subsetCodes) {
  const ranges = JSON.parse(await readFile(resolve(fontsource, 'unicode.json'), 'utf8'))
  const slices = []
  for (const [key, range] of Object.entries(ranges)) {
    const id = /^\[(\d+)\]$/.exec(key)?.[1]
    if (!id) continue // cyrillic, vietnamese, latin(-ext): never Noto characters on this site
    const codes = parseRange(range).filter(code => notoCharacter(String.fromCodePoint(code)) && !subsetCodes.has(code))
    if (codes.length) slices.push({ id: Number(id), codes })
  }
  return slices.sort((a, b) => a.id - b.id)
}

function fontFace(weight, file, range) {
  return `@font-face {\n  font-family: 'Noto Sans SC';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url('./${file}') format('woff2');\n  unicode-range: ${range};\n}`
}

export async function buildFonts(root = '.', output = 'generated/fonts') {
  const characters = await collectCharacters(root)
  if (!characters.size) throw new Error('No CJK characters collected')
  const fallbackCss = []
  const subsetCss = []
  let bytes = 0
  let fallbackFiles = 0
  let subsetSize = 0
  // Drop slice files from an earlier build so the output only holds what the CSS references.
  for (const entry of await readdir(outputPath(output), { withFileTypes: true }).catch(() => [])) {
    if (entry.isFile() && /^noto-sans-sc-fallback-\d+-\d+\.woff2$/.test(entry.name)) await rm(outputPath(output, entry.name))
  }
  for (const weight of fontWeights) {
    // HarfBuzz (WASM) keeps GSUB/GPOS, so CJK punctuation spacing (halt/palt, used by
    // text-spacing-trim) and kerning survive. Coverage is then re-checked with fontkit.
    const source = await readFile(resolve(fontsource, `files/noto-sans-sc-chinese-simplified-${weight}-normal.woff2`))
    const sourceFont = create(source)
    // Collected characters the chinese-simplified source lacks go to the fallback slices.
    const inSubset = new Set([...characters].filter(character => sourceFont.hasGlyphForCodePoint(character.codePointAt(0))))
    const outside = [...characters].filter(character => !inSubset.has(character))
    // preserveNameIds keeps the OFL licence description (13) and URL (14) in the name table.
    const buffer = Buffer.from(await subsetFont(source, [...inSubset].join(''), { targetFormat: 'woff2', preserveNameIds: [13, 14] }))
    checkCoverage(buffer, inSubset, `${weight}`)
    const file = `noto-sans-sc-${weight}.woff2`
    await writeOutput(output, file, buffer)
    bytes += buffer.length
    subsetSize = Math.max(subsetSize, inSubset.size)
    const subsetCodes = new Set([...inSubset].map(character => character.codePointAt(0)))
    const slices = await fallbackSlices(subsetCodes)
    const covered = new Set()
    for (const slice of slices) {
      const sliceFile = `noto-sans-sc-fallback-${slice.id}-${weight}.woff2`
      const sliceBuffer = await readFile(resolve(fontsource, `files/noto-sans-sc-${slice.id}-${weight}-normal.woff2`))
      const sliceFont = create(sliceBuffer)
      for (const character of outside) {
        const code = character.codePointAt(0)
        if (slice.codes.includes(code) && sliceFont.hasGlyphForCodePoint(code)) covered.add(character)
      }
      await writeOutput(output, sliceFile, sliceBuffer)
      fallbackFiles++
      fallbackCss.push(fontFace(weight, sliceFile, formatRange(slice.codes)))
    }
    // Fail closed: a collected character must be drawn by the subset or by a fallback slice.
    const uncovered = outside.filter(character => !covered.has(character))
    if (uncovered.length) throw new Error(`${weight} cmap missing (not in subset or any fallback slice): ${uncovered.map(c => `U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(', ')}`)
    // Same family and descriptors as the fallback faces. Ranges do not overlap; the subset
    // faces still come last because the last-defined matching face is tried first.
    subsetCss.push(fontFace(weight, file, unicodeRange(inSubset)))
  }
  const header = '/* Noto Sans SC: fallback slices first (characters outside the subset), subset faces last. */'
  await writeOutput(output, 'noto-sans-sc.css', [header, ...fallbackCss, ...subsetCss].join('\n\n') + '\n')
  await writeOutput(output, 'OFL.txt', await readFile(resolve(fontsource, 'LICENSE')))
  console.log(`Noto Sans SC: ${characters.size} characters collected, ${subsetSize} in the subset, ${fontWeights.length} subset WOFF2 files (${bytes} bytes), ${fallbackFiles} fallback slice files.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildFonts()
  // Vite copies public assets so the distributed site includes the license.
  await writeOutput('public/fonts', 'OFL.txt', await readFile(resolve(fontsource, 'LICENSE')))
}
