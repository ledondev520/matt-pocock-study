import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { validateSvg } from '../scripts/import-art.mjs'

const svg = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${inner}</svg>`
describe('SVG import validation', () => {
  it('allows only plain static SVG and local references', () => {
    expect(validateSvg(svg('<style>.node{fill:var(--foreground)} path{fill:url(#gradient)}</style><defs><path id="shape" d="M0 0"/></defs><use href="#shape"/><rect fill="url(#gradient)"/>'))).toContain('<svg')
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
  const input = svg('<style><![CDATA[path{fill:url(#paint)}]]></style><defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient><path id="shape" d="M0 0"/></defs><use xlink:href="#shape"/><text>&lt;script&gt; &amp; text</text>')
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
