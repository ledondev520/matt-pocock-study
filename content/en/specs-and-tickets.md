---
slug: specs-and-tickets
number: 6
title: Specs & tickets
subtitle: Turning decisions into executable tickets
section: workflow
order: 6
summary: Specs preserve decisions; vertical tickets deliver verifiable capabilities.
head: d06-spec-lifecycle
updated: 2026-10-21
---

## Keep the decisions, lose the sprawl

A fresh session can lose decisions made in chat. A sprawling spec buries the real work under stale detail.

A spec makes settled choices portable: the goal, expected behaviour, exclusions and verification. Keep open questions visibly open. Uncertainty must never quietly become a requirement.

```cards
- **Goal & behaviour** Who needs to do what? How should the system respond?
- **Boundaries & unknowns** What is excluded? Which questions still need an answer?
- **Verification** What evidence would prove the work is complete?
```

```quote
text: They're just a projection of the decisions made during grilling.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2083563195671667176
date: 2026-08-01
```

## Prove the path, then expand

`/to-spec` collects the decisions; `/to-tickets` turns them into small, complete vertical capabilities. These workflow entry points need to be configured in your environment first.

First connect input → processing → output. Expand from that working path, rather than integrating finished layers at the end.

```figure
id: s06-tracer
```

A tracer bullet is this first thin, working path through the system. The term predates Matt and comes from *The Pragmatic Programmer*. [Read Matt’s explanation](https://www.aihero.dev/tracer-bullets).

```figure
id: s06-ticket-anatomy
```

## Give each document a lifespan

Matt leans toward tickets in a tracker and cleaning up specs after use. Keep durable decisions in ADRs. Working material and long-term knowledge serve different purposes.

<!-- compare -->
| Artifact | What it holds | Lifetime |
| --- | --- | --- |
| Spec | Goal, behaviour, scope, verification | During implementation; then clean up or archive |
| Ticket | One vertical capability and its acceptance criteria | Through delivery; retained in the tracker |
| ADR | A durable decision, context and tradeoffs | Long term; mark as superseded when changed |

```note
kind: tip
For audit needs, agree on what to keep, for how long, where it lives, and who archives it. Personal habits cannot replace a team agreement.
```

## Try it yourself

```exercise
title: Slice a favourites feature
- Task: click Favourite on one item, save it, then refresh. The saved state should remain.
- Success: click → save → refresh. The item stays favourited.
- Failure: a failed save shows an error, avoids a false success state, and allows a retry.
answer: Connect the UI, save endpoint and storage in the first ticket. Leave filters, bulk actions and cross-device sync for later tickets.
```

This original acceptance-data sketch gives the success and failure checks separate inputs.

```typescript
const scenarios = [
  { save: "ok", afterRefresh: "favourited" },
  { save: "failed", message: "Retry", favourited: false },
];
```

## Quick reference & sources

- Specs capture settled decisions. Unknowns remain open.
- Each ticket proves one complete path with its own acceptance criteria.
- ADRs preserve durable rationale. Agree on archiving before cleanup.
- Sources: [specs and decisions](https://x.com/mattpocockuk/status/2083563195671667176), [tracer bullets](https://www.aihero.dev/tracer-bullets).

Independent, unofficial, non-commercial study notes. Original works belong to their authors.
