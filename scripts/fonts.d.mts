export const sourceFile: string
export function nonCjkCharacter(character: string): boolean
export function collectCharacters(root?: string): Promise<Set<string>>
export function checkCoverage(buffer: Buffer, characters: Iterable<string>, label?: string): void
export function buildFonts(root?: string, output?: string): Promise<void>
