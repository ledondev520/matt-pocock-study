import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'

/** Parse as XML so encoded attribute values cannot bypass reference checks. */
export function validateSvg(source) {
  if (/<!\s*(?:ENTITY|DOCTYPE)/i.test(source)) throw new Error('SVG entities and doctypes are forbidden')
  let document
  try { document = new JSDOM(source, { contentType: 'image/svg+xml' }).window.document }
  catch { throw new Error('Invalid SVG XML') }
  if (document.documentElement.localName !== 'svg') throw new Error('Expected an SVG root')
  const external = value => {
    const normalized = [...value].filter(char => char.charCodeAt(0) > 32 && char.charCodeAt(0) !== 127).join('')
    return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(normalized) && !/^data:image\//i.test(normalized)
  }
  function checkReferences(value) {
    if (/\\|\/\*/.test(value)) throw new Error('Escaped SVG values are forbidden')
    for (const match of value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) if (external(match[1] ?? match[2] ?? match[3])) throw new Error('External SVG URL')
    if (/@import/i.test(value)) throw new Error('SVG imports are forbidden')
  }
  for (const node of document.querySelectorAll('*')) {
    if (node.localName.toLowerCase() === 'style') checkReferences(node.textContent)
    if (['script', 'foreignobject', 'iframe', 'embed', 'object'].includes(node.localName.toLowerCase())) throw new Error(`Forbidden SVG element: ${node.localName}`)
    for (const attr of node.attributes) {
      if (/^on/i.test(attr.localName)) throw new Error('SVG event attributes are forbidden')
      if (['href', 'base'].includes(attr.localName) && external(attr.value)) throw new Error('External SVG reference')
      checkReferences(attr.value)
    }
  }
  return source
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
