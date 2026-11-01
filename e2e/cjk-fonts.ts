import type { Page } from '@playwright/test'

function collectCjkText() {
  const bodyFamily = getComputedStyle(document.body).fontFamily
  const code = document.createElement('code')
  document.body.append(code)
  const monoFamily = getComputedStyle(code).fontFamily
  code.remove()
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
    monoFamily,
    targets: [...elements].map(([element, han]) => {
      const style = getComputedStyle(element)
      const text = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('')
      return { selector: selector(element), text, han, family: style.fontFamily, weight: Number(style.fontWeight),
        size: style.fontSize, style: style.fontStyle, lang: element.closest('[lang]')?.getAttribute('lang') || document.documentElement.lang,
        heading: !!element.closest('h1, h2, h3, h4, h5, h6'),
        mono: !!element.closest('code, pre, kbd, samp') || /mono/i.test(style.fontFamily),
        top: element.getBoundingClientRect().top + scrollY }
    }),
  }
}

const familyName = (family: string) => family.trim().replace(/^["']|["']$/g, '').toLowerCase()
const latinFont = (family: string) => /^(?:Source Sans 3|JetBrains Mono)\b/.test(family)

export async function auditCjkFonts(page: Page, route: string, limit = 60) {
  await page.evaluate(() => document.fonts.ready)
  const { bodyFamily, monoFamily, targets } = await page.evaluate(collectCjkText)
  const generics = new Set('serif sans-serif monospace cursive fantasy system-ui ui-serif ui-sans-serif ui-monospace ui-rounded emoji math fangsong'.split(' '))
  const bodyFonts = new Set(bodyFamily.split(',').map(familyName).filter(family => !generics.has(family) && family !== 'source sans 3' && family !== 'jetbrains mono'))
  if (familyName(monoFamily.split(',')[0]) !== 'jetbrains mono') throw new Error(`${route} approved code stack does not start with JetBrains Mono: ${monoFamily}`)
  const stackErrors = targets.filter(target => target.mono
    ? target.family.split(',')[0].trim().replace(/^["']|["']$/g, '') !== 'JetBrains Mono'
    : target.family !== bodyFamily).map(target => `${route} ${target.selector} ${target.family}`)
  const selected = new Set(targets.filter(target => target.heading || target.weight >= 600))
  const rest = targets.filter(target => !selected.has(target)).sort((a, b) => a.top - b.top)
  const count = Math.min(rest.length, Math.max(10, limit - selected.size))
  for (let i = 0; i < count; i++) selected.add(rest[Math.floor((i + 0.5) * rest.length / count)])
  const glyphErrors: string[] = []
  const checkedCharacters = new Set<string>()
  const referenceFonts = new Map<string, string[]>()
  const cdp = await page.context().newCDPSession(page)
  const platformFonts = async (selector: string) => {
    const { root } = await cdp.send('DOM.getDocument')
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
    return (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts
  }
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    for (const target of selected) {
      await page.locator(target.selector).scrollIntoViewIfNeeded()
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      const fonts = await platformFonts(target.selector)
      if (!fonts.length) glyphErrors.push(`${route} ${target.selector} [no platform fonts]`)
      const approvedMono = target.mono && familyName(target.family.split(',')[0]) === 'jetbrains mono'
      const referenceKey = JSON.stringify([target.text, target.lang, target.weight, target.size, target.style])
      const needReference = approvedMono && !referenceFonts.has(referenceKey)
      const characters = [...new Set([...target.han, ...target.text].filter(character => /[\p{Script=Han}\p{Co}\p{Cn}]/u.test(character)))].filter(character => {
        const key = JSON.stringify([target.family, target.lang, target.weight, target.size, target.style, character])
        if (checkedCharacters.has(key) || checkedCharacters.size >= 512) return false
        checkedCharacters.add(key)
        return true
      })
      const missing = await page.evaluate(async ({ target, monoFamily, needReference, characters }) => {
        for (const [id, family, text] of [
          ['cjk-han-render-probe', target.family, [...new Set(target.han)].join('')],
          ...(needReference ? [['cjk-mono-reference-probe', monoFamily, target.text]] : []),
        ]) {
          const probe = document.createElement('span')
          probe.id = id
          probe.lang = target.lang
          probe.style.cssText = 'position: fixed; top: 0; left: 0; display: block; visibility: visible; opacity: 1; color: black; background: white; z-index: 2147483647; white-space: pre-wrap'
          probe.style.fontFamily = family
          probe.style.fontWeight = String(target.weight)
          probe.style.fontSize = target.size
          probe.style.fontStyle = target.style
          probe.textContent = text
          document.body.append(probe)
        }
        await document.fonts.ready
        const canvas = document.createElement('canvas')
        canvas.lang = target.lang
        const size = Number.parseFloat(target.size)
        canvas.width = canvas.height = Math.ceil(Math.max(96, size * 4 + 16))
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('Canvas is unavailable for glyph coverage')
        if ('lang' in context) (context as CanvasRenderingContext2D & { lang: string }).lang = target.lang
        context.font = `${target.style} ${target.weight} ${target.size} ${target.family}`
        const pixels = (text: string) => {
          context.clearRect(0, 0, canvas.width, canvas.height)
          context.fillText(text, 8, size * 2 + 8)
          return context.getImageData(0, 0, canvas.width, canvas.height).data
        }
        const absent = pixels('\u{10fffd}')
        return characters.filter(character => {
          const image = pixels(character)
          return !image.some((value, index) => index % 4 === 3 && value > 0) || image.every((value, index) => value === absent[index])
        })
      }, { target, monoFamily, needReference, characters })
      try {
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
        const allowedFonts = new Set(bodyFonts)
        if (approvedMono) {
          if (needReference) {
            const reference = await platformFonts('#cjk-mono-reference-probe')
            if (!reference.length) glyphErrors.push(`${route} ${target.selector} [no mono reference fonts]`)
            referenceFonts.set(referenceKey, reference.filter(font => !font.isCustomFont).map(font => familyName(font.familyName)))
          }
          for (const font of referenceFonts.get(referenceKey)!) allowedFonts.add(font)
        }
        for (const font of fonts) {
          if (latinFont(font.familyName)) continue
          if (font.isCustomFont || !allowedFonts.has(familyName(font.familyName))) glyphErrors.push(`${route} ${target.selector} ${font.familyName}${font.isCustomFont ? ' (web)' : ''}`)
        }
        const hanFonts = await platformFonts('#cjk-han-render-probe')
        if (!hanFonts.length) glyphErrors.push(`${route} ${target.selector} [no Han platform fonts]`)
        for (const font of hanFonts) {
          if (font.isCustomFont || !allowedFonts.has(familyName(font.familyName))) glyphErrors.push(`${route} ${target.selector} ${font.familyName} [Han${font.isCustomFont ? ', web' : ''}]`)
        }
        for (const character of missing) glyphErrors.push(`${route} ${target.selector} [missing glyph U+${character.codePointAt(0)!.toString(16).toUpperCase()}]`)
      } finally {
        await page.locator('#cjk-han-render-probe, #cjk-mono-reference-probe').evaluateAll(elements => elements.forEach(element => element.remove()))
      }
    }
  } finally { await cdp.detach() }
  return { stackErrors, glyphErrors, elements: targets.length, probes: selected.size, characters: checkedCharacters.size }
}
