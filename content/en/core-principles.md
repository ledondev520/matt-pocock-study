---
slug: core-principles
number: 2
title: Core Ideas
subtitle: From Generating Code to Designing the Environment
section: principles
order: 2
summary: Turn an agent failure into an environment problem you can improve and verify.
head: d02-failure-sort
updated: 2026-10-21
---

## More code, more rework

An agent changes several files, but the feature still misses the point. Before changing models, locate the failure: a mistaken goal, missing information, a verification gap, or a design that makes errors easy. Each calls for a different intervention.

```figure
id: d02-failure-sort
```

## Delivery starts a maintenance obligation

Generation speed explains how code arrives. It says little about the next person who must change it. Duplicate implementations, unused branches, and unclear interfaces all make that next decision harder.

Ask what observable behavior a piece of code serves. Which acceptance criterion would fail if it disappeared? If nobody can answer, establish the requirement before deciding whether to keep the implementation.

```quote
text: If your code sucks, your agent will too.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2089336734530109837
date: 2026-08-17
```

## Give a collaborator a workable environment

An agent needs a way into the project: reliable navigation, shared domain terms, a runnable application, and usable feedback. Repeating a request for care cannot supply a missing fact.

```cards
- **Wrong goal** Return to [alignment](/en/alignment-and-prototypes) and agree on behavior.
- **Missing information** Improve [document navigation](/en/agent-documents) and domain language.
- **Verification gap** Build a [feedback loop](/en/implementation-and-feedback).
- **Design defect** Examine [states and module boundaries](/en/state-and-module-boundaries).
```

```note
kind: inference
Our synthesis: types, interfaces, state models, and checks can reduce opportunities for error. Improve the boundary implicated by this failure; this does not establish a universally best architecture.
```

An improvement must handle the failing input correctly and keep the valid path working. Hiding the failure or rejecting every request would fail that test.

## Exercise: success without configuration

A submission form displays a sent confirmation even when its service address is missing. Predict whether one more reminder to check configuration would prevent recurrence. Then describe a repair at each of the four layers below.

```figure
id: s02-silent-success
```

```exercise
title: Make false success visibly fail
- Task: submit with the service address missing and record the incorrect confirmation.
- Boundary: stop the send operation on invalid configuration and return an explicit failure.
- Check: missing configuration produces an error; valid configuration still permits sending.
- Review: provide the steps, logs, and visible results for both configurations.
answer: The boundary rejects invalid configuration, a behavior check catches a returning false confirmation, and review examines evidence from actual operation. State what each layer catches.
```

## What counts as done?

Deliver a reproducible failure, a repair at the responsible boundary, and a passing result. Another reader should be able to identify where the same mistake would be stopped next time. Relying on an agent's memory leaves that question unanswered.

Also examine the valid request. Did the repair introduce unexplained branches or duplicate an entire implementation? Include the resulting maintenance burden in the discussion.

## Quick reference

```cards
- **Classify first** Distinguish goals, information, verification, and design.
- **Keep useful code** Judge delivered behavior and the cost of changing it.
- **Rerun both paths** Make failure visible and preserve valid behavior with reviewable evidence.
```
## Sources

- [Matt Pocock · 2026-08-17](https://x.com/mattpocockuk/status/2089336734530109837)

Independent, unofficial, noncommercial study notes. This site has no affiliation with or endorsement from Matt Pocock. Referenced works belong to their authors; MIT reuse carries separate copyright and license notices.
