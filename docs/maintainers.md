# Maintainer notes

Everything a maintainer needs beyond the [README](../README.md): build, deploy, tests, content rules, art, API and licence details.

## Run

Node 22.23.4+ (22.x) and npm:

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

Set `SITE_URL` to the public HTTPS origin when building (default: `https://matt.withkeya.com`). It controls canonical, hreflang, Open Graph and LLM links. Set `PORT` for the server (default: `8787`) and `HOST` for the listen address (default: `127.0.0.1`, so only a local reverse proxy can reach it; set `HOST=0.0.0.0` only if something outside the machine must connect directly). Use the same environment at build and start. No `.npmrc` is needed.

## Layout

- `content/{zh,en}/*.md`: paired lessons and corpus introduction. The exact shared contract is [docs/CONTENT_FORMAT.md](CONTENT_FORMAT.md); the teaching plan is [content/OUTLINE.md](../content/OUTLINE.md). Builds support any paired subset of lessons. Links to unpublished entries lead to the available index.
- Only finished pages are shown; later lessons and art go into the matching folders. Generated files (including `figures.json` and OG PNGs) and databases are not committed.
- `src/`: the electric React reader, shared static rendering, responsive navigation and saved language/theme choices. Self-hosted Inter, Space Grotesk, JetBrains Mono and Noto Sans SC come from @fontsource. Theme is set before paint.
- `scripts/content.ts`: validates front matter, renders cards, comparison tables, quotes, exercises, figures and notes; generates the Markdown twins of the lessons, the homes (`/<lang>/index.md`) and the licences view (`/<lang>/licenses.md`) (served for agents, not linked on pages), `content.json`, figures and bilingual `llms.txt` / `llms-full.txt`.
- `scripts/static.tsx`: renders complete crawler-readable home, article, corpus, licences and knowledge base HTML with absolute metadata into `dist/`; `404.html` is served with HTTP 404 for unknown routes. It also writes the knowledge base twins `/<lang>/knowledge.md` (through `scripts/kb/markdown.ts`, from the validated feed, which only this step reads), `sitemap.xml` and `robots.txt`. It also renders the timeline views (`/<lang>/timeline`, from the lessons' quotes and the knowledge base notes, built by `scripts/timeline.ts`) and their twins `/<lang>/timeline.md`. `npm run dev` runs only the content step, so `knowledge.md`, `timeline.md` and the timeline items exist only in a production build (`dist/`).
- `data/figures.json`: bilingual illustration registry. `public/diagrams/` holds themeable inline diagrams; `public/art/` holds imported light/dark art. Missing files use intentional placeholders and generated downloadable SVG fallbacks under `/figures/`. The home chain and tracer have hand-written SVG fallbacks. Registry IDs must be safe lowercase slugs; all builder writes use a shared resolved-path containment check.
- `data/corpus-index.json`: public links, metadata and our summaries. `server/` imports it into SQLite with FTS5 and parameterized LIKE fallback for CJK/partial matches. Disposable indexes live in ignored `generated/`.
- `tests/`: contract, parity, paragraph limits, illustration safety, SQLite API, metadata, links and 404 tests. `test/corpus/` retains the ingestion tests. `e2e/` holds Playwright layout checks over every built page (route list derived from `dist/`) (`npm run test:layout`, needs `npx playwright install chromium` once; CI runs it in the Layout job). `npm test` also checks text-token contrast; [docs/DESIGN.md](DESIGN.md) records the approved palette and contrast table.

## Diagrams

Paired Chinese/English Archify candidates live in `diagrams/src/<id>.{zh,en}.json`.
Install Archify separately, then run `ARCHIFY_HOME=… npm run diagrams` with Node 22.23.4+ (22.x)
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

## Figures and OG images

```sh
npm run import:art -- art-delivery
npm run og
```

Art filenames must be known art figure IDs: `<id>.zh.svg`, `<id>.en.svg`, `<id>.zh-dark.svg`, `<id>.en-dark.svg`. The importer validates the entire batch before copying into `public/art/`, rejecting scripts, event handlers, active embedded content, entities and external references. SVG support is deliberately limited: an element/attribute allowlist, static presentation declarations only, and functions limited to `var`, `rgb`, `rgba`, `hsl`, `hsla`, `calc` and unquoted `url(#local-id)`. Quotes are allowed only in font families. Every allowed attribute has its own value grammar (attributes without one are rejected); any attribute value containing `url(` other than a bare `url(#local-id)`, `image-set(`, `image(`, `cross-fade(`, `@import` or `expression(` is rejected, and `mask`, `clip-path` and `marker-*` accept only `none` or `url(#local-id)`. Stylesheet selectors must start at their own SVG root class or ID and are rewritten under a unique scope. At-rules (including media rules), CSS escapes, custom declarations, resource functions and page-wide selectors are rejected. XML declarations and metadata are dropped; other processing instructions are rejected. Art has no links. The separate diagram profile permits only `href="/<same-language>/<known-slug>"` anchors (or corpus), with no other anchor attributes. Rebuild after importing. Theme switches art immediately; missing dark art falls back to light.

The delivered batch contains all 100 art variants. See [the integration report](ART_INTEGRATION.md) for the original validation failures and the metadata removed from staging copies before strict import.

`npm run og` writes **1200×630** electric PNGs to `public/og/{zh,en}/` for all present lessons, home and corpus. These generated files are ignored and regenerated by `npm run build` before static rendering. It checks `OG_FONT_FILE` / `OG_CJK_FONT_FILE` first, then discovers OS fonts through `fc-match`; install fontconfig and **Noto Sans CJK / Noto Sans SC** first. Missing CJK fonts cause a clear error. No OS font paths are stored in the repository. Every deployment build requires a readable CJK font. On Ubuntu install `fontconfig fonts-noto-cjk` (`sudo apt-get install -y fonts-noto-cjk`), or set `OG_CJK_FONT_FILE` to a CJK font file.

Markdown content is trusted repository content; raw HTML is not sanitised.

Static pages embed navigation metadata and only the current page body. SPA navigation loads the destination model from per-page JSON and falls back to full navigation if loading fails. Same-page fragment links and their history entries use native browser navigation without loading JSON or resetting scroll; cross-page fragments scroll after rendering, including encoded Chinese headings. The hero's six keyboard-focusable nodes link to same-language content: Align opens the introduction; Spec, Tickets, Implement, Review and PR open the spec/ticket lesson. Focus has a visible contrasting stroke.

Server, SSR and client use the same route grammar: `/`, `/zh`, `/en`, and `/<lang>/<lowercase-slug>` (with an optional trailing slash). HTML file aliases such as `/index.html`, `/zh/index.html`, and `/<lang>/<slug>/index.html`, plus percent-encoded page paths, return real localized HTTP 404s.

## API and exports

- `GET /api/corpus?q=&type=post|article|repo|web&tag=&from=YYYY-MM-DD&to=YYYY-MM-DD&sort=engagement|date&limit=20&offset=0` → `{total, items}`. Limit: 1–200; offset: 0–100000, both safe integers. Queries containing control characters and invalid parameters return 400. Engagement = likes + 2×reposts + bookmarks + stars. Dates and metrics are collection snapshots.
- `GET /api/corpus/tags` → sorted unique tags.
- `GET /api/health`, `/api/pages?lang=zh`, `/api/search?lang=en&q=...`, `/api/lang-hint`.
- `/<lang>/<slug>.md`, `/llms.txt`, `/llms-full.txt`, `/zh/llms.txt`, `/zh/llms-full.txt`. Quotes keep attribution, source URL and date. Components become readable Markdown.
- Agent-readable: `llms.txt` (per language) starts with a how-to for coding agents, then the pages grouped by section. Every indexable HTML route has a Markdown twin linked from its `<head>` (`<link rel="alternate" type="text/markdown">`): `/<lang>/<slug>.md`, `/<lang>/index.md` for the homes (`/` is the Chinese home, so it uses `/zh/index.md`), `/<lang>/licenses.md` for the licences view (intro, links and every licence text verbatim), and `/<lang>/knowledge.md` for the knowledge base (zh: dates, notes and their links; en: dates and original-post links only, no Chinese, like the English page). The last two are listed under "Site" in `llms.txt`. `robots.txt` blocks nothing and points to `sitemap.xml` (canonical URLs with `hreflang` twins and `x-default`, the Chinese page, as in each `<head>`). `tests/static.test.tsx` derives the routes from `dist/` and fails when a page lacks its `.md`, its `llms.txt` line or its sitemap entry, so a new route must add all three. The home-page copy line comes from `src/lib/agent.ts`; `tests/static.test.tsx` checks that each `.md` has its page's title, headings and paragraphs, `e2e/agent-prompt.pw.ts` clicks the Copy button (by its accessible name), reads the clipboard, covers the refused-clipboard fallback and checks that the click moves nothing at 320/390px (the button is as wide as its longest label), and `e2e/markdown-alternate.pw.ts` checks that the client keeps the Markdown `<link>` on the current page's `.md` after hydration and in-site navigation, from 7 starting points (`/`, `/zh`, an article, the corpus, the licences and both knowledge base pages), and that a 404 has none: entered directly (one-level and multi-level paths), left through the brand link (the link comes back) and entered again client-side (the link is removed) (it only rewrites the `hreflang` alternates, `x-default` included, which stays on the Chinese page).
- `/` is the Chinese home page, pre-rendered (canonical `/zh`, `x-default` → Chinese); there is no client-side language redirect. Only a saved English choice (`localStorage.lang === 'en'`, set by the language switch) sends `/` to `/en`, from an inline `<head>` script before the body is parsed. `/zh` and `/en` are homes; `/zh/licenses` and `/en/licenses` hold every licence text. Language switching preserves the page; theme uses localStorage and defaults to the OS preference.

## Deployment

Run `npm ci` with development dependencies, `npm run build` (including OG generation; install a CJK font as above), then `npm start` behind an HTTPS reverse proxy that forwards to `http://127.0.0.1:8787` (or your `HOST`/`PORT`). Keep `content/`, `data/`, `public/`, `scripts/`, `src/`, `server/`, package files and dependencies with `dist/`. The process rebuilds the disposable SQLite indexes at start from `dist/content.json` and needs write access to `generated/`; in production it no longer rewrites `dist/`, so always rebuild after changing content. A process manager can keep it running. Unknown routes return a real 404. Never commit secrets, raw scraped material or build output.

`npm run build` also writes Brotli (`.br`, quality 11) and gzip (`.gz`) copies next to every compressible file in `dist/` of 1 KB or more. Static and dynamic responses negotiate the highest quality among Brotli, gzip and identity, with ties resolved in that order and `Vary: Accept-Encoding`. Identity that the client does not list stays acceptable at quality 0.001, below every coding it does list; a positive `*` never raises it. `identity;q=0`, or `*;q=0` without an identity entry, refuses it. The server uses a matching precompressed file when available, otherwise compresses eligible responses on the fly; responses below 1 KB stay plain when identity is acceptable. If no available coding, including identity, is acceptable, it returns 406. HEAD runs through the GET pipeline and drops the body, preserving the same status, Content-Type, Content-Encoding, Content-Length, ETag, Vary and Cache-Control for the same request headers. Hashed files under `/assets/` are cached for a year (`immutable`); everything else is `no-cache`. Strong ETags identify each successful GET/HEAD wire representation; only an original 200 response to GET/HEAD can become `304 Not Modified`, including conditional HEAD with the GET tag. Conditional requests preserve 4xx/5xx status and bodies (HEAD still has no body). Markdown exports are `text/markdown; charset=utf-8` and open in the browser. Every response carries `X-Content-Type-Options: nosniff`.

Production deploys run from GitHub Actions (`.github/workflows/deploy.yml`): after CI passes on `main`, or by hand from the Actions tab, including a one-click rollback to the previous release. The workflow builds as above, uploads through a restricted SSH key that can only run the deploy gate, switches the `current` release, restarts and smoke-tests `/`, `/zh`, `/en`, `/llms.txt` and `/api/health`, and switches back if anything fails. Server setup, secrets and rollback are in [deploy/README.md](../deploy/README.md).

Pull requests from `sync/knowledge-*` branches of this repository that only modify `data/knowledge-base.json` in place may auto-merge. Both checks live in `.github/workflows/data-pr-policy.yml` and run on `pull_request_target`, so the workflow and `scripts/ci/` come from `main`, not from the PR: the PR is read as git objects and never checked out or run. `Data PR allowlist` classifies the changed files and re-runs the knowledge base shape, privacy gate and format checks (base-branch code on a copy of the PR's data file); `Auto-merge guard` turns auto-merge off on every other PR. Renames, new files, symlinks, mode changes and edits to workflows or scripts are never allow-listed, and a change to these checks takes effect only after it is merged.

Earlier releases removed the old `welcome` and `about` routes/downloads in both languages, changed page/search API fields and corpus validation/sorting, and rebuilt disposable SQLite tables and exports at startup. They changed no business data. Roll back by restoring code and matching dependencies, rebuilding, and restarting; reverting source alone does not replace deployed files or a running process.

`npm run review` uses headless Google Chrome (installed on the OS) against a running site on port 8811, with its profile and screenshots in ignored `.cache/`. Set `REVIEW_URL` to review another local instance. It checks 320/390/1440px in both themes, navigation, preferences, corpus search, nested localized 404s, rejected HTML aliases/encoded page paths, Chinese/English TOC and fragment history, cross-page fragments, six keyboard-accessible hero links, console errors and CSP violations.

## Corpus maintenance and licence

`scripts/corpus/` collects public metadata into ignored `.corpus-raw/`; build/apply-summaries scripts produce the public index. See [scripts/README.md](../scripts/README.md). Respect source terms and request limits. `npm run check:overlap` checks original-text overlap when raw material is available.

Code is MIT; our original writing is CC BY 4.0. Quotations belong to their authors. Reuse is limited to registered MIT material with notices under `third_party/`; licensed adaptations keep accurate notices.

The eight template repositories and `ai-hero-cli` are link-only, with no content reuse. Fonts retain OFL notices. See [LICENSE](../LICENSE) and [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
