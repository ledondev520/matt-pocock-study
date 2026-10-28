import { readFileSync } from 'node:fs'

export interface PageManifest { version: 1; paths: string[] }

/** Build output: exact routes, without query strings, fragments or trailing slashes. */
export function parsePageManifest(raw: unknown): ReadonlySet<string> {
  const value = raw as Partial<PageManifest> | null
  if (!value || value.version !== 1 || !Array.isArray(value.paths) || !value.paths.length ||
    value.paths.some(path => typeof path !== 'string' ||
      !/^(?:\/|\/(?:zh|en)(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)$/.test(path) || /\/404$/.test(path)) ||
    new Set(value.paths).size !== value.paths.length) {
    throw new Error('ask page manifest: unexpected format')
  }
  return new Set(value.paths)
}

/** Missing/invalid manifests stop startup rather than allowing unchecked links. */
export function loadPageManifest(file: string): ReadonlySet<string> {
  return parsePageManifest(JSON.parse(readFileSync(file, 'utf8')))
}

export const isMethodLink = (path: string | undefined): path is string =>
  !!path && /^\/(?:zh|en)\/methods(?:\/|#|$)/.test(path)

// A section fragment does not change which generated page a link targets.
export const hasGeneratedPage = (pages: ReadonlySet<string>, path: string | undefined) =>
  !!path && pages.has(path.split('#')[0])
