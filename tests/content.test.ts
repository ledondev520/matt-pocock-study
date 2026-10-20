import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { buildContent } from '../scripts/content'

it('builds HTML, JSON, LLM indexes, full text, and every Markdown download in both languages', async () => {
  const output = await mkdtemp(join(tmpdir(), 'matt-content-'))
  try {
    const pages = await buildContent('content', output)
    expect(pages).toHaveLength(6)
    expect(JSON.parse(await readFile(join(output, 'content.json'), 'utf8'))).toEqual(pages)
    for (const lang of ['en', 'zh']) {
      const base = lang === 'en' ? output : join(output, lang)
      const index = await readFile(join(base, 'llms.txt'), 'utf8')
      const full = await readFile(join(base, 'llms-full.txt'), 'utf8')
      expect(index).toMatch(/^# .+\n\n> /)
      expect(index).toContain('\n## ')
      for (const page of pages.filter((item) => item.lang === lang)) {
        expect(page.html).toContain('<h1>')
        expect(index).toContain(`https://matt.withkeya.com/${lang}/${page.slug}.md`)
        expect(full).toContain(page.markdown)
        const markdown = await readFile(join(output, lang, `${page.slug}.md`), 'utf8')
        expect(markdown).toBe(page.markdown)
        expect(markdown).not.toContain('slug:')
      }
    }
  } finally { await rm(output, { recursive: true, force: true }) }
})
