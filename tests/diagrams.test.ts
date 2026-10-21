import { readFile, readdir } from 'node:fs/promises'
import { SaxesParser, type SaxesTagNS } from 'saxes'
import { describe, expect, it } from 'vitest'

const directory = new URL('../public/diagrams/', import.meta.url)
const files = (await readdir(directory)).filter(name => name.endsWith('.svg')).sort()
const palette = new Set([
  '#f8f7fc', '#0e0a1f', '#ffffff', '#171128', '#241b35', '#eae5f4',
  '#6b607b', '#aea4c0', '#dcd6e7', '#352a48', '#5129c5', '#a083f4',
  '#43209e', '#c6f432', '#f25cac',
])
const tokens = new Set(['background', 'foreground', 'card', 'muted', 'muted-foreground', 'border', 'primary', 'ring', 'lime', 'pink', 'card-accent'])

describe('committed diagram SVGs', () => {
  it('contains SVGs and matching Chinese/English pairs', () => {
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(file).toMatch(/^[a-z][a-z0-9-]*\.(zh|en)\.svg$/)
      expect(files).toContain(file.replace(/\.(zh|en)\.svg$/, (_, lang: string) => `.${lang === 'zh' ? 'en' : 'zh'}.svg`))
    }
  })

  for (const file of files) it(`${file} parses as safe, responsive, themeable SVG`, async () => {
    const xml = await readFile(new URL(file, directory), 'utf8')
    expect(xml.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/(?:https?:\/\/|file:|data:|javascript:)/i)
    const parser = new SaxesParser({ xmlns: true })
    const tags: SaxesTagNS[] = []
    const styles: string[] = []
    let inStyle = false
    let title = ''
    let inTitle = false
    parser.on('error', error => { throw error })
    parser.on('doctype', () => { throw new Error('SVG must not have an external entity or doctype') })
    parser.on('opentag', tag => {
      tags.push(tag)
      expect(tag.uri).toBe('http://www.w3.org/2000/svg')
      expect(['script', 'foreignobject', 'image', 'iframe', 'animate', 'set']).not.toContain(tag.local.toLowerCase())
      inStyle = tag.local === 'style'
      inTitle = tag.local === 'title'
      for (const [name, attribute] of Object.entries(tag.attributes)) {
        expect(name).not.toMatch(/^on/i)
        if (name === 'xmlns') continue
        const value = attribute.value
        expect(value).not.toMatch(/(?:https?:|file:|data:|javascript:|\/\/)/i)
        if (['href', 'xlink:href'].includes(name)) expect(value).toMatch(/^(?:#[\w-]+|\/(?:zh|en)\/[a-z0-9-]+)$/)
        if (['fill', 'stroke', 'color', 'stop-color', 'flood-color'].includes(name)) checkColor(value)
      }
    })
    parser.on('closetag', () => { inStyle = false; inTitle = false })
    parser.on('text', value => {
      if (inStyle) styles.push(value)
      if (inTitle) title += value
    })
    parser.write(xml).close()
    const root = tags[0]
    expect(root.local).toBe('svg')
    const viewBox = root.attributes.viewBox?.value.split(/\s+/).map(Number)
    expect(viewBox).toHaveLength(4)
    expect(viewBox.every(Number.isFinite)).toBe(true)
    expect(viewBox[2]).toBeGreaterThan(0)
    expect(viewBox[3]).toBeGreaterThan(0)
    expect(root.attributes.width).toBeUndefined()
    expect(root.attributes.height).toBeUndefined()
    expect(title.trim()).not.toBe('')
    expect(tags.some(tag => tag.local === 'desc')).toBe(true)
    const scope = `arch-${file.replace(/\.(zh|en)\.svg$/, '-$1')}`
    expect(root.attributes.class.value).toBe(scope)
    expect(styles.length).toBeGreaterThan(0)
    for (const css of styles) {
      expect(css).not.toMatch(/@import|@font-face|expression\s*\(|(?:https?:|data:|file:|javascript:)/i)
      for (const match of css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)) expect(match[1]).toMatch(/^#[\w-]+$/)
      for (const match of css.matchAll(/(?:^|})\s*([^{}]+)\{/g)) {
        for (const selector of match[1].split(',')) expect(selector.trim()).toMatch(new RegExp(`^\\.${scope}(?:[\\s.:#[>]|$)`))
      }
      for (const match of css.matchAll(/(?:^|[;{])\s*(?:fill|stroke|color|stop-color|background(?:-color)?)\s*:\s*([^;}]+)/gi)) checkColor(match[1].trim())
      for (const match of css.matchAll(/var\(--([\w-]+)/g)) expect(tokens.has(match[1])).toBe(true)
      for (const match of css.matchAll(/#[\da-f]{3,8}\b/gi)) expect(palette.has(match[0].toLowerCase())).toBe(true)
    }
    expect(Buffer.byteLength(xml)).toBeLessThan(80_000)
  })
})

function checkColor(value: string) {
  if (/^(?:none|transparent|currentColor|inherit)$/i.test(value)) return
  if (/^url\(#[\w-]+\)$/.test(value)) return
  const variable = /^var\(--([\w-]+)(?:,\s*(#[\da-f]{6}))?\)$/i.exec(value)
  if (variable) {
    expect(tokens.has(variable[1]), `Unknown diagram token: ${variable[1]}`).toBe(true)
    if (variable[2]) expect(palette.has(variable[2].toLowerCase())).toBe(true)
    return
  }
  expect(palette.has(value.toLowerCase()), `Unexpected diagram color: ${value}`).toBe(true)
}
