import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import type { Page, PageSummary } from '@/lib/content'
import { pickLang, type Lang } from '@/lib/lang'
import { savePreference, storedPreference } from '@/lib/preferences'

const copy = {
  en: {
    name: 'Matt · Study notes',
    tribute: 'Matt Pocock is a developer educator and the creator of Total TypeScript and AI Hero. These notes are a small tribute to his public teaching, written in our own words.',
    follow: 'Follow Matt and learn directly from his work:',
    pages: 'Pages', search: 'Search notes', submit: 'Search', empty: 'No matching notes.',
    failed: 'Could not load the notes. Please try again.', searchFailed: 'Search is unavailable. Please try again.',
    loading: 'Loading notes…', missing: 'Page not found.', home: 'Go to the welcome page',
    download: 'Download .md', dark: 'Dark theme', light: 'Light theme',
    footer: 'Unofficial, non-commercial study notes. All rights to the original works belong to Matt Pocock. Quotes link to their sources.',
  },
  zh: {
    name: 'Matt · 学习笔记',
    tribute: 'Matt Pocock 是开发者教育者，也是 Total TypeScript 和 AI Hero 的创作者。我们用自己的话记录学习心得，向他的公开教学致敬。',
    follow: '欢迎关注 Matt，直接从他的作品中学习：',
    pages: '页面', search: '搜索笔记', submit: '搜索', empty: '没有找到相关笔记。',
    failed: '无法加载笔记，请重试。', searchFailed: '搜索暂时不可用，请重试。',
    loading: '正在加载笔记…', missing: '页面不存在。', home: '前往欢迎页',
    download: '下载 .md', dark: '深色主题', light: '浅色主题',
    footer: '非官方、非商业的学习整理，版权归原作者 Matt Pocock。引用均附原文链接。',
  },
}

export function App() {
  const route = window.location.pathname.match(/^\/(en|zh)\/([^/]+)\/?$/)
  const lang: Lang = route ? route[1] as Lang : pickLang(storedPreference('lang'), navigator.language)
  const slug = route?.[2]
  const text = copy[lang]
  const otherLang = lang === 'en' ? 'zh' : 'en'
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const [pages, setPages] = useState<Page[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PageSummary[] | null>(null)
  const [searchError, setSearchError] = useState(false)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    document.documentElement.lang = lang
    if (window.location.pathname === '/') window.location.replace(`/${lang}/welcome`)
    const controller = new AbortController()
    fetch('/content.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Content unavailable')
        return response.json() as Promise<Page[]>
      })
      .then(setPages)
      .catch(() => { if (!controller.signal.aborted) setLoadError(true) })
    return () => controller.abort()
  }, [lang])

  const page = pages?.find((item) => item.lang === lang && item.slug === slug)
  useEffect(() => {
    document.title = `${page?.title ?? text.name} · Matt Pocock`
  }, [page, text.name])

  function toggleTheme() {
    document.documentElement.classList.toggle('dark', !dark)
    savePreference('theme', dark ? 'light' : 'dark')
    setDark(!dark)
  }

  async function search(event: FormEvent) {
    event.preventDefault()
    setSearching(true)
    setSearchError(false)
    setResults(null)
    try {
      const response = await fetch(`/api/search?${new URLSearchParams({ lang, q: query })}`)
      if (!response.ok) throw new Error('Search unavailable')
      setResults(await response.json() as PageSummary[])
    } catch { setSearchError(true) }
    finally { setSearching(false) }
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">{lang === 'en' ? 'Skip to content' : '跳至正文'}</a>
      <header>
        <a className="site-name" href={`/${lang}/welcome`}>{text.name}</a>
        <div className="header-actions">
          <Button variant="outline" size="sm" asChild>
            <a href={`/${otherLang}/${slug ?? 'welcome'}`} lang={otherLang} hrefLang={otherLang} onClick={() => savePreference('lang', otherLang)}>
              {lang === 'en' ? '中文' : 'English'}
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={toggleTheme} aria-pressed={dark}>{dark ? text.light : text.dark}</Button>
          <a href="https://github.com/ledondev520/matt-pocock-study">GitHub</a>
        </div>
      </header>

      <aside className="tribute" aria-label={lang === 'en' ? 'About Matt Pocock' : '关于 Matt Pocock'}>
        <p>{text.tribute}</p>
        <p>{text.follow} <a href="https://x.com/mattpocockuk">X</a>{' · '}
          <a href="https://github.com/mattpocock">GitHub</a>{' · '}
          <a href="https://www.aihero.dev">AI Hero</a>
        </p>
      </aside>

      <nav aria-label={text.pages}>
        {Array.from(new Set(pages?.filter((item) => item.lang === lang).map((item) => item.section))).map((section) => (
          <div className="page-links" key={section}>
            <span className="muted">{section}</span>
            {pages?.filter((item) => item.lang === lang && item.section === section).map((item) => (
              <a key={item.slug} href={`/${lang}/${item.slug}`} aria-current={item.slug === slug ? 'page' : undefined}>{item.title}</a>
            ))}
          </div>
        ))}
      </nav>

      <form role="search" onSubmit={(event) => { void search(event) }}>
        <label htmlFor="search">{text.search}</label>
        <div className="search-controls">
          <input id="search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200} required />
          <Button variant="outline" disabled={searching}>{text.submit}</Button>
        </div>
      </form>
      <div role="status" aria-live="polite">
        {searchError && <p>{text.searchFailed}</p>}
        {results && (results.length ? <ul>{results.map((result) => <li key={result.slug}><a href={`/${lang}/${result.slug}`}>{result.title}</a></li>)}</ul> : <p>{text.empty}</p>)}
      </div>

      <main id="main" tabIndex={-1}>
        {loadError ? <p role="alert">{text.failed}</p> : !pages ? <p>{text.loading}</p> : page ? (
          <>
            <article className="prose" dangerouslySetInnerHTML={{ __html: page.html }} />
            <p><a href={`/${lang}/${page.slug}.md`} download>{text.download}</a></p>
          </>
        ) : <><h1>{text.missing}</h1><a href={`/${lang}/welcome`}>{text.home}</a></>}
      </main>
      <footer><p>{text.footer}</p></footer>
    </div>
  )
}
