import { useEffect, useState } from 'react'
import { Site } from './Site'
import type { Model, Page } from './lib/content'
import { metadata } from './lib/metadata'
import { pickLang, routeInfo } from './lib/lang'
import { savePreference, storedPreference } from './lib/preferences'

export function App({ model: initialModel }: { model: Model }) {
  const [model, setModel] = useState(initialModel)
  const [path, setPath] = useState(window.location.pathname)
  const [dark, setDark] = useState(false)
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
    let navigation = 0
    async function navigate(target: string, push = false) {
      const version = ++navigation
      const url = new URL(target, location.href)
      const { lang, slug, home } = routeInfo(url.pathname)
      try {
        let next: Model
        if (import.meta.env.DEV) {
          const pages: Page[] = await (await fetch('/content.json')).json()
          next = { ...initialModel, pages, currentPage: pages.find(p => p.lang === lang && p.slug === slug) }
        } else {
          const response = await fetch(home ? `/${lang}/index.json` : `/${lang}/${slug}.json`)
          if (!response.ok) throw new Error('Page data unavailable')
          next = await response.json()
        }
        if (version !== navigation) return
        if (push) history.pushState(null, '', url.pathname + url.hash)
        setModel(next); setPath(url.pathname)
        requestAnimationFrame(() => { if (url.hash) document.getElementById(url.hash.slice(1))?.scrollIntoView(); else window.scrollTo(0, 0) })
      } catch { if (version === navigation) location.assign(url.href) }
    }
    if (window.location.pathname === '/') {
      const target = `/${pickLang(storedPreference('lang'), navigator.language)}`
      history.replaceState(null, '', target); void navigate(target)
    }
    const pop = () => { void navigate(window.location.pathname) }
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target.closest('a') : null
      if (!target || target.hasAttribute('download') || target.getAttribute('target') === '_blank') return
      const href = target.getAttribute('href')
      if (!href) return
      const url = new URL(href, location.href)
      if (url.origin !== location.origin || !/^\/(zh|en)(\/[-a-z0-9]+)?\/?$/.test(url.pathname)) return
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
    document.querySelectorAll('link[rel="alternate"]').forEach(link => link.setAttribute('href', link.getAttribute('hreflang') === m.lang ? m.url : m.alternate))
  }, [model, path])
  function toggleTheme() {
    const value = !dark
    document.documentElement.classList.toggle('dark', value); savePreference('theme', value ? 'dark' : 'light'); setDark(value)
  }
  return <Site key={path} model={model} path={path} dark={dark} onTheme={toggleTheme} onLanguage={lang => savePreference('lang', lang)} />
}
