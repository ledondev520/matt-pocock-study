// Sandbox tests for deploy/matt-release, the root-side release switcher. The script runs
// unchanged except for three lines (stub PATH first, a temporary ROOT, no root check);
// systemctl, curl, chown, sleep and date are stubs, so nothing touches the real system.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const HANDMADE = '20261022-1548-3af3984'
let sb: string
let root: string
let script: string
let seq = 0

const sha = (n: number) => n.toString(16).padStart(2, '0').repeat(20)

function patchedScript(): string {
  let text = readFileSync(resolve('deploy/matt-release'), 'utf8')
  const swaps: [string, string][] = [
    ['export LC_ALL=C PATH=/usr/sbin:/usr/bin:/sbin:/bin\n', `export LC_ALL=C PATH=${sb}/stub:/usr/sbin:/usr/bin:/sbin:/bin\n`],
    ['readonly ROOT=/srv/matt-site\n', `readonly ROOT=${root}\n`],
    ['[ "$(id -u)" -eq 0 ] || die "must run as root"\n', ':\n'],
  ]
  for (const [from, to] of swaps) {
    if (!text.includes(from)) throw new Error(`matt-release no longer contains: ${from.trim()}`)
    text = text.replace(from, () => to)
  }
  const path = join(sb, 'matt-release')
  writeFileSync(path, text, { mode: 0o755 })
  return path
}

function stub(name: string, body: string) {
  writeFileSync(join(sb, 'stub', name), `#!/bin/bash\n${body}\n`, { mode: 0o755 })
}

beforeEach(() => {
  sb = mkdtempSync(join(tmpdir(), 'matt-release-'))
  root = join(sb, 'root')
  mkdirSync(join(sb, 'stub'))
  mkdirSync(join(root, 'releases', HANDMADE, 'dist'), { recursive: true })
  mkdirSync(join(root, 'incoming'))
  writeFileSync(join(root, 'releases', HANDMADE, 'DEPLOYED_COMMIT'), '3af3984\n')
  symlinkSync(`releases/${HANDMADE}`, join(root, 'current'))
  // restart fails while `current` points at a release listed in fail_restart (or for all with "*").
  stub('systemctl', `echo "$*" >> "${sb}/systemctl.log"
cur=$(basename "$(readlink "${root}/current")")
if [ "$1" = restart ] && [ -f "${sb}/fail_restart" ] && grep -qxE "\\*|$cur" "${sb}/fail_restart"; then exit 1; fi
exit 0`)
  stub('curl', `[ -e "${root}/current/BROKEN" ] && exit 22; echo '{"ok":true}'`)
  stub('chown', 'exit 0')
  stub('sleep', 'exit 0')
  // Each call returns the next second, so release names are unique without waiting.
  stub('date', `n=$(cat "${sb}/date.n" 2>/dev/null || echo 0); echo $((n + 1)) > "${sb}/date.n"
printf '20261027-12%04d\\n' "$n"`)
  script = patchedScript()
  seq = 0
})
afterEach(() => rmSync(sb, { recursive: true, force: true }))

function upload(commit: string, opts: { broken?: boolean } = {}) {
  const dir = join(sb, `build-${++seq}`)
  mkdirSync(join(dir, 'dist'), { recursive: true })
  mkdirSync(join(dir, 'node_modules'))
  writeFileSync(join(dir, 'DEPLOYED_COMMIT'), `${commit}\n`)
  writeFileSync(join(dir, 'package.json'), '{}')
  writeFileSync(join(dir, 'dist/index.html'), 'hi')
  if (opts.broken) writeFileSync(join(dir, 'BROKEN'), '1')
  const r = spawnSync('tar', ['-C', dir, '-czf', join(root, 'incoming', `${commit}.tar.gz`), '.'])
  if (r.status !== 0) throw new Error(String(r.stderr))
}

function run(...args: string[]) {
  const r = spawnSync('bash', [script, ...args], { encoding: 'utf8' })
  const fields = Object.fromEntries(r.stdout.split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, fields }
}

const current = () => readlinkSync(join(root, 'current')).replace(/^releases\//, '')
const releases = () => readdirSync(join(root, 'releases')).sort()
const failedList = () => (existsSync(join(root, 'deploy-state/failed')) ? readFileSync(join(root, 'deploy-state/failed'), 'utf8').split('\n').filter(Boolean) : [])
const restarts = () => readFileSync(join(sb, 'systemctl.log'), 'utf8').split('\n').filter(l => l === 'restart matt-site').length
const deploy = (n: number, opts: { broken?: boolean } = {}) => { upload(sha(n), opts); return run('activate', sha(n)) }

describe('matt-release activate', () => {
  it('switches to a healthy release and reports both names', () => {
    const r = deploy(1)
    expect(r.status).toBe(0)
    expect(r.fields).toMatchObject({ previous: HANDMADE, result: 'ok' })
    expect(r.fields.release).toBe(`20261027-120000-${sha(1).slice(0, 12)}`)
    expect(current()).toBe(r.fields.release)
  })

  it('switches back when the health check fails', () => {
    const r = deploy(2, { broken: true })
    expect(r.status).toBe(1)
    expect(current()).toBe(HANDMADE)
    expect(r.fields).toMatchObject({ result: 'failed', failed: r.fields.release, restored: HANDMADE, restored_healthy: 'true' })
    expect(failedList()).toEqual([r.fields.release])
  })

  it('switches back and restarts the old release when restarting the new one fails', () => {
    // The stub date makes the first release of a test 20261027-120000-<sha12>.
    writeFileSync(join(sb, 'fail_restart'), `20261027-120000-${sha(3).slice(0, 12)}\n`)
    const r = deploy(3)
    expect(r.status).toBe(1)
    expect(current()).toBe(HANDMADE)
    expect(r.fields).toMatchObject({ result: 'failed', failed: r.fields.release, previous: HANDMADE, restored: HANDMADE, restored_healthy: 'true' })
    expect(restarts()).toBe(2)
    expect(failedList()).toEqual([r.fields.release])
  })

  it('still switches back and exits non-zero when the old release cannot restart either', () => {
    writeFileSync(join(sb, 'fail_restart'), '*\n')
    const r = deploy(4)
    expect(r.status).toBe(1)
    expect(current()).toBe(HANDMADE)
    expect(r.fields).toMatchObject({ result: 'failed', restored: HANDMADE, restored_healthy: 'false' })
  })

  it('refuses a bad sha without touching current', () => {
    expect(run('activate', '../../etc').status).toBe(2)
    expect(current()).toBe(HANDMADE)
  })
})

describe('matt-release prune', () => {
  it('keeps the newest 5 releases it created and every hand-made one', () => {
    for (let i = 11; i <= 17; i++) expect(deploy(i).status).toBe(0)
    const made = releases().filter(n => /^\d{8}-\d{6}-/.test(n))
    expect(made).toHaveLength(5)
    expect(releases()).toContain(HANDMADE)
    expect(made).toContain(current())
  })

  it('does not count failed releases, so the previous good one survives a run of failures', () => {
    const good1 = deploy(21).fields.release
    for (let i = 22; i <= 27; i++) expect(deploy(i, { broken: true }).status).toBe(1)
    const good2 = deploy(28)
    expect(good2.status).toBe(0)
    expect(releases()).toEqual([HANDMADE, good1, good2.fields.release].sort())
    // ...and a rollback from the new release lands on it.
    const back = run('rollback', good2.fields.release)
    expect(back.status).toBe(0)
    expect(current()).toBe(good1)
  })
})

describe('matt-release rollback', () => {
  it('needs the current release name and goes to the previous good release', () => {
    const r = deploy(31)
    expect(run('rollback', HANDMADE).status).not.toBe(0)
    expect(current()).toBe(r.fields.release)
    const back = run('rollback', r.fields.release)
    expect(back.status).toBe(0)
    expect(back.fields).toMatchObject({ release: HANDMADE, previous: r.fields.release })
    expect(current()).toBe(HANDMADE)
  })

  it('does not go back to a release it just rolled back from', () => {
    const a = deploy(32).fields.release
    const b = deploy(33).fields.release
    expect(run('rollback', b).status).toBe(0)
    expect(current()).toBe(a)
    // b is now in the history after a, but it was rolled back, so it is not a target.
    const again = run('rollback', a)
    expect(again.status).toBe(0)
    expect(current()).toBe(HANDMADE)
    expect(failedList()).toEqual([b, a])
  })

  it.each(['../../etc', 'releases/../x', `${HANDMADE}/..`, '-rf', ''])('rejects %j', bad => {
    expect(run('rollback', bad).status).not.toBe(0)
    expect(current()).toBe(HANDMADE)
  })
})

it('status prints the current release and commit', () => {
  const r = deploy(41)
  expect(run('status').fields).toEqual({ release: r.fields.release, commit: sha(41) })
})

// The server as it really is before the first channel deploy: the history holds only older
// releases (a trial run), and root switched `current` by hand to a release the history lacks.
describe('matt-release with a hand-switched current release', () => {
  const TRIAL = '20261027-151657-3af3984d5d8b'
  const MANUAL = '20261027-153211-fe9bdab'
  const history = () => readFileSync(join(root, 'deploy-state/history'), 'utf8').split('\n').filter(Boolean)

  beforeEach(() => {
    for (const name of [TRIAL, MANUAL]) {
      mkdirSync(join(root, 'releases', name, 'dist'), { recursive: true })
      writeFileSync(join(root, 'releases', name, 'DEPLOYED_COMMIT'), `${name.slice(-7)}\n`)
    }
    mkdirSync(join(root, 'deploy-state'), { mode: 0o700 })
    writeFileSync(join(root, 'deploy-state/history'), `${HANDMADE}\n${TRIAL}\n${HANDMADE}\n`)
    writeFileSync(join(root, 'deploy-state/failed'), `${TRIAL}\n`)
    rmSync(join(root, 'current'))
    symlinkSync(`releases/${MANUAL}`, join(root, 'current'))
  })

  it('rolls back to the hand-switched release after a deploy whose smoke test fails', () => {
    const r = deploy(51)
    expect(r.status).toBe(0)
    expect(r.fields.previous).toBe(MANUAL)
    const back = run('rollback', r.fields.release)
    expect(back.status).toBe(0)
    expect(back.fields).toMatchObject({ release: MANUAL, previous: r.fields.release })
    expect(current()).toBe(MANUAL)
  })

  it('switches back to the hand-switched release when the new one is unhealthy', () => {
    const r = deploy(52, { broken: true })
    expect(r.status).toBe(1)
    expect(r.fields).toMatchObject({ restored: MANUAL, restored_healthy: 'true' })
    expect(current()).toBe(MANUAL)
  })

  it('records the live release once, and not again when it is already the last entry', () => {
    const a = deploy(53).fields.release
    const b = deploy(54).fields.release
    expect(history()).toEqual([HANDMADE, TRIAL, HANDMADE, MANUAL, a, b])
  })
})
