import { useEffect, useRef, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import type { Lang } from './lib/lang'

type Panel = ComponentType<{ lang: Lang; onFallback: (q: string) => void }>

/** Keep both the question form and its client out of the initial page bundle. */
export function AskEntry({ lang, children, onFallback }: { lang: Lang; children: ReactNode; onFallback: (q: string) => void }) {
  const [Panel, setPanel] = useState<Panel>()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const label = lang === 'zh' ? '提问' : 'Ask'
  async function toggle() {
    if (Panel) { setOpen(value => !value); return }
    setLoading(true)
    try {
      const { AskPanel } = await import('./AskPanel')
      if (live.current) { setPanel(() => AskPanel); setOpen(true) }
    } catch { /* Local search remains available if the question form cannot load. */ }
    finally { if (live.current) setLoading(false) }
  }
  function fallback(q: string) {
    setOpen(false)
    onFallback(q)
  }
  return <>
    <div className="home-search-tools">
      {children}
      <button type="button" className="ask-toggle" aria-expanded={open} aria-controls="home-ask" disabled={loading} onClick={() => void toggle()}>{label}</button>
    </div>
    <div id="home-ask" hidden={!open}>{open && Panel && <Panel lang={lang} onFallback={fallback} />}</div>
  </>
}
