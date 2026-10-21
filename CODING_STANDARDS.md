# CODING_STANDARDS

评审时对照的清单。每条都对应一类会重复出现的错误。
A review-time checklist; each rule targets a mistake that tends to repeat.

- **只在评审时执行**:评审逐条对照 diff,违反项写明编号和 `文件:行号`,按实际危害定级。不要把本文件塞进写代码的提示词。
- **怎么加一行**:评审发现一类新的、会重复犯的错(不是一次性 bug),在同一 PR 的修复提交里追加一行:一句话规则 + 原因 + 出处 PR 号。只追加、不重写;已有同类规则就在原行补 PR 号。
- **测试被削弱**(放宽/删除/跳过断言、从 CI 排除)直接拒绝合并,不在本清单里分级。
- **PR 描述必须写门型和影响范围**:单向门 / 双向门及理由、影响范围、回滚方式。模板见 `.github/pull_request_template.md`。

## 规则 · Rules

1. 本地测试以退出码和未处理异常为准,不能只看 "Tests N passed";mock 的返回值形状要与真实实现一致(例如返回 Promise)。原因:断言全过但有未处理异常时 vitest 退出码为 1,CI 会失败。
2. 新增的回归测试必须证明在改动前的代码(或去掉关键判断的变异)上会失败。原因:写在错误时机的测试变异后仍然全部通过,抓不到问题。
3. PR 描述和注释里的"行为等价 / 完全一致 / 全仓清单"这类说法必须有实测证据,并在每次修复后与最终 diff 同步。正文和下载说明里"包含 / 附带 / 完整"之类对产物的声明同理。原因:过度或过时的声明会掩盖真实的行为差异。(PR #2)
4. 删除或写入文件前,相对和绝对路径都先 resolve 再做包含检查;判断越界用 `rel === '..'` 或以 `'..' + path.sep` 开头,不用 `startsWith('..')`。原因:只检查相对路径会让根外的别名路径通过,`startsWith('..')` 会误拒 `..valid` 这类合法名字。 (PR #1) (PR #1 r2)
5. 不提交密钥、token、cookie、`.env`、服务器地址、本机绝对路径;凭据只从环境变量读,`.env.example` 只写变量名。原因:仓库公开,历史里的泄露无法撤回。
6. 不提交构建产物、本地数据库、抓取的原始数据(`.corpus-raw/`)。新的产物类型出现时同步收紧 `.gitignore`。原因:原始语料受版权保护,构建产物会和源码不同步。 (PR #1)
7. 内容只写我们自己的解读;引用原话一次一两句并附原文链接;复用代码或文字只从 MIT 仓库拿,放进 `third_party/` 并保留版权和许可声明。改动内容后跑 `node scripts/check-overlap.mjs`。原因:见 `LICENSE` 和 `THIRD_PARTY_NOTICES.md`。 图里出现的原话也要在所在页面给出完整原文链接。(PR #3)
8. 中英文内容成对修改:`content/zh/<slug>.md` 和 `content/en/<slug>.md` 的 slug、栏目、顺序保持一致。原因:语言切换和 llms.txt 依赖一一对应。
9. Lint 规则调整级别的同一 PR 里,同步更新 `eslint.config.js` 头注释和 README 的相关说明。原因:文档和实际配置不一致,下一次会按过时信息工作。

10. 外部或生成的 SVG 进入 HTML 前须按元素、属性及 SVG 命名空间允许列表校验，并从解析后的 DOM 重新序列化；禁用动画和非本地引用，避免 XML/HTML 重解析执行活动内容。(PR #1)
11. 动态字符串插入模板时必须使用函数 replacement；HTML 转义不能阻止 `$&`、`$'`、`$` + 反引号等 replacement 指令改变内容。(PR #1)
12. API 输入中的不支持控制字符、非安全整数和超出业务范围的分页值必须返回 4xx；参数绑定不能保证下游解析器接受输入。(PR #1)
13. SSR、客户端与 metadata 共用语言及 404 判定，浏览器检查须覆盖多层未知路径、console 错误和 CSP 违规；静态响应正确不保证 hydration 正确。(PR #1) (PR #1 r2)
14. 内联 SVG 的 CSS 必须使用属性和值函数允许列表，所有选择器限定在各自 SVG 根并隔离作用域，禁用资源加载、转义和未批准的 at-rules；只检查 href/url() 会漏过 image-set 字符串外链及整页样式。(PR #1)
15. 同页 fragment 链接及其前进后退必须保留浏览器原生滚动和历史，不触发页面数据加载或滚动重置；跨页 fragment 须在目标 DOM 就绪后解码并滚动，浏览器回归覆盖中英文锚点和历史导航。(PR #1)
- SVG presentation attributes are CSS too: every allowed attribute needs an explicit value grammar, resource syntax (`url(` non-local, `image-set(`, `image(`, `@import`, `expression(`) is rejected in every attribute, and reference attributes (mask, clip-path, marker-*) accept only `url(#local-id)`. Why: an attribute outside the CSS-property set skipped value checks and loaded resources. (PR #1 r3)
16. 交互区域的 DOM 顺序必须与视觉顺序、键盘和读屏顺序一致；不用 CSS `order` 移动含可聚焦元素的区域，调整布局后实测 Tab 顺序。原因：截图正确时，焦点仍可能越过首屏主操作跳到页底。(PR #2)
17. 中英文教学例子须核对依赖方向、允许 / 禁止和前后条件在两种语言里一致，不能只比对标题和组件结构。原因：结构配对通过时，仍可能把合法路径译成违规路径。(PR #2)
18. 测试提速只能减少重复工作（共用构建结果、缓存），不能改变断言所查询的 DOM：仍用原来的 jsdom 整页文档断言；片段解析或自写树遍历会漏掉 template、noscript、SVG 等上下文差异。(PR #3)
19. 浏览器排版检查以可见字符的行框为准，逐行检查每行首字符（含块内第一行）；隐藏文字不能替代可见的前一个字符。原因：只比较相邻 DOM 文本，会漏掉块首或隐藏文字之后独占一行的标点。(PR #5)
