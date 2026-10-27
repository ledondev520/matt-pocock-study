// Minimal Q&A panel for /api/ask. Not mounted anywhere yet: the home page owner adds
// `<AskPanel lang={lang} />` where the search box lives (load it lazily so it stays off first paint).
// Answers render as plain text; the only links are the ones the server built from its sources.
import { useState } from 'react'
import { ASK_MAX_CHARS, askQuestion, safeHref, type AskCitation, type AskResult } from './lib/ask'
import type { Lang } from './lib/lang'

const copy = {
  zh: { label: '问一个方法论问题', submit: '提问', busy: '正在找…', source: '原帖', page: '本站', limited: '提问太频繁了，请稍后再试。', unavailable: 'AI 问答暂时不可用。', invalid: '问题需要 1–300 字。' },
  en: { label: 'Ask about a method', submit: 'Ask', busy: 'Looking…', source: 'post', page: 'site', limited: 'Too many questions; try again shortly.', unavailable: 'Answers are unavailable right now.', invalid: 'Questions need 1–300 characters.' },
}

function Links({ c, t }: { c: AskCitation; t: typeof copy.zh }) {
  const post = safeHref(c.sourceUrl), page = safeHref(c.siteUrl)
  return <>[{c.n}]{post && <> <a href={post} target="_blank" rel="noreferrer">{t.source}{c.date ? ` ${c.date}` : ''}</a></>}{page && <> · <a href={page}>{t.page}</a></>}</>
}

export function AskPanel({ lang, ask = askQuestion }: { lang: Lang; ask?: typeof askQuestion }) {
  const t = copy[lang]
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AskResult>()
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setResult(await ask(q, lang))
    setBusy(false)
  }
  const byN = new Map(result && 'citations' in result ? result.citations.map(c => [c.n, c]) : [])
  return <section className="ask-panel" aria-label={t.label}>
    <form onSubmit={submit}>
      <label htmlFor="ask-q">{t.label}</label>
      <textarea id="ask-q" value={q} maxLength={ASK_MAX_CHARS} rows={2} onChange={e => setQ(e.target.value)} />
      <span aria-live="polite">{[...q].length}/{ASK_MAX_CHARS}</span>
      <button type="submit" disabled={busy || !q.trim()}>{busy ? t.busy : t.submit}</button>
    </form>
    <div aria-live="polite" className="ask-result">
      {result?.mode === 'answer' && <>
        {result.title && <h3>{result.title}</h3>}
        <ol>{result.points.map((p, i) => <li key={i}>
          <strong>{p.title}</strong> {p.text}
          {p.quote && <blockquote lang="en">“{p.quote}” — Matt Pocock{safeHref(p.quoteUrl) && <> · <a href={safeHref(p.quoteUrl)} target="_blank" rel="noreferrer">{t.source}</a></>}</blockquote>}
          <small> {p.cites.map(n => byN.get(n)).filter(Boolean).map(c => <span key={c!.n}><Links c={c!} t={t} /> </span>)}</small>
        </li>)}</ol>
      </>}
      {(result?.mode === 'not_found' || result?.mode === 'search') && <p>{result.message}</p>}
      {result?.mode === 'search' && <ul>{result.citations.map(c => <li key={c.n}>{c.title || c.snippet} <small><Links c={c} t={t} /></small></li>)}</ul>}
      {result?.mode === 'limited' && <p>{t.limited}</p>}
      {result?.mode === 'unavailable' && <p>{t.unavailable}</p>}
      {result?.mode === 'invalid' && <p>{t.invalid}</p>}
    </div>
  </section>
}
