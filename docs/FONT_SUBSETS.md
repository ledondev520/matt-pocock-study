# 中文字体子集

`npm run build` 在 `vite build` 前运行 `npm run build:fonts`；`npm run dev` 启动前也生成一次。CI 沿用原有命令，无需安装 Python、系统字体工具或单独下载字体。

字体来源为 `@fontsource/noto-sans-sc` **5.3.1**（上游元数据版本 **v41**），依赖锁定在 `package-lock.json`。输入是该包 `files/noto-sans-sc-chinese-simplified-{400,700}-normal.woff2`。

字体采用 **OFL-1.1**，许可全文见 [Fontsource 包中的 LICENSE](https://github.com/fontsource/font-files/blob/main/fonts/google/noto-sans-sc/LICENSE) 和 [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/)。子集字体的 `name` 表保留版权声明与许可链接（HarfBuzz 默认字段外加 nameID 13/14），并将安装包中的许可全文复制为 `generated/fonts/OFL.txt`。构建入口还生成 `public/fonts/OFL.txt`，由 Vite 随站点发布。字体许可独立于站点代码的 MIT 许可。

收集器递归扫描 `content/` 的两种语言、`data/`（包括客户端语料页使用的摘要）、`src/`、`scripts/` 与 `server/`（构建和服务端渲染的界面文案，如代码块“复制”、练习标题）、`diagrams/` 与 `public/art/`。原文扫描刻意包含 frontmatter、代码示例和注释，允许少量多收，避免遗漏文案；另外解码 JSON、JS/TS/JSX 字符串、模板字符串、CSS 字符转义、数字实体和 SVG 文本。构建输入应是已更新的内容和语料索引，修改这些文件后重新构建；运行中的远程新内容需要重新构建才能扩充字体。

收集范围是交给 Noto 的字符：按 Unicode `Script_Extensions` 判定的 Han、平假名、片假名、Hangul、注音（因此包括长音符 ー、浊点 ゙ ゛ 这类 Script=Common 的共用符号），以及 CJK 标点与全角/半角字符。拉丁文、通用标点、箭头等符号继续由已有西文字体及系统后备字体提供，不放进 Noto 的 `unicode-range`。每个被收集的字符都必须在两个源字体及两个输出字体的 cmap 中存在，否则构建失败；不静默丢弃缺字。

纯 Node 依赖 `subset-font` **2.9.0**（HarfBuzz 的 WASM 构建）负责子集化并直接输出 WOFF2，保留 GSUB/GPOS 中与所留字形相关的特性（标点挤压 halt/palt、竖排 vert 等），所以中文标点间距与改前一致。生成后再用另一个解析库 fontkit **2.0.4** 读回两个字重的 cmap 逐字核对。同一输入的输出逐字节一致，测试会生成两次并比较。

生成物在已忽略的 `generated/fonts/`，不入库。`src/main.tsx` 引入生成 CSS，Vite 将两个字重作为带内容哈希的资源发布。每个字重一个文件，family 保持 `'Noto Sans SC'`，使用 `font-display: swap` 和精确的 `unicode-range`，不预加载中文字体。

重新生成与检查：

```sh
npm ci
npm run build:fonts
node scripts/fonts.mjs --check
npx vitest run tests/fonts.test.ts
npm run build
npx playwright test e2e/no-english-cjk-fonts.pw.ts e2e/noto-subset.pw.ts
```

`--check` 用当前内容检查已生成字体，不重新生成。`npm run build` 在静态生成之后再运行 `node scripts/fonts.mjs --check-dist`：扫描 `dist/` 里实际发布的 HTML、SVG、JSON、JS、CSS、TXT 等文件；除字面量外，还解码 HTML/SVG 数字实体（`&#x4e02;`、`&#19970;`）、JSON/JS 转义（`\u4e02`、`\u{4e02}`）和 CSS 转义（`\4e02`）。只要有一个 CJK 字符不在两个字重的子集里，构建就失败；测试对每种写法各放一个子集外的汉字，断言检查失败。源代码文件（`.ts`/`.tsx`/`.mjs` 等）只按字面量和 TypeScript 语法树里的字符串收集，避免把正则里的码位范围当成文案；`dist` 里的 JS 包同样按字面量加语法树字符串值检查（esbuild 可能把中文输出为 `\uXXXX`），正则字面量和正则源字符串里的范围不计入。变异测试先验证临时内容通过，再加入未收录汉字，断言两个字重的 cmap 检查均失败。浏览器测试检查中文页两个字重可实际加载；既有英文页浅色/深色零 Noto 请求测试保持原断言。

开发期间修改文案后需再运行 `npm run build:fonts`（或重启 `npm run dev`），让 Vite 读取更新后的字体与 CSS。
