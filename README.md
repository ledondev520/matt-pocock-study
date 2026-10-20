# Matt Pocock study notes

An unofficial, non-commercial bilingual study site about Matt Pocock’s public work, intended for matt.withkeya.com. This is a small tribute to his teaching: [follow Matt](https://x.com/mattpocockuk) and read the original sources. It is independent and is not endorsed by him. The two placeholder pages in each language are our own writing; they contain no copied passages.

## Run locally

Use Node 20.19+ (20.x) and npm:

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal. The dev command starts Vite and Hono together; Markdown edits restart content generation. After installing dependencies, all scripts work offline.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

## Deploy

Install dependencies with `npm ci` (including dev dependencies, since the server runs with `tsx`), run `npm run build`, then run `npm start` behind any HTTPS reverse proxy. Set `PORT` if needed; the default is 8787. Keep `content/`, `server/`, `scripts/`, `src/lib/`, the package files, and installed dependencies alongside `dist/`. The process needs write access to `dist/` and `generated/`. Use your process manager to keep it running.

## Layout and generated files

- `content/en/*.md` and `content/zh/*.md`: the source of truth. Front matter requires `slug`, `title`, numeric `order`, and `section`. Both languages must have the same slugs. Markdown is trusted, repository-authored content and may contain HTML.
- `src/`: React reader; `/en/<slug>` and `/zh/<slug>` show pages. `/` chooses the language in the browser. Header controls save `lang` and `theme` in localStorage; initial theme follows the system. All theme tokens are in `src/index.css`; dark mode uses `.dark` on `<html>`.
- `src/components/ui/button.tsx`: the only vendored shadcn/ui component, styled with Tailwind.
- `scripts/`: renders Markdown into HTML and generates `public/content.json` for the reader. Vite copies the generated public files into `dist/` during build. Start regenerates them directly in `dist/` (or `public/` during dev).
- `/llms.txt` and `/zh/llms.txt`: English and Chinese indexes with an H1, summary blockquote, and Markdown page links, following the [llms.txt format](https://llmstxt.org/).
- `/llms-full.txt` and `/zh/llms-full.txt`: all pages in the corresponding language concatenated as Markdown.
- `/en/<slug>.md` and `/zh/<slug>.md`: downloadable page bodies without front matter.
- `server/`: Hono API and production static serving with an SPA fallback. `generated/content.sqlite` is a disposable SQLite content/search index rebuilt at build and start. Search uses parameterized `LIKE`, including Chinese text. Generated files are ignored by Git.
- `tests/`: language selection, Accept-Language hint, generated files, and API tests without opening a port.

API: `GET /api/health`, `GET /api/pages?lang=zh`, `GET /api/search?lang=en&q=notes`, and `GET /api/lang-hint`. The hint uses the first Accept-Language range: a case-insensitive `zh` prefix selects Chinese; otherwise English. Browser selection prefers a valid saved `lang`, then applies the same rule to `navigator.language`.

## Corpus scripts

`scripts/corpus/` fetches public metadata (X API, GitHub API, aihero.dev sitemap) into the git-ignored `.corpus-raw/`, builds `data/corpus-index.json` (links, dates, tags, engagement numbers and one-line summaries written by us), and `scripts/check-overlap.mjs` fails if any tracked file shares 8+ consecutive words with the raw originals (short linked quotes excepted). Credentials come only from environment variables; see `.env.example` and `scripts/README.md`.

**Please respect X's Developer Agreement and terms, and each website's terms and robots rules.** Keep request rates low and never commit raw scraped text.

## License

- Code: MIT. Our own written content (`content/`, corpus summaries, design notes): CC BY 4.0. See `LICENSE`.
- Quotes of Matt Pocock stay © Matt Pocock and link to their sources; material reused from his MIT repositories keeps its original notice under `third_party/`. See `THIRD_PARTY_NOTICES.md`.


# Matt Pocock 学习笔记

这是一个关于 Matt Pocock 公开作品的非官方、非商业双语学习站点，计划用于 matt.withkeya.com。我们用这个小项目向他的教学致敬：欢迎[关注 Matt](https://x.com/mattpocockuk)，直接阅读原始来源。本项目独立维护，未获其背书。每种语言的两篇占位页面均为我们自行撰写，没有复制他的原文。

## 本地运行

使用 Node 20.19+（20.x）及 npm：

```sh
npm install
npm run dev
```

打开终端显示的 Vite 地址。开发命令同时启动 Vite 和 Hono；修改 Markdown 后会重新生成内容。安装依赖后，所有脚本均可离线运行。

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

## 部署

执行 `npm ci` 安装依赖（包含开发依赖，因为服务使用 `tsx`），运行 `npm run build`，然后通过任意 HTTPS 反向代理运行 `npm start`。可通过 `PORT` 设置监听端口，默认值为 8787。部署时，在 `dist/` 旁保留 `content/`、`server/`、`scripts/`、`src/lib/`、包管理文件和已安装的依赖。进程需要对 `dist/` 和 `generated/` 有写入权限，可由进程管理器保持运行。

## 目录与生成文件

- `content/en/*.md` 与 `content/zh/*.md`：唯一内容来源。Front matter 必须包含 `slug`、`title`、数字 `order` 和 `section`，两种语言使用相同的 slug。Markdown 是仓库中可信的自编内容，可以包含 HTML。
- `src/`：React 阅读界面，页面地址为 `/en/<slug>` 和 `/zh/<slug>`。`/` 在浏览器中选择语言。页眉控件将语言和主题分别保存在 localStorage 的 `lang` 和 `theme` 中；默认主题跟随系统。所有主题变量集中在 `src/index.css`，深色模式通过 `<html>` 的 `.dark` 类启用。
- `src/components/ui/button.tsx`：唯一内置的 shadcn/ui 组件，使用 Tailwind 样式。
- `scripts/`：将 Markdown 渲染为 HTML，生成阅读器使用的 `public/content.json`。构建时 Vite 将生成的静态文件复制到 `dist/`。启动服务时直接在 `dist/` 中重新生成，开发模式则使用 `public/`。
- `/llms.txt` 与 `/zh/llms.txt`：英文、中文目录，按照 [llms.txt 格式](https://llmstxt.org/)提供一级标题、摘要引用块及 Markdown 页面链接。
- `/llms-full.txt` 与 `/zh/llms-full.txt`：将对应语言的全部页面合并为 Markdown。
- `/en/<slug>.md` 与 `/zh/<slug>.md`：可下载的页面正文，不含 front matter。
- `server/`：Hono API、生产静态文件服务和 SPA 回退。`generated/content.sqlite` 是可删除的内容与搜索索引，构建及启动时重建；搜索采用参数化 `LIKE`，支持中文。生成文件均已加入 Git 忽略规则。
- `tests/`：语言选择、Accept-Language 提示、生成文件及无需监听端口的 API 测试。

API：`GET /api/health`、`GET /api/pages?lang=zh`、`GET /api/search?lang=en&q=notes`、`GET /api/lang-hint`。语言提示检查 Accept-Language 的第一个语言范围：以 `zh` 开头（不区分大小写）则选择中文，否则选择英文。浏览器优先使用有效的已保存 `lang`，否则对 `navigator.language` 使用相同规则。

## 语料脚本

`scripts/corpus/` 抓取公开元数据(X API、GitHub API、aihero.dev sitemap)到被 git 忽略的 `.corpus-raw/`,生成 `data/corpus-index.json`(链接、日期、标签、互动数和我们自己写的一句话摘要);`scripts/check-overlap.mjs` 检查已跟踪文件与原文是否有连续 8 个及以上相同的词(带链接的短引用除外)。凭据只从环境变量读取,见 `.env.example` 和 `scripts/README.md`。

**请遵守 X 的开发者协议与服务条款,以及各网站的使用条款和 robots 规则。** 控制请求频率,不要提交抓取的原文。

## 许可

- 代码:MIT。我们自己写的内容(`content/`、语料摘要、设计笔记):CC BY 4.0。见 `LICENSE`。
- Matt Pocock 的引文版权归他本人,均附原文链接;来自他 MIT 仓库的复用内容放在 `third_party/` 并保留原许可声明。见 `THIRD_PARTY_NOTICES.md`。
