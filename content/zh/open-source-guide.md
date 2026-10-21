---
slug: open-source-guide
number: 18
title: 开源仓库导览
subtitle: 按问题寻找开源入口
section: repos
order: 18
summary: 先说清要解决的问题，再核对仓库作用与许可。
head: d18-repo-picker
updated: 2026-10-21
---

## 星数不能替你选工具

收藏了很多仓库，却不知道该打开哪一个。先写下当前问题，再检查作用、维护状态与许可。本页依据 2026-10-20 采集版本，不保证今天的状态、安装兼容性或性能。

## 按问题选入口

流程导航、类型声明、执行隔离与应用评测是不同需求。下面五张卡都给出起点与限制；先读说明和许可，再判断是否值得试用。

```figure
id: d18-repo-picker
```

```quote
text: I built my own software factory, and I open-sourced it.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2049506712801935611
date: 2026-04-29
note: 本站译意：我搭建了自己的软件工厂，并把它开源了。
```

## 仓库卡片

```cards
- **skills** 问题：流程与说明入口。作用：查找工作方式。先读：说明与 LICENSE。局限：需按任务裁剪。许可：MIT。站内：agent 文档。
- **ts-reset** 问题：内建类型声明的坑。作用：调整部分声明。先读：影响范围与 LICENSE。局限：不验证运行时输入。许可：MIT。站内：TS 基础。
- **sandcastle** 问题：隔离 agent 执行。作用：研究执行边界。先读：边界说明与 LICENSE。局限：需核对部署条件。许可：MIT。站内：实现与反馈。
```

- [skills](https://github.com/mattpocock/skills) → [agent 文档](/zh/agent-documents)
- [ts-reset](https://github.com/mattpocock/ts-reset) → [TypeScript 基础](/zh/typescript-foundations)
- [sandcastle](https://github.com/mattpocock/sandcastle) → [实现与反馈](/zh/implementation-and-feedback)

```cards
- **evalite** 问题：评测 LLM 应用。作用：组织评测。先读：评测说明与 LICENSE。局限：指标需对应自己的任务。许可：MIT。站内：实现与反馈。
- **xstate-catalogue** 问题：状态机历史示例。作用：观察建模思路。先读：归档标记与 LICENSE。局限：不保证当前 API 兼容。许可：MIT，已归档。站内：状态与边界。
```

- [evalite](https://github.com/mattpocock/evalite) → [实现与反馈](/zh/implementation-and-feedback)
- [xstate-catalogue](https://github.com/mattpocock/xstate-catalogue) → [状态与模块边界](/zh/state-and-module-boundaries)

这五个入口不能互相替代。改类型声明不会证明未知输入有效；执行隔离也不会证明业务行为正确。每次选择都要回到最初的问题，说明工具负责哪一部分。

阅读顺序可以从问题卡开始，转到仓库说明，再核对限制和许可。若实际需要与说明不符，先换入口，不要为了使用刚找到的工具而扩大任务。

例如评测需要先知道要比较什么结果，历史示例需要先知道研究哪种状态关系。缺少这些判断，仓库即使能够打开，也还不能说明下一步该做什么。

本页只做导航，不提供安装命令或迁移方案。准备实际试用时，再核对目标环境与所选版本，记录仍未验证的条件，避免把快照信息写成当前保证。

## 想复用，先停在许可处

dictionary-of-ai-coding、course-video-manager 与 zod-fetch 的根仓库无许可证。本版只解读与链接，不搬词条、规则或代码。

translator 子目录的 MIT 不覆盖整个仓库，不能因为局部有许可，就把其他目录也当作可复制材料。

```figure
id: d18-license-tree
```

ai-hero-cli 虽有 MIT 文件，但版权行含占位符且涉及课程工具，本版不取代码或文本。工具许可不能扩大为其他内容的许可；工作坊材料与练习也不取材。

```note
kind: inference
本站建议：把「适合研究」与「获准复制」分开记录。决定复用前核对具体文件、许可范围和准确版权行，新增复用应先登记。
```

## 练习：选两个起点

```exercise
title: 不看星数做选择
- 需求一：想为 agent 建立规范导航，应先打开哪个仓库？
- 需求二：想比较 LLM 应用在一组任务上的结果，应先打开哪个仓库？
- 每项补充：许可在哪里？还有哪项适用条件需要核对？
answer: 一选 skills，二选 evalite；都先核对根 LICENSE。前者检查导航是否适合项目，后者检查指标是否衡量真实任务，不凭 MIT 标签假定兼容。
```

完成标准：能说清问题与仓库的对应关系，指出许可位置及一个限制。直接复用只限已登记项；本页五张仓库卡为原创导读。

## 速查

```cards
- **选入口** 按问题匹配用途，保留限制条件。
- **查许可** 看具体文件与范围，不能用星数替代。
- **再动手** 先登记获许可的复用，保留声明。
```

## 来源

- [Matt 谈开源实践，2026-04-29](https://x.com/mattpocockuk/status/2049506712801935611)
- 上述五个仓库为功能入口，许可按提纲的已核对快照。
- [dictionary-of-ai-coding](https://github.com/mattpocock/dictionary-of-ai-coding)
- [course-video-manager](https://github.com/mattpocock/course-video-manager)
- [zod-fetch](https://github.com/mattpocock/zod-fetch)
- [ts-error-translator](https://github.com/mattpocock/ts-error-translator)
- [ai-hero-cli](https://github.com/mattpocock/ai-hero-cli)
- [本站许可登记与边界](/zh/about-and-copyright)

非官方、非商业的学习整理，与 Matt Pocock 无隶属或背书关系。所引作品版权归原作者；MIT 复用内容另附版权与许可声明。
