import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Zap, Github, Sun, Moon, Menu, Search } from 'lucide-react'
import { localSource, type SearchItem, type SearchSource } from './lib/search'
import { Arrow, ArrowText } from './Arrow'
import { AskEntry } from './AskEntry'
import { sectionLabel, type Model, type Page, type PageSummary } from './lib/content'
import { routeInfo, type Lang } from './lib/lang'
import { agentPrompt } from './lib/agent'
import { siteNotice } from './lib/notice'
import { kbSlug, licensesSlug } from './lib/metadata'
import type { CorpusRecord } from '../server/corpus'
import { byDate, SOURCES, type KbEntry } from '../scripts/kb/feed'
import { KbText } from './KbText'
import { Timeline } from './Timeline'
import { timelineSlug } from './lib/timeline'

export const sourceUrl = 'https://github.com/ledondev520/matt-pocock-study'
export function pageHref(model: Model, lang: Lang, slug: string) {
  return model.pages.some(p => p.lang === lang && p.slug === slug) ? `/${lang}/${slug}` : `/${lang}#topics`
}
export function Figure({ id, lang, model }: { id: string; lang: Lang; model: Model }) {
  return <div dangerouslySetInnerHTML={{ __html: model.figures[lang][id] ?? '' }} />
}
export function Site({ model, path, dark = false, onTheme, onLanguage }: {
  model: Model; path: string; dark?: boolean; onTheme?: () => void; onLanguage?: (lang: Lang) => void;
}) {
  const [menu, setMenu] = useState(false)
  const { lang, slug, home } = routeInfo(path)
  const zh = lang === 'zh', other = zh ? 'en' : 'zh'
  const t = (cn: string, en: string) => zh ? cn : en
  const pages = model.pages.filter(p => p.lang === lang && p.slug !== 'corpus')
  const page = model.currentPage?.lang === lang && model.currentPage.slug === slug ? model.currentPage : undefined
  const corpus = slug === 'corpus', licenses = slug === licensesSlug && !!model.licences, kb = slug === kbSlug, timeline = slug === timelineSlug
  const otherPath = `/${other}${page ? `/${page.slug}` : licenses ? `/${licensesSlug}` : kb ? `/${kbSlug}` : timeline ? `/${timelineSlug}` : ''}`
  useEffect(() => { setMenu(false) }, [path])
  return <>
    <a className="skip-link" href="#main">{t('跳至正文', 'Skip to content')}</a>
    <header className="site-header"><div className="wrap header-inner">
      <a className="brand" href={`/${lang}`}><span className="brand-icon"><Zap size={25} fill="currentColor" /></span><span><strong>Matt<span className="brand-dot">.</span>{t('学习笔记', 'Study notes')}</strong></span></a>
      <nav className={menu ? 'main-nav open' : 'main-nav'} aria-label={t('主导航', 'Main navigation')}>
        <a href={`/${lang}#topics`}>{t('学习笔记', 'Notes')}</a><a href={`/${lang}/corpus`}>{t('语料库', 'Corpus')}</a><a href={`/${lang}/${kbSlug}`}>{t('知识库', 'Knowledge')}</a><a href={`/${lang}/${timelineSlug}`}>{t('时间轴', 'Timeline')}</a>
      </nav>
      <div className="header-tools"><a className="language-toggle" href={otherPath} hrefLang={other} lang={other === 'zh' ? 'zh-Hans' : 'en'} onClick={() => onLanguage?.(other)}>{t('EN', '中文')}</a><span className="tool-divider" /><button className="icon-button" onClick={onTheme} aria-label={t(dark ? '切换浅色主题' : '切换深色主题', dark ? 'Switch to light theme' : 'Switch to dark theme')} aria-pressed={dark}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button><a className="github-link" href={sourceUrl} aria-label="GitHub source"><Github size={21} /></a><button className="icon-button mobile-menu" aria-label={t('打开导航', 'Toggle navigation')} aria-expanded={menu} onClick={() => setMenu(!menu)}><Menu size={22} /></button></div>
    </div></header>
    <main id="main" tabIndex={-1}>
      {home ? <Home model={model} lang={lang} pages={pages} /> : licenses ? <Licenses model={model} lang={lang} /> : corpus ? <Corpus model={model} lang={lang} intro={page} /> : kb ? <KnowledgeBase entries={model.knowledge ?? []} lang={lang} /> : timeline ? <Timeline items={model.timeline ?? []} lang={lang} /> : page ? <Article model={model} page={page} pages={pages} /> : <div className="wrap missing-page"><h1>{t('这个地址没有页面', 'Page not found')}</h1><Figure id="spot-404" model={model} lang={lang} /><div className="hero-actions"><a className="primary-button" href={`/${lang}`}>{t('回到首页', 'Back home')}</a><a href={`/${lang}/corpus`}>{t('搜索语料库', 'Search the corpus')} <Arrow dir="up-right" /></a></div></div>}
    </main>
    <footer className="site-footer wrap"><a className="footer-licenses" href={`/${lang}/${licensesSlug}`}>{t('许可', 'Licenses')}</a></footer>
  </>
}
// One quiet line: a button that copies a ready-made prompt for a coding agent. The prompt itself is
// not shown; where the Clipboard API is missing or refused, it is revealed and selected instead so
// the reader can copy it by hand.
function AgentCopy({ lang, site }: { lang: Lang; site: string }) {
  const zh = lang === 'zh', t = (cn: string, en: string) => zh ? cn : en
  const [copied, setCopied] = useState(false), [manual, setManual] = useState(false)
  const text = agentPrompt(lang, site)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  useEffect(() => {
    if (!manual) return
    const node = document.getElementById('agent-prompt-text'), selection = window.getSelection()
    if (!node || !selection) return
    const range = document.createRange()
    range.selectNodeContents(node)
    selection.removeAllRanges()
    selection.addRange(range)
  }, [manual])
  function copy() {
    if (!navigator.clipboard) return setManual(true)
    navigator.clipboard.writeText(text).then(() => setCopied(true), () => setManual(true))
  }
  return <div className="agent-copy"><span className="agent-copy-hint">{t('点一下复制，丢给你的 agent', 'Copy and paste into your agent')}</span><button type="button" className="agent-copy-button" data-longest={t('已复制', 'Copied')} onClick={copy} aria-label={copied ? t('已复制给 agent 的提示', 'Copied the prompt for your agent') : t('复制给 agent 的提示', 'Copy the prompt for your agent')}><span>{copied ? t('已复制', 'Copied') : t('复制', 'Copy')}</span></button><span className="sr-only" aria-live="polite">{copied ? t('已复制', 'Copied') : ''}</span><p id="agent-prompt-text" className="agent-copy-text" hidden={!manual}>{text}</p></div>
}
// Site search over a static, per-language index (knowledge entries and notes) that is fetched on
// first focus, so the first paint does not wait for it. Matching runs in the page; nothing leaves the
// site. `source` is the seam for another provider (an answering endpoint can implement SearchSource).
const defaultSource = localSource()
function SiteSearch({ lang, source = defaultSource }: { lang: Lang; source?: SearchSource }) {
  const zh = lang === 'zh', t = (cn: string, en: string) => zh ? cn : en
  const [query, setQuery] = useState(''), [results, setResults] = useState<SearchItem[] | null>(null), [failed, setFailed] = useState(false)
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (!query.trim()) { setResults(null); return }
    let live = true
    source.search(query, lang).then(items => { if (live) { setResults(items); setFailed(false) } }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [query, lang, source])
  const links = () => [...(list.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])]
  function submit(event: FormEvent) { event.preventDefault(); links()[0]?.click() }
  function inputKey(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' && links().length) { event.preventDefault(); links()[0].focus() }
    if (event.key === 'Escape') setQuery('')
  }
  function listKey(event: KeyboardEvent) {
    const all = links(), i = all.indexOf(document.activeElement as HTMLAnchorElement)
    if (event.key === 'ArrowDown') { event.preventDefault(); all[Math.min(i + 1, all.length - 1)]?.focus() }
    if (event.key === 'ArrowUp') { event.preventDefault(); if (i <= 0) input.current?.focus(); else all[i - 1].focus() }
    if (event.key === 'Escape') { event.preventDefault(); input.current?.focus() }
  }
  const empty = results !== null && !results.length
  return <div className="site-search"><AskEntry lang={lang} onFallback={q => { setQuery(q); input.current?.focus() }}><form role="search" onSubmit={submit}><div className="search-box"><Search size={20} aria-hidden="true" /><input ref={input} id="site-search" type="search" maxLength={200} autoComplete="off" value={query} aria-label={t('搜索', 'Search')} aria-controls="site-search-results" placeholder={t('搜索', 'Search')} onFocus={() => source.prepare?.(lang)} onChange={e => setQuery(e.target.value)} onKeyDown={inputKey} /></div></form></AskEntry>
    <ul id="site-search-results" ref={list} className="search-results" onKeyDown={listKey} hidden={!results?.length}>{results?.map(item => <li key={item.href}><a href={item.href}><strong><ArrowText>{item.title}</ArrowText></strong><span><ArrowText>{item.text.length > 70 ? `${item.text.slice(0, 70)}…` : item.text}</ArrowText></span></a></li>)}</ul>
    <p className="search-status" role="status">{failed ? t('暂时无法搜索', 'Search is unavailable') : empty ? t('没有找到', 'No results') : ''}</p></div>
}
function Home({ model, lang, pages }: { model: Model; lang: Lang; pages: PageSummary[] }) {
  const zh = lang === 'zh', t = (cn: string, en: string) => zh ? cn : en
  const today = model.today ?? []
  return <div className="wrap home">
    <SiteSearch lang={lang} />
    <section className="today" aria-labelledby="today-title"><h1 id="today-title">{t('今天学什么', 'What to learn today')}</h1>
      {today.length ? <ol className="kb-list">{today.map(item => <li className="kb-entry" key={item.id}>{item.label && <span className="kb-badge">{item.label}</span>}<h2><a href={item.href} {...(/^https?:/.test(item.href) ? { target: '_blank', rel: 'noreferrer' } : {})}><ArrowText>{item.title}</ArrowText>{/^https?:/.test(item.href) && <> <Arrow dir="up-right" /></>}</a></h2>{item.rich ? <p><KbText segments={item.rich} /></p> : item.question ? <p><ArrowText>{item.question}</ArrowText></p> : null}{item.sourceUrl && <a className="kb-source" href={item.sourceUrl} target="_blank" rel="noreferrer">{t('查看原帖', 'Original post')} <Arrow dir="up-right" /></a>}</li>)}</ol> : null}
    </section>
    <nav className="home-notes" id="topics" aria-labelledby="notes-title"><h2 id="notes-title">{t('学习笔记', 'Notes')}</h2>{Array.from(new Set(pages.map(p => p.section))).map(section => <div className="section-group" id={`section-${section}`} key={section}><h3>{sectionLabel(section, lang)}</h3><ul>{pages.filter(p => p.section === section).map(p => <li key={p.slug}><a href={`/${lang}/${p.slug}`}><ArrowText>{p.title}</ArrowText></a></li>)}</ul></div>)}</nav>
    <AgentCopy lang={lang} site={model.siteUrl} />
  </div>
}
function Article({ page, pages }: { model: Model; page: Page; pages: PageSummary[] }) {
  const { lang } = page, zh = lang === 'zh', t = (cn: string, en: string) => zh ? cn : en
  const index = pages.findIndex(p => p.slug === page.slug)
  return <div className="article-page wrap"><div className="article-layout"><aside className="article-sidebar"><a href={`/${lang}`}><Arrow dir="left" /> {t('返回学习笔记', 'Back to notes')}</a><span className="eyebrow">{sectionLabel(page.section, lang)}</span><ol>{pages.filter(p => p.section === page.section).map(p => <li key={p.slug} className={p.slug === page.slug ? 'current' : ''}><a href={`/${lang}/${p.slug}`} aria-current={p.slug === page.slug ? 'page' : undefined}>{String(p.number).padStart(2, '0')} <ArrowText>{p.title}</ArrowText></a></li>)}</ol><span className="eyebrow">{t('全部栏目', 'ALL SECTIONS')}</span><ul>{Array.from(new Set(pages.map(p => p.section))).map(section => <li key={section}><a href={`/${lang}#section-${section}`}>{sectionLabel(section, lang)}</a></li>)}</ul></aside><article className="full-article"><nav className="breadcrumb" aria-label={t('面包屑导航', 'Breadcrumb')}><a href={`/${lang}#section-${page.section}`}>{sectionLabel(page.section, lang)}</a><span>/</span><span><ArrowText>{page.title}</ArrowText></span></nav><h1><ArrowText>{page.title}</ArrowText></h1><p className="article-lede"><ArrowText>{page.subtitle}</ArrowText></p><div dangerouslySetInnerHTML={{ __html: page.headHtml }} /><div className="article-body" dangerouslySetInnerHTML={{ __html: page.html }} /><nav className="article-end" aria-label={t('相邻页面', 'Adjacent pages')}>{pages[index - 1] ? <a href={`/${lang}/${pages[index - 1].slug}`}><Arrow dir="left" /><span><ArrowText>{pages[index - 1].title}</ArrowText></span></a> : <a href={`/${lang}`}><Arrow dir="left" /><span>{t('首页', 'Home')}</span></a>}{pages[index + 1] && <a href={`/${lang}/${pages[index + 1].slug}`}><span><ArrowText>{pages[index + 1].title}</ArrowText></span><Arrow dir="right" /></a>}</nav></article><aside className="page-toc"><span className="eyebrow">{t('本页目录', 'ON THIS PAGE')}</span><ol>{page.toc.map(item => <li key={item.id}><a href={`#${item.id}`}><ArrowText>{item.title}</ArrowText></a></li>)}</ol></aside></div></div>
}
// Copyright and licence notices, verbatim. Small and plain on purpose: the page exists for the record.
function Licenses({ model, lang }: { model: Model; lang: Lang }) {
  const zh = lang === 'zh', t = (cn: string, en: string) => zh ? cn : en
  const { mit, fonts } = model.licences!
  return <div className="wrap licenses-page">
    <h1>{t('许可', 'Licenses')}</h1>
    <p className="licenses-note">{siteNotice(lang)}</p>
    <p>{t('本站代码采用 MIT，自写内容采用 CC BY 4.0，见', 'Site code is MIT and our own writing is CC BY 4.0; see')} <a href={`${sourceUrl}/blob/main/LICENSE`}>LICENSE</a>{t('；完整登记见', '. The full register is in')} <a href={`${sourceUrl}/blob/main/THIRD_PARTY_NOTICES.md`}>THIRD_PARTY_NOTICES</a>{t('。下列 MIT 项目的版权声明和许可全文按 MIT 要求原样保留（与取用时上游的 LICENSE 一字不差）。', '. As MIT requires, the projects below keep their copyright notices and full licence texts, identical to each upstream LICENSE as it stood when the material was taken.')}</p>
    <h2>{t('MIT 许可的上游项目', 'MIT-licensed upstream projects')}</h2>
    {mit.map(item => <section key={item.id} id={item.id} className="license-entry"><h3>{item.name}</h3><p><a href={item.repo}>{item.repo.replace('https://', '')}</a> · <a href={item.licenseUrl}>{t('原仓库 LICENSE', 'upstream LICENSE')}</a></p>{item.adapted.length > 0 && <ul className="license-adapted">{item.adapted.map(a => <li key={a.file}><a href={item.licenseUrl.replace(/LICENSE$/, a.file)}>{a.file}</a>{t('：', ': ')}{a.pages.map((slug, i) => <span key={slug}>{i ? t('、', ', ') : ''}<a href={`/${lang}/${slug}`}>{model.pages.find(p => p.lang === lang && p.slug === slug)?.title ?? slug}</a></span>)}</li>)}</ul>}<pre lang="en" className="license-text">{item.text}</pre></section>)}
    <h2>{t('自托管字体（SIL Open Font License 1.1）', 'Self-hosted fonts (SIL Open Font License 1.1)')}</h2>
    {fonts.map(item => <section key={item.id} id={`font-${item.id}`} className="license-entry"><h3>{item.name}</h3><p><a href={item.repo}>{item.repo.replace('https://', '')}</a> · {t('经', 'via')} {item.pkg} · <a href={item.href}>{t('许可文本', 'licence file')}</a></p><pre lang="en" className="license-text">{item.text}</pre></section>)}
  </div>
}
function Corpus({ model, lang, intro }: { model: Model; lang: Lang; intro?: Page }) {
  const zh = lang === 'zh', t = (cn: string, en: string) => zh ? cn : en
  const [q, setQ] = useState(''), [type, setType] = useState(''), [tag, setTag] = useState('')
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [sort, setSort] = useState('engagement')
  const [offset, setOffset] = useState(0), [version, setVersion] = useState(0)
  const [rows, setRows] = useState<CorpusRecord[]>(model.corpusItems), [total, setTotal] = useState(model.corpusCount)
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true); setError('')
      const params = new URLSearchParams({ q, type, tag, from, to, sort, limit: '20', offset: String(offset) })
      fetch(`/api/corpus?${params}`, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error(response.status === 400 ? 'invalid' : 'unavailable')
        return response.json() as Promise<{ items: CorpusRecord[]; total: number }>
      }).then(data => { setRows(data.items); setTotal(data.total) }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'unavailable') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 200)
    return () => { clearTimeout(timer); controller.abort() }
  }, [q, type, tag, from, to, sort, offset, version])
  const resetPage = (setter: (value: string) => void, value: string) => { setter(value); setOffset(0) }
  function submit(event: FormEvent) { event.preventDefault(); setVersion(v => v + 1) }
  return <div className="wrap corpus-reader"><div className="corpus-page-intro"><a href={`/${lang}`}><Arrow dir="left" /> {t('返回首页', 'Back home')}</a><h1>{intro?.title ?? t('语料库', 'Corpus')}</h1></div><section className="corpus-panel"><form role="search" onSubmit={submit}><div className="search-row"><div className="search-box"><Search size={20} /><input id="corpus-q" type="search" aria-label={t('搜索语料库', 'Search the corpus')} maxLength={200} value={q} onChange={e => resetPage(setQ, e.target.value)} placeholder={t('例如：typescript、工作流…', 'Try typescript or workflow…')} /></div><button className="primary-button">{t('搜索', 'Search')}</button></div><div className="corpus-filter-row"><label>{t('类型', 'Type')}<select aria-label={t('类型', 'Type')} value={type} onChange={e => resetPage(setType, e.target.value)}><option value="">{t('全部', 'All')}</option>{['post', 'article', 'repo', 'web'].map(value => <option key={value}>{value}</option>)}</select></label><label>{t('起始日期', 'From')}<input type="date" value={from} onChange={e => resetPage(setFrom, e.target.value)} /></label><label>{t('截止日期', 'To')}<input type="date" value={to} onChange={e => resetPage(setTo, e.target.value)} /></label><label>{t('排序', 'Sort')}<select aria-label={t('排序', 'Sort')} value={sort} onChange={e => resetPage(setSort, e.target.value)}><option value="engagement">{t('互动数', 'Engagement')}</option><option value="date">{t('最新', 'Newest')}</option></select></label></div><fieldset className="tag-filters"><legend>{t('主题标签', 'Topic tags')}</legend><button type="button" aria-pressed={!tag} onClick={() => resetPage(setTag, '')}>{t('全部', 'All')}</button>{model.corpusTags.map(value => <button type="button" key={value} aria-pressed={tag === value} onClick={() => resetPage(setTag, tag === value ? '' : value)}>{value}</button>)}</fieldset></form><p className="result-count" role="status">{loading ? t('搜索中…', 'Searching…') : ''}</p>{error ? <div role="alert"><p>{error === 'invalid' ? t('请检查日期范围与筛选条件。', 'Check the date range and filters.') : t('暂时无法读取语料，请重试。', 'The corpus is unavailable. Please retry.')}</p><button onClick={() => setVersion(v => v + 1)}>{t('重试', 'Retry')}</button></div> : rows.length ? <div aria-busy={loading}>{rows.map(record => <div className="corpus-record" key={record.id}><span className="type-badge">{record.type}</span><div className="record-main"><a className="record-title" href={record.url} target="_blank" rel="noreferrer"><ArrowText>{record.summary[lang]}</ArrowText> <Arrow dir="up-right" /></a><div className="record-detail"><time dateTime={record.date}>{record.date.slice(0, 10)}</time><span>{record.tags.join(' · ')}</span></div></div></div>)}</div> : <div className="empty-state"><h2>{t('没有匹配的记录', 'No matching sources')}</h2><Figure model={model} lang={lang} id="spot-empty" /><button onClick={() => { setQ(''); setType(''); setTag(''); setFrom(''); setTo(''); setOffset(0) }}>{t('清除筛选', 'Clear filters')}</button></div>}<div className="pagination"><button disabled={!offset || loading} onClick={() => setOffset(Math.max(0, offset - 20))}><Arrow dir="left" /><span>{t('上一页', 'Previous')}</span></button><button disabled={offset + 20 >= total || loading} onClick={() => setOffset(offset + 20)}><span>{t('下一页', 'Next')}</span><Arrow dir="right" /></button></div></section>{intro && <div className="intro-prose corpus-intro-prose" dangerouslySetInnerHTML={{ __html: intro.html }} />}</div>
}

// Knowledge base. Every string comes from data/knowledge-base.json, which the build validates and
// gate-checks; React escapes all text and links point only at allow-listed hosts (KbText).
function KnowledgeBase({ entries, lang }: { entries: KbEntry[]; lang: Lang }) {
  const zh = lang === 'zh', days = byDate(entries)
  const back = <a href={`/${lang}`}><Arrow dir="left" /> {zh ? '返回首页' : 'Back home'}</a>
  if (!zh) {
    // The notes are written in Chinese; this page stays free of Chinese text (English pages never
    // load the Chinese font), so it lists the dates and original posts only.
    return <div className="wrap kb-reader"><div className="corpus-page-intro">{back}<h1>Knowledge base</h1>
    </div>
      {days.length ? days.map(day => <section className="kb-day" key={day.date} aria-labelledby={`day-${day.date}`}><h2 id={`day-${day.date}`}><time dateTime={day.date}>{day.date}</time></h2><ol className="kb-list">{day.entries.map((entry, i) => <li className="kb-entry" id={entry.id} key={entry.id}><a className="kb-source" href={entry.url} target="_blank" rel="noreferrer">{SOURCES[entry.source].label[1]}: original post {i + 1} <Arrow dir="up-right" /></a></li>)}</ol></section>)
        : <div className="empty-state"><h2>No notes yet</h2></div>}</div>
  }
  return <div className="wrap kb-reader"><div className="corpus-page-intro">{back}<h1>学习知识库</h1>
    </div>
    {days.length ? days.map(day => <section className="kb-day" key={day.date} aria-labelledby={`day-${day.date}`}><h2 id={`day-${day.date}`}><time dateTime={day.date}>{day.date}</time></h2><ol className="kb-list">{day.entries.map(entry => <li className="kb-entry" id={entry.id} key={entry.id}><span className="kb-badge">{SOURCES[entry.source].label[0]}</span><h3><ArrowText>{entry.title}</ArrowText></h3><p><KbText segments={entry.body} /></p><a className="kb-source" href={entry.url} target="_blank" rel="noreferrer">查看原帖 <Arrow dir="up-right" /></a></li>)}</ol></section>)
      : <div className="empty-state"><h2>还没有笔记</h2></div>}</div>
}
