import type { Page } from '@playwright/test'

function collectCjkText() {
  const bodyFamily = getComputedStyle(document.body).fontFamily
  const elements = new Map<Element, string>()
  const range = document.createRange()
  const transparent = (color: string) => color === 'transparent' || /^(?:rgba|hsla)\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(color) || /\/\s*0(?:\.0+)?%?\s*\)$/.test(color)
  const visible = (element: Element) => {
    const style = getComputedStyle(element)
    const stroke = Number.parseFloat(style.getPropertyValue('-webkit-text-stroke-width')) > 0 && !transparent(style.getPropertyValue('-webkit-text-stroke-color'))
    if (style.visibility !== 'visible' || (transparent(style.getPropertyValue('-webkit-text-fill-color') || style.color) && !stroke)) return false
    for (let parent: Element | null = element; parent; parent = parent.parentElement) {
      const own = getComputedStyle(parent)
      if (own.display === 'none' || own.contentVisibility === 'hidden' || Number(own.opacity) === 0) return false
      if (parent instanceof HTMLDetailsElement && !parent.open && !parent.querySelector(':scope > summary')?.contains(element)) return false
      const clip = own.clip.match(/^rect\((.*)\)$/)?.[1].split(/[\s,]+/).map(Number.parseFloat)
      if (clip?.length === 4 && (clip[1] - clip[3] <= 1 || clip[2] - clip[0] <= 1)) return false
      const box = parent.getBoundingClientRect()
      if (own.display !== 'inline' && own.display !== 'contents'
        && ((box.width <= 1 && own.overflowX !== 'visible') || (box.height <= 1 && own.overflowY !== 'visible'))) return false
    }
    return true
  }
  const selector = (element: Element) => {
    const parts: string[] = []
    for (let current: Element | null = element; current; current = current.parentElement) {
      if (current.id) { parts.unshift(`#${CSS.escape(current.id)}`); break }
      const siblings = current.parentElement ? [...current.parentElement.children].filter(sibling => sibling.localName === current!.localName) : [current]
      parts.unshift(`${current.localName}:nth-of-type(${siblings.indexOf(current) + 1})`)
    }
    return parts.join(' > ')
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const element = node.parentElement
    if (!element || element.closest('script, style, noscript, template, svg title, svg desc') || !/\p{Script=Han}/u.test(node.data) || !visible(element)) continue
    let text = ''
    for (const match of node.data.matchAll(/\p{Script=Han}/gu)) {
      range.setStart(node, match.index)
      range.setEnd(node, match.index + match[0].length)
      if ([...range.getClientRects()].some(box => box.width > 0 && box.height > 0 && box.right + scrollX > 0 && box.bottom + scrollY > 0)) text += match[0]
    }
    if (text) elements.set(element, (elements.get(element) ?? '') + text)
  }
  return {
    bodyFamily,
    targets: [...elements].map(([element, text]) => {
      const style = getComputedStyle(element)
      return { selector: selector(element), text, family: style.fontFamily, weight: Number(style.fontWeight),
        heading: !!element.closest('h1, h2, h3, h4, h5, h6'),
        mono: !!element.closest('code, pre, kbd, samp') || /mono/i.test(style.fontFamily),
        top: element.getBoundingClientRect().top + scrollY }
    }),
  }
}

export async function auditCjkFonts(page: Page, route: string, limit = 60) {
  await page.evaluate(() => document.fonts.ready)
  const { bodyFamily, targets } = await page.evaluate(collectCjkText)
  const stackErrors = targets.filter(target => target.mono
    ? target.family.split(',')[0].trim().replace(/^["']|["']$/g, '') !== 'JetBrains Mono'
    : target.family !== bodyFamily).map(target => `${route} ${target.selector} ${target.family}`)
  const selected = new Set(targets.filter(target => target.heading || target.weight >= 600))
  const rest = targets.filter(target => !selected.has(target)).sort((a, b) => a.top - b.top)
  const count = Math.min(rest.length, Math.max(10, limit - selected.size))
  for (let i = 0; i < count; i++) selected.add(rest[Math.floor((i + 0.5) * rest.length / count)])
  const glyphErrors: string[] = []
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    for (const target of selected) {
      await page.locator(target.selector).scrollIntoViewIfNeeded()
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: target.selector })
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      if (!fonts.length) glyphErrors.push(`${route} ${target.selector} [no platform fonts]`)
      for (const font of fonts) {
        if (/^(?:Source Sans 3|JetBrains Mono)\b/.test(font.familyName)) continue
        const systemMono = target.mono && target.family.split(',')[0].trim().replace(/^["']|["']$/g, '') === 'JetBrains Mono'
          && /^(?:DejaVu Sans Mono|Liberation Mono|Noto Sans Mono|Menlo|Monaco|Consolas|SF Mono|Courier New)\b/.test(font.familyName)
        if (font.isCustomFont || (!systemMono && !/^(?:Noto Sans CJK|PingFang|Hiragino Sans|Microsoft YaHei|Source Han Sans)/.test(font.familyName))) {
          glyphErrors.push(`${route} ${target.selector} ${font.familyName}${font.isCustomFont ? ' (web)' : ''}`)
        }
      }
    }
  } finally { await cdp.detach() }
  return { stackErrors, glyphErrors, elements: targets.length, probes: selected.size }
}
