// Runs inside Chrome. Keep this function self-contained so no DOM dependency is
// installed in the site or in CI. Archify supplies the node shapes and styles;
// the export reflows them into a narrow reading column with 14px minimum type.
export function exportSvg(spec, identity, links = {}) {
  const ns = 'http://www.w3.org/2000/svg'
  const source = document.querySelector('svg[role="img"], svg[data-layout-contract]')
  const svg = source ? source.cloneNode(false) : document.createElementNS(ns, 'svg')
  for (const attribute of [...svg.attributes]) svg.removeAttribute(attribute.name)
  const scope = `arch-${identity}`
  svg.setAttribute('xmlns', ns)
  svg.setAttribute('class', scope)
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-labelledby', `${scope}-title ${scope}-desc`)
  const make = (tag, attributes = {}, text) => {
    const element = document.createElementNS(ns, tag)
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
    if (text !== undefined) element.textContent = text
    return element
  }
  svg.append(make('title', { id: `${scope}-title` }, spec.meta.title))
  const description = source?.querySelector(':scope > desc')?.textContent || spec.answer?.summary || spec.meta.title
  svg.append(make('desc', { id: `${scope}-desc` }, description))
  const token = name => {
    if (/^(text|text-primary)$/.test(name)) return '--foreground'
    if (/text|muted/.test(name)) return '--muted-foreground'
    if (/^(bg|background)$/.test(name)) return '--background'
    if (/mask|surface|card-bg/.test(name)) return '--card'
    if (/grid|border|lane-stroke|boundary-stroke/.test(name)) return '--border'
    if (/fill|wash/.test(name)) return '--muted'
    if (/security|rose/.test(name)) return '--pink'
    return '--primary'
  }
  const mapValue = value => value
    .replace(/var\(--([\w-]+)(?:,[^)]*)?\)/g, (_, name) => `var(${token(name)})`)
    .replace(/#[\da-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi, 'var(--foreground)')
  const allowed = /^(fill|fill-opacity|fill-rule|stroke(?:-.+)?|opacity|color|font-family|font-weight|text-anchor|paint-order|vector-effect)$/
  const fragments = []
  const collect = rules => {
    for (const rule of rules) {
      if (!rule.selectorText || !source) continue
      // Viewer-state selectors must never dim a static export. Only retain
      // selectors that match the authored drawing, without page ancestors.
      for (let selector of rule.selectorText.split(',')) {
        selector = selector.trim()
        if (!/^(?:svg|\.[camt]-[\w-]+)$/.test(selector)) continue
        let matches = false
        try { matches = source.matches(selector) || !!source.querySelector(selector) } catch { continue }
        if (!matches) continue
        const declarations = []
        for (const property of rule.style) {
          if (!allowed.test(property)) continue
          const value = mapValue(rule.style.getPropertyValue(property))
          if (/url\(|animation|transition/i.test(value)) continue
          declarations.push(`${property}:${value}`)
        }
        if (!declarations.length) continue
        selector = selector.replace(/^svg(?:\[[^\]]+\])*/, `.${scope}`)
        if (!selector.startsWith(`.${scope}`)) selector = `.${scope} ${selector}`
        fragments.push(`${selector}{${declarations.join(';')}}`)
      }
    }
  }
  for (const sheet of document.styleSheets) {
    try { collect(sheet.cssRules) } catch { /* No external stylesheet is needed. */ }
  }
  // Sizing (width, max-width, centring) lives in the site stylesheet: the inline-SVG
  // CSS allowlist only permits paint and text properties.
  // Compact layout rules also override Archify's small context type and the
  // tree's inverse root treatment. Pink is always paired with a dash or cross.
  const css = [...new Set(fragments)].join('') + `
.${scope}{display:block;color:var(--foreground,#241B35);font-family:system-ui,sans-serif}
.${scope} text{fill:var(--foreground,#241B35);font-size:14px}
.${scope} .export-title{font-size:18px;font-weight:700}
.${scope} .export-label{font-size:14px;font-weight:650}
.${scope} .export-detail{font-size:14px;fill:var(--muted-foreground,#6B607B)}
.${scope} .export-box{fill:var(--card,#FFFFFF);stroke:var(--primary,#5129C5);stroke-width:1.5}
.${scope} .export-success .export-box{fill:var(--lime,#C6F432)}
.${scope} .export-success text{fill:#241B35}
.${scope} .export-decision{fill:var(--card,#FFFFFF);stroke:var(--primary,#5129C5);stroke-width:1.5}
.${scope} .export-edge{fill:none;stroke:var(--primary,#5129C5);stroke-width:1.5;stroke-linejoin:round}
.${scope} .export-wrong{stroke:var(--pink,#F25CAC);stroke-dasharray:5 4}
.${scope} .export-dashed{stroke-dasharray:6 4}
.${scope} .export-arrow{fill:var(--primary,#5129C5)}
.${scope} .export-wrong-arrow{fill:var(--pink,#F25CAC)}
.${scope} .export-note{fill:var(--card,#FFFFFF);stroke:var(--border,#DCD6E7)}
.${scope} .export-note.export-wrong{stroke:var(--pink,#F25CAC);stroke-dasharray:5 4}
.${scope} a:focus-visible .export-box{stroke:var(--ring,#5129C5);stroke-width:3}
`
  const stylesheet = make('style', {}, css)
  svg.append(stylesheet)
  const defs = make('defs')
  for (const wrong of [false, true]) {
    const marker = make('marker', { id: `${scope}-${wrong ? 'wrong' : 'arrow'}`, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' })
    marker.append(make('path', { d: 'M0 0L8 4L0 8Z', class: wrong ? 'export-wrong-arrow' : 'export-arrow' }))
    defs.append(marker)
  }
  svg.append(defs)
  // Browser measurement wraps both CJK and English without clipping long code
  // names. It uses the same system font as the finished static file.
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  context.font = '14px system-ui'
  const wrap = (input, width, font = '14px system-ui') => {
    context.font = font
    const result = []
    for (const paragraph of String(input || '').split('\n')) {
      let line = ''
      for (const part of paragraph.match(/[A-Za-z0-9_./`-]+\s*|\P{ASCII}|./gu) || []) {
        if (context.measureText(line + part).width > width && line) { result.push(line.trim()); line = '' }
        // A single command/file name may itself exceed a narrow tree cell.
        if (context.measureText(part).width > width) {
          for (const char of part) {
            if (context.measureText(line + char).width > width && line) { result.push(line.trim()); line = '' }
            line += char
          }
        } else line += part
      }
      if (line.trim()) result.push(line.trim())
    }
    return result
  }
  const text = (parent, content, x, y, width, className = 'export-detail') => {
    const font = className === 'export-title' ? '700 18px system-ui' : className === 'export-label' ? '650 14px system-ui' : '14px system-ui'
    const lines = wrap(content, width, font)
    const element = make('text', { x, y, class: `t-primary ${className}` })
    lines.forEach((line, index) => element.append(make('tspan', { x, dy: index ? 20 : 0 }, line)))
    parent.append(element)
    return Math.max(1, lines.length) * 20
  }
  let cursor = 30
  cursor += text(svg, spec.meta.title, 24, cursor, 342, 'export-title') + 22
  let graph = spec
  const extraNotes = []
  if (spec.diagram_type === 'explainer') {
    for (const panel of spec.panels || []) for (const block of panel.blocks || []) {
      if (block.type === 'diagram') graph = block.spec
      else if (block.type === 'comparison') {
        // Explainer comparisons are rendered HTML tables, with no main SVG.
        // Convert their rendered table cells into accessible native SVG notes.
        for (const row of block.rows) extraNotes.push({ title: row.label, items: row.cells.map((cell, i) => `${block.columns[i]}: ${cell.text}`) })
      } else if (block.text) extraNotes.push({ title: panel.title, items: [block.text] })
    }
  }
  const nodes = graph.nodes || graph.states || graph.events?.map(event => ({ ...event, label: event.title, sublabel: event.detail })) || []
  let relations = graph.edges || graph.transitions || graph.flows || []
  if (graph.diagram_type === 'tree') relations = nodes.filter(n => n.parent).map(n => ({ from: n.parent, to: n.id }))
  const positions = new Map()
  const layer = make('g')
  const edgesLayer = make('g', { 'aria-hidden': 'true' })
  svg.append(edgesLayer, layer)
  const isTree = graph.diagram_type === 'tree'
  const root = nodes.find(node => !node.parent)
  const simpleTree = isTree && nodes.every(node => !node.parent || node.parent === root.id || nodes.some(parent => parent.id === node.parent && parent.parent === root.id))
  const put = (node, x, y, width) => {
    const decision = node.type === 'decision' || node.type === 'security' || /[?？]$/.test(node.label)
    const innerWidth = decision ? width * 0.56 : width - 24
    const titleLines = wrap(node.label, innerWidth, '650 14px system-ui')
    const details = [node.sublabel, node.tag].filter(Boolean).join('\n')
    const detailLines = wrap(details, innerWidth)
    const lineHeight = titleLines.length * 20 + detailLines.length * 20
    const height = decision ? Math.max(100, lineHeight * 2.4 + 36) : Math.max(48, 22 + lineHeight)
    const native = source?.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`)
    const group = native ? native.cloneNode(false) : make('g')
    for (const attribute of [...group.attributes]) group.removeAttribute(attribute.name)
    group.setAttribute('id', `${scope}-node-${node.id}`)
    if (node.type === 'success' || node.label.startsWith('✓')) group.setAttribute('class', 'export-success')
    const wrong = node.type === 'failure' || /^(wrong|fluent|paid|forbidden)$/.test(node.id)
    // Retain the renderer's principal shape, then resize its geometry to the
    // measured label. Decorative runtime sigils and focus buttons are omitted.
    const nativeBox = native?.querySelector('rect:not(.c-mask):not([data-tree-stack]), polygon')
    let box = nativeBox?.cloneNode(false) || make('rect')
    for (const attribute of [...box.attributes]) box.removeAttribute(attribute.name)
    if (box.tagName === 'polygon') box = make('rect')
    const nativeClass = [...(nativeBox?.classList || [])].find(name => /^c-(?!mask)/.test(name)) || 'c-backend'
    if (decision) box = make('path', { d: `M${x + width / 2} ${y}L${x + width} ${y + height / 2}L${x + width / 2} ${y + height}L${x} ${y + height / 2}Z` })
    else for (const [key, value] of Object.entries({ x, y, width, height, rx: 9 })) box.setAttribute(key, value)
    box.setAttribute('class', `${nativeClass} export-box${decision ? ' export-decision' : ''}${wrong ? ' export-wrong' : ''}`)
    group.append(box)
    const textX = decision ? x + (width - innerWidth) / 2 : x + 12
    const textY = decision ? y + height / 2 - lineHeight / 2 + 14 : y + 23
    text(group, node.label, textX, textY, innerWidth, 'export-label')
    if (details) text(group, details, textX, textY + titleLines.length * 20, innerWidth)
    const destinations = links[node.id]
    const href = typeof destinations === 'string' ? destinations : destinations?.[0]
    if (href && /^\/(zh|en)\/[a-z0-9-]+$/.test(href)) {
      const anchor = make('a', { href }) // the visible label inside names the link
      anchor.append(group)
      layer.append(anchor)
      if (destinations.length > 1 && Array.isArray(destinations)) extraNotes.push({ title: node.label, items: destinations.slice(1), links: true })
    } else layer.append(group)
    positions.set(node.id, { x, y, width, height, node })
    return height
  }
  if (simpleTree) {
    cursor += put(root, 36, cursor, 330) + 38
    for (const branch of nodes.filter(n => n.parent === root.id)) {
      const children = nodes.filter(n => n.parent === branch.id)
      if (!children.length) { cursor += put(branch, 54, cursor, 312) + 30; continue }
      const branchY = cursor
      let bottom = cursor
      for (const child of children) bottom += put(child, 222, bottom, 144) + 22
      const height = put(branch, 54, branchY, 144)
      cursor = Math.max(bottom, branchY + height + 22) + 12
    }
  } else if (graph.events?.length) {
    // Rotate the renderer's time axis into the reading column while preserving
    // proportional event positions. Broad phase anchors stay disclosed in the
    // candidate's date-precision note.
    const dates = nodes.map(node => new Date(node.at).getTime() / 86_400_000)
    const heights = nodes.map(node => Math.max(48, 22 + wrap(node.label, 258, '650 14px system-ui').length * 20 + wrap(node.sublabel, 258).length * 20))
    let scale = 1
    for (let index = 1; index < nodes.length; index++) {
      const gap = dates[index] - dates[index - 1]
      if (gap <= 0) throw new Error('Compact timeline requires distinct, chronological event timestamps')
      scale = Math.max(scale, (heights[index - 1] / 2 + heights[index] / 2 + 44) / gap)
    }
    const origin = cursor + heights[0] / 2
    const last = origin + (dates.at(-1) - dates[0]) * scale
    edgesLayer.append(make('path', { d: `M30 ${origin}V${last}`, class: 'export-edge' }))
    nodes.forEach((node, index) => {
      const center = origin + (dates[index] - dates[0]) * scale
      const height = put(node, 54, center - heights[index] / 2, 282)
      edgesLayer.append(make('path', { d: `M25 ${center}H54`, class: 'export-edge' }))
      cursor = center + height / 2 + 44
    })
  } else {
    for (const node of nodes) cursor += put(node, 54, cursor, 282) + 44
  }
  const relationNotes = []
  const sameRoot = new Map()
  relations.forEach((relation, index) => {
    const a = positions.get(relation.from), b = positions.get(relation.to)
    if (!a || !b) throw new Error(`Missing SVG endpoint: ${relation.from} → ${relation.to}`)
    const wrong = relation.variant === 'security' || relation.role === 'error'
    let d
    const adjacent = !simpleTree && b.y > a.y && b.y - (a.y + a.height) <= 45
    if (simpleTree && b.node.parent === root.id) {
      const mid = b.y + b.height / 2
      d = `M${a.x} ${a.y + a.height / 2}H24V${mid}H${b.x}`
    } else if (simpleTree && b.node.parent === a.node.id) {
      d = `M${a.x + a.width} ${a.y + a.height / 2}H${b.x - 12}V${b.y + b.height / 2}H${b.x}`
    } else if (adjacent) {
      d = `M${a.x + a.width / 2} ${a.y + a.height}V${b.y}`
    } else {
      const side = b.y > a.y ? 350 + (index % 4) * 5 : 14 + (index % 4) * 5
      const fromX = b.y > a.y ? a.x + a.width : a.x
      const toX = b.y > a.y ? b.x + b.width : b.x
      d = `M${fromX} ${a.y + a.height / 2}H${side}V${b.y + b.height / 2}H${toX}`
    }
    // Preserve native path elements where available; only geometry is reflowed.
    const native = source?.querySelector(`[data-edge-from="${CSS.escape(relation.from)}"][data-edge-to="${CSS.escape(relation.to)}"]`)
    const path = native?.tagName === 'path' ? native.cloneNode(false) : make('path')
    for (const attribute of [...path.attributes]) path.removeAttribute(attribute.name)
    path.setAttribute('d', d)
    path.setAttribute('class', `a-emphasis export-edge${wrong ? ' export-wrong' : relation.variant === 'dashed' ? ' export-dashed' : ''}`)
    path.setAttribute('marker-end', `url(#${scope}-${wrong ? 'wrong' : 'arrow'})`)
    edgesLayer.append(path)
    if (relation.label) {
      const count = sameRoot.get(relation.from) || 0
      sameRoot.set(relation.from, count + 1)
      if (adjacent && count === 0 && wrap(relation.label, 118).length === 1) text(layer, relation.label, a.x + a.width / 2 + 10, a.y + a.height + 27, 118)
      else relationNotes.push({ title: `${a.node.label} → ${b.node.label}`, items: [relation.label, relation.note].filter(Boolean) })
    }
  })
  if (graph.events) {
    extraNotes.push({ title: spec.meta.locale.startsWith('zh') ? '时间刻度' : 'Time scale', items: [spec.meta.locale.startsWith('zh') ? '纵轴按候选日期等比例排列，阶段日期为位置锚点。' : 'Vertical spacing is proportional to candidate dates; phase dates are placement anchors.'] })
  }
  const notes = [...(graph.cards || []), ...(graph !== spec ? spec.cards || [] : []), ...extraNotes, ...relationNotes]
  for (const note of notes) {
    const group = make('g')
    const start = cursor
    cursor += 24
    cursor += text(group, note.title, 36, cursor, 318, 'export-label')
    for (let item of note.items || []) {
      // Source URLs live in the source candidate/links sidecar, never the SVG.
      if (/https?:\/\//.test(item)) item = spec.meta.locale.startsWith('zh') ? '来源链接见对应候选文件。' : 'Source link: see the matching candidate.'
      if (note.links && /^\/(zh|en)\//.test(item)) {
        const anchor = make('a', { href: item })
        cursor += text(anchor, item, 36, cursor + 2, 318)
        group.append(anchor)
      } else cursor += text(group, item, 36, cursor + 2, 318)
    }
    const box = make('rect', { x: 24, y: start, width: 342, height: cursor - start + 12, rx: 8, class: `export-note${note.dot === 'rose' ? ' export-wrong' : ''}` })
    group.prepend(box)
    svg.append(group)
    cursor += 30
  }
  svg.setAttribute('viewBox', `0 0 390 ${Math.ceil(cursor + 8)}`)
  // Drop every rule whose selector no longer occurs after runtime removal and
  // compaction. Never ship the viewer stylesheet or unused semantic classes.
  const parsedStyles = new CSSStyleSheet()
  parsedStyles.replaceSync(css)
  stylesheet.textContent = [...parsedStyles.cssRules].filter(rule => {
    try { return svg.matches(rule.selectorText) || !!svg.querySelector(rule.selectorText) } catch { return false }
  }).map(rule => rule.cssText).join('').replace(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/g, (_, r, g, b) =>
    `#${[r, g, b].map(channel => Number(channel).toString(16).padStart(2, '0')).join('')}`)
  // A strict allowlist keeps only static SVG markup, even if upstream starts
  // emitting new runtime attributes or elements in a future release.
  const tags = new Set(['svg', 'g', 'path', 'rect', 'text', 'tspan', 'title', 'desc', 'style', 'defs', 'marker', 'a'])
  for (const element of [...svg.querySelectorAll('*')]) {
    if (!tags.has(element.localName)) { element.remove(); continue }
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name) || /(?:https?:|data:|javascript:|file:|\/\/)/i.test(attribute.value)) element.removeAttribute(attribute.name)
    }
  }
  return new XMLSerializer().serializeToString(svg)
}
