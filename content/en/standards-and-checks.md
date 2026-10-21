---
slug: standards-and-checks
number: 11
title: Standards & checks
subtitle: Making Rules Enforceable
section: agent-rules
order: 11
summary: Automate rules with definite answers and reserve judgement for review.
head: d11-rule-loop
updated: 2026-10-21
---

## The reminder is there. The mistake keeps returning.

Review finds another import from a domain module into a UI component. Last time, someone added “watch import direction” to the instructions. A person still has to catch the same mistake. First decide whether the rule has a mechanically checkable answer.

Natural-language reminders spend judgement on a repeatable fact. Other questions, such as whether an abstraction earns its complexity, depend on context and need a reasoned review.

```figure
id: s11-two-kinds
```

## Make definite failures actionable

Use lint, hooks, types or CI for rules such as dependency direction and required fields. Pick a tool that covers the actual risk. Its failure output should identify the location, rule, reason and route to a fix.

```quote
text: IMO a deterministic rule should be enforced deterministically
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2111735524390027405
date: 2026-10-18
```

Try one forbidden input and one permitted input. A tool finishing successfully does not establish that it inspected the intended files. Observe both a correct rejection and a legitimate pass.

## Write standards around target behaviour

Use CODING_STANDARDS.md for conventions learned from actual failures. Make the heading state the required behaviour, explain why, and identify rules already enforced by tools. AGENTS.md provides the navigation to this material.

```figure
id: d11-rule-loop
```

Keep context-dependent rules in review with their rationale. Moving more standards to review is one of Matt's ways to reduce implementation-time instruction load. Necessary task constraints, authority boundaries and platform requirements must still be available when needed.

```note
kind: inference
Our suggestion: compare rework over a period before judging the placement effective. Fewer instructions alone prove little. If the same problems are discovered later, reconsider when the rule runs.
```

## A threshold does not define a module

Matt's personal examples include a 5,000-token file threshold, estimating tokens with bytes divided by four, and keeping a hook under three seconds. These are working parameters, not universal project limits.

A byte estimate is not a tokenizer measurement. Chinese text needs separate measurement. A file is not necessarily a module either: preserve coherent responsibilities and interfaces when splitting code instead of fragmenting a concept to satisfy a number.

## Exercise: make a failure point toward a fix

```figure
id: s11-error-message
```

```exercise
title: Turn “watch import direction” into a check
- Our scenario: src/domain may not import src/ui. Dependencies in the opposite direction are permitted.
- Task: Define coverage, a forbidden import, a permitted import and the failure message.
- Forbidden: src/domain/price.ts imports src/ui/PriceTag.
- Permitted: src/ui/PriceTag.ts imports src/domain/price.
answer: Inspect actual domain dependencies and resolve aliases before checking whether their destinations are in ui. Report the source file and import path, explain domain independence, and suggest moving a shared contract somewhere both sides may depend on.
```

## Done means the check distinguishes the cases

Run the forbidden example and observe a nonzero exit with a useful diagnostic. The permitted example should exit successfully. Check coverage and path aliases so an alternative spelling cannot bypass the boundary.

Use [decisions and retrospectives](/en/decisions-and-retrospectives) to assess the result before expanding coverage.

## Quick reference

```cards
- **Definite facts** Enforce with tools and explain how to repair failures.
- **Contextual choices** Review them with a stated rationale.
- **Effectiveness** Observe both correct rejection and legitimate passage.
```

## Sources

- Matt Pocock, [deterministic enforcement](https://x.com/mattpocockuk/status/2111735524390027405), 2026-10-18.
- Matt Pocock, [a file-size threshold example](https://x.com/mattpocockuk/status/2111708560715292675), 2026-10-18; independently interpreted.
- The check scenario, diagnostic and exercise are ours. [Copyright details](/en/about-and-copyright).

Unofficial, non-commercial study notes, with no affiliation with or endorsement by Matt Pocock. Quoted works belong to their authors; MIT reuse carries separate copyright and licence notices.
