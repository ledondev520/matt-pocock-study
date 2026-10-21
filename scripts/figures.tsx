import { existsSync } from 'node:fs'
import { readFile, access } from 'node:fs/promises'
import { renderToStaticMarkup } from 'react-dom/server'
import registryData from '../data/figures.json'
import { validateFigureRegistry } from './figure-registry.mjs'
import { writeOutput } from './output-path.mjs'
import { ChainFigure, TracerFigure } from '../src/Diagrams'
import type { Lang } from '../src/lib/lang'
import type { Figures } from '../src/lib/content'
import { validateSvg } from './import-art.mjs'

const registry = validateFigureRegistry(registryData)

// Validation is pure, so results are memoised by exact source text, profile and language:
// a figure placed on several pages is parsed once per build, and any change to the bytes
// is validated afresh.
const validated = new Map<string, string>()
function validSvg(source: string, options: { profile: 'art' | 'diagram'; lang: Lang }) {
  const key = `${options.profile}\0${options.lang}\0${source}`
  let result = validated.get(key)
  if (result === undefined) { result = validateSvg(source, options); validated.set(key, result) }
  return result
}

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
// Hand-written fallbacks pass through the same SVG boundary as imported diagrams.
function validatedMarkup(html: string, lang: Lang, profile: 'art' | 'diagram' = 'art') {
  return html.replace(/<svg[\s\S]*?<\/svg>/g, svg => validSvg(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '), { profile, lang }))
}
export const figureById = (id: string) => registry.figures.find(f => f.id === id)
async function exists(file: string) { try { await access(file); return true } catch { return false } }
export async function figureHtml(id: string, lang: Lang, assetRoot = 'public'): Promise<string> {
  const f = figureById(id)
  if (!f) throw new Error(`Unknown figure id: ${id}`)
  if (id === 'home-hero') return validatedMarkup(renderToStaticMarkup(<ChainFigure lang={lang} />), lang, 'diagram')
  const alt = `${f.alt.zh} / ${f.alt.en}`
  const caption = escapeHtml(f.caption[lang])
  const path = `/${f.owner === 'diagram' ? 'diagrams' : 'art'}/${id}.${lang}.svg`
  if (await exists(`${assetRoot}${path}`)) {
    if (f.owner === 'diagram') {
      const svg = validSvg(await readFile(`${assetRoot}${path}`, 'utf8'), { profile: 'diagram', lang })
      return `<figure class="registry-figure" data-figure="${id}"><div role="img" aria-label="${escapeHtml(alt)}">${svg}</div><figcaption>${caption}</figcaption></figure>`
    }
    const darkPath = path.replace(/\.svg$/, '-dark.svg')
    const dark = await exists(`${assetRoot}${darkPath}`) ? darkPath : path
    return `<figure class="registry-figure" data-figure="${id}"><img class="art-light" src="${path}" alt="${escapeHtml(alt)}"><img class="art-dark" src="${dark}" alt="${escapeHtml(alt)}"><figcaption>${caption}</figcaption></figure>`
  }
  if (id === 's06-tracer') return validatedMarkup(renderToStaticMarkup(<TracerFigure lang={lang} />), lang)
  const [, , width, height] = f.viewBox.split(/\s+/).map(Number)
  return `<figure class="registry-figure placeholder-figure" data-figure="${id}"><div class="figure-placeholder" role="img" aria-label="${escapeHtml(alt)}" style="aspect-ratio:${width}/${height}"><span>${id} · ${width}×${height}</span><p>${caption}</p></div><figcaption>${caption}</figcaption></figure>`
}
export async function buildFigures(outputDir?: string): Promise<Figures> {
  validateFigureRegistry(registry)
  const result: Figures = { zh: {}, en: {} }
  for (const lang of ['zh', 'en'] as const) for (const f of registry.figures) {
    result[lang][f.id] = await figureHtml(f.id, lang)
    if (outputDir) {
      await writeOutput(`${outputDir}/figures`, `${f.id}.${lang}.svg`, validSvg(await downloadableFigure(f.id, lang), { profile: f.owner === 'diagram' ? 'diagram' : 'art', lang }))
    }
  }
  return result
}
export function figureMarkdown(id: string, lang: Lang) {
  const f = figureById(id)
  if (!f) throw new Error(`Unknown figure id: ${id}`)
  const asset = `/${f.owner === 'diagram' ? 'diagrams' : 'art'}/${id}.${lang}.svg`
  return `Figure: ${f.alt[lang]} ([${id}](${existsSync(`public${asset}`) ? asset : `/figures/${id}.${lang}.svg`}))`
}

async function downloadableFigure(id: string, lang: Lang) {
  const f = figureById(id)!
  const css = await readFile('src/index.css', 'utf8')
  // Downloads use the light palette resolved to literal values. Only the SVG
  // presentation rules are copied; page CSS and custom declarations stay out.
  const tokens = Object.fromEntries([...css.matchAll(/:root \{([^}]+)\}/g)].flatMap(m => [...m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map(v => [v[1], v[2]])))
  const scope = `download-${id}-${lang}`
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)]
    .filter(m => /^\s*\.(chain|diagram|layer|time|risk|slice|loop|final)[\w-]+\s*$/.test(m[1]) && /fill:|stroke:|font-size:/.test(m[2]))
    .map(m => `.${scope} ${m[1].trim()}{${m[2].replace(/var\(--([\w-]+)\)/g, (_, key) => tokens[key])}}`).join('\n')
  const style = `<style>.${scope} text{font-family:Inter,'Noto Sans SC','Noto Sans CJK SC',sans-serif}${rules}</style>`
  if (id === 'home-hero' || id === 's06-tracer') {
    const html = renderToStaticMarkup(id === 'home-hero' ? <ChainFigure lang={lang} /> : <TracerFigure lang={lang} />)
    const svgs = [...html.matchAll(/<svg[\s\S]*?<\/svg>/g)].map(m => m[0])
    if (id === 'home-hero') return svgs[0].replace('class="chain-svg"', `class="chain-svg ${scope}"`).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace('>', `>${style}`)
    return `<svg xmlns="http://www.w3.org/2000/svg" class="${scope}" viewBox="0 0 700 400"><title>${escapeHtml(f.alt.zh + ' / ' + f.alt.en)}</title>${style}${svgs.map((svg, i) => svg.replace('<svg ', `<svg x="${i * 360}" width="340" height="400" `)).join('')}</svg>`
  }
  const [, , width, height] = f.viewBox.split(/\s+/).map(Number)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f.viewBox}"><title>${escapeHtml(f.alt.zh + ' / ' + f.alt.en)}</title><desc>${escapeHtml(f.caption[lang])}</desc><rect width="${width}" height="${height}" rx="12" fill="#EEEBF5"/><text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-family="monospace" font-size="20" fill="#6B607B">${id} · ${width}×${height}</text></svg>`
}
