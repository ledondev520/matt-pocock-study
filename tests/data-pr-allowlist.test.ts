import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync, chmodSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve('scripts/ci/data-pr-allowlist.sh')
let dir: string
const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
const commit = (message: string) => { git('add', '-A'); git('commit', '-q', '-m', message); return git('rev-parse', 'HEAD') }
const classify = (base: string, head: string) => {
  const out = execFileSync('bash', [SCRIPT, base, head], { cwd: dir, encoding: 'utf8' })
  return { allowlisted: out.includes('allowlisted=true'), touchesData: out.includes('touches_data=true'), out }
}

describe('data PR allowlist', () => {
  let base: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'allowlist-'))
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 'test@example.invalid')
    git('config', 'user.name', 'test')
    mkdirSync(join(dir, 'data'))
    mkdirSync(join(dir, '.github/workflows'), { recursive: true })
    writeFileSync(join(dir, 'data/knowledge-base.json'), '{"version":2,"entries":[]}\n')
    writeFileSync(join(dir, 'data/other.json'), '{}\n')
    writeFileSync(join(dir, '.github/workflows/ci.yml'), 'name: CI\n')
    base = commit('base')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('allows an in-place edit of the knowledge base', () => {
    writeFileSync(join(dir, 'data/knowledge-base.json'), '{"version":2,"entries":[1]}\n')
    expect(classify(base, commit('data'))).toMatchObject({ allowlisted: true, touchesData: true })
  })

  it('rejects any other file next to the data', () => {
    writeFileSync(join(dir, 'data/knowledge-base.json'), '{"version":2,"entries":[1]}\n')
    writeFileSync(join(dir, 'data/other.json'), '{"x":1}\n')
    expect(classify(base, commit('data + other'))).toMatchObject({ allowlisted: false, touchesData: true })
  })

  it('rejects workflow changes', () => {
    writeFileSync(join(dir, 'data/knowledge-base.json'), '{"version":2,"entries":[1]}\n')
    writeFileSync(join(dir, '.github/workflows/ci.yml'), 'name: CI\non: push\n')
    expect(classify(base, commit('workflow')).allowlisted).toBe(false)
  })

  it('rejects new files, even inside data/', () => {
    writeFileSync(join(dir, 'data/knowledge-base-2.json'), '{}\n')
    expect(classify(base, commit('new')).allowlisted).toBe(false)
  })

  it('rejects a rename onto the allow-listed path', () => {
    unlinkSync(join(dir, 'data/knowledge-base.json'))
    renameSync(join(dir, 'data/other.json'), join(dir, 'data/knowledge-base.json'))
    expect(classify(base, commit('rename')).allowlisted).toBe(false)
  })

  it('rejects replacing the data file with a symlink', () => {
    unlinkSync(join(dir, 'data/knowledge-base.json'))
    symlinkSync('/etc/passwd', join(dir, 'data/knowledge-base.json'))
    expect(classify(base, commit('symlink')).allowlisted).toBe(false)
  })

  it('rejects a mode change', () => {
    chmodSync(join(dir, 'data/knowledge-base.json'), 0o755)
    writeFileSync(join(dir, 'data/knowledge-base.json'), '{"version":2,"entries":[2]}\n')
    expect(classify(base, commit('exec bit')).allowlisted).toBe(false)
  })

  it('rejects deleting the data file but still flags it as data', () => {
    unlinkSync(join(dir, 'data/knowledge-base.json'))
    expect(classify(base, commit('delete'))).toMatchObject({ allowlisted: false, touchesData: true })
  })

  it('rejects an empty diff and non-sha arguments', () => {
    expect(classify(base, base).allowlisted).toBe(false)
    expect(() => execFileSync('bash', [SCRIPT, 'main', base], { cwd: dir, stdio: 'pipe' })).toThrow()
  })
})
