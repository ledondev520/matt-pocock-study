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
export function routeInfo(path: string) {
  const lang: Lang = path === '/' || path.split('/')[1] === 'zh' ? 'zh' : 'en'
  const match = /^\/(zh|en)(?:\/([a-z0-9-]+))?\/?$/.exec(path)
  return { valid: path === '/' || !!match, lang, slug: match?.[2], home: path === '/' || (!!match && !match[2]) }
}
