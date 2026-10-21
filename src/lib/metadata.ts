import type { Model } from './content'
import { routeInfo } from './lang'
export function metadata(model: Model, path: string) {
  const { lang, slug, home } = routeInfo(path)
  const page = model.pages.find(p => p.lang === lang && p.slug === slug)
  const title = page?.title ?? (home ? lang === 'zh' ? '想清楚，再动手。' : 'Think clearly. Build better.' : lang === 'zh' ? '页面不存在' : 'Page not found')
  const description = page?.summary ?? (lang === 'zh' ? '向 Matt Pocock 学习：独立整理的 TypeScript、AI coding 与写作笔记。非官方、非商业。' : 'Independent study notes on Matt Pocock’s public TypeScript, AI coding and teaching material. Unofficial and non-commercial.')
  const route = home || !page ? `/${lang}` : path.replace(/\/$/, '')
  return { lang, title: `${title} · Matt Study Notes`, description, url: `${model.siteUrl}${route}`, image: `${model.siteUrl}/og/${lang}/${page ? slug : 'home'}.png`, alternate: `${model.siteUrl}/${lang === 'zh' ? 'en' : 'zh'}${home ? '' : page ? `/${slug}` : ''}` }
}
