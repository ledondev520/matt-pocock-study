---
slug: cheat-sheets
number: 19
title: 速查表
subtitle: 把方法带回工作现场
section: cheatsheet
order: 19
summary: 按触发问题查下一步，每行都能回到完整解释。
head: card
updated: 2026-10-21
---

## 卡住时，从问题找入口

读完能理解，工作时却想不起先做什么。这页只压缩本站已解释的方法；先选最接近的触发问题，再回完整页面查条件。不要把命令名当作交付结果。

```quote
text: Here's a cheat sheet that will get you 90% of the way there.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/1701619240686485799
date: 2023-09-12
note: 本站译意：这份速查表能帮你走完大部分路程。
```

该原话说明速查的形式，不代表本站重制了原作者的 TSConfig 图，也不把其中比例当作本站效果承诺。

## 工作流选择

<!-- compare -->
| 触发问题 | 可用步骤 | 输入 → 产出 | 可跳过条件 |
| --- | --- | --- | --- |
| 明确小改动 | [直接实现与验证](/zh/implementation-and-feedback) | 已定行为 → 运行证据 | 跳过额外规划 |
| 中等不确定性 | [对齐与原型](/zh/alignment-and-prototypes) | 模糊请求 → 验收行为 | 行为已确认可跳过 |
| 跨会话决策 | [工作流分流](/zh/ai-coding-workflow) | 依赖与未知 → 决策地图 | 无跨会话需求可跳过 |

规划只需足够支撑下一次验证。对齐后的行为再进入[规格与工单](/zh/specs-and-tickets)，不要因表里有某一步就全部照做。

## 规则放在哪里

<!-- compare -->
| 作用 | 落点 | 完整解释 |
| --- | --- | --- |
| 导航 | AGENTS.md | [agent 文档](/zh/agent-documents) |
| 需要判断的规范 | CODING_STANDARDS | [规范与检查](/zh/standards-and-checks) |
| 可机械执行 | lint / hook / CI | [规范与检查](/zh/standards-and-checks) |
| 长期理由 | ADR | [决策与复盘](/zh/decisions-and-retrospectives) |
| 领域语言 | GLOSSARY | [agent 文档](/zh/agent-documents) |

```figure
id: d19-rule-placement
```

同一条要求可能需要两种落点：规范解释判断标准，检查拦住其中可机械识别的部分。两者应指向同一个行为，避免文档说一种、检查执行另一种。

导航告诉协作者去哪找，检查负责阻止可判定的错误。把所有要求塞进根文件，既不会自动执行，也容易让信息过期。

## 验证与交接

<!-- compare -->
| 字段 | 留下什么 | 回到原课 |
| --- | --- | --- |
| 行为证据 | 操作、预期、实际 | [实现与反馈](/zh/implementation-and-feedback) |
| 失败路径 | 如何失败、如何恢复 | [评审与 PR](/zh/review-and-pr) |
| 未验证项 | 缺什么证据与风险 | [评审与 PR](/zh/review-and-pr) |
| 产物链接 | 既有文件位置，避免重抄 | [上下文与交接](/zh/context-and-handoff) |
| 下一步 | 接手任务与验证方式 | [上下文与交接](/zh/context-and-handoff) |

交接里的「未验证」不是空白栏。写出尚未运行的行为、缺少的环境与可能影响，让接手者知道哪些结论仍不能采用。已有证据给位置，不把旧结果当成新一轮验证。

## TypeScript 入口

<!-- compare -->
| 遇到什么 | 先做什么 | 完整解释 |
| --- | --- | --- |
| 未知输入 | 接收 unknown，运行时验证 | [TS 基础](/zh/typescript-foundations) |
| 类型关系 | 表达输入与输出关联 | [TypeScript 基础](/zh/typescript-foundations) |
| 键类型 | 确认键可能是 string、number 还是 symbol | [实用类型工具](/zh/practical-type-tools) |
| 矛盾状态 | 列合法状态与转换 | [状态与边界](/zh/state-and-module-boundaries) |

```note
kind: inference
本站建议：一次只选一个触发问题，写下要补的证据。若速查行无法解释你的边界，返回原课核对，不要硬套。
```

使用类型表时，先区分静态关系和运行时事实。未知数据需要验证，合法键需要类型约束；状态关系则回到允许的转换。先判断缺口，再选择表达方式。

## 练习与完成标准

```exercise
title: 新会话说完成，却没运行
- 任务：只用表格找到一个完整页面和一个立即可做的动作。
- 补充：写出交接里必须标明的未知项。
answer: 打开实现与反馈，运行目标行为并记录预期与实际；交接写明尚未运行的检查及风险。只背出命令名称不算完成。
```

完成标准：选择理由与失败场景对应，动作能产出可检查证据。过一段时间换个场景再查，练习选择而非记住表格位置。

## 速查

```cards
- **流程** 按不确定性选择足够的步骤。
- **规则** 导航、判断、执行各有落点。
- **交付** 留行为证据、未知项与下一步。
```

## 来源

- [Matt 的速查表短引文，2023-09-12](https://x.com/mattpocockuk/status/1701619240686485799)
- 各行链接为本站完整解释。

## skills MIT 许可声明

本页改编的结构来自 [mattpocock/skills](https://github.com/mattpocock/skills)，MIT 许可，Copyright (c) 2026 Matt Pocock。完整许可附后，与[原仓库 LICENSE](https://github.com/mattpocock/skills/blob/2817544484ea89558aabd8a0360e042888fad713/LICENSE)一字不差。

```licence
id: mattpocock-skills
```

非官方、非商业的学习整理，与 Matt Pocock 无隶属或背书关系。所引作品版权归原作者；MIT 复用内容另附版权与许可声明。
