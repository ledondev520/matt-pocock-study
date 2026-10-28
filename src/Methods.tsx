// Methodology views: the list (/<lang>/methods) and one set (/<lang>/methods/<slug>). Titles and
// content only; every quote and step links to Matt's original post. All strings come from
// data/methods/*.json (validated at build) except the section titles in src/lib/methods.ts.
import { Arrow, ArrowText } from './Arrow'
import type { Lang } from './lib/lang'
import type { PageSummary } from './lib/content'
import { byDomain, currentLabel, domainLabel, methodPath, methodsTitle, relatedLinks, sectionTitle, text, translationLabel, type Anchor, type MethodsView, type Methodology, type MethodSummary } from './lib/methods'

/** Long tokens in quotes ("noUncheckedIndexedAccess":) get break points at camel humps and after
 * / . _ -, so a narrow screen wraps inside the word instead of before its trailing punctuation. */
function Breakable({ children }: { children: string }) {
  return children.split(/(\s+)/).map((token, i) => token.length <= 18 ? token
    : <span key={i}>{token.split(/(?<=[a-z])(?=[A-Z])|(?<=[/._-])(?=\w)/).flatMap((part, j) => j ? [<wbr key={j} />, part] : [part])}</span>)
}

function Source({ anchor, lang }: { anchor: Anchor; lang: Lang }) {
  const cite = <cite><a href={anchor.url} target="_blank" rel="noreferrer">Matt Pocock · <time dateTime={anchor.date}>{anchor.date}</time> <Arrow dir="up-right" /></a></cite>
  if (!anchor.quote) return <p className="method-source">{cite}</p>
  return <blockquote className="method-quote"><p lang="en"><Breakable>{anchor.quote}</Breakable></p>{lang === 'zh' && anchor.quote_zh && <p className="quote-translation">{translationLabel}：{anchor.quote_zh}</p>}{cite}</blockquote>
}
const Sources = ({ anchors, lang }: { anchors: Anchor[]; lang: Lang }) => <>{anchors.map((a, i) => <Source key={i} anchor={a} lang={lang} />)}</>

function MethodsNav({ list, lang, current }: { list: MethodSummary[]; lang: Lang; current?: string }) {
  return <aside className="article-sidebar method-nav"><a href={methodPath(lang)}><Arrow dir="left" /> {methodsTitle(lang)}</a>
    {byDomain(list).map(g => <div key={g.domain}><span className="eyebrow">{domainLabel(g.domain, lang)}</span><ol>{g.items.map(m => <li key={m.id} className={m.id === current ? 'current' : ''}><a href={methodPath(lang, m.id)} aria-current={m.id === current ? 'page' : undefined}><ArrowText>{m.title}</ArrowText></a></li>)}</ol></div>)}
  </aside>
}

export function MethodsIndex({ view, lang }: { view: MethodsView; lang: Lang }) {
  return <div className="wrap methods-index"><h1>{methodsTitle(lang)}</h1>
    {byDomain(view.list).map(g => <section key={g.domain} className="section-group" aria-labelledby={`domain-${g.domain}`}><h2 id={`domain-${g.domain}`}>{domainLabel(g.domain, lang)}</h2>
      <div className="topic-grid">{g.items.map(m => <div className="topic-card" key={m.id}><a href={methodPath(lang, m.id)}><h3><ArrowText>{m.title}</ArrowText> <Arrow dir="up-right" /></h3>{m.question && <p><ArrowText>{m.question}</ArrowText></p>}</a></div>)}</div>
    </section>)}
  </div>
}

export function MethodPage({ m, view, lang, pages }: { m: Methodology; view: MethodsView; lang: Lang; pages: PageSummary[] }) {
  const related = relatedLinks(m, lang, view.list, pages)
  return <div className="article-page wrap"><div className="article-layout"><MethodsNav list={view.list} lang={lang} current={m.id} />
    <article className="full-article method-article">
      <h1><ArrowText>{m.title[lang]}</ArrowText></h1>
      <section id="claim"><h2>{sectionTitle('claim', lang)}</h2><p className="method-claim"><ArrowText>{m.claim.text[lang]}</ArrowText></p><Sources anchors={m.claim.anchors} lang={lang} /></section>
      <section id="steps"><h2>{sectionTitle('steps', lang)}</h2>
        {m.steps.map(s => <section className="method-step" id={`s${s.order}`} key={s.id}><h3>{s.order}. <ArrowText>{s.title[lang]}</ArrowText></h3><p className="method-how"><ArrowText>{s.how[lang]}</ArrowText></p><Sources anchors={s.anchors} lang={lang} /></section>)}
      </section>
      {!!m.examples?.length && <section id="examples"><h2>{sectionTitle('examples', lang)}</h2>
        {m.examples.map((e, i) => e.origin === 'link-only' || e.body === undefined
          ? <p className="method-source" key={i}><a href={e.url} target="_blank" rel="noreferrer"><ArrowText>{e.title![lang]}</ArrowText> <Arrow dir="up-right" /></a></p>
          : <div className="method-example" key={i}>{e.title && <h3><ArrowText>{e.title[lang]}</ArrowText></h3>}<pre><code>{text(e.body, lang)}</code></pre>{e.url && <p className="method-source"><a href={e.url} target="_blank" rel="noreferrer">{e.url.replace('https://', '')} <Arrow dir="up-right" /></a></p>}</div>)}
      </section>}
      {!!m.pitfalls?.length && <section id="pitfalls"><h2>{sectionTitle('pitfalls', lang)}</h2><ul className="method-pitfalls">
        {m.pitfalls.map((p, i) => <li key={i}><p className="method-pitfall"><ArrowText>{p.text[lang]}</ArrowText></p><Sources anchors={p.anchors} lang={lang} /></li>)}
      </ul></section>}
      {!!m.evolution?.length && <section id="evolution"><h2>{sectionTitle('evolution', lang)}</h2><ol className="method-evolution">
        {m.evolution.map((e, i) => <li key={i} className={e.current ? 'current' : undefined}><div className="method-period"><time>{e.period}</time>{e.current && <strong>{currentLabel(lang)}</strong>}</div><p className="method-stance"><ArrowText>{e.stance[lang]}</ArrowText></p><p className="method-links">{e.anchors.map((a, j) => <a key={j} href={a.url} target="_blank" rel="noreferrer"><time dateTime={a.date}>{a.date}</time> <Arrow dir="up-right" /></a>)}</p></li>)}
      </ol></section>}
      {!!related.length && <section id="related"><h2>{sectionTitle('related', lang)}</h2><ul className="method-related">{related.map(r => <li key={r.href}><a href={r.href} {...(r.href.startsWith('/') ? {} : { target: '_blank', rel: 'noreferrer' })}><ArrowText>{r.label}</ArrowText></a></li>)}</ul></section>}
    </article></div></div>
}
