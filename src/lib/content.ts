import type { Lang } from './lang'

export interface PageSummary {
  lang: Lang
  slug: string
  title: string
  order: number
  section: string
}

export interface Page extends PageSummary {
  markdown: string
  html: string
}
