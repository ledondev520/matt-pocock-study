import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { outputPath, writeOutput } from './output-path.mjs'
import { parse } from 'yaml'
import { marked, type Token, type Tokens, type TokensList } from 'marked'
import { sections, sectionLabel, type Page, type Section } from '../src/lib/content'
import type { Lang } from '../src/lib/lang'
import { codeHtml } from './code'
import { siteUrl } from '../src/lib/site'
import { figureHtml, figureMarkdown, figureById, escapeHtml, buildFigures } from './figures'
import { licenceMarkdown, embedsArchify, archifyAppendix, licencesView } from './licences.mjs'
import { kbSlug, licensesSlug } from '../src/lib/metadata'
import { renderArrows } from './arrows'
import { agentPrompt, llmsFullPath, llmsPath } from '../src/lib/agent'
import { byDomain, domainLabel, methodPath, methodsTitle, type MethodSummary } from '../src/lib/methods'
import { listMethodologies } from './methods'

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

// Notices that stay in the Markdown exports but not on the page: every "## …" section holding a
// licence fence (the per-page MIT notice; the texts live on /licenses), and the closing disclaimer
// paragraph (the footer carries it). Run on the lexed tokens, before components are transformed.
export const disclaimerPattern = /^(?:非官方、非商业|Independent, unofficial|Unofficial, non-?commercial)/
export function pageTokens(tokens: TokensList): TokensList {
  const hidden = new Set<Token>()
  let section: Token[] = []
  const close = () => { if (section.some(t => t.type === 'code' && (t as Tokens.Code).lang === 'licence')) section.forEach(t => hidden.add(t)); section = [] }
  for (const token of tokens) {
    if (token.type === 'heading' && (token as Tokens.Heading).depth <= 2) close()
    section.push(token)
  }
  close()
  const last = tokens.filter(t => t.type !== 'space').at(-1)
  if (last?.type === 'paragraph' && disclaimerPattern.test((last as Tokens.Paragraph).text)) hidden.add(last)
  return Object.assign(tokens.filter(t => !hidden.has(t)), { links: tokens.links })
}

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
  const visible = pageTokens(tokens)
  const exports = new Map<string, string>()
  async function transform(token: Token) {
    if (token.type !== 'code' || !componentNames.includes(token.lang ?? '')) return
    const { text, lang: kind } = token as Tokens.Code
    const f = fields(text)
    let html = '', readable = ''
    if (kind === 'licence') {
      // Full upstream licence text, verbatim from third_party/ (hash-checked); never typed into content.
      // Exports keep it in place; the page shows it only on /licenses.
      readable = licenceMarkdown(f.id ?? '', lang)
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
  return { html: renderArrows(marked.parser(visible, { renderer })), markdown: markdown.trim() + '\n', toc }
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
        headHtml: head === 'card' ? renderArrows(`<aside class="key-point"><strong>${lang === 'zh' ? '一句话要点' : 'KEY POINT'}</strong><p>${escapeHtml(String(summary))}</p></aside>`) : await figureHtml(String(head), lang),
      } as Page)
    }
  }
  const slugs = (lang: Lang) => pages.filter(p => p.lang === lang).map(p => p.slug).sort().join(',')
  if (!pages.length || slugs('en') !== slugs('zh')) throw new Error('Both languages must have the same nonempty set of slugs')
  // Unpublished lessons link to the available index until their content is added.
  for (const page of pages) {
    const available = new Set([...pages.filter(p => p.lang === page.lang).map(p => p.slug), licensesSlug])
    page.html = page.html.replace(/href="\/(en|zh)\/([a-z0-9-]+)(#[^"]*)?"/g, (all, targetLang, slug) => available.has(slug) ? all : `href="/${targetLang}#topics"`)
  }
  // A page whose body or head embeds an Archify-generated diagram carries Archify's full licence at
  // the end of its Markdown export (.md and llms-full), unless it already has that licence block.
  // The page itself links to /licenses from the footer.
  if (pages.some(p => p.slug === licensesSlug)) throw new Error(`content/*/${licensesSlug}.md would collide with the licences view`)
  for (const page of pages) {
    if (!embedsArchify(page.html + page.headHtml) || page.markdown.includes(licenceMarkdown('archify', page.lang))) continue
    page.markdown = `${page.markdown.trimEnd()}\n\n${archifyAppendix(page.lang)}\n`
  }
  return pages.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
}

// What a coding agent reads first: llms.txt (how to use the site + a grouped index), llms-full.txt
// (every page in one file) and the home page's Markdown twin. One language per call. The licences
// view's twin (/<lang>/licenses.md) comes from licensesMarkdown; the knowledge base twin
// (/<lang>/knowledge.md) is written by static.tsx from the feed. Both are listed under "Site".
export function agentFiles(lang: Lang, localized: Page[], site: string, methods: MethodSummary[] = []) {
  const zh = lang === 'zh', t = (cn: string, en: string) => zh ? cn : en
  const title = t('Matt Pocock 学习笔记', 'Matt Pocock study notes')
  const summary = t('独立整理，非官方、非商业；原作品版权归原作者。', 'Independent, unofficial, non-commercial notes. Original works belong to their authors.')
  const full = `# ${title}\n\n> ${summary}\n\n${localized.map(page => `## ${page.title}\n\n${page.markdown}`).join('\n---\n\n')}`
  const fullKb = Math.max(1, Math.round(Buffer.byteLength(full) / 1024))
  const example = localized.find(page => page.slug === 'review-and-pr') ?? localized[0]
  const groups = Object.keys(sections).flatMap(section => {
    const items = localized.filter(page => page.section === section)
    return items.length ? [`### ${sectionLabel(section, lang)}\n\n${items.map(page => `- [${page.title}](${site}/${lang}/${page.slug}.md): ${page.summary}`).join('\n')}`] : []
  }).join('\n\n')
  const homeLine = `- [${t('首页', 'Home')}](${site}/${lang}/index.md): ${t('网站介绍、从哪儿开始、全部笔记目录。', 'What the site is, where to start, and the list of all notes.')}`
  const knowledgeLine = `- [${t('学习知识库', 'Knowledge base')}](${site}/${lang}/${kbSlug}.md): ${t('每天的学习笔记：Matt Pocock 的公开分享和团队学到的知识，每条附原帖链接。', 'Our daily study notes, by date, each linked to the original post (the notes themselves are in Chinese).')}`
  // Methods: the list, then one line per set with the question it answers, grouped by domain.
  const methodsGroup = methods.length ? `### ${methodsTitle(lang)}\n\n- [${methodsTitle(lang)}](${site}${methodPath(lang)}.md): ${t('全部方法论，按领域分组。', 'Every method, grouped by domain.')}\n${byDomain(methods).flatMap(g => g.items.map(m => `- [${m.title}](${site}${methodPath(lang, m.id)}.md): ${domainLabel(g.domain, lang)} · ${m.question ?? m.claim}`)).join('\n')}\n\n` : ''
  const licensesLine = `- [${t('许可', 'Licenses')}](${site}/${lang}/${licensesSlug}.md): ${t('本站复用的 MIT 项目和自托管字体的版权声明与许可全文。', 'Copyright notices and full licence texts for the MIT projects and self-hosted fonts this site reuses.')}`
  const howTo = zh ? `## 怎么用（写给 Coding Agent）

1. 在下面的目录里找到要学的主题，每行冒号后面写了这页讲什么。
2. 读那页的 \`.md\` 链接：整页的 Markdown 原文，不用渲染 HTML，也不用跑 JS。
3. 每个网页都有对应的 \`.md\`，路径后面加 \`.md\` 就行（\`/zh/${example.slug}\` → \`/zh/${example.slug}.md\`）；首页是 \`/zh/index.md\`。
4. 想一次读完：${site}${llmsFullPath(lang)} 是全部页面合在一起，约 ${fullKb} KB。
5. 找 Matt 的原帖、文章或仓库：\`GET ${site}/api/corpus?q=关键词&limit=20\` 返回 JSON，带日期、本站摘要和原文链接；还能加 \`type=post|article|repo|web\`、\`tag=\`、\`from=\`/\`to=\`（YYYY-MM-DD）、\`sort=date\`。
6. 小节标题的锚点是固定的，引用时可以写 \`/zh/<slug>#<锚点>\`。

全站公开、只读，不用登录，也不用 API key。引用时附上页面链接；引 Matt 原话时附上原文链接。` : `## How to use this site (for coding agents)

1. Find the topic you were asked about in the index below. The text after each link says what that page answers.
2. Read that page's \`.md\` link: the whole page as plain Markdown. No HTML rendering or JS needed.
3. Every HTML page has a Markdown twin: add \`.md\` to the path (\`/en/${example.slug}\` → \`/en/${example.slug}.md\`). The home page is \`/en/index.md\`.
4. Want it all at once? ${site}${llmsFullPath(lang)} has every page in one file, about ${fullKb} KB.
5. Looking for Matt's original post, article or repo? \`GET ${site}/api/corpus?q=<words>&limit=20\` returns JSON with dates, our summaries and links to the originals. It also takes \`type=post|article|repo|web\`, \`tag=\`, \`from=\`/\`to=\` (YYYY-MM-DD) and \`sort=date\`.
6. Section headings keep stable anchors, so you can cite \`/en/<slug>#<heading-id>\`.

The site is public and read-only: no login, no API key. Cite the page URL, and link to Matt's original when you quote him.`
  const intro = t('用我们自己的话整理 Matt Pocock 的公开分享：AI coding 工作流、给 agent 立规矩、TypeScript、写作与教学。',
    'Notes in our own words on Matt Pocock\'s public teaching: AI coding workflow, rules for agents, TypeScript, and writing to teach.')
  const otherLanguage = t(`English: ${site}${llmsPath('en')}`, `Chinese version: ${site}${llmsPath('zh')}`)
  const index = `# ${title}\n\n> ${summary}\n\n${intro}${zh ? '' : ' '}${otherLanguage}\n\n${howTo}\n\n## ${t('页面', 'Pages')}\n\n${groups}\n\n${methodsGroup}### ${t('网站', 'Site')}\n\n${homeLine}\n${knowledgeLine}\n${licensesLine}\n`
  const home = `# ${title}\n\n${summary}\n\n${intro}\n\n## ${t('让你的 Coding Agent 来读', 'Let your coding agent read it')}\n\n${t('把这句话发给你的 Coding Agent，想学别的就把中间那句换掉：', 'Paste this into your coding agent and swap in whatever you want to learn:')}\n\n> ${agentPrompt(lang, site)}\n\n- ${t('用法和目录：', 'How to use the site, with the index: ')}${site}${llmsPath(lang)}\n- ${t('全部页面合在一起：', 'Every page in one file: ')}${site}${llmsFullPath(lang)}${localized.some(page => page.slug === 'corpus') ? `\n- ${t('语料库（Matt 公开资料的索引）：', 'The corpus (an index of Matt\'s public work): ')}${site}/${lang}/corpus.md` : ''}\n\n## ${t('全部笔记', 'All notes')}\n\n${groups}\n`
  return { index, full, home }
}

// The Markdown twin of /<lang>/licenses: the same intro, headings and links as the page, and every
// licence text verbatim in a fence (read through the same hash checks as the page).
const repoUrl = 'https://github.com/ledondev520/matt-pocock-study'
export function licensesMarkdown(lang: Lang, site: string) {
  const zh = lang === 'zh', t = (cn: string, en: string) => zh ? cn : en
  const { mit, fonts } = licencesView()
  const fence = (text: string) => `\`\`\`text\n${text.trimEnd()}\n\`\`\``
  const intro = `${t('本站复用或改编了下列 MIT 项目的内容，按 MIT 要求在此保留其版权声明和许可全文（与取用时上游的 LICENSE 一字不差）。本站代码采用 MIT，自写内容采用 CC BY 4.0，见', 'This site reuses or adapts material from the MIT projects below. As MIT requires, their copyright notices and full licence texts are kept here, identical to each upstream LICENSE as it stood when the material was taken. Site code is MIT and our own writing is CC BY 4.0; see the')} [LICENSE](${repoUrl}/blob/main/LICENSE)${t('；完整登记见', '. The full register is in')} [THIRD_PARTY_NOTICES](${repoUrl}/blob/main/THIRD_PARTY_NOTICES.md)${t('，引文与改编的区别见', ', and the difference between quotes and adaptations is explained in')} [${t('关于本站与版权', 'About & copyright')}](${site}/${lang}/about-and-copyright.md)${t('。', '.')}`
  const projects = mit.map(item => `### ${item.name}\n\n[${item.repo.replace('https://', '')}](${item.repo}) · [${t('原仓库 LICENSE', 'upstream LICENSE')}](${item.licenseUrl})\n\n${fence(item.text)}`)
  const fontEntries = fonts.map(item => `### ${item.name}\n\n[${item.repo.replace('https://', '')}](${item.repo}) · ${t('经', 'via')} ${item.pkg} · [${t('许可文本', 'licence file')}](${site}${item.href})\n\n${fence(item.text)}`)
  return `# ${t('许可', 'Licenses')}\n\n${intro}\n\n## ${t('MIT 许可的上游项目', 'MIT-licensed upstream projects')}\n\n${projects.join('\n\n')}\n\n## ${t('自托管字体（SIL Open Font License 1.1）', 'Self-hosted fonts (SIL Open Font License 1.1)')}\n\n${fontEntries.join('\n\n')}\n`
}

export async function buildContent(contentDir: string, outputDir: string, clean = true): Promise<Page[]> {
  const pages = await readPages(contentDir)
  await mkdir(outputPath(outputDir), { recursive: true })
  for (const lang of languages) {
    if (clean) await rm(outputPath(outputDir, lang), { recursive: true, force: true })
    await mkdir(outputPath(outputDir, lang), { recursive: true })
    const localized = pages.filter(page => page.lang === lang)
    // index.md is the home page's Markdown twin.
    if (localized.some(page => page.slug === 'index')) throw new Error(`content/${lang}/index.md would replace the home page's Markdown`)
    for (const page of localized) await writeOutput(outputPath(outputDir, lang), `${page.slug}.md`, `# ${page.title}\n\n${page.summary}\n\n${page.markdown}`)
    const { index, full, home } = agentFiles(lang, localized, siteUrl(), listMethodologies(lang))
    const base = lang === 'en' ? outputDir : outputPath(outputDir, 'zh')
    await writeOutput(base, 'llms.txt', index)
    await writeOutput(base, 'llms-full.txt', full)
    await writeOutput(outputPath(outputDir, lang), 'index.md', home)
    await writeOutput(outputPath(outputDir, lang), `${licensesSlug}.md`, licensesMarkdown(lang, siteUrl()))
  }
  await writeOutput(outputDir, 'content.json', JSON.stringify(pages))
  await writeOutput(outputDir, 'figures.json', JSON.stringify(await buildFigures(outputDir)))
  return pages
}
