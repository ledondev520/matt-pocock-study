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
npm run build
npm run test:layout   # Playwright on the build: no page scrolls horizontally at 320/390/1440px, and no line starts with trailing punctuation at 320/390px
npm start
```

Set `SITE_URL` to the public HTTPS origin when building (default: `https://matt.withkeya.com`). It controls canonical, hreflang, Open Graph and LLM links. Set `PORT` for the server (default: `8787`). Use the same environment at build and start. No `.npmrc` is needed.

构建时通过 `SITE_URL` 设置公开站点地址，控制 canonical、双语替代链接、OG 与 LLM 索引。服务端口由 `PORT` 设置。构建和启动使用相同环境配置。

## Layout / 目录

- `content/{zh,en}/*.md`: paired lessons and corpus introduction. The exact shared contract is [docs/CONTENT_FORMAT.md](docs/CONTENT_FORMAT.md); the teaching plan is [content/OUTLINE.md](content/OUTLINE.md). Builds support any paired subset of lessons. Links to unpublished entries lead to the available index.
- `src/`: the electric React reader, shared static rendering, responsive navigation and saved language/theme choices. Self-hosted Inter, Space Grotesk, JetBrains Mono and Noto Sans SC come from @fontsource. Theme is set before paint.
- `scripts/content.ts`: validates front matter, renders cards, comparison tables, quotes, exercises, figures and notes; generates Markdown downloads, `content.json`, figures and bilingual `llms.txt` / `llms-full.txt`.
- `scripts/static.tsx`: renders complete crawler-readable home, article and corpus HTML with absolute metadata into `dist/`; `404.html` is served with HTTP 404 for unknown routes.
- `data/figures.json`: bilingual illustration registry. `public/diagrams/` holds themeable inline diagrams; `public/art/` holds imported light/dark art. Missing files use intentional placeholders and generated downloadable SVG fallbacks under `/figures/`. The home chain and tracer have hand-written SVG fallbacks. Registry IDs must be safe lowercase slugs; all builder writes use a shared resolved-path containment check.
- `data/corpus-index.json`: public links, metadata and our summaries. `server/` imports it into SQLite with FTS5 and parameterized LIKE fallback for CJK/partial matches. Disposable indexes live in ignored `generated/`.
- `tests/`: contract, parity, paragraph limits, illustration safety, SQLite API, metadata, links and 404 tests. `test/corpus/` retains the ingestion tests. `e2e/` holds Playwright layout checks over every built page (route list derived from `dist/`) (`npm run test:layout`, needs `npx playwright install chromium` once; CI runs it in the Layout job). `npm test` also checks text-token contrast; [docs/DESIGN.md](docs/DESIGN.md) records the approved palette and contrast table.

内容必须按同名 slug 成对提供中英文，格式见共享契约。构建只显示已完成页面；后续内容与插图放入对应目录即可接入。生成文件（包括 figures.json、OG PNG）与数据库均不入库。

## Diagrams

Paired Chinese/English Archify candidates live in `diagrams/src/<id>.{zh,en}.json`.
Install Archify separately, then run `ARCHIFY_HOME=… npm run diagrams` with Node 20
and headless Chrome (`CHROME_BIN` defaults to `google-chrome`). An optional list
of diagram IDs limits the build, for example `npm run diagrams -- home-corpus`.
This maintainer command runs showcase finalization, then Chrome extracts static
SVG nodes and styles into `public/diagrams/`. Wide layouts are reflowed into a
390px reading column with wrapped labels of at least 14px; timeline exports use
a proportional vertical time axis. Explainer comparisons
become native SVG cards. Notes remain visible. These generated SVGs are committed;
CI only validates them and does not run Archify. HTML, receipts, and the size/pass
report stay in ignored `.archify/`; Chrome profiles stay in ignored `.cache/`.

The figure loader validates and re-serializes SVGs before inlining them to inherit
the page's light/dark color tokens. The diagram profile permits only same-language
links to existing content pages (`/<lang>/<slug>`); art keeps the strict static
profile without anchors. Each file
has its own scoped class and IDs, so different diagrams or languages can share
a page. Internal node links and source references that the Archify schema cannot
store live in `<id>.links.json`; external source URLs remain in candidates or
sidecars because exported SVGs cannot request external resources. Archify notices and its MIT license are
in `THIRD_PARTY_NOTICES.md` and `third_party/archify/LICENSE`.

## Figures and OG images / 插图与分享图

```sh
npm run import:art -- art-delivery
npm run og
```

Art filenames must be known art figure IDs: `<id>.zh.svg`, `<id>.en.svg`, `<id>.zh-dark.svg`, `<id>.en-dark.svg`. The importer validates the entire batch before copying into `public/art/`, rejecting scripts, event handlers, active embedded content, entities and external references. SVG support is deliberately limited: an element/attribute allowlist, static presentation declarations only, and functions limited to `var`, `rgb`, `rgba`, `hsl`, `hsla`, `calc` and unquoted `url(#local-id)`. Quotes are allowed only in font families. Every allowed attribute has its own value grammar (attributes without one are rejected); any attribute value containing `url(` other than a bare `url(#local-id)`, `image-set(`, `image(`, `cross-fade(`, `@import` or `expression(` is rejected, and `mask`, `clip-path` and `marker-*` accept only `none` or `url(#local-id)`. Stylesheet selectors must start at their own SVG root class or ID and are rewritten under a unique scope. At-rules (including media rules), CSS escapes, custom declarations, resource functions and page-wide selectors are rejected. XML declarations and metadata are dropped; other processing instructions are rejected. Art has no links. The separate diagram profile permits only `href="/<same-language>/<known-slug>"` anchors (or corpus), with no other anchor attributes. Rebuild after importing. Theme switches art immediately; missing dark art falls back to light.

The delivered batch contains all 100 art variants. See [the integration report](docs/ART_INTEGRATION.md) for the original validation failures and the metadata removed from staging copies before strict import.

插图导入先验证整批 SVG；未知 ID 和不安全引用会失败。语言由文件名切换，深色图缺失时回退到浅色图。重新构建后即可展示。

`npm run og` writes **1200×630** electric PNGs to `public/og/{zh,en}/` for all present lessons, home and corpus. These generated files are ignored and regenerated by `npm run build` before static rendering. It checks `OG_FONT_FILE` / `OG_CJK_FONT_FILE` first, then discovers OS fonts through `fc-match`; install fontconfig and **Noto Sans CJK / Noto Sans SC** first. Missing CJK fonts cause a clear error. No OS font paths are stored in the repository. Every deployment build requires a readable CJK font. On Ubuntu install `fontconfig fonts-noto-cjk` (`sudo apt-get install -y fonts-noto-cjk`), or set `OG_CJK_FONT_FILE` to a CJK font file.

分享图优先使用 OG_FONT_FILE / OG_CJK_FONT_FILE，否则通过 fc-match 发现字体；缺少 CJK 字体会终止构建。PNG 由 build 自动生成，不提交。

Markdown content is trusted repository content; raw HTML is not sanitised.

Static pages embed navigation metadata and only the current page body. SPA navigation loads the destination model from per-page JSON and falls back to full navigation if loading fails. Same-page fragment links and their history entries use native browser navigation without loading JSON or resetting scroll; cross-page fragments scroll after rendering, including encoded Chinese headings. The hero's six keyboard-focusable nodes link to same-language content: Align opens the introduction; Spec, Tickets, Implement, Review and PR open the spec/ticket lesson. Focus has a visible contrasting stroke.

Server, SSR and client use the same route grammar: `/`, `/zh`, `/en`, and `/<lang>/<lowercase-slug>` (with an optional trailing slash). HTML file aliases such as `/index.html`, `/zh/index.html`, and `/<lang>/<slug>/index.html`, plus percent-encoded page paths, return real localized HTTP 404s.

## API and exports / 接口与导出

- `GET /api/corpus?q=&type=post|article|repo|web&tag=&from=YYYY-MM-DD&to=YYYY-MM-DD&sort=engagement|date&limit=20&offset=0` → `{total, items}`. Limit: 1–200; offset: 0–100000, both safe integers. Queries containing control characters and invalid parameters return 400. Engagement = likes + 2×reposts + bookmarks + stars. Dates and metrics are collection snapshots.
- `GET /api/corpus/tags` → sorted unique tags.
- `GET /api/health`, `/api/pages?lang=zh`, `/api/search?lang=en&q=...`, `/api/lang-hint`.
- `/<lang>/<slug>.md`, `/llms.txt`, `/llms-full.txt`, `/zh/llms.txt`, `/zh/llms-full.txt`. Quotes keep attribution, source URL and date. Components become readable Markdown.
- `/` selects saved language, then `navigator.language` (`zh*` → Chinese, otherwise English). `/zh` and `/en` are homes. Language switching preserves the page; theme uses localStorage and defaults to the OS preference.

## Deployment / 部署

Run `npm ci` with development dependencies, `npm run build` (including OG generation; install a CJK font as above), then `npm start` behind an HTTPS reverse proxy. Keep `content/`, `data/`, `public/`, `scripts/`, `src/`, `server/`, package files and dependencies with `dist/`. The process rebuilds disposable content and corpus indexes at start and needs write access to `dist/` and `generated/`. A process manager can keep it running. Unknown routes return a real 404. This branch removes the old `welcome` and `about` routes/downloads in both languages, changes page/search API fields and corpus validation/sorting, and rebuilds disposable SQLite tables and exports at startup. It changes no business data. Roll back by restoring code and matching dependencies, rebuilding, and restarting; reverting source alone does not replace deployed files or a running process.

安装依赖，生成分享图并构建后，通过任意 HTTPS 反向代理运行服务。启动会重建可删除索引，需要对产物目录有写权限。不要把密钥、原始抓取资料或构建输出提交到仓库。

`npm run review` uses headless Google Chrome (installed on the OS) against a running site on port 8811, with its profile and screenshots in ignored `.cache/`. Set `REVIEW_URL` to review another local instance. It checks 320/390/1440px in both themes, navigation, preferences, corpus search, nested localized 404s, rejected HTML aliases/encoded page paths, Chinese/English TOC and fragment history, cross-page fragments, six keyboard-accessible hero links, console errors and CSP violations.

## Corpus maintenance and licence / 语料维护与许可

`scripts/corpus/` collects public metadata into ignored `.corpus-raw/`; build/apply-summaries scripts produce the public index. See [scripts/README.md](scripts/README.md). Respect source terms and request limits. `npm run check:overlap` checks original-text overlap when raw material is available.

Code is MIT; our original writing is CC BY 4.0. Quotations belong to their authors. Reuse is limited to registered MIT material with notices under `third_party/`.

The eight template repositories and `ai-hero-cli` are link-only, with no content reuse. Fonts retain OFL notices. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

代码采用 MIT，本站原创文字采用 CC BY 4.0。原作版权归原作者；获许可的改编保留准确声明。八个模板仓库与 `ai-hero-cli` 仅链接，不复用内容；字体保留 OFL 声明。
