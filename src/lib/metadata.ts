import type { Model } from './content'
import { routeInfo } from './lang'
import { timelineSlug } from './timeline'
/** The licences view (/zh/licenses, /en/licenses); not a content page. */
export const licensesSlug = 'licenses'
/** The knowledge base view (/zh/knowledge, /en/knowledge); not a content page. */
export const kbSlug = 'knowledge'
export function metadata(model: Model, path: string) {
  const { lang, slug, home } = routeInfo(path)
  const zh = lang === 'zh'
  // The root serves the Chinese home page, so it shares /zh's canonical URL; x-default is Chinese.
  const xDefault = (zhRoute: string) => `${model.siteUrl}${zhRoute}`
  if (slug === licensesSlug) {
    return { lang, title: `${zh ? '许可' : 'Licenses'} · Matt Study Notes`,
      description: zh ? '本站复用的 MIT 项目与自托管字体的版权和许可全文。' : 'Copyright and licence texts for the MIT projects and self-hosted fonts this site reuses.',
      url: `${model.siteUrl}/${lang}/${licensesSlug}`, image: `${model.siteUrl}/og/${lang}/home.png`, alternate: `${model.siteUrl}/${zh ? 'en' : 'zh'}/${licensesSlug}`, xDefault: xDefault(`/zh/${licensesSlug}`) }
  }
  const page = model.pages.find(p => p.lang === lang && p.slug === slug)
  if (slug === kbSlug) {
    return { lang, title: `${zh ? '学习知识库' : 'Knowledge base'} · Matt Study Notes`,
      description: zh ? '每天的学习笔记，每条附原帖链接。' : 'Daily study notes, each linked to the original post.',
      url: `${model.siteUrl}/${lang}/${kbSlug}`, image: `${model.siteUrl}/og/${lang}/home.png`, alternate: `${model.siteUrl}/${zh ? 'en' : 'zh'}/${kbSlug}`, xDefault: xDefault(`/zh/${kbSlug}`) }
  }
  if (slug === timelineSlug) {
    return { lang, title: `${zh ? '时间轴' : 'Timeline'} · Matt Study Notes`,
      description: zh ? '按时间排列我们从 Matt Pocock 的公开分享里学到的要点，可按年份跳转，原帖默认隐藏。' : 'What we learned from Matt Pocock’s public posts, by date, with a year scrubber; his original posts stay hidden until you show them.',
      url: `${model.siteUrl}/${lang}/${timelineSlug}`, image: `${model.siteUrl}/og/${lang}/home.png`, alternate: `${model.siteUrl}/${zh ? 'en' : 'zh'}/${timelineSlug}`, xDefault: xDefault(`/zh/${timelineSlug}`) }
  }
  const title = page?.title ?? (home ? zh ? '今天学什么' : 'What to learn today' : zh ? '页面不存在' : 'Page not found')
  const description = page?.summary ?? (zh ? '向 Matt Pocock 学习 TypeScript、AI coding 与写作的方法。' : 'Learning from Matt Pocock: TypeScript, AI coding and writing.')
  const route = home || !page ? `/${lang}` : path.replace(/\/$/, '')
  return { lang, title: `${title} · Matt Study Notes`, description, url: `${model.siteUrl}${route}`, image: `${model.siteUrl}/og/${lang}/${page ? slug : 'home'}.png`, alternate: `${model.siteUrl}/${zh ? 'en' : 'zh'}${home ? '' : page ? `/${slug}` : ''}`, xDefault: xDefault(`/zh${home ? '' : page ? `/${slug}` : ''}`) }
}
