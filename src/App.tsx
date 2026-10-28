import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { Site } from './Site'
import type { Model, Page } from './lib/content'
import { markdownPath } from './lib/agent'
import { kbSlug, licensesSlug, metadata } from './lib/metadata'
import { routeInfo } from './lib/lang'
import { methodsSlug } from './lib/methods'
import { savePreference } from './lib/preferences'

export function App({ model: initialModel }: { model: Model }) {
  const [model, setModel] = useState(initialModel)
  const [path, setPath] = useState(window.location.pathname)
  const [dark, setDark] = useState(false)
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
    let navigation = 0
    let renderedPath = window.location.pathname
    async function navigate(target: string, push = false) {
      const version = ++navigation
      const url = new URL(target, location.href)
      const { lang, slug, method, home } = routeInfo(url.pathname)
      try {
        let next: Model
        // Methodology views are only pre-rendered (no dev content.json for them).
        if (import.meta.env.DEV && slug !== methodsSlug) {
          const pages: Page[] = await (await fetch('/content.json')).json()
          next = { ...initialModel, pages, currentPage: pages.find(p => p.lang === lang && p.slug === slug) }
        } else {
          const response = await fetch(home ? `/${lang}/index.json` : `/${lang}/${slug}${method ? `/${method}` : ''}.json`)
          if (!response.ok) throw new Error('Page data unavailable')
          next = await response.json()
        }
        if (version !== navigation) return
        if (push) history.pushState(null, '', url.pathname + url.hash)
        // Commit the destination before looking up its heading. In particular,
        // Chinese fragments arrive percent-encoded in URL.hash.
        flushSync(() => { setModel(next); setPath(url.pathname) })
        renderedPath = url.pathname
        if (url.hash) {
          let id = url.hash.slice(1)
          try { id = decodeURIComponent(id) } catch { /* A literal malformed fragment can still be an ID. */ }
          document.getElementById(id)?.scrollIntoView()
        } else window.scrollTo(0, 0)
      } catch { if (version === navigation) location.assign(url.href) }
    }
    // "/" is pre-rendered as the Chinese home page. A reader who chose English is sent to /en by the
    // inline script in index.html before the body is parsed, so no language is shown and replaced.
    const pop = () => {
      if (location.pathname === renderedPath) {
        // Native hash/history traversal already owns scrolling on this page.
        navigation++
        return
      }
      void navigate(location.pathname + location.search + location.hash)
    }
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target.closest('a') : null
      if (!target || target.hasAttribute('download') || target.getAttribute('target') === '_blank') return
      const href = target.getAttribute('href')
      if (!href) return
      const url = new URL(href, location.href)
      if (url.origin !== location.origin || !routeInfo(url.pathname).valid) return
      if (url.pathname === location.pathname && url.hash) return
      event.preventDefault(); void navigate(url.pathname + url.hash, true)
    }
    const copy = async (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-copy]') : null
      if (!button) return
      try { await navigator.clipboard.writeText(button.closest('.code-window')?.querySelector('code')?.textContent ?? ''); button.textContent = document.documentElement.lang === 'zh' ? '已复制' : 'Copied' }
      catch { button.textContent = document.documentElement.lang === 'zh' ? '请手动选择复制' : 'Select text to copy' }
    }
    window.addEventListener('popstate', pop); document.addEventListener('click', click); document.addEventListener('click', copy)
    return () => { navigation++; window.removeEventListener('popstate', pop); document.removeEventListener('click', click); document.removeEventListener('click', copy) }
  }, [initialModel])
  useEffect(() => {
    const m = metadata(model, path)
    document.documentElement.lang = m.lang; document.title = m.title
    for (const [selector, value] of [['meta[name="description"]', m.description], ['meta[property="og:title"]', m.title], ['meta[property="og:description"]', m.description], ['meta[property="og:url"]', m.url], ['meta[property="og:image"]', m.image]]) document.querySelector(selector)?.setAttribute('content', value)
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', m.url)
    // Language alternates only (this language, the other one, x-default → Chinese). The Markdown
    // alternate has no hreflang and points at this page's .md twin.
    document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(link => link.setAttribute('href', link.getAttribute('hreflang') === 'x-default' ? m.xDefault : link.getAttribute('hreflang') === m.lang ? m.url : m.alternate))
    // Homes, pages and the views (licences, knowledge base, methods) have a twin; unknown routes (404) do not.
    const { lang, slug, method, home } = routeInfo(path)
    const methodsView = slug === methodsSlug && !!model.methods && (!method || !!model.methods.current)
    let twin = document.querySelector('link[rel="alternate"][type="text/markdown"]')
    if (!home && slug !== licensesSlug && slug !== kbSlug && !methodsView && !model.pages.some(p => p.lang === lang && p.slug === slug)) twin?.remove()
    else {
      if (!twin) { twin = Object.assign(document.createElement('link'), { rel: 'alternate', type: 'text/markdown' }); document.head.append(twin) }
      twin.setAttribute('href', markdownPath(path))
    }
  }, [model, path])
  function toggleTheme() {
    const value = !dark
    document.documentElement.classList.toggle('dark', value); savePreference('theme', value ? 'dark' : 'light'); setDark(value)
  }
  return <Site key={path} model={model} path={path} dark={dark} onTheme={toggleTheme} onLanguage={lang => savePreference('lang', lang)} />
}
