import type { Lang } from './lang'

export const sections = {
  start: ['从这里开始', 'Start here'], principles: ['核心理念', 'Core ideas'],
  punchlines: ['Punch lines 精选', 'Punch lines'], workflow: ['AI coding 工作流', 'AI coding workflow'],
  'agent-rules': ['给 agent 立规矩', 'Rules for agents'], typescript: ['TypeScript 心法', 'TypeScript'],
  writing: ['写作与传播', 'Writing & teaching'], repos: ['开源仓库导览', 'Open-source guide'],
  cheatsheet: ['速查表', 'Cheat sheets'], path: ['学习路径', 'Learning paths'], about: ['关于本站', 'About'], corpus: ['语料库', 'Corpus'],
} as const
export type Section = keyof typeof sections
export const sectionLabel = (section: string, lang: Lang) => sections[section as Section]?.[lang === 'zh' ? 0 : 1] ?? section
export interface PageSummary {
  lang: Lang
  slug: string
  number: number
  title: string
  subtitle: string
  order: number
  section: Section
  summary: string
  head: string
  updated: string
}
export interface Page extends PageSummary {
  markdown: string
  html: string
  headHtml: string
  toc: { id: string; title: string }[]
  /** The page's short quotes in source order, each with the id of its "## …" section ('' before the first). */
  quotes: { text: string; url: string; date: string; note?: string; section: string }[]
}
export type Figures = Record<Lang, Record<string, string>>
export interface Model { pages: PageSummary[]; currentPage?: Page; figures: Figures; corpusCount: number; corpusItems: import('../../server/corpus').CorpusRecord[]; corpusTags: string[]; siteUrl: string
  /** Copyright and licence texts, only set on the /licenses views (build time, hash-checked). */
  licences?: Licences
  /** Knowledge base entries (newest first); only set on the knowledge base views. */
  knowledge?: import('../../scripts/kb/feed').KbEntry[]
  /** What to learn today (newest first); only set on the home pages. */
  today?: import('./learn').TodayItem[]
  /** Timeline items in this view's language (newest first); only set on the timeline views. */
  timeline?: import('./timeline').TimelineItem[] }
export interface Licences {
  mit: { id: string; name: string; repo: string; licenseUrl: string; adapted: { file: string; pages: string[] }[]; text: string }[]
  fonts: { id: string; name: string; pkg: string; repo: string; href: string; text: string }[]
}
