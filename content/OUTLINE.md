# Matt Pocock 学习站内容提纲

## 版权规则：所有写作者先读

本提纲依据项目规格的版权要求与原始资料的许可分类（维护者本地资料，不入库），资料截止于 2026-10-20，编写于 2026-10-21。原始资料只读。以下规则同时约束中文、英文、页面 Markdown 下载、`/llms.txt`、`/llms-full.txt`。

1. 正文、例子、解释与练习使用我们自己的表达；不把公开可读等同于获准转载，不逐段翻译原文章充当原创。我们提出的应用方法明确标为「本站建议」。
2. 原话每条最多一两句，且本提纲进一步限制为不超过 25 个英文词；紧邻标注 Matt Pocock、原始 URL、日期。中文释义另标「本站译意」，不得把译文伪装成英文原话。相同来源不拆成很多短句拼回全文。
3. 直接复制或改编文本、代码、模板，只使用已核实为 MIT 的仓库文件；保留该仓库的准确版权行、MIT 许可全文、来源与改编说明。优先读 `skills` 仓库的 MIT 文档，不能因为网页内容相似便改抄 aihero.dev 网页。
4. 无许可证仓库、aihero.dev 页面、X 帖子与 X Articles 只做独立解读、短引用和链接；不搬词条、提示词长文、代码截图、整串帖子或 Article 全文。若未来要展示完整帖子，另走 X 官方嵌入，不能从本地归档拼成全文展示。
5. 付费课程、cohort、工作坊、课程练习内容与 NOASSERTION 课程仓库一律不碰。公开可见的课程工具许可证不等于课程内容许可证；本站不使用它们的练习、答案、视频或讲稿。
6. 不编造「Matt 说过……」，不替他写第一人称经历，不暗示他认可本站；不用他的名字或头像冒充我们的产品身份。致敬区将其作为学习对象介绍，并清楚标明非官方。
7. 第三方评论属于各自作者，不能归到 Matt 名下。本版只转述评论所揭示的争议，不复制第三方评论原话。书籍概念注明原作者，不因 Matt 引用过就复制书中段落。
8. 所有页面页脚使用本站声明：「非官方、非商业的学习整理，与 Matt Pocock 无隶属或背书关系。所引作品版权归原作者；MIT 复用内容另附版权与许可声明。」非商业性质不替代许可。

## 信息架构与交付约定

保留规格建议的九个栏目。依据调研笔记 §7 的互动证据，在「写作与传播风格」增加独立的「互动、反馈与署名」页；依据 §2、§3、§12，把工作流和 agent 规则拆成可独立完成的小课。顶部致敬区置于首页第一屏；「关于本站与版权」作为全站固定入口。共 21 个内容页面，栏目本身不另生空白索引页。

| 位置 / 栏目 | 页面 slug | 阅读目的 |
|---|---|---|
| 顶部致敬区、首页 | `learn-from-matt` | 认识学习对象与本站边界 |
| 核心理念 | `core-principles` | 从代码产量转向可维护、可验证的系统 |
| Punch lines 精选 | `punch-lines` | 记住短句，也理解适用条件 |
| AI coding 工作流 | `ai-coding-workflow`、`alignment-and-prototypes`、`specs-and-tickets`、`implementation-and-feedback`、`review-and-pr`、`context-and-handoff` | 按问题规模选择步骤，逐步形成反馈闭环 |
| 给 agent 立规矩 | `agent-documents`、`standards-and-checks`、`decisions-and-retrospectives` | 用导航、检查与决策记录改善环境 |
| TypeScript 心法 | `typescript-foundations`、`practical-type-tools`、`state-and-module-boundaries` | 用类型、状态与接口减少错误空间 |
| 写作与传播风格 | `writing-to-teach`、`feedback-and-attribution` | 解释清楚、接纳反馈、尊重作者 |
| 开源仓库导览 | `open-source-guide` | 按需要选择入口，先看许可 |
| 速查表 | `cheat-sheets` | 写作完成后从各课压缩出操作索引 |
| 学习路径 | `learning-path` | 按能力与目标安排练习 |
| 全站固定页 | `about-and-copyright` | 披露来源、许可、非官方身份与缺口 |

- 中英共用上述 kebab-case slug；建议语言路由为 `/zh/<slug>`、`/en/<slug>`，由骨架实现者决定最终路由。这里的 slug 不因翻译改名。
- 每页均写成完整中文与完整英文，段落不混排；下面英文仅为确定的页面标题。引文保留英文原文。
- 每课固定顺序：真实问题 → 原因 → 独立解释的解决方法 → 本站原创的小例子或练习 → 可检查的完成标准 → 速查与来源。以下编号就是建议教学顺序，不是必须照搬的文案。
- 一页只承诺一个小胜利。先让读者预测、选择或改写，再展开答案和理由；测验不能只让读者勾选「我懂了」。选择题避免靠答案长度和固定位置猜中。
- 证据区分为「原文可核」「多处证据支持」「本站推论」「尚未验证」。观点随时间变化时同时给日期与条件，不把经验数字写成模型定律。
- 下文引文表是候选配额：原则上每页取一条，精选页最多三条；不要另从原帖扩成长摘录。日期统一使用归档的 UTC 日期。
- 每页列出的「写作依据」已说明要教什么及其边界，后续写作者无需重读原始语料。若扩大引文或直接复用范围，才需要核对相应原文件与许可登记。
- 所有 Markdown 导出和机器可读版本必须保留引文 URL、署名、日期、版权提示、MIT 声明，不能只导出正文。`llms.txt` 只索引本站内容；`llms-full.txt` 只汇总本站已完成的对应语言内容，不拼入原始档案。

## 逐页提纲

### 01 · 顶部致敬区与首页

- Slug：`learn-from-matt`
- 标题：向 Matt Pocock 学习 / Learning from Matt Pocock
- 小胜利：读者能选定自己的第一个学习入口。

1. 从读者困惑开始：教程、工具、模型消息很多，却不知道如何形成自己的开发方法；本站提供按问题组织的学习入口。
2. 简介采用资料支持的经历：从嗓音教学转向开发，公开内容经历 XState、TypeScript 教育、AI 工程与 agent 工作流；不使用未经核对的最新职务、粉丝数或排名。
3. 致敬他的教学实践与公开分享，解释本站学习的是思考方法、反馈机制和解释结构；本站内容由维护者独立整理。
4. 顶部直接放真实作者入口：[X](https://x.com/mattpocockuk)、[GitHub](https://github.com/mattpocock)、[AI Hero](https://aihero.dev/skills)，鼓励关注原作者；同时显示非官方、非商业说明。
5. 分成「先解决 AI coding 卡点」「补 TypeScript 基础」「学习讲解方法」三条入口，链接 `ai-coding-workflow`、`typescript-foundations`、`writing-to-teach`；页尾连接版权说明。

写作依据：调研笔记 §1、§4、§7、§12；GitHub 索引与公开个人简介。不要将 /teach 宣传语当成教学效果已获验证的结论。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| I poured my 10 years of teaching experience into a skill. | https://x.com/mattpocockuk/status/2064023481398824993 | 2026-06-08 |

### 02 · 核心理念

- Slug：`core-principles`
- 标题：从生成代码到设计环境 / From Generating Code to Designing the Environment
- 小胜利：把一次 agent 失败改写成一个可改善的环境问题。

1. 问题：agent 越写越多，返工也越多；先分辨目标错误、信息缺失、验证缺口与设计缺陷，不把每次失败都归到模型能力。
2. 维护是持续成本：少写无用代码、保留清楚接口和必要抽象，优先衡量交付行为与修改成本，不单看代码量。
3. 把 agent 当作需要快速上手的协作者：提供可靠导航、领域语言、可运行环境和验证工具，而非不断叠加提醒。
4. 类型、接口、状态模型与自动检查能减少可犯的错误；这是本站对其多处公开实践的归纳，不宣称某种架构在任何项目都最好。
5. 用本站原创的「缺配置却静默成功」案例说明：复现问题 → 让边界失败可见 → 自动检查 → 评审证据。完成标准是能指出哪一层阻止同类错误。

写作依据：调研笔记 §2.2 的环境、设计、验证条目，§2.3 的深模块，§12；深模块概念归 John Ousterhout，不称为 Matt 发明。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| If your code sucks, your agent will too. | https://x.com/mattpocockuk/status/2089336734530109837 | 2026-08-17 |

### 03 · Punch lines 精选

- Slug：`punch-lines`
- 标题：三句值得带进实践的话 / Three Lines to Put into Practice
- 小胜利：为一句口号补出行动和限制条件。

1. 问题：短句容易记住，也容易被误当成无条件命令；每张卡固定为「原话 → 本站译意 → 解决什么问题 → 适用条件 → 下一步」。
2. 维护成本卡：用下面第一条解释为何写得快不能抵消维护责任；行动是删掉不必要的功能和重复实现，而非机械追求最少行数。
3. 代码负担卡：第二条提醒每段实现都可能要修改，不等于所有代码都该删；先找可验证的简化机会，连接 `core-principles`。
4. 能力成长卡：第三条连接读代码、调试、建模与评审能力；它是个人判断，不是关于人的能力上限的实验定律，连接 `learning-path`。
5. 练习给出一个「为了少写代码而隐藏复杂度」的原创反例，要求读者说明短句在这里为何不足，答案检查是否涉及可读性、行为与维护成本。

写作依据：调研笔记 §7.4 的少写代码争议、§7.5 的能力与代码负担、§8.1 的成对句。只做三张卡，不把多篇长帖拼成语录库。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| Maintaining code is not cheap | https://x.com/mattpocockuk/status/2050167042771194226 | 2026-05-01 |
| All code is debt. | https://x.com/mattpocockuk/status/2050173149170282674 | 2026-05-01 |
| Your skill level acts as a ceiling for the agent | https://x.com/mattpocockuk/status/2065499079283470810 | 2026-06-12 |

### 04 · 工作流总览

- Slug：`ai-coding-workflow`
- 标题：按任务选择 AI coding 工作流 / Choosing an AI Coding Workflow
- 小胜利：给一个具体任务选出足够的流程。

1. 问题：所有改动都套完整流水线，容易只规划不交付；完全不对齐，又容易把错误需求实现得很完整。
2. 先按风险与不确定性分流：很小且明确的改动直接做并验证；中大改动先 `/grill-with-docs`；没有代码库时考虑 `/grill-me`；跨会话且决策复杂时再升级 `/wayfinder`。
3. 把典型主链解释为对齐 → 规格 → 实施工单 → 实现 → 评审 → PR；标明输入与输出，而不是把斜杠命令当作网站按钮或平台保证。
4. `/wayfinder` 管跨会话决策：地图索引、依赖与未决问题；其决策工单和后续 `/to-tickets` 的实现工单用途不同。地图完成后按需要接规格与实施，不在规划中默认执行生产改动。
5. 给出简短演变线：2026-01 Ralph/AFK、春季 grill/原型、7 月新命名、10 月评审和复盘；下面的 7 月原话是时间线证据，10 月建议已强调不要默认从 wayfinder 开始。
6. 练习比较「改按钮文字」「重做付款流程」「迁移不清楚的旧系统」；答案按预期改动与不确定性判断，不机械按项目大小判断。

写作依据：调研笔记 §2.1、§2.2、§7.5；2026-10-08 帖 https://x.com/mattpocockuk/status/2108216899439894574 ；MIT 文档 `skills/docs/engineering/wayfinder.md`。该文档也记录地图膨胀、agent 自行扩大执行权限等局限，应以人工确认目标和范围约束它。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| /wayfinder -> /to-spec -> /to-tickets -> /implement -> /code-review | https://x.com/mattpocockuk/status/2072625252144730215 | 2026-07-02 |

### 05 · 对齐与原型

- Slug：`alignment-and-prototypes`
- 标题：先对齐，再用原型回答问题 / Align First, Then Prototype
- 小胜利：把模糊请求收敛成可确认的行为。

1. 问题：一句「做得更好用」包含多个未定选择；直接实现会把猜测变成成本。
2. 先简短复述目标、使用者与成功条件；能从代码和资料查清的事实自己查，把需要取舍的决定留给用户。
3. 分轮处理当前可决定的问题，每题给推荐项与理由，不一次抛出两百个问题；小改动跳过此步骤。
4. 外观、动效和体验问题用廉价原型比较，记录人选择了什么及为什么；agent 不能替用户选完方案就宣布对齐完成。
5. 用本站原创「搜索结果页」案例，让读者区分事实问题、取舍问题与必须看原型的问题；完成标准是明确验收行为与仍未解决的事项。

写作依据：调研笔记 §7.5、§12 的批量问题和 UI 原型；链接 [公开讨论](https://www.aihero.dev/things-people-get-wrong-with-grill-me-and-grill-with-docs)，独立解释，不翻译其九条全文。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| Restate my intent before continuing | https://x.com/mattpocockuk/status/2105628270930845990 | 2026-10-01 |

### 06 · 规格与工单

- Slug：`specs-and-tickets`
- 标题：把已定决策变成可执行工单 / Turning Decisions into Executable Tickets
- 小胜利：写出一张带验收证据的纵向工单。

1. 问题：对话里已经决定的内容，在新会话中丢失；过长规格又容易过期或遮住真正工作。
2. 规格是已定决策的便携表达，写清目标、行为、范围外事项与验收方式；未知项不能包装成已确认需求。
3. `/to-spec` 汇总决策，`/to-tickets` 切成小而完整的纵向能力；先做能贯穿输入、处理、输出的 tracer bullet，验证端到端路径，避免所有层分别做完后才集成。
4. 区分临时实施材料与长期知识：他的实践倾向将工单放 tracker、规格用后清理，长期决策保留 ADR；团队有审计和协作需要时采用明确归档政策，不能把个人习惯改写成必须删除记录。
5. 原创练习把「实现收藏功能」切成一个可演示的小闭环，写出失败与成功观察；答案检查是否能独立验收以及依赖是否明确。

写作依据：调研笔记 §2.2 的规格生命周期、§7.4 的反方经验；[Tracer Bullets](https://www.aihero.dev/tracer-bullets) 只做独立解释与链接。tracer bullet 并非 Matt 原创术语。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| They're just a projection of the decisions made during grilling. | https://x.com/mattpocockuk/status/2083563195671667176 | 2026-08-01 |

### 07 · 实现与反馈

- Slug：`implementation-and-feedback`
- 标题：让 agent 能验证自己的工作 / Letting Agents Verify Their Work
- 小胜利：为一次改动建立可重复的反馈闭环。

1. 问题：agent 宣布完成，却没运行应用或检查实际行为；先给出这个失败场景，再说明验证基础设施的价值。
2. 接一张边界清楚的工单，先复现或建立预期，再实现并验证；解释 HITL 是人参与关键决策，AFK 是任务边界和反馈已足够明确后独立推进。
3. TypeScript 项目用类型检查、相关测试、格式与 lint；交互行为需要可操作的开发服务器、可读日志或冒烟 CLI。不同项目选择足够的检查组合，不照搬工具清单。
4. 自动检查必须能发现有意义的错误；避免只重复实现逻辑的测试。设计能够禁止某类错误时，优先改善边界，同时保留必要行为测试。
5. 自动化从一件低风险任务开始，观察结果再扩容；Ralph 循环和 Sandcastle 是历史与工具入口，不保证无人值守即可安全发版。
6. 原创练习为一个带缺失配置路径的表单列出「失败证据、修复、通过证据」；只有能重复运行且结果可判定才算完成。

写作依据：调研笔记 §2.1、§2.2、§12；[公开反馈回路文章](https://www.aihero.dev/essential-ai-coding-feedback-loops-for-type-script-projects)；Ralph Article 仅链接 https://x.com/mattpocockuk/status/2009276031622918474 ，不读取或复制 Article 全文。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| Fix the environment your agent runs in | https://x.com/mattpocockuk/status/2105740664973775163 | 2026-10-01 |

### 08 · 评审与 PR

- Slug：`review-and-pr`
- 标题：把完成声明变成评审证据 / From Completion Claims to Review Evidence
- 小胜利：交出一份能让别人判断行为与风险的变更说明。

1. 问题：代码符合规范却做错需求，或需求满足却违反约定；单一总分会掩盖另一条轴的问题。
2. 分别检查「需求是否实现」与「代码是否遵守仓库规范」，明确比较范围和依据；没有规格时记录缺失，不伪造需求。规范问题与带判断性的坏味道建议分开。
3. 将双轴评审结构改编成简短表格，行内列「依据、位置、问题、证据」；保留两轴独立结论，不把一边通过当另一边通过。
4. PR 用「变化概览、前后证据、合并风险」三块表达；风险说明是否容易回滚、影响范围与剩余不确定性。模型说没问题不等于证据。
5. 原创练习比较两份 PR 描述，补齐一条行为证据和一条回滚条件；涉及 MIT 模板改编，按许可表登记。说明该模板致谢 Dex Horthy / HumanLayer 的 show-me，不能归为 Matt 独创。

写作依据：调研笔记 §2.2、§3、§12；MIT `skills/skills/engineering/code-review/SKILL.md`、`skills/skills/engineering/pr/SKILL.md`。只改编结构，不搬评审文件中的整组 Fowler 坏味道说明，也不复制 show-me 上游内容。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| showing hard evidence that the changes work and assessing merge risk | https://x.com/mattpocockuk/status/2107062474914550098 | 2026-10-05 |

### 09 · 上下文与交接

- Slug：`context-and-handoff`
- 标题：给下一次会话留下可用的交接 / Making the Next Session Ready to Work
- 小胜利：写一份无需重读长对话的交接。

1. 问题：长会话能装下更多文字，却可能让目标、决策和证据变难找；新开会话又容易失去关键状态。
2. 先判断后续是否仍需要当前上下文，再选择继续、清理、交接、子任务或压缩；这是本站按需求整理的判断表，不照抄原帖决策树图片。
3. 长任务按可验收边界拆开；150K smart zone 是其 2026-08 的经验估计，不是统一限制，也不直接用于中文或其他模型容量计算。
4. MIT handoff 结构改编为「当前目标、已确认决策、产物路径、验证状态、未解决问题、下一步与建议技能」；已有规格和 ADR 只引用路径，不再次抄写，去掉敏感信息。
5. 原创练习让另一位读者只看交接就找到产物并判断下一步；若必须回读整段聊天才知道事实，则交接尚未完成。

写作依据：调研笔记 §2.2、§3、§12；MIT `skills/skills/productivity/handoff/SKILL.md`。下句表达的是经验法而非精确容量结论。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| Nice heuristic if you're not sure. | https://x.com/mattpocockuk/status/2087111966854730148 | 2026-08-11 |

### 10 · Agent 文档

- Slug：`agent-documents`
- 标题：把 AGENTS.md 写成导航 / Writing AGENTS.md as Navigation
- 小胜利：将一份冗长说明改为短入口和按需阅读的资料。

1. 问题：把所有规则塞进全局文件，每次任务都要带上无关内容，重复信息还会过期。
2. 根文件只留广泛相关且不易从环境发现的信息与关键入口；命令、依赖和目录事实优先从真实配置读取。
3. 写明「在什么任务下读哪个文件」，将低频资料放到相关主题旁；解释 agent 的上下文负担和人维护资料的负担需要一起权衡。
4. 删除空泛、失效与重复指令；no-op 是否真的无效要通过行为观察判断，不凭一句口号删掉有效约束。平台硬性要求继续遵守。
5. 改编 MIT writing-for-agents 检查结构，配本站原创前后示例与「每条入口都能说明触发条件」的完成标准；连接 `standards-and-checks`。

写作依据：调研笔记 §3、§7.5、§12；[AGENTS.md 公开文章](https://www.aihero.dev/a-complete-guide-to-agents-md)、[极简说明文章](https://www.aihero.dev/never-run-claude-init) 只解读；具体改编取 MIT `skills/skills/productivity/writing-for-agents/SKILL.md`。不把「90% 可以删」当成统计研究。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| Use it as an index of pointers to important files, and even then aggressively prune it for no-ops. | https://x.com/mattpocockuk/status/2073473197991715246 | 2026-07-04 |

### 11 · 规范与检查

- Slug：`standards-and-checks`
- 标题：让规则真正生效 / Making Rules Enforceable
- 小胜利：把一条反复违背的提醒改成有效检查。

1. 问题：同一条规范反复提醒仍然被忘记；先判断它是可机械检查的事实，还是需要上下文判断的取舍。
2. 可确定的规则用 lint、hook、类型或 CI 执行；错误输出要告诉 agent 如何修复，而不只是拦截。需要判断的规则留给评审并附理由。
3. CODING_STANDARDS.md 记录真实失败所产生的规则，标题直接说目标行为，注明哪些已由工具执行；与 AGENTS.md 的导航职责分开。
4. 将较多规范交给评审而非全塞给实现者，是他降低指令负担的实践策略；不可据此隐藏任务必要约束、授权范围或平台必须遵守的规则。对具体团队效果需比较返工再判断。
5. 5,000 token / bytes÷4、hook 低于 3 秒作为其个人例子展示；文件不等于模块，字节近似不等于真实 tokenizer，中文另测。不能为了阈值任意拆散模块。
6. 原创练习从「请注意导入方向」生成一条边界检查及可读失败提示，验收以一次正确拦截和一次合法通过为准。

写作依据：调研笔记 §2.2、§3、§7.2、§7.4、§12；文件阈值源 https://x.com/mattpocockuk/status/2111708560715292675 ，仅解读，不复制长提示词。规范示例全部自写，不复制无许可 course-video-manager 的 409 行规则。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| IMO a deterministic rule should be enforced deterministically | https://x.com/mattpocockuk/status/2111735524390027405 | 2026-10-18 |

### 12 · 决策与复盘

- Slug：`decisions-and-retrospectives`
- 标题：保存决策，复盘环境 / Recording Decisions and Improving the Environment
- 小胜利：从一次会话找出一个可验证的改善点。

1. 问题：代码只体现结果，新会话不知道为何如此；旧错误与导航绕路在下一次继续重复。
2. ADR 保留长期决定的背景、选择、理由、后果与状态；临时计划另管，过时决策注明替代关系。这份字段清单由本站编写，不抄仓库模板。
3. `/retro` 看真实会话与评审反馈：哪里找资料慢、哪里依赖过期文件、哪里缺工具或检查；成功会话也可能包含可减少的绕路。
4. 按「观察到的证据 → 最小改进 → 验证方式」提出建议，不让 agent 无人确认地自我加规则。优先改善导航和确定性检查，而非继续堆提示词。
5. 术语表记录领域含义、易混叫法与关联，用共享语言减少反复解释；主动按术语表检查，比仅加一句被动语气要求更可观察。
6. 原创练习分析一段虚构但明确标注为本站例子的开发记录，产出一条 ADR 和一项复盘建议；不能把这段情境写成 Matt 或其团队的经历。

写作依据：调研笔记 §7.2、§7.5、§12；retro 提示词链接 https://x.com/mattpocockuk/status/2105951409887949107 ；语气实验撤回链接 https://x.com/mattpocockuk/status/2085681281795232026 。ADR 不照搬其「直推 main」个人操作。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| Code is the materialized view of all the decisions made | https://x.com/mattpocockuk/status/2107560148243812772 | 2026-10-06 |

### 13 · TypeScript 基础心法

- Slug：`typescript-foundations`
- 标题：用类型表达已知与未知 / Expressing What You Know with Types
- 小胜利：解释一处类型错误，并在外部数据边界安全收窄。

1. 问题：`any` 或盲目断言让报错消失，也让未经验证的数据一路流入业务；先用本站自写的 API 响应例子展示风险。
2. 讲清 `unknown` 表示尚未验证的值，利用检查与收窄获得可靠信息；类型断言不能替代运行时验证。
3. 泛型用于保留输入输出之间的关系；先给普通函数为什么丢信息的问题，再让读者观察泛型如何保持关系，避免从复杂语法炫技入手。
4. 报错先翻成普通语言：预期是什么、拿到了什么、在哪一层不匹配；依靠最小复现理解根因，不把错误翻译工具当正确性的权威。
5. 把 ts-reset 放在「修正某些内建声明」位置，解释其改变 JSON 返回类型的动机；所有行为标明源于采集版本，不能暗示它提供运行时数据校验或适合无条件全局引入。

写作依据：调研笔记 §4.1、§5；MIT `ts-reset/readme.md`，仅独立解释，不复用其代码。例子与答案由本站原创并在未来骨架中用明确 TS 版本验证，不拿课程练习替代。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| If you don't know generics, I promise you'll understand them by the end of this thread. | https://x.com/mattpocockuk/status/1625838626742435842 | 2023-02-15 |

### 14 · 实用类型工具

- Slug：`practical-type-tools`
- 标题：从业务问题认识类型工具 / Learning Type Tools through Real Problems
- 小胜利：解释一种类型工具减少了哪种混淆。

1. 问题：字符串 ID 混用、字面量被放宽、对象键处理不完整；先选一个明确失误，不把所有 TS 技巧塞进一页。
2. 用本站原创 ID 例子介绍 branded types 的概念与边界：它帮助静态区分领域值，不能自动验证来自网络的内容；只链接原帖，不临摹代码图。
3. 用原创配置例子解释 `as const` 如何保留字面量信息；区分类型层面的 readonly 与运行时冻结，避开照搬截图。
4. 用键处理例子解释 `PropertyKey` 涵盖 string、number、symbol；按目标运行环境和实际 API 行为讨论，不把类型能表达等同于运行时都支持。
5. 练习让读者在三类问题中选择恰当工具，检查能否说出工具未解决的部分；答案用独立编写的代码，不照录串帖解法。

写作依据：调研笔记 §4.1、§8.5；branded types https://x.com/mattpocockuk/status/1625173884885401600 ；as const https://x.com/mattpocockuk/status/1623262073244250112 ；只根据已归纳的概念设计例子，具体语法需未来实际编译核对。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| It represents any valid key in JavaScript: string, number or symbol. | https://x.com/mattpocockuk/status/1830935305639145678 | 2024-09-03 |

### 15 · 状态与模块边界

- Slug：`state-and-module-boundaries`
- 标题：用状态与接口减少错误空间 / Reducing Errors with States and Interfaces
- 小胜利：为一段交互列出合法状态与转换。

1. 问题：多个布尔开关允许「同时加载、成功、失败」等矛盾组合，agent 后续修改难以推断合法行为。
2. 先画本站原创的请求状态表，再解释 discriminated union、reducer 或状态机如何显式表达合法状态与转换；简单场景保持简单。
3. 模块接口描述调用者可依赖的行为，内部实现由测试约束；深模块关注接口简单且隐藏有价值复杂度，不能按文件数或行数替代判断。
4. 导入边界可以用工具检查，领域错误与依赖可以用类型建模；Effect 是其公开偏好和另一个学习入口，不能宣称本页教完 Effect 或人人都应迁移。
5. 用一个非法转换的测试和一个正常交互验收练习；连接 `implementation-and-feedback`。xstate-catalogue 仅作已归档的历史案例，不暗示与当前 XState API 兼容。

写作依据：调研笔记 §2.2、§2.3、§5；[公开代码库设计文章](https://www.aihero.dev/how-to-make-codebases-ai-agents-love)，仅独立解释与链接；不复制书籍段落或状态机目录代码。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| I think I'm addicted to getting agents to build state machines | https://x.com/mattpocockuk/status/2110818314499072493 | 2026-10-15 |

### 16 · 写作与教学

- Slug：`writing-to-teach`
- 标题：从读者的问题开始讲解 / Teaching from the Reader's Problem
- 小胜利：把一段抽象说明改成可理解、可验证的小课。

1. 问题：文章一开始堆名词，读者不知道为何要学；第一句应说明具体困惑、目标或承诺，不编造自己没有的亲身经历。
2. 先问题、再原因、再方法、再具体例子；用前后变化帮助理解，一个概念配一个小场景，不复制原帖截图。
3. 短句、清楚动词、留白和适度对照服务阅读；不用把英式口语、粗话或某一种标点习惯当作教学质量本身。
4. 改编 MIT /teach 的小课与练习结构，强调独立提取、间隔与交错；完成标准是能解决新问题，不是刚看完觉得流畅。
5. 同时讲限制：AI 教学可能有事实错误，需可信来源与人工校对；观察到的书签、点赞相关性不能证明某种写法必然有效。
6. 原创练习给一段含空泛形容词的说明，要求改成目标、例子与可判定结果；不做「模仿 Matt 本人口吻」输出。

写作依据：调研笔记 §4、§8、§12；此页不搬 §8 的整套例句。X 的短句风格和 aihero 文章并不完全一致；研究提到的连字符习惯仅作为观察。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| Sometimes, all it takes to teach something is to find the perfect example | https://x.com/mattpocockuk/status/1994475432763113845 | 2025-11-28 |

### 17 · 互动、反馈与署名

- Slug：`feedback-and-attribution`
- 标题：把反馈变成改进，给贡献者署名 / Turning Feedback into Improvement and Giving Credit
- 小胜利：写一条能继续推进讨论的回应。

1. 问题：面对批评只反驳，或转述别人的作品却丢掉来源，都会让学习讨论变差。
2. 研究中的回复多为短而直接的表态；可学习的是先回应具体问题，再追问复现情境，而不是照学每一句强硬措辞。
3. 负面反馈需要进一步问清哪里出了问题，将可复现失败转为改进候选；不把一次点赞或单样本案例当可靠效果证明。
4. 推荐别人的技能时保留作者与链接；在自己的改编中清楚区分原作者贡献和本站改动，MIT 署名不能只写一个感谢名单。
5. 呈现其公开改口的例子：ASD-STE100 被动指令发布后又表示未奏效；读者应学会更新观点，不将其旧实验奉为固定规则。
6. 原创练习分别回应「你的规则没用」与「这里有失败步骤」，答案检查是否请求具体证据、承认范围限制并保留作者归属。社区统计只说明归档样本，不代表全体读者。

写作依据：调研笔记 §7、§8.6；回复主要完整覆盖 2026-04-20 至 10-20，之前数据不全。第三方评论只归纳争点，不使用第三方原文。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| Negative feedback is a gift! Would love to know how to make the skills better. | https://x.com/mattpocockuk/status/2096979934975565862 | 2026-09-07 |

### 18 · 开源仓库导览

- Slug：`open-source-guide`
- 标题：按问题寻找开源入口 / Finding Open Source by the Problem You Have
- 小胜利：为自己的问题选一个仓库，并说清可复用边界。

1. 问题：按星数找工具，容易忽略适用场景、维护状态与许可证；本页按「你现在要解决什么」组织。
2. 流程与说明入口选 skills；TypeScript 内建声明坑看 ts-reset；隔离 agent 执行看 sandcastle；LLM 应用评测看 evalite；状态机历史示例看已归档 xstate-catalogue。全部只描述采集版本，不保证最新状态。
3. 每张仓库卡固定为「问题、作用、先读什么、局限、许可、相关本站页」，链接下表的真实仓库 URL，不复制 README 当介绍。
4. dictionary-of-ai-coding、course-video-manager、zod-fetch 等根仓库无许可证，只能解读与链接；特别提醒 translator 子目录 MIT 不覆盖全仓库。
5. ai-hero-cli 虽有 MIT 文件，但与课程相关且版权行含占位符，本版不取代码和课程内容；工作坊和付费练习完全排除。
6. 原创练习给「想学规范导航」与「想搭评测」两个需求，检查读者是否区分 skills 与 evalite，以及能否找到许可；不展示未验证的性能、安装兼容性或最新排名。

写作依据：`github/repos_index.md`、`github/summaries.md`、各 LICENSE、`github/repos.json`；下方许可表就是写作时的已核实卡片资料。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| I built my own software factory, and I open-sourced it. | https://x.com/mattpocockuk/status/2049506712801935611 | 2026-04-29 |

### 19 · 速查表

- Slug：`cheat-sheets`
- 标题：把方法带回工作现场 / Taking the Methods Back to Work
- 小胜利：不重读长课也能决定下一步。

1. 问题：学完能理解，实际工作时仍找不到入口；速查表只压缩本站已解释的概念，不新增没有出处的口号。
2. 工作流选择表列「触发问题、可用步骤、输入、产出、可跳过条件」：明确小改动、中等不确定性、跨会话规划三种情况。
3. 规则落点表列「AGENTS.md 导航、CODING_STANDARDS 判断、lint/hook/CI 机械执行、ADR 长期理由、GLOSSARY 领域语言」；链接对应页面。
4. 验证与交接表列「行为证据、失败路径、未验证项、产物链接、下一步」，源自本站整理；MIT 改编字段的压缩版仍保留许可归属。
5. TypeScript 表列「未知输入、类型关系、键类型、合法状态」与适用方法，不复制原 TSConfig 图片或词典词条；每行必须能返回完整解释。
6. 练习给一个失败场景，要求只用表格找到相应页面和一个可执行动作；验收关注选择理由，不给背命令名称打分。

写作依据：调研笔记 §4.1、§12；各本站课为直接内容来源。下面原话只说明速查形式，并不授权重制原作者的 TSConfig 速查表。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| Here's a cheat sheet that will get you 90% of the way there. | https://x.com/mattpocockuk/status/1701619240686485799 | 2023-09-12 |

### 20 · 学习路径

- Slug：`learning-path`
- 标题：从第一个小胜利到独立工作流 / From Your First Small Win to an Independent Workflow
- 小胜利：选定适合自己水平的一段路线并完成一次外部验证。

1. 问题：看过很多内容，却不能独立解决问题；先用三道原创诊断题检查类型边界、验收方式与任务拆分，不默认所有读者从零开始。
2. 入门路线：`typescript-foundations` → `practical-type-tools` → `implementation-and-feedback`；任务是处理一份未知 JSON 并展示有效与无效输入结果。
3. 实践路线：`core-principles` → `ai-coding-workflow` → `alignment-and-prototypes` → `specs-and-tickets` → `review-and-pr`；任务是交一张小工单、行为证据和可评审说明。
4. 进阶路线：`context-and-handoff` → `agent-documents` → `standards-and-checks` → `state-and-module-boundaries` → `decisions-and-retrospectives`；任务是让另一会话接手，并落地一个真实有效的检查。
5. 讲解路线：`writing-to-teach` → `feedback-and-attribution`；任务是把刚做完的一次小改动写成问题、方法、验证与来源齐全的小课。
6. 按输出与标准答案判断进展，隔一段时间用变式题重试；上述先后顺序是本站设计，不宣称为 Matt 的官方课程路径，也不承诺固定学习小时数。

写作依据：调研笔记 §4、§7.5、§12；改编 MIT /teach 的学习使命、小胜利与复习结构；不复刻其付费课程大纲。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| Want to learn TypeScript for free? | https://x.com/mattpocockuk/status/1566739592249835520 | 2022-09-05 |

### 21 · 关于本站与版权

- Slug：`about-and-copyright`
- 标题：关于本站与版权 / About This Site and Copyright
- 小胜利：读者能分辨原话、本站解读和获许可的改编。

1. 问题：学习汇编容易被误认为作者本人、官方翻译或获背书产品；开头明确本站非官方、非商业、独立整理。
2. 说明来源范围与时间：公开帖子、公开文章索引、已核实许可的开源仓库；资料快照截止 2026-10-20，不使用付费课程内容。
3. 用一个原创示例说明「带链接的短引文」「本站译意」「本站推论」「MIT 改编」四种标记；不把 AI 生成句子归到 Matt 名下。
4. 展示下面的 MIT 复用登记、版权行及许可全文；正文与所有下载版本都保留归属。本站代码用 MIT，自写内容用 CC BY 4.0（见根目录 LICENSE），引文与 MIT 复用内容保留原作者版权。
5. 说明已知缺口和更正政策：事实、翻译、链接或版权有误时应更正并记录；不编造尚未提供的联系邮箱或授权文件。
6. 固定页脚声明，并链接作者 X、GitHub 与 AI Hero；无需复述完整人物生平。公开发布前仍需维护者审核，此提纲不是发布授权。

写作依据：规格版权硬性要求、LICENSES.md、调研笔记 §10、§11；下面的署名请求用于解释尊重归属，不代表他向本站授予许可或为本站背书。

| 短引文（Matt Pocock） | 来源 URL | 日期（UTC） |
|---|---|---|
| Could I get some attribution on /grill-me and /teach? | https://x.com/mattpocockuk/status/2074147715210997924 | 2026-07-06 |

## 需要保留许可声明的内容

本版明确决定：以下八个模板仓库仅作链接导览，不复用代码、文字或模板：`day-tracker-typescript`、`gatsby-pomodoro`、`gatsby-starter-netlify-cms`、`gatsby-test`、`louiseburfitt-new`、`race-manager`、`one-coding-test`、`react-boilerplate-custom`。其版权人为 gatsbyjs 或 Maximilian Stoiber，不能归到 Matt 名下。

`ai-hero-cli` 的版权行含 `<PLACEHOLDER>`，也仅链接，不复用内容；不自行替作者补全版权人。以上决定同步记录于 `THIRD_PARTY_NOTICES.md`。


### 本版计划的直接改编登记

正文原则上自行表达；下表专门登记计划借用的模板或检查结构。每行「站内出现位置」同时覆盖中文、英文、Markdown 下载与该语言 `llms-full.txt`。所有行均核对了本地 `github/repos/skills/LICENSE`，不是根据摘要猜测。文件路径以仓库根为基准。

| 仓库及来源 URL | 文件路径 | 原样版权行 | 计划复用方式与站内出现位置 |
|---|---|---|---|
| skills · https://github.com/mattpocock/skills | `skills/productivity/writing-for-agents/SKILL.md` | `Copyright (c) 2026 Matt Pocock` | 改编为文档自查结构，不整篇翻译；`agent-documents`，其压缩索引见 `cheat-sheets` |
| skills · https://github.com/mattpocock/skills | `skills/productivity/handoff/SKILL.md` | `Copyright (c) 2026 Matt Pocock` | 改编交接字段、引用既有产物及脱敏检查；`context-and-handoff`、`cheat-sheets` |
| skills · https://github.com/mattpocock/skills | `skills/engineering/code-review/SKILL.md` | `Copyright (c) 2026 Matt Pocock` | 改编需求 / 规范双轴报告结构，不复制 Fowler 列表；`review-and-pr`、`cheat-sheets` |
| skills · https://github.com/mattpocock/skills | `skills/engineering/pr/SKILL.md` | `Copyright (c) 2026 Matt Pocock` | 改编概览 / 证据 / 风险模板；保留其 Dex Horthy / HumanLayer 致谢来源；`review-and-pr`、`cheat-sheets` |
| skills · https://github.com/mattpocock/skills | `skills/productivity/teach/SKILL.md` | `Copyright (c) 2026 Matt Pocock` | 改编小课、练习与复习结构；`writing-to-teach`、`learning-path`、`cheat-sheets`；若其他页面直接套用模板，也按此来源标注 |

每个复用块旁写「根据 Matt Pocock 的 skills 仓库改编，MIT」，附来源仓库与上述文件路径，并链接 `about-and-copyright` 内完整声明。每份单页 Markdown 下载直接带上完整声明；合集按来源保留一份完整声明，并能定位受其覆盖的页面。本站添加的例子和讲解不得因此被错误标为原作者原文。

PR 文件的上游致谢在本地原文件中给出 https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md 。这里只保留来源致谢，不从该上游取内容，也不推定它的许可。

### 供写作者原样保留的 skills MIT 声明

复用 skills 仓库内容时，原样附上上游 LICENSE（https://github.com/mattpocock/skills/blob/main/LICENSE，版权行 `Copyright (c) 2026 Matt Pocock`）全文，放在 `third_party/skills/LICENSE`，不自行改写年份、姓名或免责条款。版权行汇总见根目录 `THIRD_PARTY_NOTICES.md`。

### 仓库卡片：已核对许可与使用范围

以下仓库作为页面入口；除上表列明的 skills 改编外，本版不计划直接复制仓库文本或代码。原创示例不按 ts-reset、sandcastle 或其他仓库代码临摹。以后扩大复用时，先新增准确文件与许可登记，不能只凭「MIT」标签复制。

| 仓库 URL | 核对依据与结果 | 版权行或限制 | 本站位置 |
|---|---|---|---|
| https://github.com/mattpocock/skills | 根 `LICENSE`：MIT | `Copyright (c) 2026 Matt Pocock` | 工作流、agent 文档、教学、仓库导览；复用仅限登记项 |
| https://github.com/mattpocock/ts-reset | 根 `LICENSE`：MIT | `Copyright 2023 Matthew Pocock`，没有 `(c)`，名字是 Matthew | TS 基础、仓库导览；仅解读 |
| https://github.com/mattpocock/sandcastle | 根 `LICENSE`：MIT | `Copyright (c) 2026 Matt Pocock` | 实现与反馈、仓库导览；仅解读 |
| https://github.com/mattpocock/evalite | 根 `LICENSE`：MIT | `Copyright (c) 2025 Matt Pocock` | 仓库导览；仅解读 |
| https://github.com/mattpocock/xstate-catalogue | 根 `LICENSE`：MIT | `Copyright (c) 2021 Matt Pocock`；已归档 | 状态与边界、仓库导览；仅历史导读 |
| https://github.com/mattpocock/ai-hero-cli | 根 `LICENSE`：MIT | 原样为 `Copyright (c) 2024-present <PLACEHOLDER>`，不替作者补姓名；课程工具不等于课程许可 | 仅在仓库导览提醒边界；不取代码、文本模板或练习 |
| https://github.com/mattpocock/dictionary-of-ai-coding | `repos.json` 的 `license: null`，根无 LICENSE | 无许可；只做独立解读、短引与链接，本版不摘词条 | 仓库导览、版权风险 |
| https://github.com/mattpocock/course-video-manager | `repos.json` 的 `license: null`，根无 LICENSE | 无许可；只讨论导航、规则、术语表职责，不复制文件 | agent 文档、规范与检查、仓库导览 |
| https://github.com/mattpocock/ts-error-translator | `repos.json` 根许可为 null；`apps/vscode/LICENSE` 实为 MIT | 子目录版权行为 `Copyright (c) 2022 Matt Pocock`；不能据此推定全仓库 MIT，本版全部仅解读、链接 | TS 基础、仓库导览 |
| https://github.com/mattpocock/zod-fetch | `repos.json` 的 `license: null`，根无 LICENSE | 无许可；只描述 schema 与 fetch 边界的思路，不抄实现 | 仓库导览 |
| https://github.com/mattpocock/total-typescript-monorepo | `repos.json` 的 `license: null`，根无 LICENSE | 无许可；只链接概况，不读写课程材料 | 仓库导览的许可提醒 |
| https://github.com/mattpocock/ai-engineer-workshop-2026-project | `repos.json` 的 `license: null`，根无 LICENSE | 无许可且为工作坊项目；本版排除内容，不作为练习来源 | 仅版权风险说明 |

### 非 MIT 仓库完整禁复用清单

下面按 GitHub API 返回的仓库许可字段（2026-10-20 快照）列出，以免后续写作者从别的仓库取材时误认为都属 MIT。null 是未检测到仓库级许可，不是公有领域。统计基准是 2026-10-20 快照：224 个仓库，其中原创 169、fork 55；原创为 MIT 22、无许可 104、NOASSERTION 43。这里只核对许可元数据；课程仓库的文件与练习未打开。

- 原创无许可：仅可链接、独立解读、短引并署名；其中课程、cohort、workshop 相关条目仍按更严格规则排除内容。`ts-error-translator` 子目录的例外已在上表限定。
- 原创 NOASSERTION：全部不取材；包含课程系列，也包含并非明显课程的历史项目，不将它们混称为已获许可。
- fork：不视作 Matt 原创。非 MIT 的 fork 在本版不取内容，只允许来源层面的链接与解读；NOASSERTION 或课程 fork 排除内容。即便 MIT fork 也未列入本版复用计划，不能借其名义绕过上游署名。

| 分类 | 数量 | 仓库名称（与 repos.json 完全对应） |
|---|---|---|
| 原创，无许可 | 104 | `dictionary-of-ai-coding`、`ts-error-translator`、`course-video-manager`、`zod-fetch`、`mattpocock`、`total-typescript-monorepo`、`ai-engineer-workshop-2026-project`、`pkg-demo`、`sextant`、`xstate-next-boilerplate`、`ai-sdk-tips`、`graph-docs-cli`、`redux-xstate-poc`、`package-tools`、`typescript-node`、`slopwatch`、`esbuild-node`、`ai-interviewer`、`boilersuit`、`harness-claude-code-usage-repro`、`tsconfig-creator`、`turborepo-stately-demo`、`total-typescript-monorepo-template`、`poland-ai-talk`、`xstate-test-playwright`、`debates-stream`、`matt-cli`、`ralph-workshop-repo-001`、`ralph-workshop-repo-002`、`mcp-server-from-prompts`、`total-typescript-cli`、`rubix-cube`、`workshops`、`xstate-real-world-app`、`markdown-streaming-demo`、`figma-xstate-plugin`、`xstate-stream-demo-app`、`my-monorepo`、`practice-cli`、`mise-en-place`、`react-finland-talk`、`create-t3-turbo-test`、`full-stack-ui`、`total-typescript-helpers`、`matt-product-boilerplate`、`new-mattpocock`、`react-day-berlin-react-types`、`xstate-sandpack-tutorials`、`as-prop-perf-demo`、`graphql-rest-contracts`、`react-typescript-tutorial-01`、`react-typescript-tutorial-05`、`ai-sdk-cache`、`gql-tada-testing`、`project-references-demo`、`video-ideas`、`vscode-day-talk`、`cypress-xstate-demo`、`obs-stinger`、`tt-upgrader`、`voicehacker`、`wordpress-react-simplified`、`cypress-job-search`、`kelvin-chat`、`react-typescript-boilerplate`、`react-typescript-tutorial-02`、`react-typescript-tutorial-03`、`react-typescript-tutorial-04`、`react-typescript-tutorial-06`、`react-typescript-tutorial-07`、`react-typescript-tutorial-08`、`react-typescript-tutorial-09`、`turbo-ignore-demo`、`vscode-xstate`、`xstate-form-test`、`xstate-inspect-storybook-example`、`actions-pr-merge-check`、`andrebatista.dev`、`aws-serverless-mongo-api`、`boilersuit-raw`、`bubble-sort`、`canarycare`、`cdk-recipes`、`chess-opening-learner`、`crackapack`、`default_setup`、`frauleinlouise-static`、`gatsby-starter-storybook-mdx`、`jazz-chord-finder`、`lambda-local-watch`、`multi-step-form`、`netlify-test`、`node-react-mysql-spa`、`react-typescript-tutorial-fake`、`react-typescript-tutorial-helpers`、`redux_default_app`、`solve-the-format`、`storybook-components`、`ui_experiments`、`voicehacker-accents`、`xstate-inspect-cli`、`xstate-inspect-repro`、`xstate-tutorial`、`cohort-005-project-fork-2` |
| 原创，NOASSERTION | 43 | `neverthrow-tutorial`、`pro-essentials-cut-down-to-chapters`、`pro-essentials-cut-down`、`total-typescript-book-095`、`pro-essentials-workshop-020`、`pro-essentials-workshop-085`、`total-typescript-book-005`、`total-typescript-book-010`、`total-typescript-book-045`、`total-typescript-book-060`、`total-typescript-book-085`、`pro-essentials-workshop-010`、`pro-essentials-workshop-015`、`pro-essentials-workshop-016.5`、`pro-essentials-workshop-018`、`pro-essentials-workshop-028`、`pro-essentials-workshop-030`、`pro-essentials-workshop-032`、`pro-essentials-workshop-040`、`pro-essentials-workshop-045`、`pro-essentials-workshop-050`、`pro-essentials-workshop-060`、`pro-essentials-workshop-065`、`pro-essentials-workshop-080`、`pro-essentials-workshop-083`、`total-typescript-book-015`、`total-typescript-book-016.5`、`total-typescript-book-018`、`total-typescript-book-020`、`total-typescript-book-028`、`total-typescript-book-030`、`total-typescript-book-032`、`total-typescript-book-040`、`total-typescript-book-050`、`total-typescript-book-065`、`total-typescript-book-080`、`total-typescript-book-082`、`total-typescript-book-083`、`total-typescript-book-090`、`accentlab`、`foxginger`、`freelancer`、`pro-essentials-workshop-005` |
| fork，无许可 | 15 | `claude-code`、`bunchee`、`website`、`cohort-002-project`、`fetch-super-headers`、`awesome_xstate`、`testing-workshop`、`XState-React`、`github-issue-templates`、`graphql-api`、`kendo-react-getting-started`、`kit-extension`、`react-boilerplate`、`tailwindcss-intellisense`、`xstate-test-demo` |
| fork，NOASSERTION | 5 | `ai`、`remotion`、`cal.com`、`DefinitelyTyped`、`products` |
| fork，Apache-2.0 | 3 | `node-DeepResearch`、`agent-browser`、`workers-sdk` |
| fork，CC-BY-4.0 | 2 | `TypeScript-Website`、`TypeScript-wiki` |
| fork，MPL-2.0 | 1 | `turborepo` |

## 版权风险点

1. **AI Coding Dictionary**：`dictionary-of-ai-coding/dictionary/*.md`、生成的 README 与 aihero.dev 的 72 页词典都很容易被拿来做本站术语表；根仓库无许可证，网页也无开放许可。只参考概念，用本站自己的情境解释；不得批量翻译或重排词条充当原创。
2. **三篇 X Article**：Getting Started With Ralph、Why You Think AI Coding Sucks、AFK Coding 的全文位于 `articles/`。本版只使用索引中的公开链接，分别为 https://x.com/mattpocockuk/status/2009276031622918474 、https://x.com/mattpocockuk/status/2009611147389829555 、https://x.com/mattpocockuk/status/2014058917777572084 。不读其全文取材、不贴全文、不逐节翻译、不复制整段提示词或脚本。
3. **网页 skill 与 MIT 文件混淆**：aihero.dev 的 skill 页面不能因为「仓库也有」就默认自由转载；若借用模板，必须从已核对的 `skills` 仓库文件取材、登记路径并保留 MIT 全文。其他公开文章和 Sandcastle 网页文档仍按网页保留版权处理。
4. **无许可仓库的 agent 文档**：course-video-manager 的 CLAUDE.md、409 行 CODING_STANDARDS.md 与 548 行 GLOSSARY.md 是很诱人的现成教材；只能解释文件分工，不翻译成本站规则集。`total-typescript-monorepo` 的内部工具也不能搬。
5. **课程与工具边界**：Total TypeScript、AI Hero 付费课程、cohort、工作坊、NOASSERTION 练习仓库全部排除；无许可的公开 workshop/cohort 项目同样不取内容。ai-hero-cli 的 MIT 文件不能用来授权课程题目、答案或视频。
6. **X 长提示词与图片**：/retro、pre-commit、18 条错误清单、TSConfig 速查表、泛型及 branded types 代码图、上下文决策树不能整块复制；本提纲只保留短句，表格和示例另写，不做描摹截图。引用转发时，只引 Matt 自己写的文字，不能把被引作者内容算作他的作品。
7. **第三方与书籍**：show-me 属于 Dex Horthy / HumanLayer；深模块来自 Ousterhout、seam 来自 Feathers，tracer bullet 有更早来源。保留归属，不复制书籍原段或未经核实许可的上游模板。conversations/ 中的评论也不是 Matt 的版权。
8. **把许可摘要当精确声明**：`LICENSES.md` 的通用「Matt Pocock」不能代替各仓库 LICENSE。特别保留 ts-reset 的 Matthew、ai-hero-cli 的占位符和 translator 的子目录范围，不能自行修正后再传播。
9. **导出泄漏与双语复制**：网页合规而 Markdown、llms 合集包含原始归档或丢掉署名，仍不合规。英文写作者不能直接拼回原文，中文写作者不能把长篇翻译当作独立解读。
10. **冒充与背书**：第一人称故事、用他的头像制造官方观感、未经授权的「Matt 推荐本站」都不使用。本站框架、练习与应用判断明确属于维护者。

## 不知道的

- 本提纲只核对本地快照，没有联网检查今天链接是否仍可访问、是否重定向、文章是否更新、许可证是否改变。URL 的本地存在性不等于在线可用性；发布前可另做链接检查。
- 2016-03-10 之前的帖子不在采集索引；2026-04-20 之前回复只有零散样本，转推未覆盖。调研笔记 §7 的互动结论不能代表其全部生涯或所有读者。
- 原帖图片、代码截图、视频、YouTube 与直播内容未独立核实。不能从正文提及图片推断图中具体实现；不能把未观看演讲的二手笔记写成演讲事实。
- 150K 上下文、5,000 token、150～200 条指令预算等数字对其他模型、平台和中文的适用性没有验证；字节估算不是准确 token 计数。模型名称、最新价格、安装步骤、Effect 或 XState 当前 API 兼容性也未核实，本版不承诺。
- TypeScript 示例尚未写成可运行练习，未来写作者需自写并按网站选定版本编译验证；原始帖子大多只保留文字，不能补写不存在于数据中的作者解法。
- 部分公开网页无发布日期；仓库文件未逐个追溯首次提交时间。引文表因此全部采用带确切 UTC 日期的 X 记录，不把采集日期冒充发表日期。
- ai-hero-cli 的版权占位符没有澄清；ts-error-translator 子目录与其他包的许可边界没有进一步授权证明，所以不使用其代码。其余仅有 repos.json 元数据的仓库也没有逐文件审计，不能据元数据授权未登记复用。
- 本站原创内容的整体许可、版权纠错联系渠道、作者是否愿意被如此致敬尚未提供；不能声称已获授权、合作或背书。公开发布仍需维护者审核。
- 双语正文、测验答案和事实校对尚待后续写作完成；本提纲是写作依据，不表示练习已开发、内容效果已验证或站点已上线。

## 后续写作验收

- 每个语言版本保持 21 个相同 slug、对应标题与相同学习目标，完整覆盖本页编号要点；站内引用跳转到对应语言页面。
- 每课先呈现问题，再给方法；原创例子有可检查答案，推论与实验注明边界。
- 只使用本提纲已核实的引文，原话、URL、日期不丢失；同一来源不额外拼成长摘录。无引文也可用本站解释，不为装饰捏造语录。
- MIT 改编范围与登记表一致，页面、下载与合集均保留准确署名与许可；新增复用先补登记，非 MIT 与课程材料不进入正文。
- 作者入口、非官方声明、资料截止日、已知缺口和更正入口在两种语言都可见；联系渠道未定时只说明尚未提供，不编造地址。

核验完成：已用 rg 固定字符串检索核对 23 条引文的 23 个来源 URL，全部逐字存在于本地原始归档或调研笔记；并核对原帖原文与 UTC 日期，最长 18 个英文词，无引文超过 25 词。

## 语料库（原文索引）

首页醒目入口「语料库：Matt 公开精华的持续索引」，说明本站会持续抓取并索引他公开的精华内容。

- 每条推文、X Article、aihero.dev 文章、GitHub 仓库各一条记录：链接、日期、类型、主题标签、互动数，加一句**我们自己写的**中英文摘要。数据文件 `data/corpus-index.json`（schema 见 `data/corpus-index.schema.json`），构建/启动时导入 SQLite 供搜索。
- 收录范围：原创与引用帖按互动数取精华（回复默认不收）；3 篇 X Article；aihero.dev 公开文章（排除付费课程、cohort、工作坊、产品页）；仓库只记元数据和许可。
- 摘要：Codex 批量生成，中文不超过 40 字、英文不超过 25 词，不含引号原话；写入前自动校验，与该条原文有连续 8 个及以上相同的词即拒收重写。
- 语料页功能：关键词搜索；按类型、标签、日期范围筛选；按互动数或日期排序；每条直达原文链接。
- 严禁入库：推文原文、评论原文、Article 全文、aihero 页面正文、非 MIT 仓库文件。原始抓取放在被 git 忽略的 `.corpus-raw/`；抓取脚本在 `scripts/corpus/`，凭据只从环境变量读。
- 重叠检测：`node scripts/check-overlap.mjs`（需要本地原始语料）扫描所有已跟踪文件，连续 8 词以上命中原文即失败；只放行同一行带链接、不超过 30 词的短引用。
