export type LicenceId = 'mattpocock-skills' | 'archify'
export const licences: Record<LicenceId, { name: string; repo: string; file: string; sha256: string }>
export function licenceText(id: string, read?: (file: string) => string): string
export function licenceBlock(id: string, lang: 'zh' | 'en'): { html: string; markdown: string }
export function embedsArchify(markup: string): boolean
export function archifySvgComment(): string
export function archifyAppendix(lang: 'zh' | 'en'): { html: string; markdown: string }
