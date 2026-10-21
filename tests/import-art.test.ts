import { describe, expect, it } from 'vitest'
import { validateSvg } from '../scripts/import-art.mjs'

const svg = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${inner}</svg>`
describe('SVG import validation', () => {
  it('allows plain SVG, local references and image data', () => {
    expect(validateSvg(svg('<style>.node{fill:var(--foreground)} path{fill:url(#gradient)}</style><defs><path id="shape" d="M0 0"/></defs><use href="#shape"/><rect fill="url(#gradient)"/><image href="data:image/png;base64,aGVsbG8="/><image href="data:image/svg+xml;base64,PHN2Zy8+"/>'))).toContain('<svg')
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
