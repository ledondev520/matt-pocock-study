export function ensureLicenceComments(directory?: string, options?: { check?: boolean; beforeReplace?: (name: string, path: string) => Promise<void> | void }): Promise<number>
