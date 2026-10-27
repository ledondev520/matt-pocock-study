# PR screenshots: CJK font subset with Fontsource fallback (PR #8, option A)

Screenshots for the `feat/cjk-font-subset` pull request. They are not part of the site, and this branch is never merged.

Full-page screenshots, light theme, headless Chromium, device scale 1. Each page was captured after `document.fonts.ready`. `before-*` is `main` (4ac42d0) and `after-*` is the PR branch after this change. Both are local production builds served by `server/index.ts`.

| Page | Phone 390 px | Desktop 1440 px |
|---|---|---|
| Chinese home `/zh` | before-zh-home-390.png / after-zh-home-390.png | before-zh-home-1440.png / after-zh-home-1440.png |
| Knowledge base `/zh/knowledge` | before-zh-knowledge-390.png / after-zh-knowledge-390.png | before-zh-knowledge-1440.png / after-zh-knowledge-1440.png |

Pixel comparison:

- `/zh` at 390 and 1440: identical (0 differing pixels).
- `/zh/knowledge`: same page height. The only differences are a few lines where `）` is followed by `；`. On `main` the two marks come from different Fontsource slice files, so Chrome's `text-spacing-trim` cannot tighten the pair. In the subset both are in one file, so the pair is tightened as it is everywhere else on the site. See `knowledge-390-punctuation-before-after.png` (left: before, right: after).
