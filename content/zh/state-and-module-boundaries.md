---
slug: state-and-module-boundaries
number: 15
title: 状态与模块边界
subtitle: 用状态与接口减少错误空间
section: typescript
order: 15
summary: 用合法状态与稳定接口，让错误更难出现。
head: d15-states
updated: 2026-10-21
---

## 三个开关，谁说了算

请求失败后，页面还显示成功徽章。先别补第四个布尔值：加载、成功、失败三个开关允许八种组合，其中有些根本不该出现。

```figure
id: s15-booleans
```

这些矛盾会把判断责任推给每个调用者。下一次修改时，人和 agent 都得重新猜哪些组合有效。先列合法状态，再谈用哪种库。

## 先写请求状态表

本站原创例子只允许四种状态。请先预测：尚未发送请求时，收到成功事件应怎么办？下表约定忽略它，状态保持不变。

<!-- compare -->
| 当前状态 | 允许事件 | 下一状态 |
| --- | --- | --- |
| idle | submit | loading |
| loading | resolve / reject | success / error |
| error | retry | loading |
| success | reset | idle |

表外事件均不转换。用 discriminated union 把状态名与数据绑定：success 才携带结果，error 才携带错误。reducer 集中处理事件；转换复杂时再考虑状态机。

```figure
id: d15-states
```

简单请求未必需要专门的库。关键是能回答「现在是什么状态、允许什么事件」，而不是让工具名取代行为说明。

```quote
text: I think I'm addicted to getting agents to build state machines
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2110818314499072493
date: 2026-10-15
note: 本站译意：我想我迷上了让 agent 构建状态机。
```

## 接口替调用者挡住什么

把请求细节藏进模块时，接口仍要说明成功结果、失败行为与依赖。内部实现由测试约束，调用者不该知道缓存键或重试计数才能使用它。

```figure
id: s15-deep-module
```

深模块的概念来自 John Ousterhout，关注简单接口背后隐藏的有价值复杂度。拆成十个文件或缩成十行，都不能直接证明设计更好。

## 再检查依赖边界

导入规则可由工具阻止越层访问；领域错误可以建模为明确的类型。Effect 是 Matt 的公开偏好与另一个学习入口，本页不覆盖它，也不建议所有项目迁移。

```figure
id: s15-boundary-check
```

```note
kind: inference
本站建议：先找一个反复出错的边界，明确它允许的输入、输出与失败，再选择类型或检查工具。不要为统一风格重写整个项目。
```

## 练习：拦住提前成功

```exercise
title: 为状态表补两份证据
- 任务：写出 idle 收到 resolve 时的预期，再实现这一约束。
- 失败检查：该事件不能产生 success，也不能凭空得到结果。
- 正常检查：submit 后显示加载；reject 后显示错误；retry 后可再次成功。
answer: 非法事件保持 idle；正常路径依次为 idle、loading、error、loading、success。分别检查状态与用户看到的界面。
```

完成标准：非法转换测试能拦住提前成功，正常交互也有可重复证据。继续读[实现与反馈](/zh/implementation-and-feedback)。历史仓库 xstate-catalogue 已归档，不代表当前 API 示例。

## 速查

```cards
- **状态** 一个标签表达当前阶段，数据跟随状态。
- **转换** 列允许事件，给表外事件明确策略。
- **接口** 调用者依赖行为，测试约束内部实现。
```

## 来源

- [Matt 的状态机观察，2026-10-15](https://x.com/mattpocockuk/status/2110818314499072493)
- [代码库设计文章：独立解读](https://www.aihero.dev/how-to-make-codebases-ai-agents-love)
- [xstate-catalogue：已归档的历史入口](https://github.com/mattpocock/xstate-catalogue)
