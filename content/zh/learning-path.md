---
slug: learning-path
number: 20
title: 学习路径
subtitle: 从第一个小胜利到独立工作流
section: path
order: 20
summary: 用三道诊断题选路线，以可检查的产物判断进展。
head: d20-routes
updated: 2026-10-21
---

## 从诊断开始，不从页数开始

读过很多内容，遇到新任务仍不知如何下手。先做三道题，找出当前缺口；答得出来的部分不必重学。判断依据是输出与理由，不是阅读时长。

```exercise
title: 三题选择起点
- 类型边界：收到未知 JSON，能直接断言为用户数据吗？说明如何处理无效输入。
- 验收方式：agent 说保存成功，需要看到什么证据？
- 任务拆分：收藏功能应先做所有数据库表，还是先贯穿一条收藏与读取路径？
answer: 一：先运行时验证，拒绝无效结构。二：观察保存结果，并刷新确认持久化，同时验证失败提示。三：先做可独立验收的端到端小路径，标清依赖。
```

第一题卡住，从入门走；后两题卡住，从实践走。已有交付证据但接手常断线，可选进阶；想教别人，选讲解路线。

```quote
text: Want to learn TypeScript for free?
author: Matt Pocock
url: https://x.com/mattpocockuk/status/1566739592249835520
date: 2022-09-05
note: 本站译意：想免费学习 TypeScript 吗？
```

## 入门：守住输入边界

[TS 基础](/zh/typescript-foundations) → [实用类型工具](/zh/practical-type-tools) → [实现与反馈](/zh/implementation-and-feedback)。

产物：处理一份未知 JSON，分别展示有效与无效输入。完成标准：有效数据进入功能，无效结构得到明确失败，不能只靠类型断言掩盖错误。

```figure
id: d20-routes
```

## 实践：交一个可评审的小改动

[核心理念](/zh/core-principles) → [工作流](/zh/ai-coding-workflow) → [对齐](/zh/alignment-and-prototypes) → [规格与工单](/zh/specs-and-tickets) → [评审与 PR](/zh/review-and-pr)。

产物：一张小工单、行为证据和评审说明。完成标准：另一位读者能说明改动解决什么，按步骤复验结果，并指出未验证项；不靠复述对话补全需求。

## 进阶：让下一位接得住

[上下文与交接](/zh/context-and-handoff) → [agent 文档](/zh/agent-documents) → [规范与检查](/zh/standards-and-checks) → [状态与边界](/zh/state-and-module-boundaries) → [决策与复盘](/zh/decisions-and-retrospectives)。

产物：让另一会话根据交接继续工作，并落地一个真实检查。完成标准：接手者能定位产物；故意放入目标错误时检查失败，修复后通过。

## 讲解：把刚做完的事教清楚

[写作与教学](/zh/writing-to-teach) → [反馈与署名](/zh/feedback-and-attribution)。产物：把一次小改动写成含问题、方法、验证与来源的小课。

完成标准：请另一位读者做一道新例题，核对其答案并记录误解。根据结果修改讲解，不用点赞数或「写得很好」作为通过依据。

## 把进展交给结果

小胜利、练习与复习结构根据 Matt Pocock 的 [skills 仓库](https://github.com/mattpocock/skills)改编，MIT；文件：`skills/productivity/teach/SKILL.md`。

```cards
- **先交产物** 对照每条路线的完成标准核验。
- **隔段时间** 关闭答案，再做一道变式题。
- **换种情境** 混合输入与失败条件，检查是否会选择方法。
```

完整许可见[许可](/zh/licenses)页，另见[版权页](/zh/about-and-copyright)。以上顺序由本站设计，不是 Matt 的官方路径，也不承诺固定学习小时数。

```note
kind: inference
本站建议：完成一段就请他人或另一会话复验。若只能照抄原例，返回对应小课，换输入再试，而不是急着增加阅读页数。
```

## 速查

```cards
- **输入不会验** 走入门，交有效与无效数据结果。
- **交付说不清** 走实践；接手断线则走进阶。
- **想教别人** 走讲解，用新题答案检查效果。
```

## 来源

- [Matt 的免费学习邀请，2022-09-05](https://x.com/mattpocockuk/status/1566739592249835520)
- 各路线链接为本站课程；教学结构的 MIT 来源文件见上文。

## skills MIT 许可声明

本页改编的结构来自 [mattpocock/skills](https://github.com/mattpocock/skills)，MIT 许可，Copyright (c) 2026 Matt Pocock。完整许可附后，与[原仓库 LICENSE](https://github.com/mattpocock/skills/blob/main/LICENSE)一字不差。

```licence
id: mattpocock-skills
```

非官方、非商业的学习整理，与 Matt Pocock 无隶属或背书关系。所引作品版权归原作者；MIT 复用内容另附版权与许可声明。
