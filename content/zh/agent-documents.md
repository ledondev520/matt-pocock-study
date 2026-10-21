---
slug: agent-documents
number: 10
title: Agent 文档
subtitle: 把 AGENTS.md 写成导航
section: agent-rules
order: 10
summary: 用触发条件和文件入口替代冗长的全局说明。
head: s10-index
updated: 2026-10-21
---

## 入口文件为什么越写越难用？

一次改支付，一次改样式，每次都给根文件补一段。几周后，改按钮也要读迁移细节，
而复制进去的启动命令早已过期。内容越来越多，真正该读的资料却更难找到。

根文件重复配置，还制造了第二份事实。以后命令变更，维护者必须记得改两处。
本页要把一份长说明改成短入口，让任务需要的资料在合适时出现。

```figure
id: s10-index
```

## 根入口只留能帮忙的内容

保留广泛相关、又难从环境直接发现的约定与关键入口。
运行命令、依赖和目录事实优先查真实配置；特殊约束的理由可以说明，但不要再缓存整份配置。

每个入口写明触发条件：改哪类行为时，先读哪个文件。低频资料放在相关主题旁。
读者应能从任务判断是否需要它，而不是先打开全部文档才知道哪个有关。

```quote
text: Use it as an index of pointers to important files, and even then aggressively prune it for no-ops.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2073473197991715246
date: 2026-07-04
```

```figure
id: d10-what-stays
```

## 删减也需要证据

发现空泛、失效或重复说明，先确认它影响什么行为，再删除或合并。
某句话看似常识，也可能是团队曾经失败后留下的有效边界；不能凭口号一删了之。

平台必须遵守的要求继续遵守。资料拆得太碎也有成本：人要维护更多文件与入口，
agent 可能要多次跳转。观察找资料和更新资料的负担，再决定拆分粒度。

以下自查结构根据 [Matt Pocock 的 skills 仓库][skills] 改编，MIT。

来源文件：`skills/productivity/writing-for-agents/SKILL.md`。示例文字由本站编写。

```cards
- **触发清楚** 每个入口都说出什么任务需要它。
- **事实单源** 配置能回答的问题，回到配置读取。
- **负担可见** 同时观察读取成本和维护成本。
```

## 练习：从一包规则变成导航

<!-- compare -->
| 原说明 | 本站改写 | 查验方式 |
|---|---|---|
| 做事仔细，多看文档 | 修改退款时，先读 docs/refunds.md 的状态约定 | 退款任务能找到该文档 |
| 启动命令和依赖复制十行 | 命令与依赖读取 package.json | 能找到当前有效脚本 |
| 每次都读全部部署细节 | 修改发布流程时，读 docs/release.md | 样式任务无需加载发布资料 |

```exercise
title: 为一个入口补出触发条件
- 任务：将「参考 docs/data.md」改成一条能指导迁移任务的入口。
- 再检查：普通文案修改是否也会被要求读它？目标文件是否存在？
answer: 修改持久化字段或数据迁移时，先读 docs/data.md 的兼容与恢复约定。路径是本站示例；真实项目必须确认文件存在且内容仍有效。
```

```note
kind: inference
本站建议：用两种小任务试读新导航，一种应触发入口，另一种不应触发。比较能否找到依据，以及是否遗漏了必要约束。
```

## 完成标准

每条入口都有触发条件、可访问目标和明确用途。配置事实只维护一份；
必要约束仍可找到。试读者能解释为什么此次需要读某文件，而不是只说入口变短了。

可执行的规则下一步放到 [规范与检查](/zh/standards-and-checks) 中处理。

## 速查

```cards
- **根文件** 广泛相关且难发现的信息，加关键入口。
- **按需资料** 放在主题旁，用任务条件连接。
- **删改验证** 检查行为变化，保留有效约束与硬性要求。
```

## 来源与归属

- Matt Pocock，[入口与删减](https://x.com/mattpocockuk/status/2073473197991715246)，2026-07-04。
- [AGENTS.md 公开文章](https://www.aihero.dev/a-complete-guide-to-agents-md)，独立解读。
- [极简说明文章](https://www.aihero.dev/never-run-claude-init)，独立解读。
- [skills 仓库][skills]：上述自查结构改编；Copyright (c) 2026 Matt Pocock。
- [本站版权说明](/zh/about-and-copyright)；许可全文随本页保留。

[skills]: https://github.com/mattpocock/skills

## skills MIT 许可声明

本页改编的结构来自 [mattpocock/skills](https://github.com/mattpocock/skills)，MIT 许可，Copyright (c) 2026 Matt Pocock。全文见[原仓库 LICENSE](https://github.com/mattpocock/skills/blob/main/LICENSE)。

非官方、非商业的学习整理，与 Matt Pocock 无隶属或背书关系。所引作品版权归原作者；MIT 复用内容另附版权与许可声明。
