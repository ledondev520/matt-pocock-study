import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { marked } from 'marked'
import type { Page } from '../src/lib/content'
import { siteUrl } from '../src/lib/site'

const languages = ['en', 'zh'] as const

export async function readPages(contentDir: string): Promise<Page[]> {
  const pages: Page[] = []
  for (const lang of languages) {
    const files = (await readdir(join(contentDir, lang))).filter((file) => file.endsWith('.md')).sort()
    for (const file of files) {
      const source = await readFile(join(contentDir, lang, file), 'utf8')
      const frontMatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
      if (!frontMatter) throw new Error(`Missing front matter: ${lang}/${file}`)
      const data: unknown = parse(frontMatter[1])
      if (!data || typeof data !== 'object') throw new Error(`Invalid front matter: ${lang}/${file}`)
      const content = source.slice(frontMatter[0].length)
      const { slug, title, order, section } = data as Record<string, unknown>
      if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
        || typeof title !== 'string' || !title.trim() || typeof order !== 'number'
        || !Number.isFinite(order) || typeof section !== 'string' || !section.trim()) {
        throw new Error(`Invalid front matter: ${lang}/${file}`)
      }
      if (pages.some((page) => page.lang === lang && page.slug === slug)) {
        throw new Error(`Duplicate slug: ${lang}/${slug}`)
      }
      const markdown = content.trim() + '\n'
      // Markdown is repository-authored, trusted content; there is no user HTML input.
      pages.push({ lang, slug, title, order, section, markdown, html: await marked.parse(markdown) })
    }
  }
  const slugs = (lang: string) => pages.filter((page) => page.lang === lang).map((page) => page.slug).sort().join(',')
  if (!pages.length || slugs('en') !== slugs('zh')) throw new Error('Both languages must have the same nonempty set of slugs')
  return pages.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
}

export async function buildContent(contentDir: string, outputDir: string): Promise<Page[]> {
  const pages = await readPages(contentDir)
  await mkdir(outputDir, { recursive: true })
  // These language directories contain generated files only; remove stale downloads.
  for (const lang of languages) {
    await rm(join(outputDir, lang), { recursive: true, force: true })
    await mkdir(join(outputDir, lang), { recursive: true })
    const localized = pages.filter((page) => page.lang === lang)
    for (const page of localized) {
      await writeFile(join(outputDir, lang, `${page.slug}.md`), page.markdown)
    }
    const title = lang === 'en' ? 'Matt Pocock study notes' : 'Matt Pocock 学习笔记'
    const summary = lang === 'en'
      ? 'Unofficial, non-commercial study notes about Matt Pocock’s public work, written in our own words.'
      : '用我们自己的话整理 Matt Pocock 公开作品的学习笔记，非官方、非商业。'
    const links = localized.map((page) => `- [${page.title}](${siteUrl()}/${lang}/${page.slug}.md): ${page.section}`).join('\n')
    const index = `# ${title}\n\n> ${summary}\n\n## ${lang === 'en' ? 'Pages' : '页面'}\n\n${links}\n`
    const full = `# ${title}\n\n> ${summary}\n\n${localized.map((page) => `<!-- /${lang}/${page.slug}.md -->\n\n${page.markdown}`).join('\n---\n\n')}`
    const base = lang === 'en' ? outputDir : join(outputDir, 'zh')
    await writeFile(join(base, 'llms.txt'), index)
    await writeFile(join(base, 'llms-full.txt'), full)
  }
  await writeFile(join(outputDir, 'content.json'), JSON.stringify(pages))
  return pages
}
