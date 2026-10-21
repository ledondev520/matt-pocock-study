---
slug: specs-and-tickets
number: 6
title: Specs and Tickets
subtitle: Turning Decisions into Executable Tickets
section: workflow
order: 6
summary: Capture settled decisions and slice them into independently verifiable tickets.
head: d06-spec-lifecycle
updated: 2026-10-21
---

## Can the next session find yesterday's decisions?

Yesterday you agreed that a failed save should preserve the form input. Today a fresh session clears the form. The decision stayed in chat instead of becoming an accessible reference. A sprawling spec can cause a similar problem by burying the useful choices.

The job of a spec is to carry decisions forward. A new session should be able to find what is settled, what remains open, and what evidence completion requires.

## Capture confirmed behavior

Describe the goal, expected behavior, exclusions, and acceptance method. If synchronization remains undecided, label it as an open question. A document's apparent completeness should never turn a guess into an instruction.

```cards
- **Goal and behavior** Who needs what, and how should the system respond?
- **Boundaries and unknowns** What is excluded, and what still needs a decision?
- **Acceptance** Which actions and results would demonstrate the behavior?
```

```quote
text: They're just a projection of the decisions made during grilling.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2083563195671667176
date: 2026-08-01
```

```figure
id: d06-spec-lifecycle
```

## Connect one working path first

`/to-spec` gathers settled choices. `/to-tickets` divides the work into small vertical capabilities. Begin with a narrow implementation that connects input, processing, and output. Establish that the path works before extending it.

This thin working path is often called a tracer bullet, a term that predates Matt. It exposes integration questions early, while there is still little implementation to change.

```figure
id: s06-tracer
```

## Give working material a retention policy

Matt's practice favors tickets in a tracker, cleaning up specs after use, and retaining durable decisions in ADRs. Teams with audit or collaboration needs should establish their own explicit archiving policy before removing working material.

<!-- compare -->
| Artifact | Contents | Retention |
|---|---|---|
| Spec | Confirmed goal, behavior, scope, acceptance | Clean up or archive under team policy after implementation |
| Ticket | One working capability, dependencies, evidence | Follow delivery in the tracker |
| ADR | A durable decision and its reasoning | Retain and identify superseding decisions |

## Exercise: choose the first favorites slice

Predict whether separate frontend, API, and storage tickets can each demonstrate a working favorites feature. Then write a ticket for one item, connecting a click to persistent state.

```figure
id: s06-ticket-anatomy
```

```exercise
title: Make one favorite independently verifiable
- Task: favorite an item, save it, and retain its state after refresh.
- Dependencies: an item ID, existing user identity, and an available storage interface.
- Exclusions: bulk actions, filtering, and cross-device synchronization.
- Failure observation: a failed save shows an error, avoids false success, and allows retrying.
- Success observation: after clicking, saving, and refreshing, visible state agrees with storage.
- Evidence: record a successful operation and a simulated save failure.
answer: The ticket covers input, processing, and output. If the interface is missing, identify a prerequisite or include the minimal interface in this slice. The result still needs to be demonstrable on its own.
```

```note
kind: inference
Our suggestion: leave removing a favorite for the next ticket and establish persistence in one direction first. Existing dependencies and risk still determine the appropriate slice.
```

## What counts as done?

Deliver an independently verifiable ticket with explicit dependencies, success and failure observations, and an evidence location. Someone should be able to execute it without rereading the chat. Unconfirmed choices remain visible.

Take the ticket into [implementation and feedback](/en/implementation-and-feedback) and produce the actual acceptance results.

## Quick reference

```cards
- **Specs carry choices** Separate settled decisions from unknowns and specify acceptance.
- **Tickets deliver capabilities** Connect input, processing, and output early.
- **ADRs preserve reasons** Manage durable knowledge separately from working material.
```

## Sources

- [Matt Pocock · 2026-08-01](https://x.com/mattpocockuk/status/2083563195671667176)
- [Tracer Bullets](https://www.aihero.dev/tracer-bullets)

Independent, unofficial, noncommercial study notes. This site has no affiliation with or endorsement from Matt Pocock. Referenced works belong to their authors; MIT reuse carries separate copyright and license notices.
