---
slug: standards-and-checks
number: 11
title: 规范与检查
subtitle: 让规则真正生效
section: agent-rules
order: 11
summary: 可判定的规则交给工具，需要取舍的交给评审。
head: d11-rule-loop
updated: 2026-10-21
---

## 提醒写了三遍，错误还在发生

评审又发现领域层直接导入界面组件。上次已经写了「请注意导入方向」，
这次仍要人来挡住。先判断规则能否机械识别，再决定放在哪里执行。

把规则全写成自然语言，会让同一个确定性问题反复消耗判断。
但「这个抽象值得保留吗」需要上下文，工具也不能只凭一个关键词作决定。

```figure
id: s11-two-kinds
```

## 能明确判定，就给出可修复的失败

导入方向、缺失字段、禁止的依赖，可以交给 lint、hook、类型或 CI。
选覆盖实际风险的工具，并让失败输出包含位置、规则、原因与修复入口。

```quote
text: IMO a deterministic rule should be enforced deterministically
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2111735524390027405
date: 2026-10-18
```

每条检查先试一个违规输入，再试一个合法输入。只看工具运行结束，
无法知道它是否检查了目标文件；必须观察该拦的被拦住、该过的能通过。

## 规范文件记录目标行为

CODING_STANDARDS.md 保存真实失败产生的约定，标题直接写行为要求，
正文解释原因，并标明哪些已由工具执行。AGENTS.md 负责把需要的人带到这里。

```figure
id: d11-rule-loop
```

需要判断的规则留给评审，附上取舍依据。把较多规范放到评审阶段，
是 Matt 降低实现时指令负担的一种实践；任务所需约束、授权范围与平台规则仍需及时可见。

```note
kind: inference
本站建议：比较一段时间内的返工，再判断规则放置是否有效。指令变少本身不是效果证据；如果同类问题更晚才被发现，应调整执行时机。
```

## 阈值是例子，不是模块定义

Matt 的个人例子包含 5,000 token 的文件阈值、用 bytes÷4 近似，
以及让 hook 低于 3 秒。这些是实践参数，不是所有项目都应照搬的上限。

字节估算不等于实际 tokenizer，中文要另测。文件也不等于模块。
拆分应保持职责与接口清楚，不能为了通过数值阈值把一个完整概念随意切碎。

## 练习：让错误输出指路

```figure
id: s11-error-message
```

```exercise
title: 把「请注意导入方向」变成检查
- 本站场景：src/domain 不得导入 src/ui；反向依赖允许。
- 任务：写出检查范围、一个违规例子、一个合法例子与失败提示。
- 违规输入：src/domain/price.ts 导入 src/ui/PriceTag。
- 合法输入：src/ui/PriceTag.ts 导入 src/domain/price。
answer: 覆盖 domain 的实际依赖，解析别名后检查目标是否位于 ui。提示应指出源文件与导入路径，解释领域层应独立，并建议将共享契约移到双方可依赖的位置。
```

## 完成标准

实际运行一次违规样例，观察非零退出和可定位的修复提示；合法样例应成功退出。
再核对路径别名与检查范围，确认没有通过换一种导入写法绕过边界。

把检查结果带入 [决策与复盘](/zh/decisions-and-retrospectives)，再决定是否扩大规则覆盖。

## 速查

```cards
- **确定事实** 用工具执行，失败输出说明如何修复。
- **上下文取舍** 由评审判断，并写清理由。
- **有效性** 同时观察正确拦截与合法通过。
```

## 来源

- Matt Pocock，[确定性规则](https://x.com/mattpocockuk/status/2111735524390027405)，2026-10-18。
- Matt Pocock，[文件阈值实例](https://x.com/mattpocockuk/status/2111708560715292675)，2026-10-18；仅解读。
- 检查场景、提示与练习由本站编写；[版权说明](/zh/about-and-copyright)。

非官方、非商业的学习整理，与 Matt Pocock 无隶属或背书关系。所引作品版权归原作者；MIT 复用内容另附版权与许可声明。
