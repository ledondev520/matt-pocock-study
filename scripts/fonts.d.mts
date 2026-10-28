export const fontWeights: number[]
export const notoPattern: string
export function notoCharacter(character: string): boolean
export function collectCharacters(root?: string): Promise<Set<string>>
export function checkCoverage(buffer: Buffer, characters: Iterable<string>, label?: string): void
export function buildFonts(root?: string, output?: string): Promise<void>
export function fallbackSlices(subsetCodes: Set<number>): Promise<{ id: number, codes: number[] }[]>
