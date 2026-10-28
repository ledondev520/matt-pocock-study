---
slug: cheat-sheets
number: 19
title: Cheat Sheets
subtitle: Taking the Methods Back to Work
section: cheatsheet
order: 19
summary: Find the next action by its trigger, with a route back to the full explanation.
head: card
updated: 2026-10-21
---

## Start with the blockage

You understood a lesson, but cannot recall what to do at work. These tables compress methods already explained on this site. Find the nearest trigger, then follow its lesson link for conditions. Command names alone are not deliverables.

```quote
text: Here's a cheat sheet that will get you 90% of the way there.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/1701619240686485799
date: 2023-09-12
```

The quote illustrates the reference format. This page does not reproduce the author's TSConfig graphic or promise that percentage of learning progress.

## Choose a workflow

<!-- compare -->
| Trigger | Available step | Input → output | When to skip |
| --- | --- | --- | --- |
| Clear small change | [Implement and verify](/en/implementation-and-feedback) | Settled behaviour → evidence | Skip extra planning |
| Moderate uncertainty | [Align and prototype](/en/alignment-and-prototypes) | Vague request → acceptance behaviour | Behaviour already agreed |
| Decisions across sessions | [Workflow triage](/en/ai-coding-workflow) | Dependencies and unknowns → decision map | No cross-session need |

Plan enough to support the next verification. Agreed behaviour can proceed to [specs and tickets](/en/specs-and-tickets). A step's presence in the table does not make it compulsory.

## Put rules where they work

<!-- compare -->
| Purpose | Location | Full explanation |
| --- | --- | --- |
| Navigation | AGENTS.md | [Agent documents](/en/agent-documents) |
| Judgement-based standards | CODING_STANDARDS | [Standards and checks](/en/standards-and-checks) |
| Mechanical enforcement | lint / hook / CI | [Standards and checks](/en/standards-and-checks) |
| Durable reasoning | ADR | [Decisions and retrospectives](/en/decisions-and-retrospectives) |
| Domain language | GLOSSARY | [Agent documents](/en/agent-documents) |

```figure
id: d19-rule-placement
```

One requirement may need two homes: a standard explains the judgement, while a check enforces its mechanically recognisable part. Both should describe the same behaviour so documentation and enforcement agree.

Navigation points a collaborator to information; checks reject mechanically detectable errors. Putting every requirement in a root document cannot make it execute automatically and creates more material to keep current.

## Verification and handoff

<!-- compare -->
| Field | What to retain | Full lesson |
| --- | --- | --- |
| Behaviour evidence | Steps, expected and actual results | [Implementation and feedback](/en/implementation-and-feedback) |
| Failure path | Failure behaviour and recovery | [Review and PR](/en/review-and-pr) |
| Unverified items | Missing evidence and risk | [Review and PR](/en/review-and-pr) |
| Artifact links | Existing locations, avoiding duplication | [Context and handoff](/en/context-and-handoff) |
| Next action | Receiving task and verification | [Context and handoff](/en/context-and-handoff) |

An unverified field should identify behaviours not run, missing environment and possible impact. The receiver needs to know which conclusions remain unsupported. Link existing evidence without treating an earlier result as a fresh verification.

## TypeScript entry points

<!-- compare -->
| Trigger | First move | Full explanation |
| --- | --- | --- |
| Unknown input | Accept unknown, validate at runtime | [TS foundations](/en/typescript-foundations) |
| Type relationships | Connect input and output types | [TypeScript foundations](/en/typescript-foundations) |
| Key types | Check whether a key may be a string, number or symbol | [Practical type tools](/en/practical-type-tools) |
| Contradictory states | List valid states and transitions | [States and boundaries](/en/state-and-module-boundaries) |

```note
kind: inference
Our suggestion: select one trigger and name the evidence you need next. If a row does not fit your boundary, return to the full lesson before applying it.
```

Before using the type table, distinguish a static relationship from a runtime fact. Unknown data needs validation; valid keys need type constraints. For states, return to accepted transitions. Identify the gap before choosing its representation.

## Exercise and completion

```exercise
title: A fresh session claims completion without running anything
- Task: use the tables to select a full lesson and one immediate action.
- Add: identify an unknown that the handoff must disclose.
answer: Open implementation and feedback, run the target behaviour, and record expected and actual results. Disclose checks not yet run and their risks in the handoff. Naming a command alone is insufficient.
```

Done means the selection addresses the reported failure and the action produces checkable evidence. Return later with a different scenario to practise choosing, rather than remembering a row's position.

## Quick reference

```cards
- **Workflow** Choose enough steps for the uncertainty.
- **Rules** Give navigation, judgement and enforcement distinct homes.
- **Delivery** Retain behaviour evidence, unknowns and a next action.
```

## Sources

- [Matt's cheat-sheet quote, 2023-09-12](https://x.com/mattpocockuk/status/1701619240686485799)
- Each table links to this site's full explanations.

## skills MIT notice

The structure adapted here comes from [mattpocock/skills](https://github.com/mattpocock/skills), MIT licence, Copyright (c) 2026 Matt Pocock. The complete licence follows, identical to [the repository LICENSE](https://github.com/mattpocock/skills/blob/2817544484ea89558aabd8a0360e042888fad713/LICENSE).

```licence
id: mattpocock-skills
```
