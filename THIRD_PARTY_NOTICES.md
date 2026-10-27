# Third-party notices · 第三方声明

## Archify diagram CSS · Archify 图表样式

The CSS fragments embedded in `public/diagrams/*.svg` are extracted and adapted
from [Archify](https://github.com/tt-a1i/archify), licensed under MIT. The diagram
wording and examples are our own. The exact upstream copyright lines are:

```text
Copyright (c) 2026 tt-a1i (Archify)
Copyright (c) 2025 Cocoon AI
```

The full upstream license is preserved at [third_party/archify/LICENSE](third_party/archify/LICENSE).
The site's licences page (`/zh/licenses`, `/en/licenses`, linked from every page footer) shows that
full text, and every diagram SVG file carries it (see "Files in this repository" below).
The reused rules, as shipped after theme mapping and scoping, are kept in
[third_party/archify/diagram-css.css](third_party/archify/diagram-css.css).
SVG 内嵌的 CSS 片段来自 Archify 并作主题适配，遵循 MIT 许可；图表文字和例子
由本站编写。原始版权行如上，许可全文保存在该文件中；站点的许可页（页脚「许可」链接）、
每个图表 SVG 文件开头的注释里都附有完整许可。

## Quotations · 引用
Short quotations from Matt Pocock (https://x.com/mattpocockuk, https://www.aihero.dev,
https://github.com/mattpocock) remain © Matt Pocock. Each one links to its source.
They are not licensed under this repository's MIT or CC BY 4.0 terms.
引用的 Matt Pocock 原话版权归原作者,每条附原文链接,不适用本仓库的 MIT / CC BY 4.0。

## Reused MIT material · 复用的 MIT 内容
Files copied or adapted from the repositories below are kept under `third_party/<repo>/`
together with that repository's LICENSE file. When a file is added, add a row to
"Files in this repository" and keep the copyright line exactly as in the upstream LICENSE.

Eligible repositories (original, non-fork, MIT according to GitHub, checked 2026-10-21).
Copyright lines are copied from the upstream LICENSE file where it was checked;
"(check before reuse)" means the LICENSE file has not been read yet.

| Repository | Copyright line in upstream LICENSE |
|---|---|
| [skills](https://github.com/mattpocock/skills) | Copyright (c) 2026 Matt Pocock |
| [ts-reset](https://github.com/mattpocock/ts-reset) | Copyright 2023 Matthew Pocock |
| [sandcastle](https://github.com/mattpocock/sandcastle) | Copyright (c) 2026 Matt Pocock |
| [evalite](https://github.com/mattpocock/evalite) | Copyright (c) 2025 Matt Pocock |
| [xstate-catalogue](https://github.com/mattpocock/xstate-catalogue) | Copyright (c) 2021 Matt Pocock |
| [xstate-codegen](https://github.com/mattpocock/xstate-codegen) | Copyright (c) 2020 Matt Pocock |
| [ai-hero-cli](https://github.com/mattpocock/ai-hero-cli) | Copyright (c) 2024-present <PLACEHOLDER> |
| [tt-package-demo](https://github.com/mattpocock/tt-package-demo) | Copyright (c) Matt Pocock 2024 |
| [ai-hero-cli-archived](https://github.com/mattpocock/ai-hero-cli-archived) | Copyright (c) Matt Pocock 2025 |
| [use-fsm-reducer](https://github.com/mattpocock/use-fsm-reducer) | Copyright (c) 2020 Matt Pocock |
| [make-route-map](https://github.com/mattpocock/make-route-map) | Copyright (c) 2020 Matt Pocock |
| [xstate-sync-to-context](https://github.com/mattpocock/xstate-sync-to-context) | Copyright (c) 2021 Matt Pocock |
| [xstate-command-palette](https://github.com/mattpocock/xstate-command-palette) | Copyright (c) 2021 Matt Pocock |
| [day-tracker-typescript](https://github.com/mattpocock/day-tracker-typescript) | Copyright (c) 2015 gatsbyjs |
| [gatsby-pomodoro](https://github.com/mattpocock/gatsby-pomodoro) | Copyright (c) 2017 gatsbyjs |
| [gatsby-starter-netlify-cms](https://github.com/mattpocock/gatsby-starter-netlify-cms) | Copyright (c) 2015 gatsbyjs |
| [gatsby-test](https://github.com/mattpocock/gatsby-test) | Copyright (c) 2015 gatsbyjs |
| [json-server-wrapper](https://github.com/mattpocock/json-server-wrapper) | Copyright (c) 2018 Matt Pocock |
| [louiseburfitt-new](https://github.com/mattpocock/louiseburfitt-new) | Copyright (c) 2015 gatsbyjs |
| [one-coding-test](https://github.com/mattpocock/one-coding-test) | Copyright (c) 2018 Maximilian Stoiber |
| [race-manager](https://github.com/mattpocock/race-manager) | Copyright (c) 2015 gatsbyjs |
| [react-boilerplate-custom](https://github.com/mattpocock/react-boilerplate-custom) | Copyright (c) 2018 Maximilian Stoiber |

The following eight template repositories are **link-only; no content reuse**. Their
copyright holders are gatsbyjs or Maximilian Stoiber, as shown above:
`day-tracker-typescript`, `gatsby-pomodoro`, `gatsby-starter-netlify-cms`, `gatsby-test`,
`louiseburfitt-new`, `race-manager`, `one-coding-test`, `react-boilerplate-custom`.

`ai-hero-cli` is also **link-only; no code, template or course content reuse**.
Its upstream copyright line contains `<PLACEHOLDER>`; we do not substitute a holder.
The registry above records licence observations, not permission to reuse these exclusions.

八个模板仓库及版权行含占位符的 `ai-hero-cli` 仅作链接导览，不复用内容。

## Files in this repository · 本仓库实际复用的文件

| File | Upstream | Copyright line | Used by |
|---|---|---|---|
| `third_party/mattpocock-skills/LICENSE` | [skills/LICENSE](https://github.com/mattpocock/skills/blob/main/LICENSE), byte-identical | Copyright (c) 2026 Matt Pocock | Full licence text on the licences page (`/zh/licenses`, `/en/licenses`, linked from every page footer) and at the end of the `.md` export and `llms-full.txt` section of the 7 pages (zh + en) that adapt skills structures; the text is not retyped, the build reads this file and checks its sha256 (`scripts/licences.mjs`) |
| `third_party/archify/LICENSE` | [archify/LICENSE @ 7a16d30](https://github.com/tt-a1i/archify/blob/7a16d30322f5bd09c832386faa95d8c9a933f0c0/LICENSE), byte-identical (upstream switched to Apache-2.0 on 2026-10-25; this is the last MIT version, the one taken) | Copyright (c) 2026 tt-a1i (Archify); Copyright (c) 2025 Cocoon AI | Full licence text on the licences page (`/zh/licenses`, `/en/licenses`, linked from every page footer, including every page whose HTML embeds an Archify diagram), and at the end of the `.md` export and `llms-full.txt` section of every page that embeds one; each `public/diagrams/*.svg` starts with an XML comment holding the full text, committed as part of the file and checked byte for byte by tests. All copies are generated from this file after its sha256 check (`scripts/licences.mjs`) |

The adapted skills structures themselves are rewritten in the pages, not copied files.
被改编的 skills 结构在页面中重写，不是整份复制的文件；完整 MIT 许可见站点许可页，对应页面的 .md 导出末尾也附有全文。

## Other open-source code · 其他开源代码

- `src/components/ui/*` follows the shadcn/ui component pattern (https://github.com/shadcn-ui/ui, MIT, Copyright (c) 2023 shadcn).
- npm dependencies keep their own licenses (see `package-lock.json` and each package).

## Self-hosted fonts · 自托管字体

Fonts are distributed through these @fontsource packages under the SIL Open Font License 1.1 (OFL), with their bundled licence notices:

- `@fontsource/inter`: Inter, Copyright 2016 The Inter Project Authors. [Source and OFL](https://github.com/rsms/inter/blob/master/LICENSE.txt).
- `@fontsource/space-grotesk`: Space Grotesk, Copyright 2020 The Space Grotesk Project Authors. [Source and OFL](https://github.com/floriankarsten/space-grotesk/blob/master/OFL.txt).
- `@fontsource/jetbrains-mono`: JetBrains Mono, Copyright 2020 The JetBrains Mono Project Authors. [Source and OFL](https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt).
- `@fontsource/noto-sans-sc`: Noto Sans SC, Google Inc. (as recorded in the package licence). [Source and OFL](https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE).

The electric design, hand-written SVGs and sample lesson are project-authored assets,
ported into this platform. No additional upstream repository code was vendored.

The complete package OFL notices are included in `public/font-licenses/`, distributed with the site and shown verbatim on the licences page.
