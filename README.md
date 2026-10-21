# Matt Pocock study notes · 学习笔记

An independent, unofficial, non-commercial bilingual study site about Matt Pocock’s public teaching. [Follow Matt](https://x.com/mattpocockuk), explore his [GitHub](https://github.com/mattpocock), and learn from [AI Hero](https://www.aihero.dev). There is no affiliation or endorsement.

这是用我们自己的话整理的非官方、非商业双语学习站，与 Matt Pocock 无隶属或背书关系。欢迎关注原作者，直接阅读他的作品。

## Run / 运行

Node 20.19+ (20.x) and npm:

```sh
npm install
npm run dev
```

`dev` starts Vite and Hono, watching content changes. Production:

```sh
npm run lint
npm run typecheck
npm test
npm run og
npm run build
npm start
```

Set `SITE_URL` to the public HTTPS origin when building (default: `https://matt.withkeya.com`). It controls canonical, hreflang, Open Graph and LLM links. Set `PORT` for the server (default: `8787`). Use the same environment at build and start. No `.npmrc` is needed.

构建时通过 `SITE_URL` 设置公开站点地址，控制 canonical、双语替代链接、OG 与 LLM 索引。服务端口由 `PORT` 设置。构建和启动使用相同环境配置。

## Layout / 目录

- `content/{zh,en}/*.md`: paired lessons and corpus introduction. The exact shared contract is [docs/CONTENT_FORMAT.md](docs/CONTENT_FORMAT.md); the teaching plan is [content/OUTLINE.md](content/OUTLINE.md). Builds support any paired subset of lessons. Links to unpublished entries lead to the available index.
- `src/`: the electric React reader, shared static rendering, responsive navigation and saved language/theme choices. Self-hosted Inter, Space Grotesk, JetBrains Mono and Noto Sans SC come from @fontsource. Theme is set before paint.
- `scripts/content.ts`: validates front matter, renders cards, comparison tables, quotes, exercises, figures and notes; generates Markdown downloads, `content.json`, figures and bilingual `llms.txt` / `llms-full.txt`.
- `scripts/static.tsx`: renders complete crawler-readable home, article and corpus HTML with absolute metadata into `dist/`; `404.html` is served with HTTP 404 for unknown routes.
- `data/figures.json`: bilingual illustration registry. `public/diagrams/` holds themeable inline diagrams; `public/art/` holds imported light/dark art. Missing files use intentional placeholders and generated downloadable SVG fallbacks under `/figures/`. The home chain and tracer have hand-written SVG fallbacks.
- `data/corpus-index.json`: public links, metadata and our summaries. `server/` imports it into SQLite with FTS5 and parameterized LIKE fallback for CJK/partial matches. Disposable indexes live in ignored `generated/`.
- `tests/`: contract, parity, paragraph limits, illustration safety, SQLite API, metadata, links and 404 tests. `test/corpus/` retains the ingestion tests. `npm test` also checks text-token contrast; [docs/DESIGN.md](docs/DESIGN.md) records the approved palette and contrast table.

内容必须按同名 slug 成对提供中英文，格式见共享契约。构建只显示已完成页面；后续内容与插图放入对应目录即可接入。生成文件与数据库不入库，OG PNG 除外。

## Figures and OG images / 插图与分享图

```sh
npm run import:art -- art-delivery
npm run og
```

Art filenames must be known art figure IDs: `<id>.zh.svg`, `<id>.en.svg`, `<id>.zh-dark.svg`, `<id>.en-dark.svg`. The importer validates the entire batch before copying into `public/art/`, rejecting scripts, event handlers, active embedded content, entities and external references. Rebuild after importing. Theme switches art immediately; missing dark art falls back to light.

插图导入先验证整批 SVG；未知 ID 和不安全引用会失败。语言由文件名切换，深色图缺失时回退到浅色图。重新构建后即可展示。

`npm run og` writes **1200×630** electric PNGs to `public/og/{zh,en}/` for all present lessons, home and corpus. **Keep these generated PNGs in source control.** It discovers OS fonts through `fc-match`; install fontconfig and **Noto Sans CJK / Noto Sans SC** first. Missing CJK fonts cause a clear error. No OS font paths are stored in the repository. Regenerate OG images after changing titles or summaries, then build.

分享图使用系统 CJK 字体，通过 `fc-match` 动态发现；标题或摘要更新后重新生成 PNG，再执行构建。PNG 是应保留的静态资源。

## API and exports / 接口与导出

- `GET /api/corpus?q=&type=post|article|repo|web&tag=&from=YYYY-MM-DD&to=YYYY-MM-DD&sort=engagement|date&limit=20&offset=0` → `{total, items}`. Limit: 1–200; invalid parameters return 400. Engagement = likes + 2×reposts + bookmarks + stars. Dates and metrics are collection snapshots.
- `GET /api/corpus/tags` → sorted unique tags.
- `GET /api/health`, `/api/pages?lang=zh`, `/api/search?lang=en&q=...`, `/api/lang-hint`.
- `/<lang>/<slug>.md`, `/llms.txt`, `/llms-full.txt`, `/zh/llms.txt`, `/zh/llms-full.txt`. Quotes keep attribution, source URL and date. Components become readable Markdown.
- `/` selects saved language, then `navigator.language` (`zh*` → Chinese, otherwise English). `/zh` and `/en` are homes. Language switching preserves the page; theme uses localStorage and defaults to the OS preference.

## Deployment / 部署

Run `npm ci` with development dependencies, `npm run og`, `npm run build`, then `npm start` behind an HTTPS reverse proxy. Keep `content/`, `data/`, `public/`, `scripts/`, `src/`, `server/`, package files and dependencies with `dist/`. The process rebuilds disposable content and corpus indexes at start and needs write access to `dist/` and `generated/`. A process manager can keep it running. Unknown routes return a real 404.

安装依赖，生成分享图并构建后，通过任意 HTTPS 反向代理运行服务。启动会重建可删除索引，需要对产物目录有写权限。不要把密钥、原始抓取资料或构建输出提交到仓库。

`npm run review` uses headless Google Chrome (installed on the OS) against a running site on port 8811, with its profile and screenshots in ignored `.cache/`. Set `REVIEW_URL` to review another local instance. It checks both sizes/themes, navigation, preferences, corpus search and 404s.

## Corpus maintenance and licence / 语料维护与许可

`scripts/corpus/` collects public metadata into ignored `.corpus-raw/`; build/apply-summaries scripts produce the public index. See [scripts/README.md](scripts/README.md). Respect source terms and request limits. `npm run check:overlap` checks original-text overlap when raw material is available.

Code is MIT; our original writing is CC BY 4.0. Quotations belong to their authors. Reuse is limited to registered MIT material with notices under `third_party/`.

The eight template repositories and `ai-hero-cli` are link-only, with no content reuse. Fonts retain OFL notices. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

代码采用 MIT，本站原创文字采用 CC BY 4.0。原作版权归原作者；获许可的改编保留准确声明。八个模板仓库与 `ai-hero-cli` 仅链接，不复用内容；字体保留 OFL 声明。
