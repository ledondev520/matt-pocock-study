export type Language = 'zh' | 'en';
type Props = { lang: Language; pageHref?: string; links?: Record<string, string> };

export function ChainFigure({ lang, links = {} }: Props) {
  const zh = lang === 'zh';
  const names = zh ? ['对齐', '规格', '工单', '实现', '评审', 'PR'] : ['Align', 'Spec', 'Tickets', 'Implement', 'Review', 'PR'];
  const labels = zh ? ['先问清楚再动手', '把决定写下来', '切成可验收的小块', '小步提交，跑反馈', '对照规范拦问题', '证据 + 回滚方式'] : ['Ask before you build', 'Write decisions down', 'Small, verifiable slices', 'Small steps, run feedback', 'Check against standards', 'Evidence and rollback'];
  const routes = ['alignment-and-prototypes', 'specs-and-tickets', 'specs-and-tickets', 'implementation-and-feedback', 'review-and-pr', 'review-and-pr'];
  return <figure className="chain-figure">
    <svg viewBox="0 0 360 638" aria-labelledby="chain-title chain-desc" className="chain-svg">
      <title id="chain-title">AI coding 工作流 / The AI coding chain</title>
      <desc id="chain-desc">对齐、规格、工单、实现、评审、PR；评审反馈回到起点，形成规范。Align, spec, tickets, implement, review, PR. Review feeds rules back to the start.</desc>
      <defs><marker id="chain-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="var(--hero-text)" /></marker></defs>
      <text x="46" y="22" className="chain-kicker">{zh ? '从一个问题，到一个可验证的 PR' : 'FROM QUESTION TO VERIFIED PR'}</text>
      {names.map((name, i) => {
        const y = 42 + i * 79;
        return <g key={name}>
          {i < 5 && <path d={`M194 ${y + 64}v13`} className="chain-line" markerEnd="url(#chain-arrow)" />}
          <a href={links[routes[i]] ?? (i === 1 || i === 2 ? `/${lang}/specs-and-tickets` : `/${lang}#topics`)} aria-label={`${name}: ${labels[i]}`}>
            <rect x="46" y={y} width="302" height="64" rx="8" className={i === 5 ? 'chain-final' : 'chain-node'} />
            <text x="62" y={y + 25} className={i === 5 ? 'chain-number final-ink' : 'chain-number'}>{`0${i + 1}`}</text>
            <text x="100" y={y + 25} className={i === 5 ? 'chain-name final-ink' : 'chain-name'}>{name}<tspan x="328" textAnchor="end">↗</tspan></text>
            <text x="62" y={y + 50} className={i === 5 ? 'chain-label final-ink' : 'chain-label'}>{labels[i]}</text>
          </a>
        </g>;
      })}
      <path d="M46 390 H18 V74 H42" className="chain-line loop-line" markerEnd="url(#chain-arrow)" />
      <circle cx="18" cy="390" r="5" fill="var(--pink)" />
      <path d="M18 390 V561 H46" className="chain-line loop-line" />
      <rect x="46" y="547" width="302" height="81" rx="8" className="loop-box" />
      <text x="60" y="572" className="chain-name">{zh ? '↺ 规范与反馈' : '↺ Standards & feedback'}</text>
      <text x="60" y="596" className="chain-label">{zh ? '犯错 → 记一条规范' : 'Mistake → add a rule'}</text>
      <text x="60" y="618" className="chain-label">{zh ? '→ 下次评审拦住' : '→ caught next review'}</text>
    </svg>
    <figcaption>{zh ? '先对齐，再交付；把评审中发现的问题变成下一次的规范。' : 'Align, build, verify. Turn review findings into rules for the next pass.'}</figcaption>
  </figure>;
}

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
        <text x="62" y="295" className="diagram-muted">{zh ? '时间 →' : 'Time →'}</text>
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
        <text x="62" y="295" className="diagram-muted">{zh ? '时间 →' : 'Time →'}</text>
        <rect x="20" y="315" width="300" height="65" rx="6" className="diagram-track" />
        <text x="34" y="341" className="diagram-heading">{zh ? '✓ 每张工单可独立验收' : '✓ Each ticket is verifiable'}</text>
        <text x="34" y="365" className="diagram-label">{zh ? '输入 → 处理 → 输出，全程跑通' : 'on its own: input → output'}</text>
      </svg>
    </div>
    <figcaption id="tracer-caption">{zh ? '分层把集成风险留到最后；纵向切片让第一张工单就跑通 UI → API → DB，尽早得到反馈。' : 'Layers defer integration risk; vertical slices connect UI → API → DB in the first ticket, so feedback arrives early.'}</figcaption>
  </figure>;
}
