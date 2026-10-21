---
slug: ai-coding-workflow
number: 4
title: Workflow Overview
subtitle: Choosing an AI Coding Workflow
section: workflow
order: 4
summary: Choose enough process for the risk and uncertainty of the change.
head: d04-triage
updated: 2026-10-21
---

## How much process does this change need?

A button label change turns into pages of planning. A payment redesign reaches implementation before anyone agrees on the rules. Both waste effort: the first adds unnecessary ceremony; the second makes an uncertain decision expensive.

## Assess risk and uncertainty first

Describe the expected change, who it affects, and what you still need to learn. Make and verify a small, clear change directly. Start medium or large changes with `/grill-with-docs`; consider `/grill-me` when there is no codebase to inspect.

Escalate to `/wayfinder` for complex decisions spanning sessions. These names identify skill entry points. Check whether your environment provides them before using them; this site does not execute the workflow for you.

```figure
id: d04-triage
```

## Follow the artifacts through the main chain

The typical chain runs through alignment, a spec, implementation tickets, implementation, review, and a PR. Each step consumes an earlier result. If an input is missing, record the gap so it remains visible.

<!-- compare -->
| Step | Input | Result |
|---|---|---|
| Alignment | An unclear request | Confirmed decisions |
| Spec | Settled decisions | Goal, behavior, exclusions, verification |
| Implementation tickets | A spec | Independently verifiable vertical capabilities |
| Implementation | A bounded ticket | A change passing relevant checks |
| Review | The change and its references | Separate requirements and standards conclusions |
| PR | Review and behavior evidence | Change overview, before/after evidence, merge risk |

## A decision map carries a different job

`/wayfinder` connects decision tickets through a map index, dependencies, and open questions. Those tickets establish choices. Later, `/to-tickets` produces implementation tickets that describe small working capabilities.

Move from the map into specifications and implementation as needed. Planning does not imply permission to change production. A person still confirms the goal and scope, and an expanding map can itself become maintenance work.

```figure
id: d04-main-chain
```

## Read advice with its date attached

January 2026 emphasized Ralph and AFK. Spring brought grilling and prototypes. July introduced the naming chain below; October put more weight on review and retrospectives. The July post records one stage in that evolution.

```quote
text: /wayfinder -> /to-spec -> /to-tickets -> /implement -> /code-review
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2072625252144730215
date: 2026-07-02
```

By October 8, the advice was no longer to begin with `/wayfinder` by default. When reading an earlier workflow, establish its task and conditions before applying it today.

```figure
id: d04-timeline
```

## Exercise: select three starting points

```exercise
title: Choose enough process
- Task: pick a first step for a button label edit, a payment redesign, and a poorly understood legacy migration.
- Deliverable: name the risk, unknowns, and next artifact for each.
- Check: could equally sized projects still require different paths?
answer: Make and verify the clear label edit. Inspect payment behavior and align on tradeoffs before redesigning. Investigate the legacy system; add a map if interdependent decisions span sessions. Judge the change and uncertainty.
```

```note
kind: inference
Our recommendation: when the next action is clear, deliver something verifiable. Add alignment or planning when a key unknown could change the implementation direction.
```

## What counts as done?

Choose a path for one task and state what would justify escalating it. The first step has a concrete output, and unconfirmed choices remain open. A sequence of skill names alone does not establish either.

Practice [alignment and prototypes](/en/alignment-and-prototypes), or take settled choices into [specs and tickets](/en/specs-and-tickets).

## Quick reference

```cards
- **Small and clear** Make the change and verify its behavior.
- **Important unknowns** Investigate, ask for a decision, or prototype.
- **Decisions across sessions** Use a map when needed and confirm scope before implementation.
```

## Sources

- [Matt Pocock · 2026-07-02](https://x.com/mattpocockuk/status/2072625252144730215)
- [2026-10-08 · Workflow selection](https://x.com/mattpocockuk/status/2108216899439894574)

Independent, unofficial, noncommercial study notes. This site has no affiliation with or endorsement from Matt Pocock. Referenced works belong to their authors; MIT reuse carries separate copyright and license notices.
