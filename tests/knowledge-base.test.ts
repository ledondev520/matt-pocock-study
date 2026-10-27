// Knowledge base feed: parser, publication gate (fail closed), sync CLI and rendering.
// All notes below are SAMPLE data written for these tests (样例数据), not real notes; the private
// names are made up (样例名), and every quota or usage figure is invented for the tests (777/1000,
// 37.5% and so on); none is a real reading. The real list lives outside this repository.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import { buildFeed, byDate, checkText, gateFeed, parseNotes, validateFeed, type KbFeed } from '../scripts/kb/feed'
import { runSync, sourceFiles } from '../scripts/kb/sync'
import { Site } from '../src/Site'
import { metadata } from '../src/lib/metadata'
import type { Model } from '../src/lib/content'
import { pageModel } from '../scripts/static'

const SAMPLE_NAMES = ['Samplebot', '样例名', 'sample-dir/']
const post = (id: number, handle = 'mattpocockuk') => `https://x.com/${handle}/status/${id}`
const notes = (...entries: string[]) => `# 样例笔记 SAMPLE\n\n正文 Samplebot 在调研部分出现也不发布。\n\n## 每日追加（样例）\n\n### 2099-01-02（样例：读取范围…）\n\n${entries.join('\n')}\n\n下次从 id 1 之后接着读。\n`
const entry = (body: string, link = post(111)) => `- **样例标题。** ${body} [原帖](${link})。Direct。用法：样例用法 Samplebot、/home/sample/x、额度 3.14%。`
const feedOf = (...entries: string[]) => buildFeed([{ source: 'matt-notes', text: notes(...entries) }]).feed

describe('parser', () => {
  it('keeps only the public part (title, body, links before 用法) with a stable id', () => {
    const { entries, skipped } = parseNotes(notes(entry('样例正文，原话 "sample quote"，见 [回复](' + post(222) + ')。'), '- 跳过：样例。'), 'matt-notes')
    expect(entries).toEqual([{ id: 'matt-notes-2099-01-02-222', date: '2099-01-02', source: 'matt-notes', title: '样例标题', url: post(222), body: [
      { text: '样例正文，原话 "sample quote"，见 ' }, { text: '回复', href: post(222) }, { text: '。 ' }, { text: '原帖', href: post(111) }, { text: '。' }] }])
    expect(JSON.stringify(entries)).not.toMatch(/用法|Samplebot|home\/sample|Direct/)
    expect(skipped).toEqual([{ source: 'matt-notes', date: '2099-01-02', reason: 'no-title', line: 10 }])
  })
  it('a body that continues the title does not start with punctuation', () => {
    expect(parseNotes(notes('- **样例标题**：样例正文 [原帖](' + post(1) + ')。用法：样例。'), 'matt-notes').entries[0].body[0].text).toBe('样例正文 ')
  })
  it('skips (and reports) an entry without an original post link; the rest still publish', () => {
    const { entries, skipped } = parseNotes(notes('- **样例无链接。** 只有文字，[别处](https://github.com/mattpocock/skills)。', entry('样例正文。')), 'matt-notes')
    expect(entries.map(e => e.title)).toEqual(['样例标题'])
    expect(skipped).toEqual([{ source: 'matt-notes', date: '2099-01-02', reason: 'no-source-link', line: 9 }])
  })
  it('each source has its own original-link rule', () => {
    const other = notes(entry('样例。', post(5, 'someone')))
    expect(parseNotes(other, 'matt-notes').entries).toEqual([])
    expect(parseNotes(other, 'team').entries.map(e => e.id)).toEqual(['team-2099-01-02-5'])
    const gh = parseNotes(notes(entry('样例。', 'https://github.com/sample-org/sample-repo')), 'team').entries[0]
    expect(gh.id).toMatch(/^team-2099-01-02-[0-9a-f]{8}$/)
    expect(parseNotes(notes(entry('样例。', 'https://github.com/sample-org/sample-repo')), 'team').entries[0].id).toBe(gh.id)
  })
  it('ignores everything outside 每日追加, merges sources newest first, keeps ids unique', () => {
    const older = notes(entry('十月样例。')).replace('2099-01-02', '2099-01-01')
    const { feed } = buildFeed([{ source: 'matt-notes', text: older }, { source: 'matt-notes', text: notes(entry('样例。'), entry('同一帖样例。')) }, { source: 'team', text: notes(entry('团队样例。', post(9, 'someone'))) }])
    expect(feed.entries.map(e => e.id)).toEqual(['matt-notes-2099-01-02-111', 'matt-notes-2099-01-02-111-2', 'team-2099-01-02-9', 'matt-notes-2099-01-01-111'])
    expect(byDate(feed.entries).map(d => [d.date, d.entries.length])).toEqual([['2099-01-02', 3], ['2099-01-01', 1]])
    expect(buildFeed([{ source: 'matt-notes', text: '## 别的章节\n\n### 2099-01-03\n\n' + entry('样例。') }]).feed.entries).toEqual([])
  })
})

describe('gate (one case per category, plus look-alikes that must pass)', () => {
  const blocked: [string, string][] = [
    ['email', '样例联系 sample.person@example.com'],
    ['quota', '样例共 120k tokens'],
    ['quota', '样例 9.9M cached'],
    ['quota', '样例本周额度还剩 37.5%'],
    ['quota', '样例 24.68% 周额度'],
    ['quota', '样例当日剩余 777/1000'],
    ['quota', '样例今天 777/1000'],
    ['quota', 'sample usage: 4321'],
    ['internal-name', '样例：交给 Samplebot 处理'],
    ['internal-name', '样例：样例名负责'],
    ['internal-name', '样例：SAMPLEBOT 负责'],
    ['internal-path', '样例文件在 /home/sample/a.md'],
    ['internal-path', '样例 ~/notes/a.md'],
    ['internal-path', '样例见 C:\\sample\\a.md'],
    ['internal-name', '样例见 sample-dir/notes'],
    ['internal-rule', '样例按 rules.md 处理'],
    ['internal-rule', '样例先拿 sitelock'],
    ['internal-rule', '样例加一个 routine'],
    ['secret', '样例 ghp_' + 'A'.repeat(36)],
    // Built from parts so the repository's own secret scan does not flag the fixture.
    ['secret', '样例 -----BEGIN OPENSSH ' + 'PRIVATE KEY-----'],
    ['ip', '样例服务器 ' + ['203', '0', '113', '9'].join('.')], // RFC 5737 documentation address
    ['phone', '样例电话 13800138000'],
  ]
  it.each(blocked)('%s: %s', (category, text) => {
    expect(checkText(text, SAMPLE_NAMES).map(f => f.category)).toContain(category)
    expect(gateFeed(feedOf(entry(text)), SAMPLE_NAMES).map(f => f.category)).toContain(category)
  })
  it('the title is gated too', () => {
    expect(gateFeed(feedOf(entry('样例。').replace('样例标题', '样例 Samplebot 标题')), SAMPLE_NAMES).map(f => [f.field, f.category])).toEqual([['title', 'internal-name']])
  })
  it('link: a link outside the allow-list blocks', () => {
    const findings = gateFeed(feedOf(entry('样例 [内部](https://example.com/private)。')), SAMPLE_NAMES)
    expect(findings).toEqual([expect.objectContaining({ category: 'link', match: 'https://example.com/private' })])
  })
  it('a private name inside a link target blocks', () => {
    const findings = gateFeed(feedOf(entry(`样例 [仓库](https://github.com/mattpocock/Samplebot)。`)), SAMPLE_NAMES)
    expect(findings.map(f => f.category)).toEqual(['internal-name'])
  })
  it.each([
    '样例 848 赞、约 47 万浏览', '样例：掌握 100% 数据', '样例用 /grill-me 和 /wayfinder', '样例 TypeScript 7.1', 'Samplebots 不是名单里的词',
    '样例 10 万/12 万人', '样例 3–4 个提示词', '样例 [仓库](https://github.com/mattpocock/skills/pull/1316)',
  ])('look-alike passes: %s', text => {
    expect(gateFeed(feedOf(entry(text)), SAMPLE_NAMES)).toEqual([])
  })
})

describe('usage marker variants never publish the usage part (review P2-1)', () => {
  const line = (rest: string, title = '样例标题。') => `- **${title}** 样例正文 [原帖](${post(111)})。${rest}`
  it.each([
    '**用法**：内部样例', '**用法：** 内部样例', '__用法__: 内部样例', '用法︰内部样例', '用法﹕内部样例', '用途：内部样例',
    '用\u200b法：内部样例', '用 法 ： 内部样例', '⽤法：内部样例', '*用途*:内部样例',
  ])('%s', rest => {
    const { entries } = parseNotes(notes(line(rest)), 'matt-notes')
    // Recognised as the marker: the entry is published, cut before it.
    expect(entries.map(e => e.body.map(s => s.text).join(''))).toEqual(['样例正文 原帖。'])
    expect(JSON.stringify(entries)).not.toContain('内部样例')
  })
  it.each([
    ['a marker in the title', line('用法：样例。', '样例 用法：内部样例。')],
    ['an unrecognised 用… section', line('用处：内部样例')],
    ['用法 written with a look-alike colon the split does not know', line('用法 ⦂ 内部样例')],
    ['用法 hidden by a zero-width space and no colon', line('用\u200b法 内部样例')],
  ])('skips the whole entry for %s, and logs it', (_, text) => {
    const { entries, skipped } = parseNotes(notes(text), 'matt-notes')
    expect(entries).toEqual([])
    expect(skipped).toEqual([expect.objectContaining({ reason: 'usage-marker' })])
  })
  it('an entry without any usage marker is skipped (nothing shows where the internal part starts)', () => {
    const { entries, skipped } = parseNotes(notes(`- **样例标题。** 样例正文 [原帖](${post(111)})。`), 'matt-notes')
    expect(entries).toEqual([])
    expect(skipped).toEqual([expect.objectContaining({ reason: 'no-usage-marker' })])
  })
  it('作用： and 用了 in ordinary prose are not markers', () => {
    expect(parseNotes(notes(entry('样例作用：类型推断，用了 3 个提示词。')), 'matt-notes').entries).toHaveLength(1)
  })
})

describe('gate sees the text the page shows (review P2-2 bypasses, one case each)', () => {
  const P = post(111)
  // Each body goes through entry(), so it sits before a standard usage part and must be blocked by the gate.
  const bypass: [string, string][] = [
    ['internal-name', '样例 Ｓａｍｐｌｅｂｏｔ'], ['internal-name', '样例 Sample\u200bbot'], ['internal-name', '样例 Sample\u00adbot'], ['internal-name', '样例 Sample\ufe0fbot'], ['internal-name', '样例 Sample\u034fbot'],
    ['internal-name', '样例 样\u200b例名'], ['internal-name', `样例 [Samplebot](${P})`], ['internal-name', `样例 Sample[bot](${P})`],
    ['internal-name', `样例 样例[名](${P})`], ['internal-name', '样例 Sample**bot**'], ['internal-name', '样例 Sample`bot`'],
    ['internal-name', '样例 Samplebot_x'], ['internal-name', '样例 Sample bot 处理'], ['internal-name', '样例 样·例·名'],
    ['email', '样例 a.b＠example.com'], ['email', '样例 a.b @ example.com'], ['email', '样例 a.b@\u200bexample.com'],
    ['email', `样例 a.b@[example.com](${P})`], ['email', '样例 ａ.ｂ@ｅｘａｍｐｌｅ.ｃｏｍ'],
    // RFC 5737 documentation address, built from parts so the repository's own IPv4 scan stays quiet.
    ['ip', '样例 ' + ['２０３', '０', '１１３', '９'].join('.')], ['ip', '样例 ' + ['203', '0', '113', '9'].join('。')],
    ['ip', '样例 ' + ['203', '0', '\u200b113', '9'].join('.')], ['ip', '样例 ' + ['203', '0', '113', '9'].join('．')],
    ['phone', '样例 138 0013 8000'], ['phone', '样例 138-0013-8000'], ['phone', '样例 +86 138 0013 8000'],
    ['phone', '样例 +86-138-0013-8000'], ['phone', '样例 １３８００１３８０００'], ['phone', '样例 1380013\u200b8000'],
    ['internal-rule', '样例按 ｒｕｌｅｓ.md'], ['internal-rule', '样例按 rules\u200b.md'], ['internal-rule', '样例按 rules**.md**'],
    ['internal-rule', '样例按 rules*.md*'], ['internal-rule', '样例按 rules<b>.md</b>'], ['email', '样例 a.b@*example*.com'],
    // Review P3: secret shapes, quota phrasings and paths after any character (built from parts for the scanners).
    ['secret', '样例 ' + ['sk', 'proj', 'A'.repeat(20)].join('-')], ['secret', '样例 ' + ['sk', 'ant', 'api03', 'A'.repeat(20)].join('-')],
    ['secret', '样例 gh' + 's_' + 'A'.repeat(36)], ['secret', '样例 AI' + 'za' + 'A'.repeat(35)], ['secret', '样例 gl' + 'pat-' + 'A'.repeat(20)],
    ['quota', '样例 还剩 13.57%'], ['quota', '样例今天用掉 345 万'], ['quota', '样例额度 ３．１４％'], ['quota', '样例周额度还剩两成'],
    ['internal-path', '样例放在/tmp/sample.md'], ['internal-path', '样例路径：/etc/sample'], ['internal-path', '样例见`/home/sample/a`'],
  ]
  it.each(bypass)('%s: %s', (category, text) => {
    expect(gateFeed(feedOf(entry(text)), SAMPLE_NAMES).map(f => f.category)).toContain(category)
  })
  it('the shown text is checked whole even when no single segment matches', () => {
    const findings = gateFeed(feedOf(entry(`样例 Sample[bot](${P})`)), SAMPLE_NAMES)
    expect(findings).toEqual([expect.objectContaining({ category: 'internal-name', field: 'shown' })])
  })
  it('links: each source may only link to its own originals (plus the shared Matt sites)', () => {
    expect(gateFeed(feedOf(entry(`样例 [别人](${post(5, 'someone')})`)), SAMPLE_NAMES).map(f => f.category)).toEqual(['link'])
    expect(gateFeed(feedOf(entry('样例 [仓库](https://github.com/sample-org/sample-repo)')), SAMPLE_NAMES).map(f => f.category)).toEqual(['link'])
    const team = buildFeed([{ source: 'team', text: notes(entry('样例 [仓库](https://github.com/sample-org/sample-repo)', post(9, 'someone'))) }]).feed
    expect(gateFeed(team, SAMPLE_NAMES)).toEqual([])
  })
  it.each([
    '样例 2099 年 1 月 2 日', '样例版本 1.2.3', '样例 @mattpocockuk 说', '样例作用：类型推断', '样例用了 3 个提示词', '样例 sample_case 写法',
    '样例 138 个提示词', '样例 10.5 万浏览', `样例见 [skills](https://github.com/mattpocock/skills) 和 [原帖](${post(222)})`,
  ])('look-alike still passes: %s', text => {
    expect(gateFeed(feedOf(entry(text)), SAMPLE_NAMES)).toEqual([])
  })
})

describe('the build re-checks the committed feed', () => {
  it('build:content stops on a feed with a gate finding', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kb-build-'))
    try {
      const bad = join(dir, 'bad.json')
      writeFileSync(bad, JSON.stringify({ version: 2, entries: [{ id: 'matt-notes-2099-01-02-1', date: '2099-01-02', source: 'matt-notes', title: '样例 a@b.co', url: post(1), body: [{ text: '原帖', href: post(1) }] }] }))
      expect(() => execFileSync('npx', ['tsx', 'scripts/build-content.ts'], { env: { ...process.env, KB_FEED: bad }, stdio: 'pipe', timeout: 60000 })).toThrow(/gate findings/)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }, 70000)
})

describe('sync CLI fails closed and reads only configured sources', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const file = (name: string, text: string) => { const path = join(dir, name); writeFileSync(path, text); return path }
  const names = file('names.txt', '# 样例名单\nSamplebot\n样例名\n')
  const log = join(dir, 'sync.log')
  const lines = () => readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l) as Record<string, unknown>)
  mkdirSync(join(dir, 'notes')); mkdirSync(join(dir, 'team'))
  const config = (enabled = true, pattern = 'sample-????-??.md') => file('sources.json', JSON.stringify({ sources: [{ id: 'matt-notes', files: join(dir, 'notes', pattern), enabled: true }, { id: 'team', files: join(dir, 'team', 'team-????-??.md'), enabled }] }))
  const sync = (out: string, cfg = config()) => runSync(['--config', cfg, '--denylist', names, '--out', out, '--log', log])

  it('only enabled sources and matching file names are read', () => {
    file('notes/sample-2099-01.md', notes(entry('样例。')))
    file('notes/other.md', notes(entry('不应读取 sample@example.com')))
    file('team/team-2099-01.md', notes(entry('团队样例。', post(9, 'someone'))))
    expect(sourceFiles(readFileSync(config(false), 'utf8')).map(f => f.file.slice(dir.length))).toEqual(['/notes/sample-2099-01.md'])
    expect(sourceFiles(readFileSync(config(true), 'utf8')).map(f => [f.source, f.file.slice(dir.length)])).toEqual([['matt-notes', '/notes/sample-2099-01.md'], ['team', '/team/team-2099-01.md']])
    expect(() => sourceFiles(JSON.stringify({ sources: [{ id: 'matt-notes', files: join(dir, '*', 'x.md'), enabled: true }] }))).toThrow(/file name/)
    expect(() => sourceFiles(JSON.stringify({ sources: [{ id: 'unknown', files: join(dir, 'x.md'), enabled: true }] }))).toThrow(/bad source/)
  })
  it('writes the feed when the gate passes, and reports noop when nothing changed', () => {
    const out = join(dir, 'ok.json')
    expect(sync(out)).toBe(0)
    expect(validateFeed(JSON.parse(readFileSync(out, 'utf8'))).entries).toHaveLength(2)
    expect(sync(out)).toBe(0)
    expect(lines().at(-1)).toMatchObject({ result: 'noop', entries: 2 })
  })
  it('one finding in any source blocks the whole batch: nothing written, old file kept, log names the category', () => {
    file('team/team-2099-02.md', notes(entry('团队样例 sample@example.com', post(10, 'someone'))))
    const out = file('old.json', 'previous\n')
    expect(sync(out)).toBe(1)
    expect(readFileSync(out, 'utf8')).toBe('previous\n')
    expect(lines().filter(l => l.result === 'blocked')).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'email', id: 'team-2099-01-02-10' }), expect.objectContaining({ published: false })]))
    expect(String(lines().at(-1)?.at)).toMatch(/\+08:00$/)
    rmSync(join(dir, 'team/team-2099-02.md'))
  })
  it('a missing, empty or unreadable name list blocks instead of skipping the check', () => {
    const out = join(dir, 'none.json')
    expect(runSync(['--config', config(), '--out', out, '--log', log])).toBe(2)
    expect(runSync(['--config', config(), '--denylist', file('empty.txt', '# 只有注释\n\n'), '--out', out, '--log', log])).toBe(1)
    expect(runSync(['--config', config(), '--denylist', join(dir, 'missing.txt'), '--out', out, '--log', log])).toBe(2)
    expect(existsSync(out)).toBe(false)
  })
})

describe('committed feed and build validation', () => {
  it('data/knowledge-base.json is valid and passes the public gate', () => {
    const feed = validateFeed(JSON.parse(readFileSync('data/knowledge-base.json', 'utf8')))
    expect(feed.entries.length).toBeGreaterThan(0)
    for (const e of feed.entries) expect(e.url).toMatch(/^https:\/\/x\.com\/mattpocockuk\/status\/\d+$/)
  })
  const one = { id: 'matt-notes-2099-01-02-1', date: '2099-01-02', source: 'matt-notes', title: '样例', url: post(1), body: [{ text: '原帖', href: post(1) }] }
  const good: KbFeed = { version: 2, entries: [one as KbFeed['entries'][number]] }
  it('accepts a good feed', () => { expect(validateFeed(good)).toBe(good) })
  it.each([
    ['gate finding', { ...good, entries: [{ ...one, title: '样例 a@b.co' }] }],
    ['extra field', { ...good, note: 'x' }],
    ['bad original link', { ...good, entries: [{ ...one, url: post(1, 'someone'), body: [{ text: '原帖', href: post(1, 'someone') }] }] }],
    ['unknown source', { ...good, entries: [{ ...one, source: 'other', id: 'other-2099-01-02-1' }] }],
    ['id not matching source and date', { ...good, entries: [{ ...one, id: 'matt-notes-2099-01-03-1' }] }],
    ['duplicate id', { ...good, entries: [one, one] }],
    ['dates out of order', { ...good, entries: [{ ...one, date: '2099-01-01', id: 'matt-notes-2099-01-01-1' }, { ...one, id: 'matt-notes-2099-01-02-2' }] }],
    ['old version', { version: 1, days: [] }],
    ['original link missing from the body', { ...good, entries: [{ ...one, body: [{ text: '回复', href: post(2) }] }] }],
  ])('rejects %s', (_, value) => { expect(() => validateFeed(value)).toThrow(/knowledge-base/) })
})

describe('rendering', () => {
  const feed = feedOf(entry('样例正文 <script>alert(1)</script>。'))
  const model: Model = { pages: [], figures: { zh: {}, en: {} }, corpusCount: 0, corpusItems: [], corpusTags: [], siteUrl: 'https://example.test', knowledge: feed.entries }
  it('Chinese page lists entries with escaped text, the original link and a stable anchor', () => {
    const html = renderToString(createElement(Site, { model, path: '/zh/knowledge' }))
    expect(html).toContain('学习知识库'); expect(html).toContain('样例标题')
    expect(html).toContain(`href="${post(111)}"`); expect(html).not.toContain('<script>alert')
    expect(html).toContain('id="matt-notes-2099-01-02-111"'); expect(html).toContain('href="/en/knowledge"')
  })
  it('a link and the closing mark after it share one unbreakable span', () => {
    const html = renderToString(createElement(Site, { model, path: '/zh/knowledge' }))
    expect(html).toMatch(/<span class="kb-keep"><a [^>]*>原帖<\/a>。<\/span>/)
  })
  it('English page has no Chinese characters (English pages never load the Chinese font)', () => {
    const html = renderToString(createElement(Site, { model, path: '/en/knowledge' }))
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'))
    expect(main).toContain(`href="${post(111)}"`)
    expect(main).not.toMatch(/\p{Script_Extensions=Han}/u)
  })
  it('metadata, scoping and navigation', () => {
    expect(metadata(model, '/zh/knowledge')).toMatchObject({ url: 'https://example.test/zh/knowledge', alternate: 'https://example.test/en/knowledge' })
    expect(pageModel(model, [], '/zh/knowledge').knowledge).toEqual(feed.entries)
    expect(pageModel(model, [], '/zh').knowledge).toBeUndefined()
    expect(renderToString(createElement(Site, { model, path: '/zh' }))).toContain('href="/zh/knowledge"')
  })
})
