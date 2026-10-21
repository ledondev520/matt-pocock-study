---
slug: review-and-pr
number: 8
title: 评审与 PR
subtitle: 把完成声明变成评审证据
section: workflow
order: 8
summary: 让评审者看到行为证据、独立结论与合并风险。
head: s08-two-axes
updated: 2026-10-21
---

## 代码整齐，为什么还不能合并？

导出按钮按规范写完，结果只下载当前页。需求要的是全部筛选结果。
也可能结果正确，却绕过了仓库约定的权限入口。一个总分无法解释这两种失败。

先预测：类型检查全绿，能证明导出范围正确吗？它只检查自己覆盖的性质。
本页的小目标，是让另一位评审者看得出需求、规范和风险分别处于什么状态。

```figure
id: s08-two-axes
```

## 两条轴，各自给结论

固定本次比较的起点与终点，找到工单、规格和仓库规范。
需求轴逐项核对行为；规范轴逐条核对约定。没有规格就标记缺失，先补确认依据。

把明确违规和可能的坏味道分开。前者能指向规则，后者需要解释修改收益。
即使同一处代码同时涉及两轴，也保留两条结论，避免规范通过掩盖功能缺口。

<!-- compare -->
| 评审轴 | 依据 | 位置 | 问题 | 证据 |
|---|---|---|---|---|
| 需求 | 工单：导出全部结果 | 导出入口 | 只导出当前页 | 42 条结果只得到 20 行 |
| 规范 | 仓库权限规则 | 下载处理器 | 已走统一权限入口 | 未登录请求被拒绝 |

此双轴结构根据 [Matt Pocock 的 skills 仓库][skills] 改编，MIT。
来源文件：`skills/engineering/code-review/SKILL.md`。表内场景和文字由本站编写。

## PR 要让别人能复核

变化概览说明谁在什么操作下得到新行为；前后证据使用同一输入，注明环境与结果。
合并风险写明回滚是否可行、影响哪些调用者，以及尚未验证什么。

```figure
id: s08-pr-blocks
```

```quote
text: showing hard evidence that the changes work and assessing merge risk
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2107062474914550098
date: 2026-10-05
```

不要把「模型检查过」填在证据栏。贴出可定位的日志、截图或测试记录，
并说明它们证明哪项行为。没有运行的检查应写成待验证，不能算通过。

三块 PR 结构根据 [skills][skills] 的 `skills/engineering/pr/SKILL.md` 改编，MIT。

该文件致谢 Dex Horthy / HumanLayer 的 [show-me][showme]；这里仅保留致谢，不取其内容。

## 练习：补齐能判断的说明

```exercise
title: 给导出修复补一条证据和一个回滚条件
- 描述 A：修复导出，检查通过，可以合并。
- 描述 B：改用完整筛选结果生成 CSV；同一筛选在修复前后分别得到 20、42 行。
- 任务：选较可复核的一份，再补验证记录位置、失败路径和回滚条件。
answer: B 更可复核。注明测试数据与运行记录；验证无权限时拒绝下载。若只改应用代码且 CSV 接口兼容，可回退版本；若改了持久数据，须另查恢复路径。
```

```note
kind: inference
本站建议：把「可回滚」写成有条件的判断。代码能撤回，不代表已发送的数据、邮件或外部写入也能撤回。
```

## 完成标准

另一位读者能定位比较范围、两轴依据和行为证据，分别复述两条结论。
他也能指出影响范围、回滚条件与未验证项；缺少任何一项，就补说明或继续验证。

接下来用 [交接页](/zh/context-and-handoff) 把这些状态带进新会话。

## 速查

```cards
- **需求轴** 按验收行为找证据，缺规格就标明缺失。
- **规范轴** 明确违规与判断性建议分别列出。
- **PR 三块** 变化概览、前后证据、合并风险。
```

## 来源与归属

- Matt Pocock，[评审证据与合并风险](https://x.com/mattpocockuk/status/2107062474914550098)，2026-10-05。
- [skills 仓库][skills]：上列两份结构改编；Copyright (c) 2026 Matt Pocock。
- [show-me 上游致谢][showme]，Dex Horthy / HumanLayer；仅列来源。
- [本站版权说明](/zh/about-and-copyright)；改编结构的版权行与 MIT 许可原文链接见页末。

[skills]: https://github.com/mattpocock/skills
[showme]: https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md

## skills MIT 许可声明

本页改编的结构来自 [mattpocock/skills](https://github.com/mattpocock/skills)，MIT 许可，Copyright (c) 2026 Matt Pocock。全文见[原仓库 LICENSE](https://github.com/mattpocock/skills/blob/main/LICENSE)。

非官方、非商业的学习整理，与 Matt Pocock 无隶属或背书关系。所引作品版权归原作者；MIT 复用内容另附版权与许可声明。
