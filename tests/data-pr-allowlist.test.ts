import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync, chmodSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const SCRIPT = resolve('scripts/ci/data-pr-allowlist.sh')
const POLICY = resolve('scripts/ci/data-pr-policy.sh')
const REPO = 'owner/matt'
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
    writeFileSync(join(dir, 'data/knowledge-base.json.bak'), '{}\n')
    mkdirSync(join(dir, 'scripts/ci'), { recursive: true })
    writeFileSync(join(dir, 'scripts/ci/data-pr-allowlist.sh'), 'echo allowlisted=false\n')
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

  it('reports a real rename of the data file as a rename and rejects it', () => {
    renameSync(join(dir, 'data/knowledge-base.json'), join(dir, 'data/kb-old.json'))
    const result = classify(base, commit('rename away'))
    expect(result.allowlisted).toBe(false)
    expect(result.out).toMatch(/^not allowed \(R\d+ rename\/copy\): data\/knowledge-base\.json -> data\/kb-old\.json$/m)
  })

  it('rejects an in-place edit of a file that only shares the prefix of the data file', () => {
    writeFileSync(join(dir, 'data/knowledge-base.json.bak'), '{"x":1}\n')
    expect(classify(base, commit('bak')).allowlisted).toBe(false)
  })

  it('judges only the PR changes when main has moved on since the branch point', () => {
    git('checkout', '-q', '-b', 'sync/knowledge-x')
    writeFileSync(join(dir, 'data/knowledge-base.json'), '{"version":2,"entries":[1]}\n')
    const head = commit('data')
    git('checkout', '-q', 'main')
    writeFileSync(join(dir, 'data/other.json'), '{"main":1}\n')
    const mainTip = commit('main moves on')
    expect(classify(mainTip, head)).toMatchObject({ allowlisted: true, touchesData: true })
  })

  it('never allow-lists a PR that edits the checks themselves', () => {
    writeFileSync(join(dir, 'data/knowledge-base.json'), '{"version":2,"entries":[1]}\n')
    writeFileSync(join(dir, 'scripts/ci/data-pr-allowlist.sh'), 'echo allowlisted=true\n')
    expect(classify(base, commit('script')).allowlisted).toBe(false)
  })

  it('prints file names quoted, so a name cannot start a workflow command line', () => {
    writeFileSync(join(dir, 'data/x\n::error::forged'), '1\n')
    const result = classify(base, commit('odd name'))
    expect(result.allowlisted).toBe(false)
    expect(result.out.split('\n').some(line => line.startsWith('::'))).toBe(false)
  })
})

describe('data PR policy', () => {
  let base: string
  let dataHead: string
  let codeHead: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'policy-'))
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 'test@example.invalid')
    git('config', 'user.name', 'test')
    mkdirSync(join(dir, 'data'))
    writeFileSync(join(dir, 'data/knowledge-base.json'), '{"version":2,"entries":[]}\n')
    writeFileSync(join(dir, 'README.md'), 'x\n')
    base = commit('base')
    writeFileSync(join(dir, 'data/knowledge-base.json'), '{"version":2,"entries":[1]}\n')
    dataHead = commit('data')
    writeFileSync(join(dir, 'README.md'), 'y\n')
    codeHead = commit('code')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const policy = (head: string, headRef: string, headRepo = REPO) => {
    const r = spawnSync('bash', [POLICY, base, head], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, HEAD_REF: headRef, HEAD_REPO: headRepo, GITHUB_REPOSITORY: REPO },
    })
    const field = (name: string) => new RegExp(`^${name}=(\\w+)$`, 'm').exec(r.stdout)?.[1]
    return { status: r.status, sync: field('sync'), eligible: field('eligible') }
  }

  it('makes a same-repository sync branch with only data eligible', () => {
    expect(policy(dataHead, 'sync/knowledge-2026-10-27')).toEqual({ status: 0, sync: 'true', eligible: 'true' })
  })

  it('fails a sync branch that changes anything else', () => {
    expect(policy(codeHead, 'sync/knowledge-2026-10-27')).toEqual({ status: 1, sync: 'true', eligible: 'false' })
  })

  it('never makes other branches or forks eligible', () => {
    expect(policy(dataHead, 'feat/knowledge')).toEqual({ status: 0, sync: 'false', eligible: 'false' })
    expect(policy(dataHead, 'sync/knowledge-x', 'someone/fork')).toEqual({ status: 0, sync: 'false', eligible: 'false' })
    expect(policy(dataHead, 'sync/knowledge-$(id)')).toEqual({ status: 0, sync: 'false', eligible: 'false' })
    expect(policy(dataHead, 'sync/knowledge-x\nmain')).toEqual({ status: 0, sync: 'false', eligible: 'false' })
  })

  it('refuses to run without the PR context', () => {
    const r = spawnSync('bash', [POLICY, base, dataHead], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH } })
    expect(r.status).not.toBe(0)
  })
})

// The checks that decide auto-merge must come from the base branch and never run PR code.
describe('data PR policy workflow', () => {
  type Step = { uses?: string; run?: string; with?: Record<string, unknown> }
  type Job = { name: string; permissions?: Record<string, string>; steps: Step[] }
  const workflow = parse(readFileSync(resolve('.github/workflows/data-pr-policy.yml'), 'utf8')) as {
    on: Record<string, unknown>; permissions: unknown; jobs: Record<string, Job>
  }
  const jobs = Object.values(workflow.jobs)

  it('runs from the base branch only, under the required check names', () => {
    expect(Object.keys(workflow.on)).toEqual(['pull_request_target'])
    expect(workflow.permissions).toEqual({})
    expect(jobs.map(j => j.name).sort()).toEqual(['Auto-merge guard', 'Data PR allowlist'])
  })

  it('never checks out the PR or interpolates PR-controlled text into a script', () => {
    for (const job of jobs) {
      for (const step of job.steps) {
        if (step.uses?.startsWith('actions/checkout@')) {
          expect(step.with?.ref).toBeUndefined()
          expect(step.with?.['persist-credentials']).toBe(false)
        }
        if (step.uses) expect(step.uses).toMatch(/@[0-9a-f]{40}(\s|$)/)
        if (step.run) {
          expect(step.run).not.toContain('${{')
          expect(step.run).not.toMatch(/git (checkout|switch|worktree|reset)\b/)
        }
      }
    }
  })

  it('gives write access only to the guard', () => {
    expect(workflow.jobs.allowlist.permissions).toEqual({ contents: 'read' })
    expect(workflow.jobs.guard.permissions).toEqual({ contents: 'read', 'pull-requests': 'write' })
  })

  it('is the only workflow that runs the policy scripts', () => {
    const others = readdirSync(resolve('.github/workflows')).filter(f => f !== 'data-pr-policy.yml')
    for (const file of others) {
      const text = readFileSync(resolve('.github/workflows', file), 'utf8')
      expect(text, file).not.toMatch(/data-pr-(allowlist|policy)\.sh|Data PR allowlist|Auto-merge guard/)
    }
  })
})
