// Parses the Noto Sans SC @font-face rules of a stylesheet: the generated one
// (generated/fonts/noto-sans-sc.css) or the minified one Vite ships in dist/assets.
export type NotoFace = { kind: 'subset' | 'fallback'; weight: number; slice?: number; url: string; file: string; codes: Set<number> }

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

export function parseFontFaces(css: string, prefix: string): NotoFace[] {
  const faces: NotoFace[] = []
  for (const [, body] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    if (!/font-family:\s*['"]?Noto Sans SC['"]?\s*;/.test(body)) continue
    const url = /src:\s*url\(['"]?([^'")]+)['"]?\)\s*format\(['"]woff2['"]\)\s*;?/.exec(body)?.[1]
    const weight = Number(/font-weight:\s*(\d+)/.exec(body)?.[1])
    const range = /unicode-range:\s*([^;}]+)/.exec(body)?.[1]
    if (!url || !range || !weight) throw new Error(`Incomplete Noto @font-face: ${body.slice(0, 200)}`)
    if (!url.startsWith(prefix)) throw new Error(`Noto font not served from ${prefix}: ${url}`)
    if (/,\s*url\(/.test(body)) throw new Error(`Unexpected second src in Noto @font-face: ${url}`)
    const file = url.slice(prefix.length)
    const fallback = /^noto-sans-sc-fallback-(\d+)-(\d+)(?:-[A-Za-z0-9_-]+)?\.woff2$/.exec(file)
    const subset = /^noto-sans-sc-(\d+)(?:-[A-Za-z0-9_-]+)?\.woff2$/.exec(file)
    if (fallback) {
      if (Number(fallback[2]) !== weight) throw new Error(`Weight mismatch: ${file}`)
      faces.push({ kind: 'fallback', weight, slice: Number(fallback[1]), url, file, codes: parseRange(range) })
    } else if (subset) {
      if (Number(subset[1]) !== weight) throw new Error(`Weight mismatch: ${file}`)
      faces.push({ kind: 'subset', weight, url, file, codes: parseRange(range) })
    } else throw new Error(`Unknown Noto font file: ${file}`)
  }
  return faces
}
