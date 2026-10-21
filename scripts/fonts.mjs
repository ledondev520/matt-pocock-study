import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { create } from 'fontkit'
import ts from 'typescript'
import { SaxesParser } from 'saxes'
import subsetFont from 'subset-font'
import { outputPath, writeOutput } from './output-path.mjs'

const require = createRequire(import.meta.url)
const fontsource = dirname(require.resolve('@fontsource/noto-sans-sc/package.json'))
export const fontWeights = [400, 700]
// scripts/ and server/ render labels into HTML (code toolbar, exercise headings, 404).
const roots = ['content', 'data', 'src', 'scripts', 'server', 'diagrams', 'public/art']
const extensions = new Set(['.md', '.json', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.svg'])

// Latin, shared punctuation and symbols continue to use the preceding Latin
// families/system fallback. Only CJK text is eligible to trigger Noto downloads.
export function notoCharacter(character) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u.test(character)
}

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
        // Conservative scan includes frontmatter, code examples and CSS content.
        add(text)
        add(text.replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => String.fromCodePoint(
          code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code),
        )))
        if (extname(file) === '.json') {
          add(JSON.stringify(JSON.parse(text))) // Decode escaped JSON (including corpus summaries).
        } else if (/\.[cm]?[jt]sx?$/.test(file)) {
          const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
          function visit(node) {
            if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddleOrTemplateTail(node) || ts.isJsxText(node)) add(node.text)
            ts.forEachChild(node, visit)
          }
          visit(source)
        } else if (extname(file) === '.svg') {
          const parser = new SaxesParser()
          parser.on('text', add)
          parser.on('cdata', add)
          parser.write(text).close()
        } else if (extname(file) === '.css') {
          add(text.replace(/\\([\da-f]{1,6})\s?/gi, (_, code) => String.fromCodePoint(parseInt(code, 16))))
        }
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

export async function checkFonts(root = '.', output = 'generated/fonts') {
  const characters = await collectCharacters(root)
  for (const weight of fontWeights) checkCoverage(await readFile(outputPath(output, `noto-sans-sc-${weight}.woff2`)), characters, `${weight}`)
}

// Post-build guard: every CJK character in the shipped HTML, JSON, SVG and JS must be in both subsets.
export async function checkDist(dist = 'dist', output = 'generated/fonts') {
  const characters = new Set()
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = outputPath(directory, entry.name)
      if (entry.isDirectory()) await walk(file)
      else if (/\.(html|json|svg|js|txt)$/.test(entry.name)) for (const character of await readFile(file, 'utf8')) if (notoCharacter(character)) characters.add(character)
    }
  }
  await walk(dist)
  for (const weight of fontWeights) checkCoverage(await readFile(outputPath(output, `noto-sans-sc-${weight}.woff2`)), characters, `${dist} ${weight}`)
  return characters.size
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
  if (process.argv.includes('--check')) await checkFonts()
  else if (process.argv.includes('--check-dist')) console.log(`Noto Sans SC: ${await checkDist()} built characters covered.`)
  else {
    await buildFonts()
    // Vite copies public assets so the distributed site includes the license.
    await writeOutput('public/fonts', 'OFL.txt', await readFile(resolve(fontsource, 'LICENSE')))
  }
}
