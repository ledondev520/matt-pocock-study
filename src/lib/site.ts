/** Public origin of the site. Override with SITE_URL at build time (no trailing slash). */
export const DEFAULT_SITE_URL = 'https://matt.withkeya.com'

export function siteUrl(env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env): string {
  return (env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '')
}
