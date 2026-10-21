import { JSDOM } from 'jsdom'
import { renderToStaticMarkup } from 'react-dom/server'
import { Arrow, arrowDirections } from '../src/Arrow'

const document = new JSDOM('').window.document
const markup = Object.fromEntries(Object.entries(arrowDirections).map(([glyph, dir]) => [glyph, renderToStaticMarkup(<Arrow dir={dir} label={glyph} />)]))

// Transform rendered text only: URLs, attributes, Markdown and llms exports stay untouched.
export function renderArrows(html: string) {
  if (!/[←→↓↗]/.test(html)) return html
  const template = document.createElement('template')
  template.innerHTML = html
  const walker = document.createTreeWalker(template.content, 4)
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  for (const node of nodes) {
    if (!/[←→↓↗]/.test(node.data) || node.parentElement?.closest('style, script, title, desc')) continue
    if (node.parentElement?.getAttribute('font-family') === 'system-ui, sans-serif') continue
    const fragment = document.createDocumentFragment()
    for (const part of node.data.split(/([←→↓↗])/)) {
      if (!arrowDirections[part]) { fragment.append(part); continue }
      if (node.parentElement?.namespaceURI === 'http://www.w3.org/2000/svg') {
        // SVG text cannot contain an inline SVG. Isolate just the symbol from CJK webfonts.
        const span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
        span.setAttribute('font-family', 'system-ui, sans-serif')
        span.textContent = part
        fragment.append(span)
      } else {
        const arrow = document.createElement('template')
        arrow.innerHTML = markup[part]
        fragment.append(arrow.content)
      }
    }
    node.replaceWith(fragment)
  }
  return template.innerHTML
}
