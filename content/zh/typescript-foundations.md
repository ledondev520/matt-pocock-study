---
slug: typescript-foundations
number: 13
title: TypeScript 基础
subtitle: 用类型表达已知与未知
section: typescript
order: 13
summary: 先验证未知数据，再用类型保留可靠信息。
head: s13-unknown
updated: 2026-10-21
---

## 报错消失了，数据就可信吗？

接口返回 `{ "seats": "many" }`，代码却把它当成座位数量。加上 `any` 或断言后，
编辑器安静了，后续计算仍可能出错。类型检查通过，不能证明外部输入符合预期。

先预测：把响应断言成 `{ seats: number }`，会把字符串变成数字吗？
不会。断言只改变编译器看待它的方式。本页要在边界检查数据，再保留已确认的信息。

```figure
id: s13-unknown
```

## 用检查把 unknown 收窄

`unknown` 表示尚不知道值是什么。读取属性和做计算之前，先检查存在性、
形状与字段条件。下面只接受非负整数座位数；不合法输入明确报错，避免进入业务计算。

```ts
function readSeats(value: unknown): number {
  if (typeof value !== "object" || value === null) {
    throw new Error("Expected an object");
  }
  if (!("seats" in value)) {
    throw new Error("Missing seats");
  }
  const seats = value.seats;
  if (typeof seats !== "number" ||
      !Number.isInteger(seats) || seats < 0) {
    throw new Error("Invalid seat count");
  }
  return seats;
}
```

检查只证明写明的条件。这里没有检查账号权限或库存变化，也没有把输入自动修复。
复杂响应可用合适的运行时校验方式，仍需决定接受什么、拒绝什么。

## 泛型保留输入与输出的关系

一个把数字或文本原样返回的函数，若统一标注联合类型，调用后会丢失输入的具体信息。
泛型可以表达「传入什么类型，就返回什么类型」，而不是为每种输入重写函数。

```figure
id: s13-generic
```

```ts
function echoWide(value: string | number): string | number {
  return value;
}
function echo<T>(value: T): T {
  return value;
}
const wide = echoWide(12); // string | number
const precise = echo(12); // 12
```

```quote
text: If you don't know generics, I promise you'll understand them by the end of this thread.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/1625838626742435842
date: 2023-02-15
```

## 把报错读成三句话

先说预期是什么、实际拿到什么、在哪层不匹配，再缩成最小复现。
例如把 `wide` 交给只收数字的函数：接收方要数字，但变量仍可能是文本；问题在返回类型的关系丢失。

```figure
id: d13-error-read
```

## ts-reset 处在声明这一层

按资料采集版本，ts-reset 会调整某些内建声明，包括让 JSON 解析结果体现为未知值，
推动调用方先检查。它不提供运行时数据校验；采用前应审视项目环境与全局声明影响。

```note
kind: inference
本站建议：先在小范围理解声明变化，再决定是否引入工具。上面的原创例子不依赖 ts-reset；是否拒绝无效数据，仍由运行时检查决定。
```

```note
kind: tip
本站原创代码已用 TypeScript 5.7.3、strict、ES2022 编译核对，并运行有效与无效输入。类型错误示例另作预期失败检查。
```

```exercise
title: 先预测，再检查边界
- 任务：预测 readSeats 对 `{ seats: 3 }`、`{ seats: "3" }`、`null` 的结果，再运行核对。
- 再解释：为何 echoWide 的结果不能直接当 number？你会修正哪一层？
answer: 只有第一个返回 3，其余报错。echoWide 的声明允许返回文本；如果契约是原样返回，用泛型保留关系，也可在调用处检查类型。盲目断言没有证明数值条件。
```

## 完成标准

能解释断言没有验证什么，预测并运行有效与无效输入，再用普通语言说明一处类型不匹配。
还能指出泛型保留的是哪条关系，而不是只背语法。下一步看 [实用类型工具](/zh/practical-type-tools)。

## 速查

```cards
- **unknown** 尚未验证，先检查再使用。
- **泛型** 保留调用中输入与输出的类型关系。
- **报错** 预期、实际、层次，缩小复现再修正。
```

## 来源

- Matt Pocock，[泛型讲解入口](https://x.com/mattpocockuk/status/1625838626742435842)，2023-02-15。
- [ts-reset 仓库](https://github.com/mattpocock/ts-reset)，仅按资料采集版本独立解读，不复用代码。
- 代码、响应数据与练习由本站编写；[版权说明](/zh/about-and-copyright)。

非官方、非商业的学习整理，与 Matt Pocock 无隶属或背书关系。所引作品版权归原作者；MIT 复用内容另附版权与许可声明。
