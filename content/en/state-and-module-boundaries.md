---
slug: state-and-module-boundaries
number: 15
title: States and Module Boundaries
subtitle: Reducing Errors with States and Interfaces
section: typescript
order: 15
summary: Make invalid states harder to express and module behaviour easier to depend on.
head: d15-states
updated: 2026-10-21
---

## Three flags disagree

A request fails, yet its success badge remains visible. Adding another flag will not resolve the ambiguity. Three independent flags for loading, success and failure permit eight combinations, including combinations your interface should never show.

```figure
id: s15-booleans
```

Every caller inherits the job of interpreting those combinations. Future edits become guesswork for people and agents alike. Define the valid situations before choosing a library.

## Start with a request table

Our example has four states. Predict what should happen if a success event arrives before any request starts. Here, the policy is to ignore that event and retain the current state.

<!-- compare -->
| Current state | Accepted event | Next state |
| --- | --- | --- |
| idle | submit | loading |
| loading | resolve / reject | success / error |
| error | retry | loading |
| success | reset | idle |

Events absent from the table leave state unchanged. A discriminated union can attach results only to success and an error only to error. A reducer centralises event handling; a state machine becomes useful when transitions need more structure.

```figure
id: d15-states
```

A simple request may need no dedicated library. You should still be able to name the current state and the events it accepts. A tool name cannot answer those questions for you.

```quote
text: I think I'm addicted to getting agents to build state machines
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2110818314499072493
date: 2026-10-15
```

## What does the interface protect?

A request module should explain its results, failures and dependencies. Tests constrain its implementation. Callers should not need to understand cache keys or retry counters to use it correctly.

```figure
id: s15-deep-module
```

John Ousterhout's deep-module concept concerns a simple interface that hides useful complexity. Neither splitting something into ten files nor squeezing it into ten lines establishes that quality.

## Enforce dependency boundaries

Tools can reject imports that cross an architectural boundary. Types can describe domain failures explicitly. Effect is one of Matt's public preferences and a possible further study topic. This lesson does not cover it or recommend a universal migration.

```figure
id: s15-boundary-check
```

```note
kind: inference
Our suggestion: choose one boundary with recurring failures. Define its inputs, outputs and failure behaviour, then select a type or check that enforces the agreement.
```

## Exercise: reject early success

```exercise
title: Produce two kinds of evidence
- Task: specify and enforce what idle does when it receives resolve.
- Invalid path: it must not enter success or invent a result.
- Normal path: submit shows loading; reject shows an error; retry can lead to success.
answer: The invalid event preserves idle. The normal sequence is idle, loading, error, loading, success. Check both the state and the visible interface.
```

Done means a test catches early success and a repeatable interaction demonstrates the normal path. Continue with [implementation and feedback](/en/implementation-and-feedback). The archived xstate-catalogue is a historical reference, with no promise of current API compatibility.

## Quick reference

```cards
- **State** One tag names the phase; data belongs to that phase.
- **Transitions** List accepted events and a policy for every other event.
- **Interface** Callers depend on behaviour; tests constrain internals.
```

## Sources

- [Matt on state machines, 2026-10-15](https://x.com/mattpocockuk/status/2110818314499072493)
- [Codebase design article, independently interpreted](https://www.aihero.dev/how-to-make-codebases-ai-agents-love)
- [xstate-catalogue, archived historical examples](https://github.com/mattpocock/xstate-catalogue)

Unofficial, non-commercial study notes. No affiliation with or endorsement by Matt Pocock. Quoted works remain their authors’ copyright; MIT reuse retains its copyright and licence notices.
