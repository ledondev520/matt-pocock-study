---
slug: practical-type-tools
number: 14
title: 实用类型工具
subtitle: 从业务问题认识类型工具
section: typescript
order: 14
summary: 从具体混淆出发选工具，并说清它的边界。
head: d14-tool-picker
updated: 2026-10-21
---

## 两个 string，为什么传错也不报错？

给用户发通知的函数收一个字符串，调用方却传进订单 ID。它们都写成 `string`，
类型检查无法区分。先选这种具体混淆，再决定工具，不必先背一整页高级语法。

另外两类常见问题是配置字面量变宽，以及键处理遗漏 symbol。
三类问题需要不同信息：领域身份、精确取值、键的范围。工具也各有没解决的部分。

```figure
id: d14-tool-picker
```

## 品牌类型保留领域身份

branded types 在原有类型上附加静态标记，让用户 ID 与订单 ID 不能直接互换。
下面标记只存在于类型层；可信构造入口应在验证之后授予品牌，而不是随处断言。

```figure
id: s14-brand
```

```ts
declare const idKind: unique symbol;
type UserId = string & { readonly [idKind]: "user" };
type OrderId = string & { readonly [idKind]: "order" };
function userId(value: string): UserId {
  if (!/^usr_[0-9]+$/.test(value)) {
    throw new Error("Invalid user ID");
  }
  return value as UserId;
}
function notificationTarget(id: UserId): string {
  return `/users/${id}`;
}
notificationTarget(userId("usr_8"));
```

这个构造函数只检查本站规定的格式，不证明用户存在或调用者有权访问。
品牌帮助编译器区分领域值，来自网络的未知输入仍需先验证。品牌也不能阻止有人故意强制断言。

## as const 保留精确取值

配置本来只有两个模式，普通可变数组却容易被推断为 `string[]`。
`as const` 保留字面量信息，下面可由数组得到精确的模式联合类型。

```ts
const modes = ["quiet", "loud"] as const;
type Mode = (typeof modes)[number];
const current: Mode = "quiet";
```

类型层的 readonly 限制通过该类型进行修改，不等于冻结运行时对象。
需要运行时冻结时另行选择机制，并明确它覆盖的深度；不能由类型标记推断对象永远不变。

## PropertyKey 表达键的范围

键可能是 string、number 或 symbol。选择 `PropertyKey` 可以表达这个范围，
但实际 API 怎么遍历、转换或保存键，还要看运行环境与操作本身。

```quote
text: It represents any valid key in JavaScript: string, number or symbol.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/1830935305639145678
date: 2024-09-03
```

```ts
const marker = Symbol("marker");
const labels: Record<PropertyKey, string> = {};
labels[marker] = "hidden from Object.keys";
labels[7] = "shelf";
const visible = Object.keys(labels); // ["7"]
const all = Reflect.ownKeys(labels); // ["7", marker]
```

此例对象的数字属性名会转成字符串，`Object.keys` 不列 symbol 键。
`Reflect.ownKeys` 可见自身的 symbol 键，也含不可枚举键。类型能表达键，不等于每个 API 都保留它。

## 练习：选择工具，也指出缺口

```note
kind: tip
本站原创代码已用 TypeScript 5.7.3、strict、ES2022 编译核对，并运行有效与无效输入。类型错误示例另作预期失败检查。
```

```exercise
title: 三种错误，三种边界
- A：订单 ID 误传给用户通知函数；B：模式配置被推断为 string[]；C：遍历对象时漏了 symbol。
- 任务：为每题选工具，说出它仍未解决什么，再写一个最小例子核对。
answer: A 用品牌区分领域，仍需验证输入与权限；B 用 as const 保留取值，未冻结对象；C 用 PropertyKey 表达范围，再选遍历 API。改类型不改变键遍历行为。
```

```note
kind: inference
本站建议：每次引入工具都附一个“它没有保证什么”的反例。用它提醒下一位维护者，类型承诺与业务验证分别覆盖哪一层。
```

## 完成标准

能运行自己的小例子，分别观察错误领域 ID 被静态拒绝、模式联合保留精确取值，
以及两种键遍历的结果差异。还能解释运行时验证与冻结为什么仍需另行处理。

继续读 [状态与模块边界](/zh/state-and-module-boundaries)，把类型约束放进更完整的设计。

## 速查

```cards
- **品牌类型** 区分领域身份，不自动验证网络值。
- **as const** 保留字面量与 readonly 信息，不冻结对象。
- **PropertyKey** 表达三种键类型，API 行为仍需核对。
```

## 来源

- Matt Pocock，[PropertyKey](https://x.com/mattpocockuk/status/1830935305639145678)，2024-09-03。
- Matt Pocock，[branded types](https://x.com/mattpocockuk/status/1625173884885401600)，2023-02-13；只链接概念来源。
- Matt Pocock，[as const](https://x.com/mattpocockuk/status/1623262073244250112)，2023-02-09；只链接概念来源。
