declare module 'fontkit' {
  type Font = {
    hasGlyphForCodePoint(codePoint: number): boolean
    characterSet: number[]
    variationAxes: Record<string, { min: number; max: number; default: number; name: string }>
    name: { records: Record<string, Record<string, string> | undefined> }
    directory: { tables: Record<string, unknown> }
    layout(text: string): { positions: { xAdvance: number; yAdvance: number; xOffset: number; yOffset: number }[] }
  }
  export function create(buffer: Buffer): Font
}
