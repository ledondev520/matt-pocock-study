---
slug: alignment-and-prototypes
number: 5
title: Alignment and Prototypes
subtitle: Align First, Then Prototype
section: workflow
order: 5
summary: Separate facts, decisions, and experience questions to agree on observable behavior.
head: d05-alignment-flow
updated: 2026-10-21
---

## “Make it easier to use” leaves choices open

Someone finds the search results awkward. You might add highlighting, filters, sorting, or a new layout, but those changes solve different problems. Implementing immediately turns a guess into code, tests, and rework.

Establish who is searching, what they need to find, and where they get stuck. Define what would count as an improvement before comparing solutions.

## Restate the goal and assign the questions

Briefly describe the user, goal, and success condition so the requester can correct your understanding. Inspect the code and documentation for facts such as available response fields or existing components. Those are investigation tasks you can do yourself.

```quote
text: Restate my intent before continuing
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2105628270930845990
date: 2026-10-01
```

## Ask for decisions in manageable rounds

Suppose the default sort depends on whether the old sorting behavior must remain available. Resolve that prerequisite first. Offer a recommended option with its reason, and explain when an alternative fits. Keep each round focused on choices that can currently be made.

Skip this round for a small, clear change. Ask people for tradeoffs that affect behavior or scope, after investigating the facts available to you.

## Prototype questions about experience

Density and interaction flow are difficult to judge from a verbal description alone. Build inexpensive alternatives and ask someone to perform the same task in each.

Record what the person chose, why, and what remains undecided. An agent's preference does not establish agreement. A prototype supplies learning material; it still needs work before it becomes a deliverable.

```figure
id: d05-alignment-flow
```

## Exercise: sort the search-page questions

Classify each question below and identify who should answer it. Explain why a question about splitting the interface across pages might require an actual prototype before anyone can make a useful choice.

```figure
id: s05-three-questions
```

<!-- compare -->
| Question type | Our example | Who answers? |
|---|---|---|
| Fact | Does the response include tags? | The agent inspects the interface and code |
| Tradeoff | Default to relevance or date? | The user decides, with a reasoned recommendation |
| Experience | Do filters crowd the results? | A person tries prototypes and chooses |

```exercise
title: Turn a vague search request into agreed behavior
- Task: give a next action for each question without claiming approval in advance.
- Deliverable: one goal, one unresolved tradeoff, and one prototype comparison task.
- Acceptance: describe what happens after selecting a filter and list remaining questions.
answer: Inspect the tag field; recommend relevance sorting with a reason; compare a sidebar with collapsible filters. After confirmation, record how selected filters appear, clear, and update results.
```

```note
kind: inference
Our recommendation: compare prototypes using the same search task, recording observations separately from preferences. This helps explain a choice but does not establish a general usability result.
```

## What counts as done?

Another collaborator can distinguish confirmed behavior, factual evidence, and open questions. Human choices have recorded reasons. If an unresolved issue could change the central behavior, keep it visibly unresolved.

Take confirmed results into [specs and tickets](/en/specs-and-tickets) so the next session can continue the work.

## Quick reference

```cards
- **Investigate facts** Read the code and references first.
- **Ask for tradeoffs** Recommend with reasons and let the person decide.
- **Try the experience** Record prototype choices before updating the spec.
```

## Sources

- [Matt Pocock · 2026-10-01](https://x.com/mattpocockuk/status/2105628270930845990)
- [Public discussion](https://www.aihero.dev/things-people-get-wrong-with-grill-me-and-grill-with-docs)

Independent, unofficial, noncommercial study notes. This site has no affiliation with or endorsement from Matt Pocock. Referenced works belong to their authors; MIT reuse carries separate copyright and license notices.
