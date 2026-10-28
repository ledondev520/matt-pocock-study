import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Arrow, ArrowText } from './Arrow'
import { KbText } from './KbText'
import type { Lang } from './lib/lang'
import { byYear, yearId, yearIndexAt, yearIndexForKey, type TimelineItem, type TimelineYear } from './lib/timeline'

// The timeline view: what we learned, newest first, grouped by year, with a phone-album style year
// scrubber on the right. Matt's original posts (quote and link) are rendered only after the reader
// turns them on; the choice is not saved anywhere. All text comes from the build (lessons and the
// gate-checked knowledge base) and is escaped by React.
export function Timeline({ items, lang }: { items: TimelineItem[]; lang: Lang }) {
  const zh = lang === 'zh', t = (cn: string, en: string) => zh ? cn : en
  const [showOriginal, setShowOriginal] = useState(false)
  const years = byYear(items)
  return <div className="wrap tl-page">
    <div className="corpus-page-intro"><h1>{t('时间轴', 'Timeline')}</h1>
      <label className="tl-toggle"><input type="checkbox" role="switch" checked={showOriginal} onChange={event => setShowOriginal(event.target.checked)} /><span className="tl-switch" aria-hidden="true" /><span>{t('原帖', 'Original posts')}</span></label>
    </div>
    {years.length ? <div className="tl-layout">
      {/* Before the list in the DOM so keyboard users reach it first; drawn in the right-hand column. */}
      <YearScrubber years={years.map(y => y.year)} lang={lang} />
      <TimelineList years={years} lang={lang} showOriginal={showOriginal} />
    </div> : null}
  </div>
}

export function TimelineList({ years, lang, showOriginal }: { years: TimelineYear[]; lang: Lang; showOriginal: boolean }) {
  const zh = lang === 'zh', t = (cn: string, en: string) => zh ? cn : en
  return <div className="tl-years">{years.map(({ year, items }) => <section className="tl-year" id={yearId(year)} key={year} aria-labelledby={`${yearId(year)}-title`}>
    <h2 id={`${yearId(year)}-title`}>{year}</h2>
    <ol className="tl-list">{items.map(item => <li className="tl-item" id={item.id} key={item.id} data-kind={item.kind}>
      <div className="tl-meta"><time dateTime={item.date}>{item.date}</time></div>
      <h3><ArrowText>{item.learned.title}</ArrowText></h3>
      {/* A note's links are its original posts, so they are plain text until originals are shown. */}
      <p className="tl-learned">{typeof item.learned.text === 'string' ? <ArrowText>{item.learned.text}</ArrowText> : <KbText segments={item.learned.text} links={showOriginal} />}</p>
      <a className="tl-from" href={item.learned.href}><ArrowText>{item.learned.from}</ArrowText> <Arrow dir="right" /></a>
      {showOriginal && <div className="tl-original">
        {item.original.quote && <blockquote><p lang="en">{item.original.quote}</p>{item.original.note && <p className="quote-translation">{item.original.note}</p>}</blockquote>}
        <a className="kb-source" href={item.original.url} target="_blank" rel="noreferrer">{t('原帖', 'Original')} <Arrow dir="up-right" /></a>
      </div>}
    </li>)}</ol>
  </section>)}</div>
}

// Phone-album style scrubber: one evenly spaced label per year (newest at the top). Press or drag
// anywhere on it to jump to the year under the finger; a bubble shows that year while dragging. It is
// one ARIA slider (value = the year), so arrow keys, Page Up/Down, Home and End work too. While the
// reader scrolls normally it follows the year at the top of the screen. It is fixed to the screen
// (see index.css), so a jump never moves the labels under the finger.
function YearScrubber({ years, lang }: { years: string[]; lang: Lang }) {
  const zh = lang === 'zh'
  const [index, setIndex] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [shown, setShown] = useState(true)
  const track = useRef<HTMLDivElement>(null)
  const current = useRef(0)
  // After a jump the page may not be able to put an old year at the top (not enough content below it);
  // the jumped-to year stays selected until the reader scrolls away from where the jump landed.
  const pinned = useRef<{ index: number; scrollY: number } | null>(null)
  const drag = useRef<number | null>(null)
  const select = (i: number) => { current.current = i; setIndex(i) }
  function jump(i: number) {
    if (i < 0 || i >= years.length) return
    select(i)
    // Instant, not the page's smooth scrolling: the list follows the finger while dragging.
    document.getElementById(yearId(years[i]))?.scrollIntoView({ block: 'start', behavior: 'instant' })
    pinned.current = { index: i, scrollY: window.scrollY }
  }
  useEffect(() => {
    let frame = 0
    const follow = () => {
      frame = 0
      // Shown while the list fills the middle of the screen (not over the footer at the end).
      const list = track.current?.closest('.tl-layout')?.querySelector('.tl-years')?.getBoundingClientRect()
      if (list) setShown(document.activeElement === track.current || drag.current !== null || (list.top < window.innerHeight && list.bottom > window.innerHeight / 2))
      if (drag.current !== null) return
      if (pinned.current && Math.abs(window.scrollY - pinned.current.scrollY) < 4) return select(pinned.current.index)
      pinned.current = null
      const line = Math.min(160, window.innerHeight / 3)
      let at = 0
      years.forEach((year, i) => { const top = document.getElementById(yearId(year))?.getBoundingClientRect().top; if (top !== undefined && top <= line) at = i })
      if (at !== current.current) select(at)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(follow) }
    window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll)
    follow()
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame) }
  }, [years])
  const under = (clientY: number) => {
    const box = track.current!.getBoundingClientRect()
    return yearIndexAt(clientY - box.top, box.height, years.length)
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.currentTarget.focus({ preventScroll: true })
    drag.current = event.pointerId; setDragging(true)
    jump(under(event.clientY))
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (drag.current !== event.pointerId) return
    const i = under(event.clientY)
    if (i !== current.current) jump(i)
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    if (drag.current !== event.pointerId) return
    drag.current = null; setDragging(false)
  }
  function key(event: KeyboardEvent<HTMLDivElement>) {
    const next = yearIndexForKey(event.key, current.current, years.length)
    if (next === undefined) return
    event.preventDefault()
    jump(next)
  }
  const position = (i: number) => `${((i + 0.5) / years.length) * 100}%`
  return <div className={`tl-scrubber${dragging ? ' dragging' : ''}${shown ? '' : ' off'}`}>
    <div ref={track} className="tl-track" role="slider" tabIndex={0} aria-label={zh ? '按年份跳转' : 'Jump to a year'} aria-orientation="vertical"
      aria-valuemin={Number(years.at(-1))} aria-valuemax={Number(years[0])} aria-valuenow={Number(years[index])} aria-valuetext={years[index]}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onKeyDown={key}>
      {years.map((year, i) => <span key={year} className={i === index ? 'tl-label active' : 'tl-label'} data-year={year} style={{ top: position(i) }} aria-hidden="true">{year}</span>)}
      <span className="tl-bubble" style={{ top: position(index) }} aria-hidden="true">{years[index]}</span>
    </div>
  </div>
}
