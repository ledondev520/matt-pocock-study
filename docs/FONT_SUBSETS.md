# 中文字体子集

`npm run build` 在 `vite build` 前运行 `npm run build:fonts`；`npm run dev` 启动前也生成一次。CI 沿用原有命令，无需安装 Python、系统字体工具或单独下载字体。

字体来源为 `@fontsource/noto-sans-sc` **5.3.1**（上游元数据版本 **v41**），依赖锁定在 `package-lock.json`。输入是该包 `files/noto-sans-sc-chinese-simplified-{400,700}-normal.woff2`。

字体采用 **OFL-1.1**，许可全文见 [Fontsource 包中的 LICENSE](https://github.com/fontsource/font-files/blob/main/fonts/google/noto-sans-sc/LICENSE) 和 [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/)。子集字体的 `name` 表保留版权声明与许可链接（HarfBuzz 默认字段外加 nameID 13/14），并将安装包中的许可全文复制为 `generated/fonts/OFL.txt`。构建入口还生成 `public/fonts/OFL.txt`，由 Vite 随站点发布。字体许可独立于站点代码的 MIT 许可。

收集器递归扫描 `content/` 的两种语言、`data/`（包括客户端语料页使用的摘要）、`src/`、`scripts/` 与 `server/`（构建和服务端渲染的界面文案，如代码块“复制”、练习标题）、`diagrams/` 与 `public/art/`，读取文件里的字面字符；`.json` 文件另按 `JSON.parse` 解析后收集键和字符串值（服务端也是这样读语料的，所以只在翻页或搜索后出现、以 `\u` 转义写的记录也会进子集）。源码里的实体或转义不解码。收集只决定子集里放哪些字，多收几个无妨；它**不是**缺字检查。

收集范围是交给 Noto 的字符：按 Unicode `Script_Extensions` 判定的 Han、平假名、片假名、Hangul、注音（因此包括长音符 ー、浊点 ゙ ゛ 这类 Script=Common 的共用符号），以及 CJK 标点与全角/半角字符。同一个判定（`notoPattern`）也用于浏览器检查。收集到的字符里，源字体有的全部进子集，生成后逐字核对子集 cmap；源字体没有的（如 `丂`、`〜`、康熙部首 `⽤`、半角 `｡`）交给下面的回退分片，回退分片也没有字形的字让生成失败，报错里列出码位。

纯 Node 依赖 `subset-font` **2.9.0**（HarfBuzz 的 WASM 构建）负责子集化并直接输出 WOFF2，保留 GSUB/GPOS 中与所留字形相关的特性（标点挤压 halt/palt、竖排 vert 等），所以中文标点间距与改前一致。生成后再用另一个解析库 fontkit **2.0.4** 读回两个字重的 cmap 逐字核对。同一输入的输出逐字节一致，测试会生成两次并比较。

生成物在已忽略的 `generated/fonts/`，不入库。`src/main.tsx` 引入生成 CSS，Vite 将两个字重作为带内容哈希的资源发布。每个字重一个文件，family 保持 `'Noto Sans SC'`，使用 `font-display: swap` 和精确的 `unicode-range`，不预加载中文字体。

## 回退分片（方案 A）

子集外的字不再落到系统字体，而是由浏览器按 `unicode-range` 去拿完整的 Fontsource 分片：

- 生成 CSS 先写回退分片的 `@font-face`，最后写两个子集 `@font-face`。全部 family 都是 `'Noto Sans SC'`、`font-display: swap`、只有 WOFF2。
- 回退分片就是 `@fontsource/noto-sans-sc` 的编号分片（`files/noto-sans-sc-<编号>-<字重>-normal.woff2`，按 `unicode.json`）。文件原样复制到 `generated/fonts/noto-sans-sc-fallback-<编号>-<字重>.woff2`，再由 Vite 带哈希发布到本站 `/assets/`。CSP 的 `font-src 'self'` 不用改。cyrillic、vietnamese、latin、latin-ext 分片不用。
- 每个分片的 `unicode-range` 是「上游范围 ∩ `notoPattern` − 子集里的字」。所以子集里的字只匹配子集 `@font-face`，不会触发分片下载；箭头这类非 `notoPattern` 字符不匹配任何 Noto 面，英文页照旧不请求 Noto。各面的范围互不重叠，测试会检查。
- 首屏没有新增请求：回退规则跟其它字体规则一起打进同一个样式表，常用字只下载两个子集文件。代价是样式表变大，Brotli 后约多 16 KB。
- 页面上出现子集外的字（每日知识库、用户输入、搜索结果）时，浏览器只下载这个字所在的那一个分片，每个字重一个，和改子集前 main 的行为一样。

测试：`tests/fonts.test.ts`（范围不重叠、分片文件和上游逐字节相同、源字体外的字走分片、谁都没有的字让生成失败）；`tests/static.test.tsx`（构建产物的样式表里两类 `@font-face` 都在、引用的文件都在 `dist/assets`）；`e2e/noto-fallback.pw.ts`（注入子集外的 `丂`，断言请求本站分片、`document.fonts` 里对应面已加载、CDP 报告由 Web 字体绘制；中文首屏只请求两个子集文件；所有中文路由的分片请求都能用页面上的子集外字符解释）。

重新生成与检查：

```sh
npm ci
npm run build:fonts
npx vitest run tests/fonts.test.ts
npm run build
npx playwright test e2e/font-coverage.pw.ts e2e/no-english-cjk-fonts.pw.ts e2e/noto-subset.pw.ts
```

## 缺字检查（浏览器）

缺字检查在浏览器里做，而不是在文本层猜测各种编码。`e2e/font-coverage.pw.ts` 在构建产物上逐页打开 `dist/` 里的每个页面（中英文全部路由），收集页面**实际绘制**的字符：所有文本节点（包括脚本运行后写入的，如 `innerHTML`、拼接的代理对）、每个元素 `::before`/`::after` 的计算后 `content`，以及文本类 `input`/`textarea` 的当前 `value`（为空时取 `placeholder`，按 `::placeholder` 的字体）；`textarea` 标记里的默认文本只在它仍是当前值时才算。只看字体栈里包含 `Noto Sans SC` 的元素中、属于上述判定的字符。

不绘制的内容不检查：`hidden`、`display: none`、`visibility: hidden`、关闭的 `<details>` 内文、`content-visibility: hidden` 元素的内容（含它自己的 `::before`/`::after`）、伪元素按它自己的计算后 `visibility` 判断（元素 `visibility: hidden` 而伪元素设回 `visible` 时照常检查，反之不检查），且元素本身及祖先都不能是 `display: none`；`display: contents` 的元素自己没有盒子，但它的文字和 `::before`/`::after` 画在父元素的盒子里，照常检查（按最近的有盒祖先判断上述各条）；以及 SVG 的 `<title>`/`<desc>`（这两个只给辅助技术和浏览器提示框用）。`<select>` 的选项按所属 `<select>` 是否可见判断。

每个路由检查这些状态：1440px 宽加载完成后；改为 320px 宽后；展开页面上所有 `<details>`（练习答案）后。语料页（`/zh/corpus`、`/en/corpus`）还会依次检查：逐页点「下一页」直到最后一页、按一个标签搜索、无结果、日期范围无效（400）、服务不可用（500）和加载中。

每个（字体栈、字重、字形风格、字符）组合在页面里用一个隔离的探针元素渲染一次，再通过 Chrome DevTools Protocol 的 `CSS.getPlatformFontsForNode` 问 Chrome 实际用哪个字体画了它。只要有一个字不是由站点自带的 Web 字体（Noto Sans SC、Inter、Space Grotesk、JetBrains Mono，且 CDP 报告 `isCustomFont` 为真）画的，测试就失败；本机装有同名系统字体也不能冒充，并列出路由、字符、码位和实际字体。例如 `ˇ` 由 Inter 画，`˙` 由它所在的 Noto 回退分片画，都不算缺字；子集和回退分片都没有的 `丒`（U+4E12）落到系统字体，算缺字。探针结果只在同一文档内复用（同一页的多个状态之间），换页后重新检查，以免后一页字体加载失败时被前一页的结果掩盖。

范围说明：字体栈本来就不含 Noto Sans SC 的元素（如 `"Space Grotesk", sans-serif` 的眉标、`system-ui` 的 SVG 箭头、语言切换标签）本来就由系统字体显示，不在检查范围内。用户在搜索框里自己输入的任意文字不在范围内。

这个检查随 `npm run test:layout` 运行，CI 的 Layout 作业在构建之后执行它（缓存 Playwright 浏览器）。同一文件里的夹具测试证明它能抓到：`innerHTML` 里的实体、`"\uD842"+"\uDFB7"` 拼出的代理对、style 属性里经 `&#92;` 或 `&bsol;` 变成 CSS 转义再由 `::after` 显示的字、命名实体 `&dot;`（夹具里的「缺字」用 `丒` U+4E12 和 `𠮷`，子集和任何回退分片都没有它们）、`input` 的 `placeholder` 和 `value`、只在语料第 2 页出现的字、前一页检查过但后一页字体丢失的字、同名系统字体画的字；`display: contents` 元素的文字和 `::after`；同时不会误报 JSON 里的 `"\\uf900"`（解析后是 6 个 ASCII 字符）、CSS 注释里的转义，以及上面列出的各种不绘制的内容。

开发期间修改文案后需再运行 `npm run build:fonts`（或重启 `npm run dev`），让 Vite 读取更新后的字体与 CSS。
