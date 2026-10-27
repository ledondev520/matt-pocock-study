# PR screenshots: agent-readable site (U1)

Screenshots for the `feat/agent-readable` pull request. Not part of the site; this branch is never merged.

Home page, light theme, headless Chromium. `before-*` is `main` (108a955), `after-*` is the PR branch.

| | Chinese | English |
|---|---|---|
| Phone 390 px (top 1500 px) | before-zh-mobile.png / after-zh-mobile.png | before-en-mobile.png / after-en-mobile.png |
| Desktop 1440 px (first screen) | before-zh-desktop.png / after-zh-desktop.png | before-en-desktop.png / after-en-desktop.png |

Article page `/<lang>/review-and-pr`: the visible "Download .md" / "Download Markdown" links are removed (the `.md` files stay, for agents).

| | Chinese | English |
|---|---|---|
| Phone 390 px (top 1100 px) | before-zh-article-mobile.png / after-zh-article-mobile.png | before-en-article-mobile.png / after-en-article-mobile.png |
| Desktop 1440 px (first screen) | before-zh-article-desktop.png / after-zh-article-desktop.png | before-en-article-desktop.png / after-en-article-desktop.png |

Copy button, fix round 1 (home page, light theme, headless Chromium, clipped to the copy line). Before the fix (`e9ece22-*`) the button grew from "复制/Copy" to "已复制/Copied" on click (zh 61→75 px, en 69→82 px); at 320 px the Chinese line rewrapped from 4 to 5 lines and the text below jumped 24 px. Now (`copy-*`) the button is as wide as its longest label from the start, so the click changes only the label: button width, line height and the paragraph below stay put.

| | Chinese | English |
|---|---|---|
| 320 px, before fix | e9ece22-copy-zh-320-before-click.png / e9ece22-copy-zh-320-after-click.png | e9ece22-copy-en-320-before-click.png / e9ece22-copy-en-320-after-click.png |
| 320 px, fixed | copy-zh-320-before-click.png / copy-zh-320-after-click.png | copy-en-320-before-click.png / copy-en-320-after-click.png |
| 390 px, before fix | e9ece22-copy-zh-390-before-click.png / e9ece22-copy-zh-390-after-click.png | e9ece22-copy-en-390-before-click.png / e9ece22-copy-en-390-after-click.png |
| 390 px, fixed | copy-zh-390-before-click.png / copy-zh-390-after-click.png | copy-en-390-before-click.png / copy-en-390-after-click.png |
