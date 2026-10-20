export function storedPreference(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

export function savePreference(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* Preferences still work for this page when storage is blocked. */ }
}
