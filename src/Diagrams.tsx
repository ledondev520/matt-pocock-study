import { ArrowText, SvgArrowText } from './Arrow'

export type Language = 'zh' | 'en';
type Props = { lang: Language; pageHref?: string; links?: Record<string, string> };

export function TracerFigure({ lang }: Props) {
  const zh = lang === 'zh';
  return <figure className="tracer-figure" aria-labelledby="tracer-caption">
    <div className="tracer-panels">
      <svg viewBox="0 0 340 400" role="img" aria-labelledby="layers-title layers-desc">
        <title id="layers-title">横向分层 / Layer by layer</title>
        <desc id="layers-desc">UI、API、DB 各层分别完成，到最后才集成，问题暴露晚。UI, API and DB are completed separately; integration risks appear only at the end.</desc>
        <defs><marker id="time-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 10 5 0 10Z" fill="var(--muted-foreground)" /></marker></defs>
        <rect x="1" y="1" width="338" height="398" rx="12" className="diagram-panel" />
        <text x="20" y="33" className="diagram-heading">{zh ? '横向分层' : 'Layer by layer'}</text>
        <text x="20" y="59" className="diagram-muted">{zh ? '先各做各的，最后再接起来' : 'Build separately, connect last'}</text>
        {[0, 1, 2].map(i => <g key={i}>
          <text x="20" y={115 + i * 57} className="diagram-label">{['UI', 'API', 'DB'][i]}</text>
          <rect x="62" y={88 + i * 57} width="243" height="42" rx="5" className="diagram-track" />
          <rect x={62 + i * 81} y={88 + i * 57} width="81" height="42" rx="5" className="layer-fill" />
          <text x={102 + i * 81} y={115 + i * 57} textAnchor="middle" className="layer-ink">{zh ? '完成' : 'Done'}</text>
        </g>)}
        <path d="M62 270 H303" className="time-line" markerEnd="url(#time-arrow)" />
        <text x="62" y="295" className="diagram-muted"><SvgArrowText>{zh ? '时间 →' : 'Time →'}</SvgArrowText></text>
        <path d="M305 245 V311 H287" className="risk-line" />
        <rect x="20" y="315" width="300" height="65" rx="6" className="risk-box" />
        <text x="34" y="341" className="risk-ink diagram-heading">{zh ? '⚠ 最后集成' : '⚠ Integration at the end'}</text>
        <text x="34" y="365" className="risk-ink diagram-label">{zh ? '最后才发现接不上' : 'Breaks show up at the end'}</text>
      </svg>
      <svg viewBox="0 0 340 400" role="img" aria-labelledby="slices-title slices-desc">
        <title id="slices-title">纵向切片 / Vertical slices (tracer bullet)</title>
        <desc id="slices-desc">第一张工单先贯穿 UI、API、DB，后续再扩展第二、第三片，每片独立验收。The lime first slice runs through UI, API and DB end to end. Slices two and three follow, each independently verifiable.</desc>
        <rect x="1" y="1" width="338" height="398" rx="12" className="diagram-panel" />
        <text x="20" y="33" className="diagram-heading">{zh ? '纵向切片' : 'Vertical slices'}</text>
        <text x="20" y="59" className="diagram-muted">{zh ? 'tracer bullet：先跑通一条链路' : 'Tracer bullet: end to end first'}</text>
        {[0, 1, 2].map(i => <g key={i}>
          <text x="20" y={115 + i * 57} className="diagram-label">{['UI', 'API', 'DB'][i]}</text>
          <rect x="62" y={88 + i * 57} width="243" height="42" rx="5" className="diagram-track" />
        </g>)}
        {[0, 1, 2].map(i => <g key={i}>
          <rect x={62 + i * 83} y="80" width="77" height="176" rx="6" className={i === 0 ? 'slice-first' : 'slice-next'} />
          <text x={100 + i * 83} y="106" textAnchor="middle" className={i === 0 ? 'slice-ink' : 'diagram-label'}>{i + 1}</text>
          <path d={`M${100 + i * 83} 120 v92 m-6 -7 6 7 6 -7`} className={i === 0 ? 'slice-arrow-first' : 'slice-arrow'} />
          <text x={100 + i * 83} y="243" textAnchor="middle" className={i === 0 ? 'slice-ink' : 'diagram-label'}>✓</text>
        </g>)}
        <path d="M62 270 H303" className="time-line" markerEnd="url(#time-arrow)" />
        <text x="62" y="295" className="diagram-muted"><SvgArrowText>{zh ? '时间 →' : 'Time →'}</SvgArrowText></text>
        <rect x="20" y="315" width="300" height="65" rx="6" className="diagram-track" />
        <text x="34" y="341" className="diagram-heading">{zh ? '✓ 每张工单可独立验收' : '✓ Each ticket is verifiable'}</text>
        <text x="34" y="365" className="diagram-label"><SvgArrowText>{zh ? '输入 → 处理 → 输出，全程跑通' : 'on its own: input → output'}</SvgArrowText></text>
      </svg>
    </div>
    <figcaption id="tracer-caption"><ArrowText>{zh ? '分层把集成风险留到最后；纵向切片让第一张工单就跑通 UI → API → DB，尽早得到反馈。' : 'Layers defer integration risk; vertical slices connect UI → API → DB in the first ticket, so feedback arrives early.'}</ArrowText></figcaption>
  </figure>;
}
