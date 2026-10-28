---
slug: decisions-and-retrospectives
number: 12
title: Decisions & retrospectives
subtitle: Recording Decisions and Improving the Environment
section: agent-rules
order: 12
summary: Keep durable reasoning and use session evidence to propose a small environmental improvement.
head: d12-retro-flow
updated: 2026-10-21
---

## Why are we debating the same choice again?

A fresh session finds a cache but no explanation for its five-minute lifetime. It changes the lifetime to a day, and an old problem returns. Code reveals the implemented choice; the constraints behind it may be missing.

Other costs live outside the code: following obsolete instructions, searching the wrong documents and repeating manual checks. This lesson preserves durable reasoning and turns session evidence into one testable environmental improvement.

```quote
text: Code is the materialized view of all the decisions made
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2107560148243812772
date: 2026-10-06
```

## Use an ADR for a decision that still needs explaining

Record context, choice, rationale, consequences and status in an architecture decision record. Manage temporary execution steps separately. When a decision changes, identify its replacement so a reader can distinguish historical reasoning from the current agreement.

```figure
id: s12-adr-fields
```

```cards
- **Context and choice** What constraints mattered, and what was selected?
- **Rationale and consequences** What alternative was set aside, and what cost was accepted?
- **Status** Is this current, undecided or superseded by a named record?
```

Use the team's review and change process to maintain it; another person's committing habits are not a requirement. Update durable reasoning separately from current task progress.

## Start a retrospective with observed evidence

`/retro` examines real sessions and review feedback: slow document discovery, stale references, missing tools and missing checks. Successful delivery can still contain expensive detours, so inspect successful sessions too.

```figure
id: d12-retro-flow
```

Connect each observation to a minimal improvement and a way to verify it. A person confirms the change before it becomes policy. Prefer repairing navigation or a definite check when that addresses the evidence.

## A glossary needs an active checking step

A business term may name different things for different readers. Record its meaning, confusing alternatives and relationships. Then check a ticket or report against those entries. A general request for consistent language gives no observable result by itself.

Matt withdrew one experiment with a passive style instruction. That does not establish that all writing requirements fail. Identify a real ambiguity, name the terms to check and compare how readers understand the revised text.

## Exercise: produce a record and a proposal

```exercise
title: Explain the cache and repair the route to its documentation
- Fictional site example: a session read an obsolete interface guide; two failed runs preceded discovery of the current guide.
- Confirmed decision: status may lag by at most five minutes, so cache for five minutes and accept more requests.
- Task: Write a five-field ADR, then propose one retrospective improvement and its verification.
answer: Record the latency constraint, five-minute choice, rationale, request cost and current status. Propose redirecting the status-interface pointer after human confirmation and marking the old guide superseded. Ask a fresh session to locate the interface and observe whether it reaches the current guide directly.
```

```note
kind: inference
Our suggestion: change one evidenced obstacle, then observe a similar task. Define a shorter route as locating the current reference; a shorter conversation alone does not establish improvement.
```

## Done means both outputs can be assessed

The ADR explains an accepted cost and identifies its status and replacement, if any. The proposal points to session evidence, a minimal change, a confirming person and a verification action. An unapproved proposal remains a proposal.

For a lasting rule, use [standards and checks](/en/standards-and-checks) to choose where it should run.

## Quick reference

```cards
- **ADR** Keep durable context, choice, rationale, consequences and status.
- **Retrospective** Evidence → minimal improvement → verification → human confirmation.
- **Glossary** Define the language and check real documents against it.
```

## Sources

- Matt Pocock, [code and decisions](https://x.com/mattpocockuk/status/2107560148243812772), 2026-10-06.
- Matt Pocock, [retro prompt](https://x.com/mattpocockuk/status/2105951409887949107), 2026-10-02; independently interpreted.
- Matt Pocock, [withdrawn style experiment](https://x.com/mattpocockuk/status/2085681281795232026), 2026-08-07; independently interpreted.
