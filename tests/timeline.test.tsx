// Timeline view: items built from the lessons' quotes and the knowledge base, scrubber maths, and the
// rule that Matt's original posts are not rendered until the reader turns them on.
// All pages, notes, dates and ids below are SAMPLE data written for these tests (样例数据); every
// number in them is made up.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { renderMarkdown } from '../scripts/content'
import { timelineItems, timelineMarkdown } from '../scripts/timeline'
import { pageModel } from '../scripts/static'
import { validateFeed, type KbEntry } from '../scripts/kb/feed'
import { Site } from '../src/Site'
import { TimelineList } from '../src/Timeline'
import type { Model, Page } from '../src/lib/content'
import { metadata } from '../src/lib/metadata'
import { byYear, yearIndexAt, yearIndexForKey } from '../src/lib/timeline'

const post = (id: number) => `https://x.com/mattpocockuk/status/${id}`
const quote = (text: string, id: number, date: string) => `\`\`\`quote\ntext: ${text}\nauthor: Matt Pocock\nurl: ${post(id)}\ndate: ${date}\nnote: 本站译意：样例译意 ${id}。\n\`\`\``
async function page(lang: 'zh' | 'en', slug: string, order: number, source: string): Promise<Page> {
  const rendered = await renderMarkdown(source, lang)
  return { lang, slug, title: lang === 'zh' ? `zh 样例课 ${order}` : `Sample lesson ${order}`, subtitle: 's', number: order, order, section: 'workflow', summary: lang === 'zh' ? `样例要点 ${order}` : `Sample point ${order}`, head: 'card', updated: '2099-01-01', headHtml: '', ...rendered }
}
const notes: KbEntry[] = validateFeed({ version: 2, entries: [
  { id: 'matt-notes-2099-03-04-901', date: '2099-03-04', source: 'matt-notes', title: '样例笔记甲', body: [{ text: '样例正文甲，' }, { text: '原帖', href: post(901) }, { text: '。' }], url: post(901) },
  { id: 'matt-notes-2097-05-06-902', date: '2097-05-06', source: 'matt-notes', title: '样例笔记乙', body: [{ text: '样例正文乙。' }, { text: '原帖', href: post(902) }], url: post(902) },
] }).entries
async function samplePages() {
  const zhSource = `## 样例一\n\n正文。\n\n${quote('Sample line one.', 801, '2098-07-08')}\n\n## 样例二\n\n### 小节\n\n${quote('Sample line two.', 802, '2096-09-10')}\n\n## 样例一\n\n${quote('Sample line three.', 803, '2099-03-04')}\n`
  const enSource = zhSource.replace('## 样例一', '## Sample one').replace('## 样例二', '## Sample two').replace('### 小节', '### Part').replace('## 样例一', '## Sample one').replace(/note: .*\n/g, 'note: Our sample reading.\n')
  return [await page('zh', 'sample-a', 2, zhSource), await page('en', 'sample-a', 2, enSource)]
}

describe('quotes on a page', () => {
  it('carry their date and the id of the "##" section they sit in, counted like the heading ids', async () => {
    const [zh] = await samplePages()
    expect(zh.quotes.map(q => [q.url, q.date, q.section])).toEqual([[post(801), '2098-07-08', '样例一'], [post(802), '2096-09-10', '样例二'], [post(803), '2099-03-04', '样例一-1']])
    for (const q of zh.quotes) expect(zh.html).toContain(`<h2 id="${q.section}">`)
  })
  it('a quote without a valid date fails the build', async () => {
    await expect(renderMarkdown(quote('Sample.', 804, '2099-1-2'), 'en')).rejects.toThrow(/YYYY-MM-DD/)
  })
})

describe('timeline items', () => {
  it('Chinese: notes and lesson quotes, newest first, notes before lessons on the same date', async () => {
    const items = timelineItems('zh', await samplePages(), notes)
    expect(items.map(i => [i.date, i.kind])).toEqual([['2099-03-04', 'note'], ['2099-03-04', 'lesson'], ['2098-07-08', 'lesson'], ['2097-05-06', 'note'], ['2096-09-10', 'lesson']])
    expect(new Set(items.map(i => i.id)).size).toBe(items.length)
    const lesson = items.find(i => i.original.url === post(802))!
    expect(lesson.learned).toEqual({ title: '样例二', text: '样例要点 2', href: '/zh/sample-a#样例二', from: 'zh 样例课 2' })
    expect(lesson.original).toEqual({ url: post(802), quote: 'Sample line two.', note: '本站译意：样例译意 802。' })
    expect(items[0].learned.href).toBe('/zh/knowledge#matt-notes-2099-03-04-901')
  })
  it('English: lesson quotes only (the notes are Chinese), and no Chinese text', async () => {
    const items = timelineItems('en', await samplePages(), notes)
    expect(items.map(i => i.kind)).toEqual(['lesson', 'lesson', 'lesson'])
    expect(JSON.stringify(items)).not.toMatch(/\p{Script_Extensions=Han}/u)
  })
  it('groups by year, newest first', async () => {
    expect(byYear(timelineItems('zh', await samplePages(), notes)).map(y => [y.year, y.items.length])).toEqual([['2099', 2], ['2098', 1], ['2097', 1], ['2096', 1]])
  })
  it('the Markdown twin lists what we learned by year, without original posts', async () => {
    const md = timelineMarkdown('zh', timelineItems('zh', await samplePages(), notes), 'https://example.test')
    expect(md.split('\n').filter(l => l.startsWith('#'))).toEqual(['# 时间轴', '## 2099', '### 样例笔记甲', '### 样例一', '## 2098', '### 样例一', '## 2097', '### 样例笔记乙', '## 2096', '### 样例二'])
    expect(md).toContain('[zh 样例课 2](https://example.test/zh/sample-a.md)')
    expect(md).not.toContain('x.com')
    expect(md).not.toContain('Sample line')
  })
})

describe('original posts stay hidden until shown', () => {
  it('renders no original link or quote by default, and all of them when shown', async () => {
    const years = byYear(timelineItems('zh', await samplePages(), notes))
    const hidden = renderToString(<TimelineList years={years} lang="zh" showOriginal={false} />)
    expect(hidden).not.toContain('x.com')
    expect(hidden).not.toContain('Sample line')
    expect(hidden).not.toContain('样例译意')
    expect(hidden.replace(/<[^>]+>/g, ''), 'the note text stays, its link becomes text').toContain('样例正文甲，原帖。')
    expect(hidden).toMatch(/<span class="kb-keep"><span>原帖<\/span>。<\/span>/)
    const shown = renderToString(<TimelineList years={years} lang="zh" showOriginal />)
    for (const id of [801, 802, 803, 901, 902]) expect(shown).toContain(`href="${post(id)}"`)
    for (const text of ['Sample line one.', 'Sample line two.', 'Sample line three.', '本站译意：样例译意 801。']) expect(shown).toContain(text)
  })
  it('the page: a heading, an unchecked switch and a labelled year slider; nothing else but content', async () => {
    const pages = await samplePages()
    const base: Model = { pages, figures: { zh: {}, en: {} }, corpusCount: 0, corpusItems: [], corpusTags: [], siteUrl: 'https://example.test', knowledge: notes }
    const model = pageModel(base, pages, '/zh/timeline')
    expect(pageModel(base, pages, '/zh').timeline).toBeUndefined()
    expect(model.knowledge).toBeUndefined()
    const html = renderToString(<Site model={model} path="/zh/timeline" />)
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'))
    expect(main).not.toContain('x.com')
    expect(main).toMatch(/<h1>时间轴<\/h1>/)
    expect(main).toMatch(/<input type="checkbox" role="switch"\/>/)
    expect(main).toMatch(/role="slider" tabindex="0" aria-label="按年份跳转" aria-orientation="vertical" aria-valuemin="2096" aria-valuemax="2099" aria-valuenow="2099" aria-valuetext="2099"/)
    expect([...main.matchAll(/data-year="(\d+)"/g)].map(m => m[1])).toEqual(['2099', '2098', '2097', '2096'])
    expect([...main.matchAll(/<section class="tl-year" id="year-(\d+)"/g)].map(m => m[1])).toEqual(['2099', '2098', '2097', '2096'])
    expect(html).toContain('href="/zh/timeline"')
    const en = renderToString(<Site model={pageModel(base, pages, '/en/timeline')} path="/en/timeline" />)
    expect(en.slice(en.indexOf('<main'), en.indexOf('</main>'))).not.toMatch(/\p{Script_Extensions=Han}/u)
    expect(metadata(model, '/en/timeline')).toMatchObject({ url: 'https://example.test/en/timeline', alternate: 'https://example.test/zh/timeline', xDefault: 'https://example.test/zh/timeline' })
  })
})

describe('scrubber maths', () => {
  it('maps a pointer offset to the evenly spaced year under it, clamped to the track', () => {
    expect([-5, 0, 24, 25, 74, 75, 99, 100, 500].map(y => yearIndexAt(y, 100, 4))).toEqual([0, 0, 0, 1, 2, 3, 3, 3, 3])
    expect(yearIndexAt(10, 0, 4)).toBe(0)
    expect(yearIndexAt(10, 100, 0)).toBe(-1)
  })
  it('keys follow the slider (top = newest = largest value): Up/Right newer, Home oldest, End newest', () => {
    const keys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'PageUp', 'PageDown', 'Home', 'End', 'a']
    expect(keys.map(k => yearIndexForKey(k, 2, 5))).toEqual([1, 1, 3, 3, 0, 4, 4, 0, undefined])
    expect(yearIndexForKey('ArrowUp', 0, 5)).toBe(0)
    expect(yearIndexForKey('ArrowDown', 4, 5)).toBe(4)
  })
})
