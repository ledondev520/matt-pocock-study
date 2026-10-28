import { routeInfo, type Lang } from './lang'

/** The prompt the home page copies for a coding agent (also in the home page's Markdown twin). It is
 * complete as written: no placeholder, nothing for the reader to edit. */
export function agentPrompt(lang: Lang, site: string) {
  return lang === 'zh'
    ? `请读 ${site}/llms.txt 和其中列出的 Matt Pocock 学习笔记，然后根据这些内容帮我学习、回答我的问题，引用时附上对应页面的链接。`
    : `Read ${site}/llms.txt and the Matt Pocock study notes it lists, then use them to help me learn and to answer my questions, citing the page links.`
}

/** Where the Markdown twin of an HTML route lives: /zh → /zh/index.md, /en/x → /en/x.md, /en/methods/x → /en/methods/x.md, / (the Chinese home) → /zh/index.md. */
export function markdownPath(path: string) {
  const { lang, slug, method, home } = routeInfo(path)
  return home ? `/${lang}/index.md` : `/${lang}/${slug}${method ? `/${method}` : ''}.md`
}

/** The agent guide for each language (English at the root, Chinese under /zh). */
export const llmsPath = (lang: Lang) => lang === 'zh' ? '/zh/llms.txt' : '/llms.txt'
export const llmsFullPath = (lang: Lang) => lang === 'zh' ? '/zh/llms-full.txt' : '/llms-full.txt'
