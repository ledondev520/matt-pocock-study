import { readFile, readdir } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'
import { randomUUID } from 'node:crypto'
import { cssProperties, cssValue, cssDeclarations, cssStylesheet } from './svg-css.mjs'
import { validateFigureRegistry } from './figure-registry.mjs'
import { writeOutput } from './output-path.mjs'
import { existsSync } from 'node:fs'
import { archifySvgComment } from './licences.mjs'

let archifyComment

const SVG = 'http://www.w3.org/2000/svg'
const XLINK = 'http://www.w3.org/1999/xlink'
const XMLNS = 'http://www.w3.org/2000/xmlns/'
const elements = new Set('svg g defs symbol use path rect circle ellipse line polyline polygon text tspan title desc linearGradient radialGradient stop clipPath mask pattern marker style'.split(' '))
const attributes = new Set(`id class role aria-label aria-labelledby aria-describedby aria-hidden viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points transform fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit opacity color style href font-family font-size font-weight font-style text-anchor dominant-baseline alignment-baseline letter-spacing textLength lengthAdjust dx dy rotate offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod fx fy fr clip-path clip-rule clipPathUnits mask maskUnits maskContentUnits patternUnits patternContentUnits patternTransform preserveAspectRatio marker-start marker-mid marker-end markerWidth markerHeight markerUnits refX refY orient overflow vector-effect`.split(/\s+/))
const PARSE_ERROR = 'http://www.mozilla.org/newlayout/xml/parsererror.xml'
const serializerWindow = new JSDOM('').window
const parser = new serializerWindow.DOMParser()
const localReference = /^#[A-Za-z_][\w:.-]*$/
const localUrl = /^url\(\s*#[A-Za-z_][\w:.-]*\s*\)$/
// Every allowed attribute has an explicit value grammar; an attribute without one is rejected.
// Resource-loading syntax (url( other than a bare local fragment, image-set(, image(, @import,
// expression(, external href) is refused for every attribute before any grammar is consulted.
const noFunctions = value => { if (/[()]/.test(value)) throw new Error('SVG attribute does not accept functions') }
const grammar = {}
const define = (names, check) => { for (const name of names.split(/\s+/)) grammar[name] = check }
define('id class role aria-label aria-labelledby aria-describedby aria-hidden', noFunctions)
define('viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points dx dy rotate offset textLength fx fy fr refX refY markerWidth markerHeight stroke-width stroke-dashoffset stroke-miterlimit stroke-dasharray opacity fill-opacity stroke-opacity stop-opacity font-size letter-spacing', value => {
  if (!/^[\w\s.,%+-]*$/.test(value)) throw new Error('Invalid SVG numeric attribute')
})
define('fill-rule clip-rule stroke-linecap stroke-linejoin text-anchor dominant-baseline alignment-baseline lengthAdjust gradientUnits spreadMethod clipPathUnits maskUnits maskContentUnits patternUnits patternContentUnits preserveAspectRatio markerUnits orient overflow vector-effect font-weight font-style', value => {
  if (!/^[\w\s.-]*$/.test(value)) throw new Error('Invalid SVG keyword attribute')
})
define('transform gradientTransform patternTransform', value => {
  if (!/^[\w\s.,()+-]*$/.test(value)) throw new Error('Invalid SVG transform')
  for (const [, name] of value.matchAll(/([A-Za-z_-]+)\s*\(/g)) if (!/^(?:matrix|translate|scale|rotate|skewX|skewY)$/.test(name)) throw new Error('Forbidden SVG transform function')
})
define('font-family', value => cssValue('font-family', value))
// Paint attributes: a bare local url(#id), or the CSS paint grammar (keywords, hex, var/rgb/hsl/calc).
define('fill stroke color stop-color', (value, name) => { if (!localUrl.test(value.trim())) cssValue(name, value) })
// Reference-only attributes may only point inside the same document.
define('mask clip-path marker-start marker-mid marker-end', value => {
  if (!(value.trim() === 'none' || localUrl.test(value.trim()))) throw new Error('SVG references must be none or url(#local-id)')
})
define('style href', () => {})
const resourceSyntax = /(?:^|[^\w-])(?:-[a-z]+-)?(?:image-set|image|cross-fade|element|paint|src)\s*\(|@import|expression\s*\(/i
function staticValue(value) {
  // Forbid CSS obfuscation and HTML raw-text breakouts before checking URLs.
  if (/\\|\/\*|@import|expression|<|\]\]>|(?:data|javascript)\s*:/i.test(value)) throw new Error('Unsafe SVG value')
  const remaining = value.replace(/url\(\s*(?:"(#[A-Za-z_][\w:.-]*)"|'(#[A-Za-z_][\w:.-]*)'|(#[A-Za-z_][\w:.-]*))\s*\)/gi, '')
  if (/url\s*\(/i.test(remaining)) throw new Error('Only local SVG URLs are allowed')
}

/** Validate a static SVG subset, then serialize a fresh tree for HTML embedding. */
export function validateSvg(source, { profile = 'art', lang } = {}) {
  // The only comment ever accepted: Archify's licence comment, byte-exact (generated from the
  // hash-checked LICENSE), as the very first bytes of a diagram file. It is removed before every
  // check below, so any other comment, a second copy, or a copy anywhere else is still rejected.
  if (profile === 'diagram') {
    archifyComment ??= archifySvgComment()
    if (source.startsWith(archifyComment)) source = source.slice(archifyComment.length)
  }
  // XML declarations are parsed for validity, then omitted by serialization.
  const withoutDeclaration = source.replace(/^\uFEFF?<\?xml\s[^?]*\?>/, '')
  if (/<!\s*(?:ENTITY|DOCTYPE)|<\?|<!--/i.test(withoutDeclaration)) throw new Error('SVG declarations, processing instructions and comments are forbidden')
  // One parser window is shared: each call parses into a fresh, script-less XML document and the
  // output is a separately built tree, so no state crosses calls. Creating a JSDOM per figure made
  // a full content build spend most of its time constructing windows.
  const document = parser.parseFromString(source, 'image/svg+xml')
  const root = document.documentElement
  if (!root || root.namespaceURI === PARSE_ERROR || root.localName === 'parsererror') throw new Error('Invalid SVG XML')
  {
    if (root.localName !== 'svg' || root.namespaceURI !== SVG) throw new Error('Expected an SVG root')
    const output = document.implementation.createDocument(SVG, 'svg', null)
    const scope = `svg-${randomUUID()}`
    function copy(node) {
      if (node.nodeType === 3 || node.nodeType === 4) {
        if (node.nodeType === 4 && node.textContent.includes('<')) throw new Error('Unsafe SVG CDATA')
        return output.createTextNode(node.textContent)
      }
      if (node.nodeType === 1 && node.namespaceURI === SVG && node.localName === 'metadata') return null
      const link = node.localName === 'a' && profile === 'diagram'
      if (node.nodeType !== 1 || node.namespaceURI !== SVG || (!elements.has(node.localName) && !link)) throw new Error('Forbidden SVG element or namespace')
      if (link && !node.hasAttribute('href')) throw new Error('Diagram anchors require href')
      const clean = output.createElementNS(SVG, node.localName)
      for (const attr of node.attributes) {
        if (link && attr.name !== 'href') throw new Error('Diagram anchors only allow href')
        if (attr.namespaceURI === XMLNS) {
          if (!((attr.name === 'xmlns' && attr.value === SVG) || (attr.name === 'xmlns:xlink' && attr.value === XLINK))) throw new Error('Forbidden SVG namespace')
          continue
        }
        if (attr.namespaceURI && !(attr.namespaceURI === XLINK && attr.localName === 'href')) throw new Error('Forbidden attribute namespace')
        if (!attributes.has(attr.localName) || !grammar[attr.localName]) throw new Error(`Forbidden SVG attribute: ${attr.name}`)
        if (resourceSyntax.test(attr.value)) throw new Error('SVG resource syntax is forbidden')
        staticValue(attr.value)
        grammar[attr.localName](attr.value, attr.localName)
        if (attr.localName === 'style') { clean.setAttribute('style', cssDeclarations(attr.value)); continue }
        if (cssProperties.has(attr.localName)) cssValue(attr.localName, attr.value)
        if (link && attr.localName === 'href') {
          const match = /^\/(zh|en)\/([a-z0-9-]+)$/.exec(attr.value)
          if (attr.namespaceURI || !match || match[1] !== lang || (match[2] !== 'corpus' && !existsSync(`content/${lang}/${match[2]}.md`))) throw new Error('Forbidden diagram link')
        }
        if (!link && attr.localName === 'href' && !localReference.test(attr.value)) throw new Error('Only local SVG references are allowed')
        // Normalize xlink:href to SVG2 href; never preserve arbitrary prefixes.
        clean.setAttribute(attr.localName, attr.value)
      }
      if (node === root) clean.setAttribute('class', `${root.getAttribute('class') || ''} ${scope}`.trim())
      if (node.localName === 'style') {
        clean.textContent = cssStylesheet(node.textContent, root, scope)
      } else for (const child of node.childNodes) { const safe = copy(child); if (safe) clean.appendChild(safe) }
      return clean
    }
    output.replaceChild(copy(root), output.documentElement)
    return new serializerWindow.XMLSerializer().serializeToString(output.documentElement)
  }
}

export async function importArt(directory) {
  const { figures } = validateFigureRegistry(JSON.parse(await readFile('data/figures.json', 'utf8')))
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
  for (const { file, svg } of pending) await writeOutput('public/art', file, svg)
  return pending.length
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: npm run import:art -- <directory>')
  console.log(`Imported ${await importArt(process.argv[2])} validated SVGs.`)
}
