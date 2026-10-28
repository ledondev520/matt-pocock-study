---
slug: punch-lines
number: 3
title: Three Lines for Practice
subtitle: Three Lines to Put into Practice
section: punchlines
order: 3
summary: Give a memorable line a scope, a limit, and a practical next step.
head: s03-card-anatomy
updated: 2026-10-21
---

## A memorable line leaves work to do

Short lines travel well because they leave conditions unstated. Treating one as a universal instruction can turn a warning about maintenance into a contest over line counts. Each card below adds the missing context: meaning, problem, conditions, and a next action.

```figure
id: s03-card-anatomy
```

## Maintenance cost: speed leaves responsibility behind

```quote
text: Maintaining code is not cheap
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2050167042771194226
date: 2026-05-01
note: Meaning here: producing an implementation still leaves someone responsible for its upkeep.
```

Ask who will change the feature, investigate a failure, and update duplicated behavior. Cheap generation does not remove any of those jobs.

```cards
- **Problem** Estimating cost from generation speed while ignoring later changes.
- **Conditions** You are deciding whether a feature or implementation deserves to stay.
- **Next action** Find one unused feature or duplicate implementation and specify evidence for removing it safely.
```

## Code as a liability: prove the simplification

```quote
text: All code is debt.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2050173149170282674
date: 2026-05-01
note: Meaning here: an implementation brings possible future obligations.
```

A useful validation, a clear name, or a necessary abstraction also takes code. Return to [core ideas](/en/core-principles) and consider the cost of changing behavior alongside the amount of implementation.

```cards
- **Problem** Keeping every generated addition without assessing its value.
- **Conditions** Expected behavior is known and you can compare results before and after a change.
- **Next action** Simplify one duplicate branch and check both valid and exceptional paths.
```

## Growing skill: practice judgment

```quote
text: Your skill level acts as a ceiling for the agent
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2065499079283470810
date: 2026-06-12
note: Meaning here: your ability to judge the work affects what you can reliably achieve with an agent.
```

Read this as a personal judgment. It is not an experimental law or a verdict on anyone's potential. Ask a more useful question: can you read the change, investigate the failure, explain the states, and identify review risks?

```cards
- **Problem** Accepting completion claims you cannot evaluate.
- **Conditions** You need to judge whether an implementation and its evidence deserve confidence.
- **Next action** Choose reading, debugging, modeling, or review practice from the [learning paths](/en/learning-path).
```

## Exercise: where did the complexity go?

Imagine checkout code compressing membership, expiry, and refund eligibility into one nested expression. It has half as many lines, but a failure no longer tells the reader which condition mattered. Write a review response before opening the suggested answer.

```exercise
title: Ask for evidence of a simplification
- Task: identify which of the three lines could most easily be misused to justify the compression.
- Deliverable: recommend keeping or changing it, with one readability reason and one behavior check.
- Check: can another reader locate the refund branch for an expired membership?
answer: Treating code as a liability does not prove that compression helps. Name the relevant conditions and verify refund behavior for expired and active memberships. Compare understanding and change costs before deciding.
```

```note
kind: inference
Our recommendation: when a slogan supports a change, state its conditions and a possible counterexample.
```

Try a second counterexample: clear error messages add code but make a failure easier to investigate. Explain why that addition earns its place. If a slogan cannot settle the question, supply the missing context and tradeoff.

## What counts as done?

Your answer addresses readability, behavior, and maintenance cost. It also identifies a judgment the quotation cannot make for you. A shorter implementation alone does not explain how someone will maintain it.

## Quick reference

```cards
- **Maintenance cost** Delivery leaves future changes and investigations.
- **Code liability** Establish the benefit before reducing implementation.
- **Growing skill** Practice the part of the work you cannot yet verify.
```
## Sources

- [Matt Pocock · 2026-05-01](https://x.com/mattpocockuk/status/2050167042771194226)
- [Matt Pocock · 2026-05-01](https://x.com/mattpocockuk/status/2050173149170282674)
- [Matt Pocock · 2026-06-12](https://x.com/mattpocockuk/status/2065499079283470810)
