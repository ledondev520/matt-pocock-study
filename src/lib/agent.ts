import { routeInfo, type Lang } from './lang'

/** The line a reader pastes into a coding agent. Shown on the home page and in its Markdown twin. */
export function agentPrompt(lang: Lang, site: string) {
  return lang === 'zh'
    ? `去 ${site}/zh/llms.txt 学一下怎么把大 PR 切小，学完讲给我听。`
    : `Go read ${site}/llms.txt and teach me how to split up a big PR.`
}

/** Where the Markdown twin of an HTML route lives: /zh → /zh/index.md, /en/x → /en/x.md, /en/methods/x → /en/methods/x.md, / (the Chinese home) → /zh/index.md. */
export function markdownPath(path: string) {
  const { lang, slug, method, home } = routeInfo(path)
  return home ? `/${lang}/index.md` : `/${lang}/${slug}${method ? `/${method}` : ''}.md`
}

/** The agent guide for each language (English at the root, Chinese under /zh). */
export const llmsPath = (lang: Lang) => lang === 'zh' ? '/zh/llms.txt' : '/llms.txt'
export const llmsFullPath = (lang: Lang) => lang === 'zh' ? '/zh/llms-full.txt' : '/llms-full.txt'
