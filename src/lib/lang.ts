export type Lang = 'zh' | 'en'

export function pickLang(stored: string | null, navigatorLanguage: string | undefined): Lang {
  if (stored === 'zh' || stored === 'en') return stored
  return navigatorLanguage?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

// Use the first language range, matching navigator.language's single-language rule.
export function acceptLanguageHint(header: string | undefined): Lang {
  return pickLang(null, header?.split(',')[0]?.split(';')[0]?.trim())
}

// Language depends only on the first segment, even for invalid/unknown routes. The root "/" is the
// Chinese home page (no client redirect, so nothing flashes in another language first).
// Methodology pages are the one nested route: /<lang>/methods/<method>.
export function routeInfo(path: string) {
  const lang: Lang = path === '/' || path.split('/')[1] === 'zh' ? 'zh' : 'en'
  const match = /^\/(zh|en)(?:\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?)?\/?$/.exec(path)
  const nested = !!match?.[3] && match[2] !== 'methods'
  return { valid: path === '/' || (!!match && !nested), lang, slug: nested ? undefined : match?.[2], method: nested ? undefined : match?.[3], home: path === '/' || (!!match && !match[2]) }
}
