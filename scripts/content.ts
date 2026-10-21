import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { outputPath, writeOutput } from './output-path.mjs'
import { parse } from 'yaml'
import { marked, type Token, type Tokens } from 'marked'
import { sections, type Page, type Section } from '../src/lib/content'
import type { Lang } from '../src/lib/lang'
import { codeHtml } from './code'
import { siteUrl } from '../src/lib/site'
import { figureHtml, figureMarkdown, figureById, escapeHtml, buildFigures } from './figures'
import { licenceBlock, embedsArchify, archifyAppendix } from './licences.mjs'

const languages = ['en', 'zh'] as const
const componentNames = ['cards', 'quote', 'exercise', 'figure', 'note', 'licence']
const fields = (text: string) => Object.fromEntries([...text.matchAll(/^([a-z]+):\s*(.*)$/gm)].map(([, key, value]) => [key, value]))
// Inline code: escape the text first, then only add markup around it, so no text from the source
// is ever emitted as HTML. A <wbr> after each "/" that sits between path segments lets a long path
// wrap at a segment boundary instead of pushing its trailing punctuation onto a line of its own;
// spaces before a closing bracket are kept with it (span.code-keep, white-space: nowrap), so "}"
// never starts a line. Special characters are turned into entities first, so no source text can
// become a tag (the only tags are the fixed ones added here), and "/" stays as ordinary text.
// Neither <wbr> nor the span adds text, so copied text is unchanged; the .md and llms-full exports
// come from the Markdown source.
export const codespanHtml = (text: string) => `<code>${escapeHtml(text)
  .replace(/(?<=[^/])\/(?=[^/])/g, '/<wbr>')
  .replace(/ +[)\]}]+/g, keep => `<span class="code-keep">${keep}</span>`)}</code>`
const articleRenderer = () => Object.assign(new marked.Renderer(), { codespan: ({ text }: Tokens.Codespan) => codespanHtml(text) })
const componentRenderer = articleRenderer()
const inline = (text: string) => marked.parseInline(text, { renderer: componentRenderer }) as string
const md = (text: string) => marked.parse(text, { async: false, renderer: componentRenderer })
const headingId = (text: string) => text.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section'

export async function renderMarkdown(source: string, lang: Lang) {
  const toc: Page['toc'] = []
  const renderer = articleRenderer()
  const seen = new Map<string, number>()
  renderer.heading = ({ depth, text }: Tokens.Heading) => {
    if (depth === 1) throw new Error('H1 belongs in front matter')
    const base = headingId(text), count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    const id = count ? `${base}-${count}` : base
    if (depth === 2) toc.push({ id, title: text.replace(/[*`]/g, '') })
    return `<h${depth} id="${id}">${inline(text)}</h${depth}>\n`
  }
  renderer.table = function (token: Tokens.Table) {
    const header = token.header.map(c => `<th scope="col">${this.parser.parseInline(c.tokens)}</th>`).join('')
    const rows = token.rows.map(row => `<tr>${row.map((c, i) => `<${i ? 'td' : 'th scope="row"'}>${this.parser.parseInline(c.tokens)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')
    return `<div class="comparison-wrap"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`
  }
  renderer.code = ({ text, lang: codeLang }: Tokens.Code) => codeHtml(text, codeLang ?? 'text', lang)
  const tokens = marked.lexer(source)
  const exports = new Map<string, string>()
  async function transform(token: Token) {
    if (token.type !== 'code' || !componentNames.includes(token.lang ?? '')) return
    const { text, lang: kind } = token as Tokens.Code
    const f = fields(text)
    let html = '', readable = ''
    if (kind === 'licence') {
      // Full upstream licence text, verbatim from third_party/ (hash-checked); never typed into content.
      ({ html, markdown: readable } = licenceBlock(f.id ?? '', lang))
    } else if (kind === 'figure') {
      html = await figureHtml(f.id, lang); readable = figureMarkdown(f.id, lang)
    } else if (kind === 'quote') {
      if (!/^https?:\/\//.test(f.url ?? '')) throw new Error('Quote requires an http(s) url')
      if (!f.author || !f.date || !f.text) throw new Error('Quote requires text, author and date')
      if (f.text.trim().split(/\s+/).length > 25 || (f.text.match(/[.!?](?:\s|$)/g)?.length ?? 0) > 2) throw new Error('Quote exceeds the short quotation limit')
      html = `<blockquote class="punch-quote"><p lang="en">${escapeHtml(f.text)}</p>${f.note ? `<p class="quote-translation">${escapeHtml(f.note)}</p>` : ''}<cite><a href="${escapeHtml(f.url)}">— ${escapeHtml(f.author)}</a><time datetime="${escapeHtml(f.date)}">${escapeHtml(f.date)}</time></cite></blockquote>`
      readable = `> ${f.text}\n>\n> — ${f.author}, [source](${f.url}), ${f.date}${f.note ? `\n>\n> ${f.note}` : ''}`
    } else if (kind === 'cards') {
      const items = text.split('\n').filter(line => /^-\s/.test(line)).map(line => line.replace(/^-\s+/, ''))
      if (items.length < 2 || items.length > 4 || items.some(item => !/^\*\*[^*]+\*\*/.test(item))) throw new Error('Cards need 2–4 bold-titled items')
      html = `<div class="key-cards">${items.map((item, i) => { const [, title, body] = /^\*\*(.*?)\*\*\s*(.*)$/.exec(item)!; return `<section class="key-card"><span>0${i + 1}</span><h3>${inline(title)}</h3><p>${inline(body)}</p></section>` }).join('')}</div>`
      readable = items.map(item => `- ${item}`).join('\n')
    } else if (kind === 'exercise') {
      if (!f.title) throw new Error('Exercise requires title')
      const body = text.split('\n').filter(line => !/^(title|answer):/.test(line)).join('\n')
      html = `<section class="exercise"><span class="eyebrow">${lang === 'zh' ? '动手练习' : 'TRY IT'}</span><h3>${escapeHtml(f.title)}</h3>${md(body)}${f.answer ? `<details><summary>${lang === 'zh' ? '参考思路' : 'Suggested approach'}</summary>${md(f.answer)}</details>` : ''}</section>`
      readable = `### ${f.title}\n\n${body}${f.answer ? `\n\n${lang === 'zh' ? '参考思路' : 'Suggested approach'}: ${f.answer}` : ''}`
    } else {
      if (!['inference', 'unverified', 'tip'].includes(f.kind)) throw new Error('Unknown note kind')
      const body = text.replace(/^kind:.*\n?/, '')
      const labels = { inference: ['本站推论', 'Our inference'], unverified: ['尚未验证', 'Unverified'], tip: ['本站建议', 'Our suggestion'] }
      const label = labels[f.kind as keyof typeof labels][lang === 'zh' ? 0 : 1]
      html = `<aside class="callout ${f.kind}"><strong>${label}</strong>${md(body)}</aside>`
      readable = `> **${label}**\n${body.split('\n').map(line => `> ${line}`).join('\n')}`
    }
    exports.set(token.raw, readable)
    Object.assign(token, { type: 'html', text: html, block: true, raw: token.raw })
  }
  // walkTokens handles components nested in lists as well as top-level fences.
  const pending: Promise<void>[] = []
  marked.walkTokens(tokens, token => { pending.push(transform(token)) })
  await Promise.all(pending)
  const markdown = source.replace(/```(cards|quote|exercise|figure|note|licence)\s*\n[\s\S]*?\n```/g, raw => exports.get(raw) ?? '')
  return { html: marked.parser(tokens, { renderer }), markdown: markdown.trim() + '\n', toc }
}

export async function readPages(contentDir: string): Promise<Page[]> {
  const pages: Page[] = []
  for (const lang of languages) {
    for (const file of (await readdir(join(contentDir, lang))).filter(file => file.endsWith('.md')).sort()) {
      const source = await readFile(join(contentDir, lang, file), 'utf8')
      const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
      if (!match) throw new Error(`Missing front matter: ${lang}/${file}`)
      const data = parse(match[1]) as Record<string, unknown>
      const { slug, title, subtitle, number, order, section, summary, head, updated } = data ?? {}
      if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || file !== `${slug}.md`
        || [title, subtitle, summary, head, updated].some(value => typeof value !== 'string' || !value.trim())
        || !Number.isInteger(number) || Number(number) < 0 || Number(number) > 21 || order !== number
        || !(String(section) in sections) || (slug === 'corpus') !== (number === 0)
        || !/^\d{4}-\d{2}-\d{2}$/.test(String(updated))) throw new Error(`Invalid front matter: ${lang}/${file}`)
      if (lang === 'zh' ? [...String(summary)].length > 40 : String(summary).split(/\s+/).length > 25) throw new Error(`Summary too long: ${lang}/${slug}`)
      if (head !== 'card' && !figureById(String(head))) throw new Error(`Unknown figure id: ${head}`)
      const rendered = await renderMarkdown(source.slice(match[0].length), lang)
      pages.push({ lang, slug, title, subtitle, number, order, section: section as Section, summary, head, updated, ...rendered,
        headHtml: head === 'card' ? `<aside class="key-point"><strong>${lang === 'zh' ? '一句话要点' : 'KEY POINT'}</strong><p>${escapeHtml(String(summary))}</p></aside>` : await figureHtml(String(head), lang),
      } as Page)
    }
  }
  const slugs = (lang: Lang) => pages.filter(p => p.lang === lang).map(p => p.slug).sort().join(',')
  if (!pages.length || slugs('en') !== slugs('zh')) throw new Error('Both languages must have the same nonempty set of slugs')
  // Unpublished lessons link to the available index until their content is added.
  for (const page of pages) {
    const available = new Set(pages.filter(p => p.lang === page.lang).map(p => p.slug))
    page.html = page.html.replace(/href="\/(en|zh)\/([a-z0-9-]+)(#[^"]*)?"/g, (all, targetLang, slug) => available.has(slug) ? all : `href="/${targetLang}#topics"`)
  }
  // A page whose body or head embeds an Archify-generated diagram carries Archify's full licence at
  // its end (HTML, .md download and llms-full), unless it already has that licence block.
  for (const page of pages) {
    if (!embedsArchify(page.html + page.headHtml) || page.html.includes(licenceBlock('archify', page.lang).html)) continue
    const appendix = archifyAppendix(page.lang)
    page.html += appendix.html
    page.markdown = `${page.markdown.trimEnd()}\n\n${appendix.markdown}\n`
  }
  return pages.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
}

export async function buildContent(contentDir: string, outputDir: string, clean = true): Promise<Page[]> {
  const pages = await readPages(contentDir)
  await mkdir(outputPath(outputDir), { recursive: true })
  for (const lang of languages) {
    if (clean) await rm(outputPath(outputDir, lang), { recursive: true, force: true })
    await mkdir(outputPath(outputDir, lang), { recursive: true })
    const localized = pages.filter(page => page.lang === lang)
    for (const page of localized) await writeOutput(outputPath(outputDir, lang), `${page.slug}.md`, `# ${page.title}\n\n${page.summary}\n\n${page.markdown}`)
    const title = lang === 'en' ? 'Matt Pocock study notes' : 'Matt Pocock 学习笔记'
    const summary = lang === 'en' ? 'Independent, unofficial, non-commercial notes. Original works belong to their authors.' : '独立整理，非官方、非商业；原作品版权归原作者。'
    const links = localized.map(page => `- [${page.title}](${siteUrl()}/${lang}/${page.slug}.md): ${page.summary}`).join('\n')
    const index = `# ${title}\n\n> ${summary}\n\n## ${lang === 'en' ? 'Pages' : '页面'}\n\n${links}\n`
    const full = `# ${title}\n\n> ${summary}\n\n${localized.map(page => `## ${page.title}\n\n${page.markdown}`).join('\n---\n\n')}`
    const base = lang === 'en' ? outputDir : outputPath(outputDir, 'zh')
    await writeOutput(base, 'llms.txt', index)
    await writeOutput(base, 'llms-full.txt', full)
  }
  await writeOutput(outputDir, 'content.json', JSON.stringify(pages))
  await writeOutput(outputDir, 'figures.json', JSON.stringify(await buildFigures(outputDir)))
  return pages
}
