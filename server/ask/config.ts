// Settings from the process environment. DEEPSEEK_API_KEY is read here and nowhere else, and is
// never logged or returned.

export interface AskConfig {
  host: '127.0.0.1' | '::1'
  port: number
  enabled: boolean
  apiKey: string | undefined
  baseUrl: string
  model: string
  dbFile: string
  indexFile: string
  pageManifestFile: string
  datasetDir: string | undefined
  chunksFile: string | undefined
  siteUrl: string
  perIpPerMinute: number
  perIpPerDay: number
  globalPerDay: number
  maxChars: number
  maxConcurrent: number
  cacheDays: number
  timeoutMs: number
  breakerFailures: number
  breakerCoolDownMs: number
  minScore: number
  contextUnits: number
}

const int = (env: NodeJS.ProcessEnv, name: string, fallback: number, min = 1, max = 1_000_000) => {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}`)
  return value
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AskConfig {
  // Loopback only: nginx is the single way in, and the client-IP header is trusted for that reason.
  const host = env.ASK_HOST ?? '127.0.0.1'
  if (host !== '127.0.0.1' && host !== '::1') throw new Error('ASK_HOST must be a loopback address (127.0.0.1 or ::1)')
  const apiKey = env.DEEPSEEK_API_KEY?.trim() || undefined
  return {
    host, port: int(env, 'ASK_PORT', 8788, 1024, 65535),
    enabled: env.ASK_ENABLED === '1' && !!apiKey,
    apiKey,
    baseUrl: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: env.DEEPSEEK_MODEL || 'deepseek-flash',
    dbFile: env.ASK_DB || 'generated/ask.sqlite',
    indexFile: env.ASK_INDEX || 'server-data/ask-index.json',
    pageManifestFile: env.ASK_PAGE_MANIFEST || 'dist/page-manifest.json',
    datasetDir: env.ASK_DATASET_DIR || undefined,
    chunksFile: env.ASK_CHUNKS_FILE || undefined,
    siteUrl: (env.SITE_URL || 'https://matt.withkeya.com').replace(/\/+$/, ''),
    perIpPerMinute: int(env, 'ASK_PER_IP_PER_MINUTE', 10),
    perIpPerDay: int(env, 'ASK_PER_IP_PER_DAY', 100),
    globalPerDay: int(env, 'ASK_GLOBAL_PER_DAY', 1000),
    maxChars: int(env, 'ASK_MAX_INPUT_CHARS', 300, 1, 2000),
    maxConcurrent: int(env, 'ASK_MAX_CONCURRENT', 4, 1, 64),
    cacheDays: int(env, 'ASK_CACHE_DAYS', 7, 0, 365),
    timeoutMs: int(env, 'ASK_TIMEOUT_MS', 15000, 1000, 120000),
    breakerFailures: int(env, 'ASK_BREAKER_FAILURES', 5),
    breakerCoolDownMs: int(env, 'ASK_BREAKER_COOLDOWN_MS', 300000, 1000),
    minScore: int(env, 'ASK_MIN_SCORE', 6, 0, 1000),
    contextUnits: int(env, 'ASK_CONTEXT_UNITS', 8, 1, 20),
  }
}
