import type { Lang } from '../../src/lib/lang'
import { byDate, SOURCES, type KbEntry, type Segment } from './feed'

// The Markdown twin of /<lang>/knowledge: what the page shows, in the same order. The notes are in
// Chinese, so the English twin (like the English page) lists only the dates and the original posts
// and carries no Chinese text. Text comes from the validated, gate-checked feed.
const inline = (segments: Segment[]) => segments.map(s => s.href ? `[${s.text}](${s.href})` : s.text).join('')
export function knowledgeMarkdown(lang: Lang, entries: KbEntry[]) {
  const days = byDate(entries)
  if (lang === 'en') {
    const body = days.length ? days.map(day => `## ${day.date}\n\n${day.entries.map((entry, i) => `- [${SOURCES[entry.source].label[1]}: original post ${i + 1}](${entry.url})`).join('\n')}`).join('\n\n') : '## No notes yet'
    return `# Knowledge base\n\n${body}\n`
  }
  const body = days.length ? days.map(day => `## ${day.date}\n\n${day.entries.map(entry => `### ${entry.title}\n\n${SOURCES[entry.source].label[0]}\n\n${inline(entry.body)}\n\n[查看原帖](${entry.url})`).join('\n\n')}`).join('\n\n') : '## 还没有笔记'
  return `# 学习知识库\n\n${body}\n`
}
