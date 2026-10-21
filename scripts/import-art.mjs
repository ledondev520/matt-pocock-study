import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'

const SVG = 'http://www.w3.org/2000/svg'
const XLINK = 'http://www.w3.org/1999/xlink'
const XMLNS = 'http://www.w3.org/2000/xmlns/'
const elements = new Set('svg g defs symbol use path rect circle ellipse line polyline polygon text tspan title desc linearGradient radialGradient stop clipPath mask pattern marker style'.split(' '))
const attributes = new Set(`id class role aria-label aria-labelledby aria-describedby aria-hidden viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points transform fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit opacity color style href font-family font-size font-weight font-style text-anchor dominant-baseline alignment-baseline letter-spacing textLength lengthAdjust dx dy rotate offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod fx fy fr clip-path clip-rule clipPathUnits mask maskUnits maskContentUnits patternUnits patternContentUnits patternTransform preserveAspectRatio marker-start marker-mid marker-end markerWidth markerHeight markerUnits refX refY orient overflow vector-effect`.split(/\s+/))
const localReference = /^#[A-Za-z_][\w:.-]*$/
function staticValue(value) {
  // Forbid CSS obfuscation and HTML raw-text breakouts before checking URLs.
  if (/\\|\/\*|@import|expression|<|\]\]>|(?:data|javascript)\s*:/i.test(value)) throw new Error('Unsafe SVG value')
  const remaining = value.replace(/url\(\s*(?:"(#[A-Za-z_][\w:.-]*)"|'(#[A-Za-z_][\w:.-]*)'|(#[A-Za-z_][\w:.-]*))\s*\)/gi, '')
  if (/url\s*\(/i.test(remaining)) throw new Error('Only local SVG URLs are allowed')
}

/** Validate a static SVG subset, then serialize a fresh tree for HTML embedding. */
export function validateSvg(source) {
  if (/<!\s*(?:ENTITY|DOCTYPE)|<\?|<!--/i.test(source)) throw new Error('SVG declarations, processing instructions and comments are forbidden')
  let window
  try { window = new JSDOM(source, { contentType: 'image/svg+xml' }).window }
  catch { throw new Error('Invalid SVG XML') }
  try {
    const document = window.document
    const root = document.documentElement
    if (root.localName !== 'svg' || root.namespaceURI !== SVG) throw new Error('Expected an SVG root')
    const output = document.implementation.createDocument(SVG, 'svg', null)
    function copy(node) {
      if (node.nodeType === 3 || node.nodeType === 4) {
        if (node.nodeType === 4 && node.textContent.includes('<')) throw new Error('Unsafe SVG CDATA')
        return output.createTextNode(node.textContent)
      }
      if (node.nodeType !== 1 || node.namespaceURI !== SVG || !elements.has(node.localName)) throw new Error('Forbidden SVG element or namespace')
      const clean = output.createElementNS(SVG, node.localName)
      for (const attr of node.attributes) {
        if (attr.namespaceURI === XMLNS) {
          if (!((attr.name === 'xmlns' && attr.value === SVG) || (attr.name === 'xmlns:xlink' && attr.value === XLINK))) throw new Error('Forbidden SVG namespace')
          continue
        }
        if (attr.namespaceURI && !(attr.namespaceURI === XLINK && attr.localName === 'href')) throw new Error('Forbidden attribute namespace')
        if (!attributes.has(attr.localName)) throw new Error(`Forbidden SVG attribute: ${attr.name}`)
        staticValue(attr.value)
        if (attr.localName === 'href' && !localReference.test(attr.value)) throw new Error('Only local SVG references are allowed')
        // Normalize xlink:href to SVG2 href; never preserve arbitrary prefixes.
        clean.setAttribute(attr.localName, attr.value)
      }
      if (node.localName === 'style') staticValue(node.textContent)
      for (const child of node.childNodes) clean.appendChild(copy(child))
      return clean
    }
    output.replaceChild(copy(root), output.documentElement)
    return new window.XMLSerializer().serializeToString(output.documentElement)
  } finally { window.close() }
}

export async function importArt(directory) {
  const { figures } = JSON.parse(await readFile('data/figures.json', 'utf8'))
  const ids = new Set(figures.filter(f => f.owner === 'art').map(f => f.id))
  const pending = []
  for (const file of (await readdir(directory)).sort()) {
    if (!file.endsWith('.svg')) continue
    const match = /^(.*)\.(zh|en)(-dark)?\.svg$/.exec(file)
    if (!match || !ids.has(match[1])) throw new Error(`Unknown art filename: ${basename(file)}`)
    const svg = validateSvg(await readFile(resolve(directory, file), 'utf8'))
    pending.push({ file, svg })
  }
  // Validate the complete batch before copying anything.
  await mkdir('public/art', { recursive: true })
  for (const { file, svg } of pending) await writeFile(`public/art/${file}`, svg)
  return pending.length
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: npm run import:art -- <directory>')
  console.log(`Imported ${await importArt(process.argv[2])} validated SVGs.`)
}
