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
}
export type Figures = Record<Lang, Record<string, string>>
export interface Model { pages: PageSummary[]; currentPage?: Page; figures: Figures; corpusCount: number; corpusItems: import('../../server/corpus').CorpusRecord[]; corpusTags: string[]; siteUrl: string
  /** Archify licence appendix for non-article views whose figures embed Archify diagrams; set at build time. */
  licenceHtml?: string }
