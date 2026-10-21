import { execFileSync } from 'node:child_process'
import { mkdir, access, writeFile } from 'node:fs/promises'
import { resolve, relative, isAbsolute, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readPages } from './content.ts'
import { Resvg } from '@resvg/resvg-js'

async function font(pattern, required, override) {
  if (override) {
    try { await access(override); return resolve(override) }
    catch { throw new Error(`OG font file is not readable: ${override}`) }
  }
  let result
  try { result = execFileSync('fc-match', ['-f', '%{family}\n%{file}', pattern], { encoding: 'utf8' }).split('\n') }
  catch { throw new Error('OG generation needs fontconfig (fc-match) and Noto Sans CJK / Noto Sans SC fonts installed on the OS.') }
  if (required && !/Noto Sans (?:CJK|SC)/i.test(result[0])) throw new Error('No CJK font found. Install Noto Sans CJK or Noto Sans SC, then run npm run og again.')
  return result[1]
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
function lines(text, max) {
  const words = /[\u3400-\u9fff]/.test(text) ? [...text] : text.split(/\s+/).map(word => word + ' ')
  const result = ['']
  for (const word of words) {
    const weight = value => [...value].reduce((n, ch) => n + (ch.charCodeAt(0) > 255 ? 1 : .53), 0)
    if (weight(result.at(-1) + word) > max) result.push('')
    result[result.length - 1] += word
  }
  return result.map(line => line.trim())
}
export function outputPath(root, lang, slug) {
  const base = resolve(root)
  const target = resolve(base, lang, `${slug}.png`)
  for (const boundary of [base, resolve(base, lang)]) {
    const rel = relative(boundary, target)
    if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('OG output escapes its root')
  }
  return target
}
export async function generateOg(contentDir = 'content', outputDir = 'public/og') {
  const validated = await readPages(contentDir)
  const fonts = [await font('Noto Sans CJK SC', true, process.env.OG_CJK_FONT_FILE), await font('Inter', false, process.env.OG_FONT_FILE), await font('Space Grotesk:weight=bold', false, process.env.OG_FONT_FILE)]
  for (const lang of ['zh', 'en']) {
    const pages = [{ slug: 'home', title: lang === 'zh' ? '想清楚，再动手。' : 'Think clearly. Build better.', summary: lang === 'zh' ? '向 Matt Pocock 学习 · TypeScript / AI coding / 写作与教学' : 'Learning from Matt Pocock · TypeScript / AI coding / Writing & teaching' }]
    pages.push(...validated.filter(page => page.lang === lang))
    for (const page of pages) {
      const target = outputPath(outputDir, lang, page.slug)
      await mkdir(resolve(target, '..'), { recursive: true })
      const title = lines(page.title, 19).slice(0, 3)
      const summary = lines(page.summary, 32).slice(0, 2)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#F8F7FC"/><rect width="1200" height="420" fill="#43209E"/><rect x="65" y="55" width="45" height="8" fill="#C6F432"/><text x="130" y="70" font-family="Inter, Noto Sans CJK SC" font-size="22" fill="#D8CCF3">MATT · STUDY NOTES / 学习笔记</text>${title.map((line, i) => `<text x="65" y="${172 + i * 77}" font-family="Space Grotesk, Noto Sans CJK SC" font-size="62" font-weight="700" fill="#FFFFFF">${escape(line)}</text>`).join('')}${summary.map((line, i) => `<text x="65" y="${482 + i * 40}" font-family="Inter, Noto Sans CJK SC" font-size="28" fill="#241B35">${escape(line)}</text>`).join('')}<text x="65" y="592" font-family="Inter, Noto Sans CJK SC" font-size="19" fill="#6B607B">INDEPENDENT · UNOFFICIAL · NON-COMMERCIAL</text><rect x="1085" y="555" width="48" height="48" rx="5" fill="#C6F432"/><text x="1095" y="590" font-size="35" fill="#221438">↗</text></svg>`
      const png = new Resvg(svg, { font: { loadSystemFonts: false, fontFiles: fonts, defaultFontFamily: 'Noto Sans CJK SC' } }).render().asPng()
      await writeFile(target, png)
    }
    console.log(`Generated ${pages.length} ${lang} OG images (1200×630).`)
  }

}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await generateOg()
