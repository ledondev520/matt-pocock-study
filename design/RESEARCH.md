# 视觉调研:6 个文档站 / 学习站

日期:2026-10-21。方法:无头 Chrome 1440 宽截图(浅色,默认主题),人工观察。只总结做法,不复制任何站点的配色、插画、字体组合或布局。截图未提交到仓库(属于他站页面)。

| 站点 | 看的页面 |
|---|---|
| Stripe Docs | docs.stripe.com/payments/quickstart |
| Tailwind CSS Docs | tailwindcss.com/docs/styling-with-utility-classes |
| Next.js Docs | nextjs.org/docs/app/getting-started/installation |
| Astro Starlight | starlight.astro.build/getting-started |
| Josh W. Comeau 博客 | joshwcomeau.com/css/center-a-div |
| Total TypeScript(Essentials 书) | totaltypescript.com/books/total-typescript-essentials |

## 1. 排版
- **正文字号与行宽**:几个站点的正文都在 16–18px,正文栏 65–75 个拉丁字符宽。Comeau 和 Total TypeScript 的正文最松(行高约 1.6–1.7,段距大),读长文最舒服;Stripe/Next 更紧凑,适合查询型页面。
- **字体**:工具文档(Next、Tailwind、Starlight、Stripe)用中性无衬线;学习型站(Comeau、Total TS)标题用有个性的展示字体(圆润无衬线、斜体衬线),正文保持朴素。结论:**个性放在标题,正文要朴素**。
- **中文要更松**:以上站点都是英文。中文正文需要行高 1.75–1.9、每行 35–40 字,字号不小于 17px。
- **标题层级**:H1 很大但字重不一定最重;H2 和正文之间有明显的空白落差(Comeau 用颜色做 H2,Starlight 加锚点图标)。

## 2. 信息层级
- **三栏结构**(Tailwind、Next、Starlight、Stripe):左侧栏目树,中间正文,右侧"本页目录"。正文栏始终是视觉中心,两侧栏用小字号、低对比文字。
- **面包屑 / 小标签**:Tailwind 和 Next 在 H1 上方放一个小号大写的栏目名(例如 "CORE CONCEPTS"),读者知道自己在哪一层。
- **学习站的开头**:Total TS 每章用整屏大标题加章节号,Comeau 用插画头图和"更新于"日期。我们的首页可以借这个思路做"仪式感",内页保持克制。
- **提示块**(Starlight 的 aside、Comeau 的强调框):用底色加图标区分"提示/注意/引用",比单纯加粗醒目。

## 3. 代码块
- 浅色页面上用**深色代码块**的很多(Stripe、Tailwind、Comeau),对比强,一眼能分出"正文"和"代码";Next 和 Starlight 用浅灰底代码块,风格更统一。
- 好的细节:文件名 / 语言标签页(Stripe、Next 的 Terminal 标签)、复制按钮(Starlight、Next)、包管理器切换标签(npm/pnpm/yarn)、行号(只在长示例上用)。
- 行内代码:浅色底 + 圆角 + 等宽字体,不要用和链接一样的颜色。

## 4. 深浅色
- Starlight、Next、Tailwind、Comeau 都有手动切换(Starlight 是 Auto/Light/Dark 三档);Total TS 默认深色。
- 深色模式下正文不用纯白(偏灰的米白更舒服),背景不用纯黑(带一点色相的深灰/深蓝)。
- 强调色在深色下要调亮、降饱和,否则发光刺眼。

## 5. 导航
- 顶栏:左 logo,中间或右侧搜索框(带 Ctrl K 提示),最右侧 GitHub 图标和主题、语言切换(Starlight、Next、Tailwind 都是这个位置)。
- 侧栏分组标题用小号大写字母 + 字距,组内条目常规字号;当前页用色块或左边线高亮。
- 手机端侧栏收进汉堡菜单,本页目录折叠到标题下面。

## 对本站的结论
1. 首页可以大胆(色块、大标题、语料库入口醒目),内页以阅读为先:正文 ≥17px、中文行高约 1.8、正文栏约 38em。
2. 正文对比度 ≥ WCAG AA(4.5:1),辅助文字也要达标;深色模式不用纯黑纯白。
3. 代码块:深色块 + 文件名标签 + 复制按钮;行内代码与链接颜色区分。
4. 顶栏右侧固定:语言切换、深浅色切换、GitHub 源码链接。
5. 引用块(Matt 的短句)要有专门样式,署名并带原帖链接,和我们自己的解读在视觉上分开。
