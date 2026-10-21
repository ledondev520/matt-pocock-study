export const fontWeights: number[]
export function notoCharacter(character: string): boolean
export function collectCharacters(root?: string): Promise<Set<string>>
export function checkCoverage(buffer: Buffer, characters: Iterable<string>, label?: string): void
export function checkFonts(root?: string, output?: string): Promise<void>
export function checkDist(dist?: string, output?: string): Promise<number>
export function buildFonts(root?: string, output?: string): Promise<void>
