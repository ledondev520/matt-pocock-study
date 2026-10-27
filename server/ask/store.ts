// Counters and the answer cache, in SQLite so a crash loop cannot reset today's limits.
// Keys are hashes only: no question text and no IP address is ever stored.
import { randomBytes } from 'node:crypto'
import Database from 'better-sqlite3'

export interface Store {
  /** Adds one to the counter and returns the new value. */
  hit(key: string, window: string, ttlMs: number, now: number): number
  count(key: string, window: string): number
  /** Takes a slot if the counter is below `limit`; returns whether it did. Atomic. */
  take(key: string, window: string, limit: number, ttlMs: number, now: number): boolean
  getCache(key: string, now: number): string | undefined
  putCache(key: string, value: string, ttlMs: number, now: number): void
  secret(): Buffer
  prune(now: number): void
  close(): void
}

export function openStore(filename: string): Store {
  const db = new Database(filename)
  db.pragma('journal_mode = WAL')
  db.exec(`CREATE TABLE IF NOT EXISTS counters (key TEXT NOT NULL, window TEXT NOT NULL, n INTEGER NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY (key, window));
    CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (name TEXT PRIMARY KEY, value BLOB NOT NULL);`)
  const upsert = db.prepare(`INSERT INTO counters (key, window, n, expires) VALUES (?, ?, 1, ?)
    ON CONFLICT (key, window) DO UPDATE SET n = n + 1 RETURNING n`)
  const read = db.prepare('SELECT n FROM counters WHERE key = ? AND window = ?')
  const getCache = db.prepare('SELECT value FROM cache WHERE key = ? AND expires > ?')
  const putCache = db.prepare('INSERT OR REPLACE INTO cache (key, value, expires) VALUES (?, ?, ?)')
  const count = (key: string, window: string) => (read.get(key, window) as { n: number } | undefined)?.n ?? 0
  const hit = (key: string, window: string, ttlMs: number, now: number) => (upsert.get(key, window, now + ttlMs) as { n: number }).n
  const take = db.transaction((key: string, window: string, limit: number, ttlMs: number, now: number) => {
    if (count(key, window) >= limit) return false
    hit(key, window, ttlMs, now)
    return true
  })
  let secret = (db.prepare("SELECT value FROM meta WHERE name = 'ip-secret'").get() as { value: Buffer } | undefined)?.value
  if (!secret) {
    secret = randomBytes(32)
    db.prepare("INSERT INTO meta (name, value) VALUES ('ip-secret', ?)").run(secret)
  }
  const fixedSecret = secret
  return {
    hit, count,
    take: (key, window, limit, ttlMs, now) => take(key, window, limit, ttlMs, now) as boolean,
    getCache: (key, now) => (getCache.get(key, now) as { value: string } | undefined)?.value,
    putCache: (key, value, ttlMs, now) => { putCache.run(key, value, now + ttlMs) },
    secret: () => fixedSecret,
    prune: now => { db.prepare('DELETE FROM counters WHERE expires <= ?').run(now); db.prepare('DELETE FROM cache WHERE expires <= ?').run(now) },
    close: () => db.close(),
  }
}
