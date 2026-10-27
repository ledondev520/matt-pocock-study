import type { Licences } from '../src/lib/content'
export type LicenceId = 'mattpocock-skills' | 'archify'
export const licences: Record<LicenceId, { name: string; repo: string; licenseUrl: string; file: string; sha256: string }>
export function licenceText(id: string, read?: (file: string) => string): string
export function licenceMarkdown(id: string, lang: 'zh' | 'en'): string
export function embedsArchify(markup: string): boolean
export function archifySvgComment(): string
export function archifyAppendix(lang: 'zh' | 'en'): string
export const fonts: Record<string, { name: string; pkg: string; repo: string; file: string; sha256: string }>
export function licencesView(): Licences
