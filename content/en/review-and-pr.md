---
slug: review-and-pr
number: 8
title: Review & PR
subtitle: From Completion Claims to Review Evidence
section: workflow
order: 8
summary: Give reviewers separate findings, observable behaviour and a clear account of merge risk.
head: s08-two-axes
updated: 2026-10-21
---

## Tidy code can still deliver the wrong thing

The export button follows every convention, but downloads only the current page. The ticket asked for every filtered result. A different change might export correctly while bypassing the agreed permission boundary. A single review score hides which problem remains.

Before reading on, predict what a clean type check proves about export coverage. It proves only the properties it checks. Your goal here is a change description another person can use to judge behaviour and risk.

```figure
id: s08-two-axes
```

## Keep two independent findings

Fix the start and end of the comparison. Locate the ticket, specification and repository standards. Check requested behaviour on one axis and repository commitments on the other. If no specification exists, record that gap and establish the intended behaviour.

Separate a documented violation from a possible design smell. A violation needs a rule reference; a suggestion needs a reason. Keep the two conclusions even when both concern the same code.

<!-- compare -->
| Axis | Basis | Location | Finding | Evidence |
|---|---|---|---|---|
| Requirements | Ticket: export every result | Export entry | Only the current page is exported | 42 matches produce 20 rows |
| Standards | Repository permission rule | Download handler | Uses the shared permission entry | An anonymous request is rejected |

## Give the reviewer something to verify

Use three parts for the PR. Describe the changed behaviour, compare results for the same input, then explain merge risk. Include the environment, affected callers, rollback conditions and anything still unverified.

```figure
id: s08-pr-blocks
```

```quote
text: showing hard evidence that the changes work and assessing merge risk
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2107062474914550098
date: 2026-10-05
```

An agent's confidence cannot fill the evidence column. Link a run, screenshot or log and say which claim it supports. A check that has not run remains an open item.

## Exercise: make an export fix reviewable

```exercise
title: Add evidence and a rollback condition
- Description A: Fixed export. Checks passed. Ready to merge.
- Description B: CSV now uses the entire filtered result; identical filters produced 20 rows before and 42 after.
- Task: Choose the more reviewable version. Add the run location, a failure case and a rollback condition.
answer: B gives a comparison to investigate. Identify the fixture and run, then show that anonymous downloads fail. An application rollback may suffice if the CSV interface stays compatible and persistent data is untouched; otherwise investigate recovery separately.
```

```note
kind: inference
Our suggestion: describe reversibility as a conditional claim. Reverting code does not necessarily undo a file already sent, an email delivered or an external write.
```

## Done means someone else can assess it

A reader can locate the comparison boundary, evidence and basis for each axis, then state both conclusions independently. They can also identify affected users, rollback conditions and unverified behaviour. Missing information means more documentation or verification is needed.

Carry this state into a fresh session with the [handoff lesson](/en/context-and-handoff).

## Quick reference

```cards
- **Requirements** Check acceptance behaviour; make a missing specification visible.
- **Standards** Separate rule violations from suggestions that require judgement.
- **PR structure** Change overview, before-and-after evidence, merge risk.
```

## Sources and attribution

- Matt Pocock, [review evidence and merge risk](https://x.com/mattpocockuk/status/2107062474914550098), 2026-10-05.
- [show-me upstream credit][showme], Dex Horthy / HumanLayer; attribution only.

[showme]: https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md

## skills MIT notice

The structure adapted here comes from [mattpocock/skills](https://github.com/mattpocock/skills), MIT licence, Copyright (c) 2026 Matt Pocock. The complete licence follows, identical to [the repository LICENSE](https://github.com/mattpocock/skills/blob/2817544484ea89558aabd8a0360e042888fad713/LICENSE).

```licence
id: mattpocock-skills
```
