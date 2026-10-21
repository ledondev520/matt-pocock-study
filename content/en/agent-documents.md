---
slug: agent-documents
number: 10
title: Agent documents
subtitle: Writing AGENTS.md as Navigation
section: agent-rules
order: 10
summary: Turn a crowded instruction file into useful pointers with explicit triggers.
head: s10-index
updated: 2026-10-21
---

## Why does the entry file keep getting harder to use?

A payment change adds migration instructions. A styling change adds another paragraph. Soon even a button edit loads deployment details, while the copied startup command is obsolete. More documentation has made the relevant information harder to find.

Copying configuration creates another place to maintain the same fact. This lesson turns that crowded file into an entry point that leads a task to the right material.

```figure
id: s10-index
```

## Keep information that earns its place

Keep broadly relevant conventions that are difficult to discover from the environment, plus essential pointers. Read commands, dependencies and directory facts from their actual configuration. Explain unusual constraints where needed without duplicating the configuration itself.

State when a task should open each document. Keep infrequent material beside its subject. The reader should be able to select a reference from the task, before opening every document.

```quote
text: Use it as an index of pointers to important files, and even then aggressively prune it for no-ops.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2073473197991715246
date: 2026-07-04
```

```figure
id: d10-what-stays
```

## Pruning needs evidence too

When instructions look vague, stale or repetitive, identify the behaviour they affect before removing or merging them. A familiar sentence may preserve a boundary established after a real failure. Test its effect rather than assuming it does nothing.

Keep platform requirements in force. Splitting documentation also has costs: people maintain more files and agents follow more pointers. Observe both lookup effort and maintenance effort when deciding how far to split.

Checklist structure adapted from [Matt Pocock's skills repository][skills], MIT: `skills/productivity/writing-for-agents/SKILL.md`. Example wording is ours.

```cards
- **Clear triggers** Each pointer identifies the task that needs it.
- **One factual source** Read configuration facts from configuration.
- **Visible costs** Consider both reading effort and maintenance effort.
```

## Exercise: replace a pile of instructions

<!-- compare -->
| Existing instruction | Our replacement | Verification |
|---|---|---|
| Be careful and read the docs | When changing refunds, read the state rules in docs/refunds.md | A refund task finds that document |
| Ten copied lines of commands and dependencies | Read package.json for commands and dependencies | The current script can be located |
| Always read every deployment detail | When changing the release process, read docs/release.md | A styling task need not load release material |

```exercise
title: Give a reference a useful trigger
- Task: Replace “See docs/data.md” with a pointer useful for a migration task.
- Check: Would a copy edit also trigger it? Does the destination exist?
answer: When changing persisted fields or data migrations, read the compatibility and recovery rules in docs/data.md. This is an illustrative path; verify existence and freshness in an actual project.
```

```note
kind: inference
Our suggestion: try two small tasks against the revised navigation. One should trigger the pointer; the other should not. Check whether the right basis is found and whether any necessary constraint is missed.
```

## Done means the navigation guides a real task

Every pointer has a trigger, an accessible destination and a purpose. Configuration facts have one maintained source, and necessary constraints remain discoverable. A reader can explain why this task needs a document, beyond observing that the entry file is shorter.

Move executable constraints into the process described in [standards and checks](/en/standards-and-checks).

## Quick reference

```cards
- **Root file** Broadly relevant, hard-to-discover information and essential pointers.
- **References** Keep them near their subject and connect them with task conditions.
- **Pruning** Observe behaviour while preserving effective constraints and mandatory requirements.
```

## Sources and attribution

- Matt Pocock, [pointers and pruning](https://x.com/mattpocockuk/status/2073473197991715246), 2026-07-04.
- [Public AGENTS.md guide](https://www.aihero.dev/a-complete-guide-to-agents-md), independently interpreted.
- [Minimal instruction files](https://www.aihero.dev/never-run-claude-init), independently interpreted.
- [skills repository][skills]: checklist adaptation identified above; Copyright (c) 2026 Matt Pocock.
- [Site copyright details](/en/about-and-copyright). The copyright line and a link to the MIT licence text appear at the end of this page.

[skills]: https://github.com/mattpocock/skills

## skills MIT notice

The structure adapted here comes from [mattpocock/skills](https://github.com/mattpocock/skills), MIT licence, Copyright (c) 2026 Matt Pocock. Full text: [the repository LICENSE](https://github.com/mattpocock/skills/blob/main/LICENSE); this site's THIRD_PARTY_NOTICES keeps the same notice.

Unofficial, non-commercial study notes, with no affiliation with or endorsement by Matt Pocock. Quoted works belong to their authors; MIT reuse carries separate copyright and licence notices.
