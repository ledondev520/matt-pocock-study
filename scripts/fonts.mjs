import { readdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { create } from 'fontkit'
import subsetFont from 'subset-font'
import { outputPath, writeOutput } from './output-path.mjs'

const require = createRequire(import.meta.url)
const fontsource = dirname(require.resolve('@fontsource-variable/source-sans-3/package.json'))
export const sourceFile = resolve(fontsource, 'files/source-sans-3-latin-wght-normal.woff2')
// scripts/ and server/ render labels into HTML (code toolbar, exercise headings, 404).
const roots = ['content', 'data', 'src', 'scripts', 'server', 'diagrams', 'public/art']
const extensions = new Set(['.md', '.json', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.svg', '.html'])

const cjk = /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}\p{Script_Extensions=Bopomofo}\u3000-\u303f\uff00-\uffef]/u
export const nonCjkCharacter = character => !cjk.test(character)

export async function collectCharacters(root = '.') {
  const characters = new Set()
  for (const [start, end] of [[0x20, 0x7e], [0xa0, 0xff], [0x2010, 0x2027], [0x2030, 0x203a], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x2190, 0x2193]]) {
    for (let code = start; code <= end; code++) characters.add(String.fromCodePoint(code))
  }
  function add(text) {
    for (const character of text) if (nonCjkCharacter(character)) characters.add(character)
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
  const source = await readFile(sourceFile)
  const font = create(source)
  const { min, max } = font.variationAxes.wght
  if (min !== 200 || max !== 900) throw new Error('Unexpected Source Sans 3 weight range')
  const characters = new Set([...(await collectCharacters(root))].filter(c => font.hasGlyphForCodePoint(c.codePointAt(0))))
  // Omitting variationAxes preserves the variable axis; HarfBuzz retains all layout features.
  const buffer = Buffer.from(await subsetFont(source, [...characters].join(''), { targetFormat: 'woff2', preserveNameIds: [13, 14] }))
  checkCoverage(buffer, characters)
  for (const entry of await readdir(outputPath(output), { withFileTypes: true }).catch(() => [])) {
    if (entry.isFile()) await rm(outputPath(output, entry.name))
  }
  const file = 'source-sans-3-latin-wght.woff2'
  await writeOutput(output, file, buffer)
  const subset = create(buffer)
  const range = unicodeRange(subset.characterSet.filter(code => subset.hasGlyphForCodePoint(code)).map(code => String.fromCodePoint(code)))
  await writeOutput(output, 'source-sans-3.css', `@font-face {
  font-family: 'Source Sans 3';
  font-style: normal;
  font-weight: ${min} ${max};
  font-display: swap;
  src: url('./${file}') format('woff2');
  unicode-range: ${range};
}\n`)
  console.log(`Source Sans 3: ${characters.size} characters, ${buffer.length} bytes.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildFonts()
