import type { Lang } from '../../src/lib/lang'
import { kbSlug } from '../../src/lib/metadata'
import { byDate, SOURCES, type KbEntry, type Segment } from './feed'

// The Markdown twin of /<lang>/knowledge: what the page shows, in the same order. The notes are in
// Chinese, so the English twin (like the English page) lists only the dates and the original posts
// and carries no Chinese text. Text comes from the validated, gate-checked feed.
const inline = (segments: Segment[]) => segments.map(s => s.href ? `[${s.text}](${s.href})` : s.text).join('')
export function knowledgeMarkdown(lang: Lang, entries: KbEntry[], site: string) {
  const days = byDate(entries)
  if (lang === 'en') {
    const lede = `Our daily study notes: what we learned from Matt Pocock’s public posts, and what the team picked up elsewhere, in our own words. The notes are in Chinese: read them on the [Chinese page](${site}/zh/${kbSlug}.md), or open the original posts below. Our reading is not the authors’ view.`
    const body = days.length ? days.map(day => `## ${day.date}\n\n${day.entries.map((entry, i) => `- [${SOURCES[entry.source].label[1]}: original post ${i + 1}](${entry.url})`).join('\n')}`).join('\n\n') : '## No notes yet'
    return `# Knowledge base\n\n${lede}\n\n${body}\n`
  }
  const lede = '我们每天的学习笔记：从 Matt Pocock 的公开帖子里挑出值得学的，加上团队在别处学到的东西，用我们自己的话记下来，每条都附原帖链接。原话和语境以原帖为准，本站解读不代表原作者观点。'
  const body = days.length ? days.map(day => `## ${day.date}\n\n${day.entries.map(entry => `### ${entry.title}\n\n${SOURCES[entry.source].label[0]}\n\n${inline(entry.body)}\n\n[查看原帖](${entry.url})`).join('\n\n')}`).join('\n\n') : '## 还没有笔记'
  return `# 学习知识库\n\n${lede}\n\n${body}\n`
}
