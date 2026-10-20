# Corpus tooling / 语料工具

## English

These tools use plain Node 20 ESM and built-in modules, with no npm dependencies.
Run commands from the repository root. The committed index contains metadata and
our own bilingual summaries. Original posts, article titles, descriptions, HTML,
and article bodies must never be committed. The starter index is intentionally
`[]`; it contains no unverified examples.

Obey [X's Developer Agreement and policies](https://developer.x.com/en/developer-terms/agreement-and-policy)
and [X's terms](https://x.com/en/tos), as well as each website's terms and robots.txt.
Keep request rates low and use only public resources your access permits. Do not
bypass login, payment, or access restrictions. X API availability, history limits,
fields, and quotas depend on your access; this tool cannot promise a full archive.
API references: [X user posts](https://docs.x.com/x-api/users/get-posts),
[X rate limits](https://docs.x.com/x-api/fundamentals/rate-limits), and
[GitHub public repositories](https://docs.github.com/en/rest/repos/repos#list-repositories-for-a-user).

### Environment and output

`.env.example` lists empty variable names. Set values in your process environment;
the tools do not automatically load dotenv files. Tokens are read only from the
environment, never from command arguments or committed files.

| Variable | Meaning |
| --- | --- |
| `X_BEARER_TOKEN` | Required for X API calls |
| `X_HANDLE` | Public X handle, default `mattpocockuk` |
| `GH_USER` | Public GitHub user, default `mattpocock` |
| `GITHUB_TOKEN` | Optional token for GitHub API quota |
| `CORPUS_RAW_DIR` | Raw directory, default `.corpus-raw/`, relative to the working directory |

Before fetching, add `.corpus-raw/`, `.env`, and `.env.*` with an exception for
`.env.example` to the repository ignore rules. Ignore any custom raw directory as
well. This task leaves the repository ignore file and package scripts untouched.
Never stage or commit raw data, populated env files, summary batches, or checkpoints.
HTTP failure messages omit response bodies and credentials. The copyright guard
intentionally prints matched source words: keep its output private when needed.

### Run order

```sh
node scripts/corpus/fetch-x.mjs
node scripts/corpus/fetch-github.mjs
node scripts/corpus/fetch-aihero.mjs
node scripts/corpus/build-index.mjs --types post,article,repo,web --min-likes 50
# Prepare and review an original bilingual summary batch in the raw directory.
node scripts/corpus/apply-summaries.mjs .corpus-raw/summaries.jsonl
node scripts/check-overlap.mjs --require-raw
node --test test/corpus/
```

| Script | Behavior and output |
| --- | --- |
| `corpus/fetch-x.mjs` | Paginates the X v2 user timeline with the required fields; excludes reposts, classifies original/quote/self_thread/reply, deduplicates IDs, writes raw `x/posts.jsonl` |
| `corpus/fetch-github.mjs` | Lists only public repository metadata: name, URL, description, SPDX license, stars, last push, fork flag; writes raw `github/repos.json`; downloads no repository contents |
| `corpus/fetch-aihero.mjs` | Reads the sitemap and nested same-origin sitemaps, checks robots, rejects restricted paths, retains confirmed public article/tutorial metadata in raw `aihero/pages.json` |
| `corpus/build-index.mjs` | Whitelists index fields, applies topic rules and quality filters, preserves summaries by stable ID, validates and writes `data/corpus-index.json` and `data/corpus-index.schema.json`; prints the pending count, creates no pending file |
| `corpus/apply-summaries.mjs` | Validates a JSONL batch of `{id, zh, en}` against originals, then atomically replaces the index only when the entire batch passes |
| `check-overlap.mjs` | Checks text targets against raw source 8-grams and reports file, line, run length, matched words, and totals |

Fetchers make sequential requests with at least one second between pages; aihero
honors robots crawl delays. API requests retry rate limits up to five times,
respecting reset and Retry-After headers. An interrupt is safe: X writes raw data
before its pagination checkpoint (`x/timeline-state.json`). Re-run the same command
to finish that window. Successful runs remove the checkpoint; the next default
run uses the newest stored post ID. Metrics of old posts are not refreshed by an
incremental fetch; re-fetch a date window to refresh them.

X windows are exclusive ID bounds (`--since-id`, `--until-id`) or UTC date/time
bounds (`--since`, `--until`). Date-only ISO input is normalized to midnight UTC.
An explicit window disables automatic newest-ID selection, allowing backfills:

```sh
node scripts/corpus/fetch-x.mjs --since 2026-01-01 --until 2026-02-01
node scripts/corpus/fetch-x.mjs --since-id 100 --until-id 200
```

Keep a separate raw directory for each account. An unfinished window must finish
before changing windows; to deliberately restart it, delete only its local raw
checkpoint. The raw post file is preserved and IDs are still deduplicated.

aihero transiently reads HTML to inspect the title and access metadata, storing
only URL, sitemap lastmod, and title. It never writes HTML or page bodies. Pages
with paid/private flags, uncertain public access, or uncertain article type are
skipped. This is intentionally conservative and may omit public pages when the
site changes its metadata. Missing/invalid source dates are skipped by the index
builder and counted; dates are never invented. Article dates use sitemap lastmod,
repo dates use pushed_at, and X dates use created_at.

### Index and summaries

The index fields are `id`, `type`, `url`, `date`, `tags`, `metrics`, and `summary`.
Only applicable, available metrics are included; missing metrics are not fabricated.
Replies are excluded by default; use `--include-replies` to include qualifying
replies. Self-thread posts remain eligible. `--min-likes` applies only to posts.
The default threshold is 50. `--types` controls the complete rebuilt index, so
records outside the chosen types are removed. Existing summaries of retained IDs
are preserved. Never edit those summaries to contain original source text.

Topic keyword rules are documented in `corpus/build-index.mjs`; a record can have
multiple tags and unmatched records receive `general`. Stable IDs are `x:ID`,
`x-article:ID`, or a source prefix and 24 hex characters from the canonical URL's
SHA-256 hash. URL fragments are excluded from hashed IDs. Changing a URL changes
its ID and requires new summaries.

Optional local inputs: `x/articles.json` (array) or `x/articles.jsonl` can hold
public X Articles with `id` (optional), `url`, `created_at` or `date`, `title`,
`text`/`body`, and optional `public_metrics`. Do not supply the same article in
both formats. Timeline note_tweet is a long post, not automatically an X Article.
X Articles require a separate permitted collection step; the timeline API does
not provide a full article archive. `web/pages.json` (array) accepts `url`, `date`
or `lastmod`, and optional `title`, `text`, `description` for other public resources.
All these inputs are raw files and must stay ignored.

Use `corpus/summarize-prompt.md` for a separate, operator-controlled LLM batch job.
Supply IDs, links, and original fields locally; request original one-sentence
Chinese and English summaries (at most 40 characters / 25 words). Store model
output under the raw directory. The importer rejects unknown IDs, duplicate IDs,
extra keys, empty summaries, quotation marks, line breaks, excessive lengths, and
any summary sharing eight consecutive English words with that record's original.
There is no quote-with-link exemption for summaries. Original text must be
available; a title-only aihero record can only be checked against its stored title.
An editor must check factual accuracy, one-sentence form, and Chinese originality;
English overlap detection cannot establish originality of a translation.

### Copyright guard

```sh
node scripts/check-overlap.mjs
node scripts/check-overlap.mjs --raw .corpus-raw --require-raw
node scripts/check-overlap.mjs --paths data/corpus-index.json
node scripts/check-overlap.mjs --raw .corpus-raw --require-raw --all-files   # also scan source code (noisy: import lines collide with code samples)
node scripts/check-overlap.mjs --paths scripts,data --paths test/corpus
```

Sources are all string values in JSON/JSONL and full Markdown text, recursively
under `--raw` or `CORPUS_RAW_DIR`. Fields and documents are never joined to create
false source windows. JSONL is streamed and source windows retain only two uint32
hashes encoded as compact base36 keys. Tokenization lowercases Latin letters and
digits and splits at punctuation; CJK characters do not become tokens. Maximal
adjacent matching 8-gram windows become reported runs. Matching crosses target
line breaks so reflowing copied text cannot evade detection.

By default, the guard obtains tracked paths with `git ls-files -z`. Explicit
`--paths` scans just those files/directories and can check new untracked files
before staging. Repeated options, comma-separated paths, and subsequent path
arguments are accepted. `third_party/`, package-lock files, symlinks, and binary
files are excluded in either mode. A hit is allowed only when it has at most 30
words, stays on one line (including a Markdown table row), and that line contains
an HTTP(S) link. A longer run or an unlinked run fails with exit 1. Output lists
files scanned, hits, allowed quotes, and violations.

No raw directory prints `no raw corpus, skipped` and exits 0, suitable for CI
without private data. `--require-raw` fails on a missing directory or a corpus
with no eight-word windows. Malformed raw data fails closed. Skipping without raw
data is not evidence that an index passed an originality check.

Suggested package scripts (add separately):

```json
{
  "corpus:x": "node scripts/corpus/fetch-x.mjs",
  "corpus:github": "node scripts/corpus/fetch-github.mjs",
  "corpus:aihero": "node scripts/corpus/fetch-aihero.mjs",
  "corpus:build": "node scripts/corpus/build-index.mjs",
  "corpus:summaries": "node scripts/corpus/apply-summaries.mjs",
  "check:overlap": "node scripts/check-overlap.mjs",
  "test:corpus": "node --test test/corpus/"
}
```

Suggested ignore entries (add separately):

```gitignore
.corpus-raw/
.env
.env.*
!.env.example
```

## 中文

工具仅使用 Node 20 内置模块，无 npm 依赖。请在仓库根目录运行。提交到仓库的
仅为链接、时间、分类、主题标签、互动数和我们自己撰写的中英文摘要。原帖、
文章标题、仓库描述、网页 HTML 和正文均属于原始材料，绝不能提交。初始索引为
`[]`，不包含未经核实的示例。

必须遵守 X 开发者协议、X 使用条款及各网站的条款与 robots.txt。仅访问获准
访问的公开内容，保持低请求频率，不绕过登录、付费或权限限制。X 的历史范围、
字段和配额取决于 API 权限，工具不保证抓取完整历史。

环境变量见上表及 `.env.example`。令牌仅从环境读取，不接受命令行传入，不会
自动加载 dotenv 文件。默认公开账号分别为 `mattpocockuk` 和 `mattpocock`。
原始输出默认在 `.corpus-raw/`，可用 `CORPUS_RAW_DIR` 修改。抓取前请按上方
建议添加忽略规则，自定义原始目录也必须忽略。本次不修改 package.json 或忽略文件。

运行顺序：先运行三个 fetch 脚本，再运行 build-index，随后单独生成并人工审核
摘要 JSONL，用 apply-summaries 导入，最后运行 check-overlap 与测试。完整命令
见上方 Run order。X 输出 `x/posts.jsonl`；GitHub 仅保存仓库元数据至
`github/repos.json`，不下载代码；aihero 保存 URL、lastmod 和标题至
`aihero/pages.json`，不落盘网页正文。无法确认公开权限或文章类型的页面会跳过。

X 支持 `--since` / `--until` 时间窗口及 `--since-id` / `--until-id` ID 窗口。
默认从已保存的最新 ID 增量抓取；显式窗口可用于补抓历史和更新旧互动数。
中断后使用同一命令继续，分页检查点在 `x/timeline-state.json`，完成后自动删除。
切换账号请使用不同原始目录。请求按顺序进行，至少间隔一秒，遵守 robots 延迟，
遇到限流按 reset / Retry-After 等待重试。

索引构建器写入 `data/corpus-index.json` 和 JSON Schema，并执行内置校验。
默认仅收录至少 50 赞的帖子、排除对他人的回复，自回复串仍可收录。
`--include-replies` 可包含达标回复，`--min-likes` 仅影响帖子。
`--types` 选择本次重建的全部类型，未选类型会从索引移除。主题规则在脚本内
注释说明；按 ID 保留已有摘要，缺失摘要留空并打印待处理数量，不生成待处理文件。
日期缺失或无效的条目会跳过并计数，不编造日期。

可选本地输入 `x/articles.json` / `.jsonl` 用于另行合法获取的公开 X Articles，
`web/pages.json` 用于其他公开资源；字段约定见上文。长帖 note_tweet 不会被
误当作 X Article。所有输入、检查点、LLM 提示批次及结果均留在忽略目录。

摘要模板为 `corpus/summarize-prompt.md`。中英文各一句，中文最多 40 字符，
英文最多 25 词，用自己的话写，不引用、不照抄。导入器整批校验，失败时不会
改写索引；拒绝未知或重复 ID、空值、多余字段、超长、引号、换行以及连续八个
英文词与该条原文重合的摘要。即使带链接也不能豁免摘要。人工仍须检查事实、
单句要求与中文原创性；仅存标题的 aihero 条目只能与本地标题进行重合检查。

重合检查器递归读取原始 JSON/JSONL 的字符串字段及 Markdown。默认检查所有
Git 已跟踪文本，`--paths` 可指定文件或目录，也支持尚未跟踪的新文件。
排除 third_party、package-lock、符号链接与二进制文件。英文按小写拉丁字母和
数字分词，标点分隔，忽略中文字符。发现连续八词或更多重合时报告文件、行号、
长度与重合内容；仅当整段最多 30 词、位于同一行或 Markdown 表格行且该行带
HTTP(S) 链接时允许作为短引用，其他情况退出码为 1。报告可能含原文，请妥善处理日志。

缺少原始目录时输出 `no raw corpus, skipped` 并正常退出，便于公开 CI 运行。
加 `--require-raw` 则缺少目录或没有可检查的八词窗口均失败。没有原始数据时的
跳过结果不代表通过原创性审核。始终先在本地完整检查，再提交索引；绝不提交原始材料。
