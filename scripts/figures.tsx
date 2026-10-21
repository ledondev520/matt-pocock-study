import { existsSync } from 'node:fs'
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { renderToStaticMarkup } from 'react-dom/server'
import registry from '../data/figures.json'
import { ChainFigure, TracerFigure } from '../src/Diagrams'
import type { Lang } from '../src/lib/lang'
import type { Figures } from '../src/lib/content'
import { validateSvg } from './import-art.mjs'

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
export const figureById = (id: string) => registry.figures.find(f => f.id === id)
async function exists(file: string) { try { await access(file); return true } catch { return false } }
export async function figureHtml(id: string, lang: Lang, assetRoot = 'public'): Promise<string> {
  const f = figureById(id)
  if (!f) throw new Error(`Unknown figure id: ${id}`)
  if (id === 'home-hero') return renderToStaticMarkup(<ChainFigure lang={lang} />)
  const alt = `${f.alt.zh} / ${f.alt.en}`
  const caption = escapeHtml(f.caption[lang])
  const path = `/${f.owner === 'diagram' ? 'diagrams' : 'art'}/${id}.${lang}.svg`
  if (await exists(`${assetRoot}${path}`)) {
    if (f.owner === 'diagram') {
      const svg = validateSvg(await readFile(`${assetRoot}${path}`, 'utf8'))
      return `<figure class="registry-figure" data-figure="${id}"><div role="img" aria-label="${escapeHtml(alt)}">${svg}</div><figcaption>${caption}</figcaption></figure>`
    }
    const darkPath = path.replace(/\.svg$/, '-dark.svg')
    const dark = await exists(`${assetRoot}${darkPath}`) ? darkPath : path
    return `<figure class="registry-figure" data-figure="${id}"><img class="art-light" src="${path}" alt="${escapeHtml(alt)}"><img class="art-dark" src="${dark}" alt="${escapeHtml(alt)}"><figcaption>${caption}</figcaption></figure>`
  }
  if (id === 's06-tracer') return renderToStaticMarkup(<TracerFigure lang={lang} />)
  const [, , width, height] = f.viewBox.split(/\s+/).map(Number)
  return `<figure class="registry-figure placeholder-figure" data-figure="${id}"><div class="figure-placeholder" role="img" aria-label="${escapeHtml(alt)}" style="aspect-ratio:${width}/${height}"><span>${id} · ${width}×${height}</span><p>${caption}</p></div><figcaption>${caption}</figcaption></figure>`
}
export async function buildFigures(outputDir?: string): Promise<Figures> {
  const result: Figures = { zh: {}, en: {} }
  for (const lang of ['zh', 'en'] as const) for (const f of registry.figures) {
    result[lang][f.id] = await figureHtml(f.id, lang)
    if (outputDir) {
      await mkdir(`${outputDir}/figures`, { recursive: true })
      await writeFile(`${outputDir}/figures/${f.id}.${lang}.svg`, await downloadableFigure(f.id, lang))
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
  const roots = [...css.matchAll(/:root \{([^}]+)\}/g)].map(m => m[1]).join('\n')
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].filter(m => /\.(chain|diagram|layer|time|risk|slice|loop|final)/.test(m[1]) && /fill:|stroke:|font-size:/.test(m[2])).map(m => m[0]).join('\n')
  const style = `<style>:root{${roots}}text{font-family:Inter,'Noto Sans SC','Noto Sans CJK SC',sans-serif}${rules}</style>`
  if (id === 'home-hero' || id === 's06-tracer') {
    const html = renderToStaticMarkup(id === 'home-hero' ? <ChainFigure lang={lang} /> : <TracerFigure lang={lang} />)
    const svgs = [...html.matchAll(/<svg[\s\S]*?<\/svg>/g)].map(m => m[0])
    if (id === 'home-hero') return svgs[0].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace('>', `>${style}`)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 400"><title>${escapeHtml(f.alt.zh + ' / ' + f.alt.en)}</title>${style}${svgs.map((svg, i) => svg.replace('<svg ', `<svg x="${i * 360}" width="340" height="400" `)).join('')}</svg>`
  }
  const [, , width, height] = f.viewBox.split(/\s+/).map(Number)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f.viewBox}"><title>${escapeHtml(f.alt.zh + ' / ' + f.alt.en)}</title><desc>${escapeHtml(f.caption[lang])}</desc><rect width="${width}" height="${height}" rx="12" fill="#EEEBF5"/><text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-family="monospace" font-size="20" fill="#6B607B">${id} · ${width}×${height}</text></svg>`
}
