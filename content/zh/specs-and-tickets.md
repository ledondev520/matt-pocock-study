---
slug: specs-and-tickets
number: 6
title: 规格与工单
subtitle: 把已定决策变成可执行工单
section: workflow
order: 6
summary: 规格保存决定，纵向工单交付可验证的能力。
head: d06-spec-lifecycle
updated: 2026-10-21
---

## 聊天结束，决定别丢

上一轮聊定的行为，换个会话就可能失去上下文。另一种麻烦是规格越写越长：过时的细节盖住了真正要做的事。

规格是已做决定的便携形式。写清目标、行为、不做什么，以及如何验证。未知的部分就标成待确认，别把没想清楚的问题装成需求。

```cards
- **目标与行为** 谁要完成什么？系统应怎样回应？
- **边界与未知** 哪些不做？哪些问题仍待确认？
- **验证方式** 看到什么证据，才算真正做完？
```

```quote
text: They're just a projection of the decisions made during grilling.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2083563195671667176
date: 2026-08-01
note: 本站译意：规格只是把反复追问时已经做出的决定投射成文字。
```

## 先跑通，再扩展

先用 `/to-spec` 收拢讨论中定下的决定，再用 `/to-tickets` 切成小而完整的纵向能力。命令是工作流入口，需要先在自己的环境配置。

第一张先贯穿输入 → 处理 → 输出，再扩展后续能力。别等各层做完才集成。

```figure
id: s06-tracer
```

这就是 tracer bullet：先用一条细小的端到端链路验证方向。术语并非 Matt 首创，源自《程序员修炼之道》。[读 Matt 的解释](https://www.aihero.dev/tracer-bullets)。

```figure
id: s06-ticket-anatomy
```

## 材料会过期，知识要留下

Matt 的做法偏向把工单放进任务追踪器，用完后清理规格。需要长期保留的决定写进 ADR。临时实施材料和长期知识，承担的是不同职责。

<!-- compare -->
| 材料 | 保存什么 | 生命周期 |
| --- | --- | --- |
| 规格 Spec | 目标、行为、边界、验证 | 实施期间；用后清理或归档 |
| 工单 Ticket | 一个纵向能力及验收条件 | 跟随交付；留在追踪器 |
| ADR | 重要决定、背景与取舍 | 长期；改变时注明被替代 |

```note
kind: tip
需要审计的团队，应明确约定保存什么、保存多久、存在哪里、由谁负责归档。个人习惯不能代替团队约定。
```

## 动手练习

```exercise
title: 把「添加收藏」切成一个闭环
- 任务：点击一条内容的收藏按钮，保存成功，刷新后仍显示已收藏。
- 成功时观察到：点击 → 保存 → 刷新，收藏状态仍在。
- 失败时观察到：保存失败时提示错误，不显示假成功，并允许重试。
answer: 第一张工单贯通界面、保存接口和存储。列表筛选、批量操作和多端同步留给后续工单。
```

下面是本站原创的验收数据示意，可以按成功与失败分别运行检查。

```typescript
const scenarios = [
  { save: "ok", afterRefresh: "favourited" },
  { save: "failed", message: "Retry", favourited: false },
];
```

## 速查与来源

- 规格保存已定决策；未知仍标为未知。
- 工单先跑通一条链路，每张都能独立验收。
- ADR 留下长期理由；清理材料前确认归档政策。
- 原文：[规格与决定](https://x.com/mattpocockuk/status/2083563195671667176)、[tracer bullets](https://www.aihero.dev/tracer-bullets)。

非官方、非商业的独立学习整理。所引作品版权归原作者。
