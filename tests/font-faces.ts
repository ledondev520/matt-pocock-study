export function parseRange(range: string): Set<number> {
  const codes = new Set<number>()
  for (const part of range.split(',')) {
    const text = part.trim()
    const match = /^U\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?$/i.exec(text)
    if (!match) throw new Error(`Bad unicode-range part: ${text}`)
    const start = parseInt(match[1].replace(/\?/g, '0'), 16)
    const end = match[2] ? parseInt(match[2], 16) : parseInt(match[1].replace(/\?/g, 'f'), 16)
    for (let code = start; code <= end; code++) codes.add(code)
  }
  return codes
}

export function parseFontFaces(css: string, prefix: string) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
    const family = /font-family:\s*['"]?([^;'"}]+)['"]?\s*;/.exec(body)?.[1].trim()
    const url = /src:\s*url\(['"]?([^'" )]+)['"]?\)\s*format\(['"]woff2['"]\)/.exec(body)?.[1]
    const weight = /font-weight:\s*([^;}]+)/.exec(body)?.[1].trim()
    const range = /unicode-range:\s*([^;}]+)/.exec(body)?.[1]
    if (!family || !url || !weight || !range || !/font-display:\s*swap/.test(body)) throw new Error(`Incomplete font face: ${body}`)
    if (!url.startsWith(prefix)) throw new Error(`Font not served from ${prefix}: ${url}`)
    return { family, url, file: url.slice(prefix.length), weight, codes: parseRange(range) }
  })
}
