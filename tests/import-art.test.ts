import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { validateSvg } from '../scripts/import-art.mjs'

const svg = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="test-svg">${inner}</svg>`
describe('SVG import validation', () => {
  it('allows only plain static SVG and local references', () => {
    expect(validateSvg(svg('<style>.test-svg .node{fill:var(--foreground)} .test-svg path{fill:url(#gradient)}</style><defs><path id="shape" d="M0 0"/></defs><use href="#shape"/><rect fill="url(#gradient)"/>'))).toContain('<svg')
  })
  it.each([
    `<path style='fill:url("https://example.org/has space")'/>`, '<use href="h&#x09;ttps://example.org/x"/>', '<script>alert(1)</script>', '<rect onload="alert(1)"/>', '<rect OnClick="x"/>', '<foreignObject/>', '<iframe/>', '<embed/>', '<object/>',
    '<image href="https://example.org/img.svg"/>', '<use xlink:href="//example.org/a.svg"/>', '<image href="data:text/html,hello"/>', '<path fill="url(https://example.org/a)"/>', '<path style="fill:url(//example.org/a)"/>', '<image href="&#x68;ttps://example.org/x"/>', '<image href="javascript:alert(1)"/>', '<style>@import url(https://example.org/x)</style>', '<rect style="fill:u\\72l(https://example.org/x)"/>',
  ])('rejects active content or external references: %s', value => expect(() => validateSvg(svg(value))).toThrow())
  it('rejects entities and malformed XML', () => {
    expect(() => validateSvg('<!DOCTYPE svg [<!ENTITY x "hello">]><svg/>')).toThrow()
    expect(() => validateSvg('<svg><path></svg>')).toThrow()
  })
})

it.each([
  '<set attributeName="href" to="javascript:alert(1)"/>',
  '<animate attributeName="href" values="javascript:alert(1)"/>',
  '<animateTransform attributeName="transform"/>', '<discard/>', '<a/>', '<image/>',
  '<style><![CDATA[</style><img src="x" onerror="alert(1)">]]></style>',
  '<p><style><![CDATA[</style><img src="x" onerror="alert(1)">]]></style></p>',
  '<g xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></g>',
  '<path xmlns="http://www.w3.org/1999/xhtml"/>',
  '<use href="data:image/svg+xml;base64,PHN2Zy8+"/>',
  '<use href="data:image/png;base64,aGVsbG8="/>',
  '<use href="relative.svg#x"/>', '<use xlink:href="relative.svg"/>',
  '<path fill="url(relative.svg#x)"/>', '<style>path{fill:url(data:image/png;base64,abc)}</style>',
  '<style>path{fill:expression(alert(1))}</style>', '<style>path{content:"&lt;"}</style>',
  '<?xml-stylesheet href="relative.css"?>', '<!-- </style><script>alert(1)</script> -->',
  '<g unknown="value"/>', '<g xmlns:evil="https://example.org" evil:href="#x"/>',
])('rejects review bypass %s', inner => expect(() => validateSvg(svg(inner))).toThrow())
it('rejects processing instructions outside the SVG root', () => {
  expect(() => validateSvg('<?xml-stylesheet href="x.css"?>' + svg(''))).toThrow()
})
it('reserializes a safe DOM and stays inert when reparsed as HTML', () => {
  const input = svg('<style><![CDATA[.test-svg path{fill:url(#paint)}]]></style><defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient><path id="shape" d="M0 0"/></defs><use xlink:href="#shape"/><text>&lt;script&gt; &amp; text</text>')
  const clean = validateSvg(input)
  expect(clean).not.toBe(input)
  expect(clean).not.toContain('CDATA')
  const doc = new JSDOM(`<div>${clean}</div>`).window.document
  expect(doc.querySelectorAll('script, img, iframe, a, foreignObject')).toHaveLength(0)
  for (const node of doc.querySelectorAll('svg, svg *')) {
    expect(node.namespaceURI).toBe('http://www.w3.org/2000/svg')
    for (const attr of node.attributes) {
      expect(attr.name).not.toMatch(/^on/i)
      expect(attr.value).not.toMatch(/javascript:|data:/i)
    }
  }
  expect(doc.querySelector('use')?.getAttribute('href')).toBe('#shape')
})

it.each([
  'image-set("https://example.org/image.png" 1x)',
  'image-set(https://example.org/image.png 1x)',
  'image-set("/api/health?svg" 1x)',
  'cross-fade(url(#a),url(#b),50%)', 'element(#a)',
  'u\\72l(#a)', 'rgb(0,0,0)\\', 'var(--a, image-set(/api/health 1x))',
  '"red"', 'url("#local")',
])('rejects CSS resource syntax in both declarations and attributes: %s', value => {
  const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  expect(() => validateSvg(svg(`<rect style="fill:${escaped}"/>`))).toThrow()
  expect(() => validateSvg(svg(`<style>.test-svg rect{fill:${value}}</style>`))).toThrow()
})
it.each([
  'body{fill:red}', '*{fill:red}', '.other{fill:red}',
  '.test-svg rect, body{fill:red}', '.test-svg + body{fill:red}',
  '.test-svg ~ *{fill:red}', '.test-svg :is(rect, body){fill:red}',
  '.test-svg\\20 body{fill:red}',
  '@import "https://example.org/style.css";',
  '@font-face{font-family:remote;src:url(#a)}',
  '@media (prefers-color-scheme:dark){.test-svg rect{fill:red}}',
  '.test-svg{background-image:image-set("/api/health" 1x)}',
  '.test-svg{--paint:red}', '.test-svg{font:12px serif}',
  '.test-svg{fill:red!important}', '.test-svg{transform:translate(1px)}',
])('rejects CSS outside the scoped allowlist: %s', css => {
  expect(() => validateSvg(svg(`<style>${css}</style>`))).toThrow()
})
it('accepts scoped static CSS and gives each inline SVG a unique CSS boundary', () => {
  const source = svg(`<style>.test-svg{color:rgb(1,2,3)}.test-svg > rect,.test-svg text{fill:var(--ink);stroke:url(#paint);font-family:'Noto Sans SC',sans-serif;font-size:calc(10px + 2px);opacity:.8}</style><rect style="fill:hsl(30,50%,50%);stroke-width:2"/><text>label</text>`)
  const first = validateSvg(source), second = validateSvg(source)
  const doc = new JSDOM(`<div>${first}${second}<rect id="outside"/></div>`).window.document
  const roots = [...doc.querySelectorAll('svg')]
  const classes = roots.map(root => [...root.classList].find(name => name.startsWith('svg-'))!)
  expect(classes[0]).not.toBe(classes[1])
  for (let i = 0; i < roots.length; i++) {
    const css = roots[i].querySelector('style')!.textContent!
    expect(css).not.toContain('.test-svg')
    for (const selector of css.matchAll(/([^{}]+)\{/g)) for (const part of selector[1].split(',')) {
      expect(part.trim().startsWith('.' + classes[i])).toBe(true)
      expect(doc.querySelector(part)?.closest('svg')).toBe(roots[i])
    }
  }
})
it('drops XML declarations and metadata, including namespaced metadata children', () => {
  const clean = validateSvg(`<?xml version="1.0" encoding="UTF-8"?>${svg('<metadata><rdf:data xmlns:rdf="https://example.org/rdf">author data</rdf:data></metadata><rect/>')}`)
  expect(clean).not.toContain('<?')
  expect(clean).not.toContain('metadata')
  expect(clean).not.toContain('author data')
  expect(clean).toContain('<rect')
  expect(() => validateSvg(`<?xml version="1.0"?><?other instruction?>${svg('')}`)).toThrow()
})
it('permits same-language known links only in the diagram profile', () => {
  const source = svg('<a href="/zh/specs-and-tickets"><text>Read</text></a>')
  expect(validateSvg(source, { profile: 'diagram', lang: 'zh' })).toContain('href="/zh/specs-and-tickets"')
  expect(validateSvg(svg('<a href="/en/corpus"/>'), { profile: 'diagram', lang: 'en' })).toContain('/en/corpus')
  expect(() => validateSvg(source)).toThrow()
})
it.each([
  '', 'href="https://example.org"', 'href="javascript:alert(1)"',
  'href="/en/specs-and-tickets"', 'href="/zh/unknown-slug"',
  'xlink:href="/zh/specs-and-tickets"', 'href="/zh/specs-and-tickets#heading"',
  'href="/zh/specs-and-tickets" target="_blank"',
])('rejects diagram anchor %s', attributes => {
  expect(() => validateSvg(svg(`<a ${attributes}/>`), { profile: 'diagram', lang: 'zh' })).toThrow()
})

describe('presentation attributes accept only local references and static values (PR #1 r3)', () => {
  const resource = [
    `mask="image-set(&quot;/api/health?svg-mask=1&quot; 1x)"`,
    `mask="image-set(&quot;https://example.org/m.png&quot; 1x)"`,
    `mask="image-set('https://example.org/m.png' 1x)"`,
    `mask="image-set(url(https://example.org/m.png) 1x)"`,
    `mask="-webkit-image-set(&quot;https://example.org/m.png&quot; 1x)"`,
    `mask="IMAGE-SET(&quot;/x&quot; 1x)"`,
    `mask="image-set (&quot;/x&quot; 1x)"`,
    `mask="image(&quot;/x.png&quot;)"`,
    `mask="cross-fade(url(#a), url(#b), 50%)"`,
    `mask="url(/x.svg#m)"`,
    `mask="url(https://example.org/m.svg#m)"`,
    `mask="url(#m) image-set(&quot;/x&quot; 1x)"`,
    `clip-path="image-set(&quot;/x&quot; 1x)"`,
    `clip-path="url(/x.svg#c)"`,
    `clip-path="inset(10px)"`,
    `marker-end="url(/x.svg#m)"`,
    `fill="image-set(&quot;/x&quot; 1x)"`,
    `fill="url(/x.svg#g)"`,
    `stroke="url(https://example.org/g)"`,
    `stroke="expression(alert(1))"`,
    `stop-color="image(&quot;/x&quot;)"`,
    `transform="translate(1) image-set(&quot;/x&quot; 1x)"`,
    `transform="url(#a)"`,
    `font-family="@import x"`,
    `class="a(b)"`,
    `d="M0 0 url(#x)"`,
  ]
  it.each(resource)('rejects %s', attr => expect(() => validateSvg(svg(`<rect ${attr}/>`))).toThrow())
  it.each(['filter="url(#f)"', 'cursor="pointer"', 'onbegin="x"', 'requiredFeatures="x"'])('rejects attributes without a grammar: %s', attr =>
    expect(() => validateSvg(svg(`<rect ${attr}/>`))).toThrow())
  it('keeps local url(#id) references and static paint values', () => {
    const out = validateSvg(svg('<defs><mask id="m"/><clipPath id="c"/><linearGradient id="g"/><marker id="k"/></defs><rect mask="url(#m)" clip-path="url(#c)" fill="url(#g)" stroke="var(--primary)" marker-end="url(#k)" transform="translate(2 3) rotate(4)"/><rect mask="none" fill="#5129C5"/>'))
    expect(out).toContain('mask="url(#m)"')
    expect(out).toContain('clip-path="url(#c)"')
    expect(out).toContain('fill="url(#g)"')
    expect(out).toContain('marker-end="url(#k)"')
    expect(out).not.toMatch(/image-set|image\(/)
  })
})

describe('Archify licence comment in diagram SVGs', async () => {
  const { archifySvgComment } = await import('../scripts/licences.mjs')
  const { readFile } = await import('node:fs/promises')
  const comment = archifySvgComment()
  const file = await readFile('public/diagrams/d02-failure-sort.en.svg', 'utf8')
  const body = file.slice(comment.length)
  const licence = await readFile('third_party/archify/LICENSE', 'utf8')
  it('is generated from the full licence text and is the start of each committed file', () => {
    expect(file.startsWith(comment)).toBe(true)
    expect(comment).toBe(`<!--\nCSS in this file is adapted from Archify (tt-a1i/archify), MIT licence:\n\n${licence}-->\n`)
  })
  it('is accepted only in its exact form, first in a diagram file, and is not reserialized', () => {
    // Each validation scopes ids with a fresh random svg-<uuid>; compare with that normalized.
    const scoped = (source: string) => validateSvg(source, { profile: 'diagram', lang: 'en' }).replace(/svg-[0-9a-f-]{36}/g, 'svg-scope')
    const clean = scoped(comment + body)
    expect(clean).toBe(scoped(body))
    expect(clean).not.toContain('<!--')
  })
  it.each([
    ['an edited year', comment.replace('2026 tt-a1i', '2027 tt-a1i') + body],
    ['a truncated notice', comment.replace('Cocoon AI\n', '') + body],
    ['a second copy', comment + comment + body],
    ['leading whitespace', ' ' + comment + body],
    ['any other comment', '<!-- note -->\n' + body],
    ['the comment inside the root', body.replace('>', '>' + comment)],
    ['an extra comment after it', comment + '<!-- </style><script>alert(1)</script> -->' + body],
  ])('rejects %s', (_, source) => expect(() => validateSvg(source, { profile: 'diagram', lang: 'en' })).toThrow())
  it('is not accepted for illustrated artwork', () => {
    expect(() => validateSvg(comment + svg(''))).toThrow(/comments are forbidden/)
  })
})
