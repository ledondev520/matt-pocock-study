import { expect, it } from 'vitest'
import { fold, localSource, searchItems, type SearchItem } from '../src/lib/search'
import { agentPrompt } from '../src/lib/agent'
import { interimSource, learnSource, searchIndex, todayItems } from '../scripts/learn/source'
import { dropCounts, withoutCounts } from '../scripts/kb/counts'
import type { KbEntry } from '../scripts/kb/feed'
import type { PageSummary } from '../src/lib/content'

const items: SearchItem[] = [
  { kind: 'post', title: '先写规格再开工', text: '把需求拆成可验证的小票据。', href: '/zh/knowledge#a' },
  { kind: 'note', title: '评审与 PR', text: '需求轴与规范轴分开看。', href: '/zh/review-and-pr' },
  { kind: 'note', title: 'Review and PRs', text: 'Requirements and standards are separate axes.', href: '/en/review-and-pr' },
]
it('search matches Chinese substrings without word breaks, English case-insensitively, title hits first', () => {
  expect(searchItems(items, '规格再').map(i => i.href)).toEqual(['/zh/knowledge#a'])
  expect(searchItems(items, '需求').map(i => i.href)).toEqual(['/zh/knowledge#a', '/zh/review-and-pr'])
  expect(searchItems(items, 'REVIEW').map(i => i.href)).toEqual(['/en/review-and-pr'])
  expect(searchItems(items, 'ｒｅｖｉｅｗ  axes').map(i => i.href)).toEqual(['/en/review-and-pr'])
  expect(searchItems(items, 'PR').map(i => i.href)[0]).toBe('/zh/review-and-pr')
  expect(searchItems(items, '没有这个词')).toEqual([])
  expect(searchItems(items, '   ')).toEqual([])
  expect(fold(' Ａ  B ')).toBe('a b')
})
it('the local source loads each language index once, on first use', async () => {
  const loads: string[] = []
  const source = localSource(async lang => { loads.push(lang); return items })
  expect(loads).toEqual([])
  source.prepare!('zh')
  await source.search('需求', 'zh')
  await source.search('规格', 'zh')
  expect(loads).toEqual(['zh'])
  await source.search('review', 'en')
  expect(loads).toEqual(['zh', 'en'])
  // A failed load is retried next time instead of being cached.
  let fail = true
  const flaky = localSource(async () => { if (fail) throw new Error('offline'); return items })
  await expect(flaky.search('需求', 'zh')).rejects.toThrow('offline')
  fail = false
  expect((await flaky.search('需求', 'zh')).length).toBe(2)
})
it('returns the best passage per method while keeping notes and separate knowledge entries', () => {
  const passages: SearchItem[] = Array.from({ length: 12 }, (_, i) => ({ kind: 'step', title: 'Review', text: i === 9 ? 'specific issue' : 'General advice', href: `/en/methods/pr-review#s${i + 1}` }))
  const note: SearchItem = { kind: 'note', title: 'Review & PR', text: 'Evidence', href: '/en/review-and-pr' }
  const results = searchItems([...passages, note], 'review')
  expect(results.map(r => r.href)).toEqual(['/en/methods/pr-review#s1', note.href])
  expect(searchItems(passages, 'specific')[0]?.href).toBe('/en/methods/pr-review#s10')
  expect(searchItems(items, '需求').map(i => i.href)).toEqual(['/zh/knowledge#a', '/zh/review-and-pr'])
  expect(searchItems([{ ...items[0]!, href: '/zh/knowledge#b' }, items[0]!], '规格再')).toHaveLength(2)
})
it('the agent prompt is ready to paste: full llms.txt address, no instructions or placeholders', () => {
  const site = 'https://matt.withkeya.com'
  expect(agentPrompt('zh', site)).toContain('https://matt.withkeya.com/llms.txt')
  expect(agentPrompt('en', site)).toContain('https://matt.withkeya.com/llms.txt')
  for (const lang of ['zh', 'en'] as const) expect(agentPrompt(lang, site)).not.toMatch(/替换|换掉|说话就行|swap|replace|placeholder|\{|\}|<|>|…/i)
  expect(agentPrompt('en', site)).not.toMatch(/[\u3000-\u9fff]/)
})
it('uses all methodologies for today and search, with localized step links and notes', () => {
  const pages = [{ lang: 'en', slug: 'review-and-pr', title: 'Review and PRs', subtitle: 'Review', summary: 'Two axes.' }] as PageSummary[]
  const source = learnSource({ knowledge: [], pages })
  for (const lang of ['zh', 'en'] as const) {
    const list = source.listMethodologies(lang)
    expect(list).toHaveLength(31)
    expect(list.every(m => m.href.startsWith(`/${lang}/methods/`))).toBe(true)
    const review = source.getMethodology('pr-review', lang)!
    expect(review.id).toBe('m.pr-review')
    expect(review.steps.length).toBeGreaterThan(0)
    expect(source.getMethodology('missing', lang)).toBeUndefined()
    const today = todayItems(source, lang)
    expect(today).toHaveLength(6)
    expect(today.map(m => m.dateLast)).toEqual(today.map(m => m.dateLast).sort().reverse())
    const index = searchIndex(source, lang)
    expect(index.some(c => c.kind === 'overview' && c.href === `/${lang}/methods/pr-review`)).toBe(true)
    expect(index.some(c => c.kind === 'step' && c.href === `/${lang}/methods/pr-review#s1`)).toBe(true)
    expect(index.every(c => c.href.startsWith(`/${lang}/`))).toBe(true)
    expect(index.map(c => c.text).join('\n')).not.toMatch(/\bMIT\b/)
    if (lang === 'en') {
      expect(index).toContainEqual({ kind: 'note', title: 'Review and PRs', text: 'Review Two axes.', href: '/en/review-and-pr' })
      expect(index.map(c => c.title + c.text).join('\n')).not.toMatch(/[\u3000-\u9fff]/)
    }
  }
})
const entry = (id: string, date: string, title: string, text: string): KbEntry => ({ id, date, source: 'matt-notes', url: `https://x.com/mattpocockuk/status/${id}`, title, body: [{ text }] } as KbEntry)
it('engagement counts are dropped from knowledge text at build', () => {
  expect(withoutCounts('这条帖子 1.2 万赞、30 万浏览，讲的是规格。')).toBe('这条帖子，讲的是规格。')
  expect(withoutCounts('他说先写测试。这是本周互动最高的一条。')).toBe('他说先写测试。')
  expect(withoutCounts('Ship small (2,400 likes).')).toBe('Ship small.')
  const kept = dropCounts({ ...entry('1', '2026-10-27', '标题', ''), body: [{ text: '共 300 赞' }, { text: '原帖', href: 'https://x.com/a' }] } as KbEntry)
  expect(kept.body).toEqual([{ text: '共' }, { text: '原帖', href: 'https://x.com/a' }])
})
it('drops a count-only segment before a link but preserves punctuation after the link', () => {
  const original = {
    ...entry('matt-notes-2026-10-28-2115394392273895644', '2026-10-28', 'PR 描述', ''),
    body: [
      { text: '140 赞。' },
      { text: '原帖', href: 'https://x.com/mattpocockuk/status/2115394392273895644' },
      { text: '，PR 是 ' },
      { text: 'course-video-manager#2399', href: 'https://github.com/mattpocock/course-video-manager/pull/2399' },
      { text: '。' },
    ],
  }
  expect(dropCounts(original).body).toEqual([
    { text: '原帖', href: 'https://x.com/mattpocockuk/status/2115394392273895644' },
    { text: '，PR 是 ' },
    { text: 'course-video-manager#2399', href: 'https://github.com/mattpocock/course-video-manager/pull/2399' },
    { text: '。' },
  ])
})
it('removes only newly exposed leading sentence punctuation after dropping counts', () => {
  for (const punctuation of '。，、；：！？.,;:!?…') {
    expect(withoutCounts(`140 赞${punctuation}`)).toBe('')
    expect(withoutCounts(` 140 赞 ${punctuation} ${punctuation} 后文。`)).toBe('后文。')
    expect(withoutCounts(` ${punctuation} 后文。`)).toBe(` ${punctuation} 后文。`)
    expect(withoutCounts(` ${punctuation} 后文 140 赞`)).toBe(` ${punctuation} 后文`)
  }
})
it.each([
  ['140 likes .NET configuration', '.NET configuration'],
  ['140 赞。.env 配置', '.env 配置'],
  ['140 likes .NET', '.NET'],
  ['140 likes, .NET configuration', '.NET configuration'],
  ['140 赞。 .env 配置', '.env 配置'],
])('preserves identifier punctuation after a removed count: %s', (input, expected) => {
  expect(withoutCounts(input)).toBe(expected)
})
it('the learn source feeds today (newest first, limited) and the search index from one place', () => {
  const knowledge = [entry('1', '2026-10-26', '旧的', '旧'), entry('2', '2026-10-27', '新的一', '一'), entry('3', '2026-10-27', '新的二', '二')]
  const pages = [{ lang: 'zh', slug: 'review-and-pr', title: '评审与 PR', subtitle: '评审与 PR', summary: '需求与规范。' }, { lang: 'en', slug: 'review-and-pr', title: 'Review and PRs', subtitle: 'Review', summary: 'Two axes.' }] as PageSummary[]
  const source = interimSource({ knowledge, pages })
  expect(todayItems(source, 'zh').map(i => i.title)).toEqual(['新的一', '新的二'])
  expect(todayItems(source, 'zh', 1)).toHaveLength(1)
  expect(todayItems(source, 'en').every(i => i.href.startsWith('https://x.com/') && !/[\u3000-\u9fff]/.test(i.title))).toBe(true)
  expect(searchIndex(source, 'zh').map(i => i.href)).toEqual(['/zh/knowledge#1', '/zh/knowledge#2', '/zh/knowledge#3', '/zh/review-and-pr'])
  expect(searchIndex(source, 'en')).toEqual([{ kind: 'note', title: 'Review and PRs', text: 'Review Two axes.', href: '/en/review-and-pr' }])
})

it.each([
  ['140 赞、30 万浏览。正文。', '正文。'],
  ['140 likes, 20 views.', ''],
  ['(140 likes).', ''],
  ['（140 赞）。正文。', '正文。'],
  ['140 赞。30 浏览。.env 配置', '.env 配置'],
  ['(140 likes), (20 views); .NET configuration', '.NET configuration'],
])('removes the separators of a leading count run: %s', (input, expected) => {
  expect(withoutCounts(input)).toBe(expected)
})
it('drops consecutive and parenthesized count-only segments without changing linked punctuation', () => {
  const link = { text: 'Original', href: 'https://x.com/a' }
  expect(dropCounts({ ...entry('counts', '2026-10-29', '(140 likes).', ''), body: [
    { text: '140 likes, 20 views.' }, { text: '（140 赞）。' }, link, { text: '，说明。' },
  ] }).body).toEqual([link, { text: '，说明。' }])
})
