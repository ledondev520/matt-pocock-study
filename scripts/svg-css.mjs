// A deliberately small CSS grammar: no at-rules, nesting, custom declarations,
// string resource syntax, escapes, comments, or unrecognised functions.
export const cssProperties = new Set('fill stroke stroke-width stroke-dasharray stroke-linecap stroke-linejoin opacity fill-opacity stroke-opacity font-family font-size font-weight font-style letter-spacing text-anchor dominant-baseline paint-order color display visibility'.split(' '))
const functions = new Set(['var', 'rgb', 'rgba', 'hsl', 'hsla', 'calc'])
export function cssValue(property, value) {
  if (!value.trim() || /[\\@{};!<>]|\/\*|\*\//.test(value) || /\p{Cc}/u.test(value)) throw new Error('Unsafe SVG CSS value')
  let remaining = value
  if (property === 'font-family') remaining = remaining.replace(/"[a-zA-Z0-9 _-]+"|'[a-zA-Z0-9 _-]+'/g, '')
  if (/["']/.test(remaining)) throw new Error('SVG CSS strings are only allowed in font-family')
  remaining = remaining.replace(/url\(#[A-Za-z_][\w:.-]*\)/g, '')
  const tokens = remaining.match(/[A-Za-z_-][\w-]*\s*\(|[()]/g) ?? []
  let depth = 0
  for (const token of tokens) {
    if (token === ')') { if (--depth < 0) throw new Error('Invalid SVG CSS parentheses') }
    else {
      if (token === '(' || !functions.has(token.slice(0, token.indexOf('(')).trim())) throw new Error('Forbidden SVG CSS function')
      depth++
    }
  }
  if (depth || !/^[\w\s#.,%+*/():-]*$/.test(remaining)) throw new Error('Invalid SVG CSS value')
}
export function cssDeclarations(source) {
  return source.split(';').filter(part => part.trim()).map(part => {
    const match = /^\s*([a-z-]+)\s*:\s*([^]+?)\s*$/.exec(part)
    if (!match || !cssProperties.has(match[1])) throw new Error('Forbidden SVG CSS property')
    cssValue(match[1], match[2])
    return `${match[1]}:${match[2]}`
  }).join(';')
}
export function cssStylesheet(source, root, scope) {
  const roots = [root.id && '#' + root.id, ...[...root.classList].map(name => '.' + name)].filter(Boolean)
  let result = '', end = 0
  const simple = /^(?:[a-zA-Z][\w-]*)?(?:[.#][a-zA-Z_][\w-]*)*(?::(?:hover|focus-visible))?$/
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (source.slice(end, match.index).trim()) throw new Error('Invalid SVG CSS rules')
    const selectors = match[1].split(',').map(value => {
      const selector = value.trim()
      const own = roots.find(prefix => selector.startsWith(prefix) && (selector.length === prefix.length || /^[\s>]/.test(selector.slice(prefix.length))))
      if (!own || !/^[.#][a-zA-Z_][\w-]*$/.test(own)) throw new Error('SVG CSS selectors must start at their own root')
      const tail = selector.slice(own.length)
      if (tail.trim()) {
        // Descendants and direct children only; sibling combinators and selector
        // functions could leave the SVG boundary and are intentionally absent.
        const parts = tail.trim().replace(/^>\s*/, '').split(/\s*>\s*|\s+/)
        if (parts.some(part => !part || !simple.test(part))) throw new Error('Forbidden SVG CSS selector')
      }
      return `.${scope}${tail}`
    })
    result += `${selectors.join(',')}{${cssDeclarations(match[2])}}`
    end = match.index + match[0].length
  }
  if (source.slice(end).trim()) throw new Error('Invalid SVG CSS rules')
  return result
}
