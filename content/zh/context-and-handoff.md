---
slug: context-and-handoff
number: 9
title: 上下文与交接
subtitle: 给下一次会话留下可用的交接
section: workflow
order: 9
summary: 交接保存关键状态，让下一会话直接验证并继续。
head: d09-context-decision
updated: 2026-10-21
---

## 换会话，工作为什么又从头开始？

旧对话里有失败日志、已经否决的方案和新的验收要求。继续聊，关键事实越来越难找；
直接重开，又得重新解释。本页要留下可接手的状态，而不是缩写整段聊天。

先问：下一步仍需要哪些当前上下文？判断依据是任务需要，不是聊天长度本身。
一份交接应让接手者先找到事实，再决定下一步，不必猜测「应该已经做完了」。

## 按后续需要选动作

<!-- compare -->
| 条件 | 动作 | 先保住什么 |
|---|---|---|
| 同一小闭环仍需当前细节 | 继续 | 目标与当前验证结果 |
| 目标未变，混入无关材料 | 清理 | 有效决策与证据入口 |
| 到了可验收边界，将换会话 | 交接 | 产物、状态和未决问题 |
| 有可独立验收的旁支任务 | 子任务 | 输入、范围和返回格式 |
| 同一任务仍需推进，但历史太散 | 压缩 | 决策、失败证据与未知项 |

```figure
id: d09-context-decision
```

```note
kind: inference
这是本站按工作需要整理的判断表，不是原帖决策树。清理或压缩前，先保存仍有用的证据；不要把尚未解决的问题一起抹掉。
```

## 用验收边界控制任务长度

把长任务拆成能观察结果的小段，例如先验证单项导出，再做批量操作。
一段结束时记录结果，下一段从明确输入开始。子任务也需要边界，不能只交一句「帮忙看看」。

150K smart zone 是 Matt 在 2026-08 的个人经验估计。它不是通用容量限制，
不能直接拿来计算中文或其他模型何时必须换会话。交接时机仍要看工作状态。

```quote
text: Nice heuristic if you're not sure.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2087111966854730148
date: 2026-08-11
```

## 交接只留下接手所需的六格

目标写当前要完成的行为；决策写已确认的选择；产物给路径；验证注明已跑、未跑与失败。
再列未决问题、下一步和建议技能。已有规格、ADR 只引用路径，检查链接仍可访问。

```figure
id: s09-handoff-card
```

六格结构根据 [Matt Pocock 的 skills 仓库][skills] 改编，MIT。
来源文件：`skills/productivity/handoff/SKILL.md`。字段和下面的场景由本站组织。

分享前去掉密钥、个人资料与带凭据的日志。需要访问的资源可以说明授权方式，
不要把凭据塞进交接。区分「已有产物」和「已验证成功」，文件存在不是完成证据。

## 练习：只读交接能继续吗？

```exercise
title: 把「导出差不多好了」改成可接手状态
- 当前目标：导出全部筛选结果；已确认：不含批量删除。
- 产物路径：src/export.ts；决策依据：docs/adr/007-export.md。
- 验证状态：单页用例通过；跨页数据尚未测试。
- 任务：补未决问题、下一步与建议技能，再让同伴只看交接指出先查什么。
answer: 未决问题是跨页是否遗漏。下一步用 42 条匹配数据验证行数，并核对无权限请求；建议使用团队已有的验证技能。这里是本站虚构路径，真实交接须换成可访问产物。
```

## 完成标准

接手者不回读聊天，就能找到产物、说出已验证与未验证部分，并选择下一项检查。
若他把「尚未测试」理解为「通过」，应先改交接措辞，再继续实施。

要让产物更容易找，可继续读 [Agent 文档](/zh/agent-documents)。

## 速查

```cards
- **先判断需要** 继续、清理、交接、子任务、压缩各有用途。
- **路径替代重复** 引用规格和 ADR，保留验证状态与未知项。
- **让人试接手** 能找到产物并判断下一步，才算交接有效。
```

## 来源与归属

- Matt Pocock，[经验判断](https://x.com/mattpocockuk/status/2087111966854730148)，2026-08-11。
- [skills 仓库][skills]：上述 handoff 结构改编；Copyright (c) 2026 Matt Pocock。
- [本站版权说明](/zh/about-and-copyright)；完整 MIT 许可附后（见页末）。

[skills]: https://github.com/mattpocock/skills

## skills MIT 许可声明

本页改编的结构来自 [mattpocock/skills](https://github.com/mattpocock/skills)，MIT 许可，Copyright (c) 2026 Matt Pocock。完整许可附后，与[原仓库 LICENSE](https://github.com/mattpocock/skills/blob/main/LICENSE)一字不差。

```licence
id: mattpocock-skills
```

非官方、非商业的学习整理，与 Matt Pocock 无隶属或背书关系。所引作品版权归原作者；MIT 复用内容另附版权与许可声明。
