# PLAN — 并行开发拆分

目标:把骨架做成完整的中英双语学习站。每一块都能单独开一个 Codex 会话(或一个分支)并行做,互不改对方的文件;每块一个 PR,合并前过 CI 和独立评审(对照 `CODING_STANDARDS.md`)。

通用约束(每个会话的提示词都带上):
- 只改"边界"里列出的文件;需要动别人的文件时,在 PR 描述里写清楚,交给负责那块的会话。
- 版权:只写我们自己的解读;引用一次一两句并附原文链接;复用只从 MIT 仓库拿,放进 `third_party/` 并更新 `THIRD_PARTY_NOTICES.md`;原始抓取数据(`.corpus-raw/`)永远不提交。
- 完成检查:`npm run lint && npm run typecheck && npm test && npm run build` 全部退出码 0;有原始语料时再跑 `node scripts/check-overlap.mjs`。

## 依赖顺序

```
设计方向选定 ──► A 前端 ─┐
B 后端 ─────────────────┼─► E 测试/验收(最后收口)
C 中文内容 ─┐            │
D 英文内容 ─┴(同一份 OUTLINE,slug 对齐)
F 语料索引 ──► 后端 /api/corpus 与前端语料页接入
```
A、B、C、D、F 可以同时开工;E 的单元测试随各块一起写,E 本身负责端到端验收。

## A 前端(UI 与阅读体验)
- 边界:`src/**`(不含 `src/lib/i18n*` 的判定逻辑以外的改动需在 PR 说明)、`index.html`、`src/index.css`、`components.json`。
- 内容:落地选定的设计方向(色板、字体、深浅色);顶栏(站名、栏目导航、语言切换、深浅色切换、右上角 GitHub 源码链接);致敬区;栏目页、正文页(左栏目录、右本页目录、引用块、代码块含复制按钮);语料页(搜索框、类型/标签/日期筛选、按互动数排序、分页);首页醒目的语料库入口并说明"持续抓取 Matt 公开精华";每页"下载 .md";页脚声明。
- 验收:正文 ≥17px、中文行宽约 35–40 字;浅色和深色下正文、辅助文字、链接对比度 ≥ 4.5:1(附计算表);1440 和 390 宽截图各一张;键盘可完成语言/主题切换;刷新后语言和主题选择保持。

## B 后端(Hono + SQLite)
- 边界:`server/**`、`scripts/build-content.ts`、数据库相关模块。
- 内容:内容索引与全文搜索(SQLite FTS5);`/api/corpus` 读 `data/corpus-index.json` 导入 SQLite,支持 `q`、`type`、`tag`、`from`/`to`、`sort=engagement|date`、分页;`/llms.txt`、`/llms-full.txt`(中英各一份)、每页 `.md`;安全响应头;缓存头(静态文件长缓存,HTML 短缓存)。
- 验收:各接口有 `app.request` 测试(含筛选和排序的组合、非法参数返回 400);构建产物里 llms 文件和每页 .md 数量与内容页数量一致;冷启动从空数据库重建成功。

## C 中文内容
- 边界:`content/zh/**`。
- 内容:按 `content/OUTLINE.md` 写每一页;先讲问题再给办法;每页末尾给"速查"小结;引用照 OUTLINE 里的表(只用表里的链接)。
- 验收:页数、slug 与 OUTLINE 一致;每条引用都有链接且不超过两句;重叠检测 0 违规;本地构建后每页可打开、可下载 .md。

## D 英文内容
- 边界:`content/en/**`。
- 内容:与中文同一份 OUTLINE、同样的 slug 和顺序,独立写成地道英文(不是逐句机翻);引用用原文英文。
- 验收:同 C;另外 slug 集合与 `content/zh` 完全相同(由测试检查)。

## E 测试与验收
- 边界:`test/**`、`e2e/**`、`.github/workflows/**`。
- 内容:中英 slug 对齐测试;front-matter 校验;所有内部链接有效;引用行必须带链接的检查;Playwright 冒烟(首页、语言切换写入 localStorage、深色切换、语料页筛选);把重叠检测接入 CI(无原始语料时跳过)。
- 验收:CI 全绿;故意改坏一个 slug / 去掉一条引用链接时对应测试失败(写进 PR 描述作为证据)。

## F 语料索引(数据管道)
- 边界:`scripts/corpus/**`、`scripts/check-overlap.mjs`、`data/corpus-index*.json`、`.env.example`。
- 内容:抓取脚本(X API、GitHub API、aihero.dev sitemap,凭据只从环境变量读)输出到被忽略的 `.corpus-raw/`;`build-index` 生成每条记录(链接、日期、类型、主题标签、互动数);摘要由 Codex 批量生成中英各一句(我们自己的话),`apply-summaries` 写入前自动校验与原文不能有连续 8 个及以上相同的词。
- 验收:`data/corpus-index.json` 通过 schema 校验;所有摘要非空且通过 8 词重叠检测;记录里只有链接和元数据,没有原文正文;`rg` 检查仓库里没有令牌、内部路径。

## 之后(不在本轮)
- 部署:构建后 `npm start` 放在任意 HTTPS 反向代理后面;先出预览版,确认后再公开。
- 语料定期更新:手动跑通两次后再考虑定时任务。
