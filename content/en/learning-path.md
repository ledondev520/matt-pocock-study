---
slug: learning-path
number: 20
title: Learning Paths
subtitle: From Your First Small Win to an Independent Workflow
section: path
order: 20
summary: Use three diagnostic questions to choose a route, then assess progress through checkable work.
head: d20-routes
updated: 2026-10-21
---

## Diagnose before counting pages

You have read plenty, yet a fresh task still feels difficult to start. Try three questions to locate the gap. Skip what you can already demonstrate. Judge the output and reasoning rather than time spent reading.

```exercise
title: Three questions to find your starting point
- Type boundary: can unknown JSON simply be asserted as user data? Explain how invalid input is handled.
- Acceptance: an agent says saving works. What evidence would you request?
- Slicing: build every database table first, or complete one save-and-read path for favourites?
answer: Validate the input at runtime and reject an invalid shape. Observe saving, refresh to check persistence, and inspect a failed save. Start with an independently verifiable end-to-end slice and identify its dependencies.
```

If question one was difficult, choose foundations. For questions two or three, choose practice. If delivery works but handoffs fail, try the advanced route. Choose explanation when you want to teach someone else.

```quote
text: Want to learn TypeScript for free?
author: Matt Pocock
url: https://x.com/mattpocockuk/status/1566739592249835520
date: 2022-09-05
```

## Foundations: protect the input boundary

[TS foundations](/en/typescript-foundations) → [practical type tools](/en/practical-type-tools) → [implementation and feedback](/en/implementation-and-feedback).

Deliverable: handle unknown JSON and show both valid and invalid outcomes. Done means valid data reaches the feature and invalid structure produces an explicit failure. A type assertion alone cannot establish this behaviour.

```figure
id: d20-routes
```

## Practice: deliver a reviewable change

[Core ideas](/en/core-principles) → [workflow](/en/ai-coding-workflow) → [alignment](/en/alignment-and-prototypes) → [specs and tickets](/en/specs-and-tickets) → [review and PR](/en/review-and-pr).

Deliverable: one small ticket, behaviour evidence and a review description. Done means another reader can explain the problem addressed, reproduce the outcome and identify unverified items without reconstructing requirements from your chat.

## Advanced: make the work transferable

[Context and handoff](/en/context-and-handoff) → [agent documents](/en/agent-documents) → [standards and checks](/en/standards-and-checks) → [states and boundaries](/en/state-and-module-boundaries) → [decisions and retrospectives](/en/decisions-and-retrospectives).

Deliverable: another session continues from the handoff, and one meaningful check is implemented. Done means the receiver locates the artifacts and the check rejects an intentionally introduced target error, then passes after its repair.

## Explanation: teach a completed change

[Writing to teach](/en/writing-to-teach) → [feedback and attribution](/en/feedback-and-attribution). Deliverable: a small lesson covering the problem, method, verification and sources for a change you completed.

Done means another reader attempts a fresh example and you check the answer and record misunderstandings. Revise the explanation from those results. Likes and compliments cannot establish that the learner can apply it.

## Let results show progress

The small-win, practice and review structure adapts Matt Pocock's [skills repository](https://github.com/mattpocock/skills), MIT; source file: `skills/productivity/teach/SKILL.md`.

```cards
- **Deliver first** Check the artifact against the route's completion criteria.
- **Return later** Close the answer and try a variation.
- **Change the context** Mix inputs and failure conditions to practise selecting a method.
```

The full licence appears below and on the [copyright page](/en/about-and-copyright). These route sequences are this site's design. They are not Matt's official learning path and promise no fixed completion time.

```note
kind: inference
Our suggestion: ask a person or another session to verify each completed segment. If you can only repeat the original example, return to the relevant lesson and change the input before adding more reading.
```

## Quick reference

```cards
- **Input gap** Choose foundations and demonstrate valid and invalid data.
- **Delivery gap** Choose practice; use advanced for broken handoffs.
- **Teaching goal** Choose explanation and assess answers to a fresh problem.
```

## Sources

- [Matt's free-learning invitation, 2022-09-05](https://x.com/mattpocockuk/status/1566739592249835520)
- Route links lead to this site's lessons; the MIT teaching source is identified above.

## skills MIT notice

The structure adapted here comes from [mattpocock/skills](https://github.com/mattpocock/skills), MIT licence, Copyright (c) 2026 Matt Pocock. Full text: [the repository LICENSE](https://github.com/mattpocock/skills/blob/main/LICENSE); this site's THIRD_PARTY_NOTICES keeps the same notice.

Unofficial, non-commercial study notes. No affiliation with or endorsement by Matt Pocock. Quoted works remain their authors’ copyright; MIT reuse retains its copyright and licence notices.
