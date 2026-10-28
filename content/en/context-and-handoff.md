---
slug: context-and-handoff
number: 9
title: Context & handoff
subtitle: Making the Next Session Ready to Work
section: workflow
order: 9
summary: Preserve the state a fresh session needs to verify progress and continue.
head: d09-context-decision
updated: 2026-10-21
---

## Why does a fresh session restart the work?

The old conversation holds failed runs, rejected approaches and revised acceptance criteria. Continuing makes them harder to find. Restarting loses them. The useful output is a state another session can act on, rather than a miniature transcript.

Ask which parts of the current context the next step still needs. Conversation length alone cannot answer that. A handoff should let its reader find facts before deciding what to do.

## Choose an action for the remaining work

<!-- compare -->
| Condition | Action | Preserve first |
|---|---|---|
| The same small loop still needs current details | Continue | Goal and current verification results |
| The goal is unchanged but unrelated material has accumulated | Clean up | Active decisions and evidence links |
| An acceptance boundary is reached and a new session will take over | Hand off | Artifacts, status and open questions |
| A side task has its own acceptance criteria | Separate subtask | Input, scope and return format |
| The same task must continue but its history is scattered | Compress | Decisions, failure evidence and unknowns |

```figure
id: d09-context-decision
```

```note
kind: inference
This decision table is our synthesis, not a reproduction of a source image. Preserve useful evidence before cleaning or compressing history, including questions that remain unanswered.
```

## Split at observable results

Give a long task smaller acceptance boundaries: verify one export before adding bulk operations. Record the result at each boundary so the next stage has a definite input. A separate subtask also needs a clear deliverable.

Matt's August 2026 estimate of a 150K smart zone describes personal experience. It is not a universal limit or a formula for Chinese text and other models. Decide when to hand off by examining the work still ahead.

```quote
text: Nice heuristic if you're not sure.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2087111966854730148
date: 2026-08-11
```

## Leave six fields the next session can use

Record the current goal, confirmed decisions, artifact locations, verification status, unresolved questions, and the next action with suggested skills. Link existing specifications and ADRs instead of repeating them. Check that the references still resolve.

```figure
id: s09-handoff-card
```

Remove secrets, personal information and credentials embedded in logs. Explain how authorised access is obtained without including credentials. Keep artifact existence separate from verification: a file can exist while its behaviour remains untested.

## Exercise: can someone continue from this alone?

```exercise
title: Replace “export is nearly ready” with usable state
- Goal: export every filtered result. Confirmed exclusion: bulk deletion.
- Artifacts: src/export.ts; decision basis: docs/adr/007-export.md.
- Verification: single-page case passed; multi-page data not tested.
- Task: Add the open question, next action and suggested skill. Ask someone to identify the first check using only this handoff.
answer: The open question is whether results spanning pages are omitted. Next, test a fixture with 42 matches and verify rejected anonymous requests. Suggest the team's existing verification skill. These paths are fictional; a real handoff must identify accessible artifacts.
```

## Done means the handoff works in isolation

A reader can find the artifacts, distinguish verified results from untested behaviour, and select the next check without reopening the conversation. If they mistake an unrun check for a passing one, revise the wording before continuing.

Make those artifact paths easier to discover with [agent documentation](/en/agent-documents).

## Quick reference

```cards
- **Choose deliberately** Continue, clean up, hand off, separate a subtask or compress according to what comes next.
- **Link existing work** Preserve verification status and open questions alongside artifact paths.
- **Test the handoff** A reader should locate the work and name the next action independently.
```

## Sources and attribution

- Matt Pocock, [a contextual heuristic](https://x.com/mattpocockuk/status/2087111966854730148), 2026-08-11.

## skills MIT notice

The structure adapted here comes from [mattpocock/skills](https://github.com/mattpocock/skills), MIT licence, Copyright (c) 2026 Matt Pocock. The complete licence follows, identical to [the repository LICENSE](https://github.com/mattpocock/skills/blob/2817544484ea89558aabd8a0360e042888fad713/LICENSE).

```licence
id: mattpocock-skills
```
