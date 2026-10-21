---
slug: open-source-guide
number: 18
title: Open-source Guide
subtitle: Finding Open Source by the Problem You Have
section: repos
order: 18
summary: Choose a repository for a concrete problem, then check its scope and licence.
head: d18-repo-picker
updated: 2026-10-21
---

## Stars cannot choose for you

You have bookmarked repositories but still cannot pick a starting point. Name the problem first, then check purpose, maintenance status and licensing. This guide describes the snapshot collected on 2026-10-20. It makes no promise about today's status, installation compatibility or performance.

## Pick an entry by problem

Workflow navigation, type declarations, execution isolation and application evaluation are different needs. Each card identifies a starting point and a limit. Read the explanation and licence before deciding whether to try it.

```figure
id: d18-repo-picker
```

```quote
text: I built my own software factory, and I open-sourced it.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2049506712801935611
date: 2026-04-29
```

## Repository cards

```cards
- **skills** Problem: workflow navigation. Role: explore working methods. Read first: overview and LICENSE. Limit: adapt to the task. Licence: MIT. Site lesson: agent documents.
- **ts-reset** Problem: built-in declaration pitfalls. Role: adjust selected declarations. Read first: scope and LICENSE. Limit: no runtime input validation. Licence: MIT. Site lesson: TS foundations.
- **sandcastle** Problem: isolated agent execution. Role: explore execution boundaries. Read first: boundary documentation and LICENSE. Limit: check deployment conditions. Licence: MIT. Site lesson: implementation and feedback.
```

- [skills](https://github.com/mattpocock/skills) → [agent documents](/en/agent-documents)
- [ts-reset](https://github.com/mattpocock/ts-reset) → [TypeScript foundations](/en/typescript-foundations)
- [sandcastle](https://github.com/mattpocock/sandcastle) → [implementation and feedback](/en/implementation-and-feedback)

```cards
- **evalite** Problem: evaluating LLM applications. Role: organise evaluations. Read first: evaluation documentation and LICENSE. Limit: choose task-relevant measures. Licence: MIT. Site lesson: implementation and feedback.
- **xstate-catalogue** Problem: historical state-machine examples. Role: study modelling ideas. Read first: archive status and LICENSE. Limit: current APIs may differ. Licence: MIT; archived. Site lesson: states and boundaries.
```

- [evalite](https://github.com/mattpocock/evalite) → [implementation and feedback](/en/implementation-and-feedback)
- [xstate-catalogue](https://github.com/mattpocock/xstate-catalogue) → [states and module boundaries](/en/state-and-module-boundaries)

These entry points cannot substitute for one another. Changing declarations does not establish that unknown input is valid. Execution isolation cannot establish correct business behaviour. Explain which part of your original problem the chosen tool addresses.

Start with a problem card, read the repository overview, then inspect limits and licensing. If the documented purpose does not fit, choose another entry rather than expanding the task to accommodate a tool.

For evaluation, identify which outcomes you need to compare. For historical examples, identify the state relationship you want to study. Being able to open a repository does not yet establish a useful next action.

This guide offers navigation rather than installation or migration instructions. Before a trial, check your target environment and selected version, and record conditions still unverified. Snapshot information cannot guarantee current compatibility.

## Check permission before reuse

The roots of dictionary-of-ai-coding, course-video-manager and zod-fetch have no licence in the checked snapshot. This site interprets and links without copying entries, rules or code. A translator subdirectory's MIT licence does not license the entire repository.

```figure
id: d18-license-tree
```

ai-hero-cli has an MIT file with a placeholder copyright line and is a course-related tool. This edition takes no code or text from it. Tool licensing cannot grant permission for other material; workshop material and exercises are also excluded.

```note
kind: inference
Our suggestion: record suitability for study separately from permission to copy. Before reuse, check the specific file, licence scope and accurate copyright line, then register the proposed reuse.
```

## Exercise: choose two starting points

```exercise
title: Choose without looking at stars
- Need one: create standards navigation for an agent. Which repository comes first?
- Need two: compare an LLM application's results across tasks. Which comes first?
- For each: locate the licence and identify one condition still needing a check.
answer: Choose skills for navigation and evalite for evaluation. Check each root LICENSE. Then assess project fit for the former and task-relevant measures for the latter; MIT alone establishes no compatibility.
```

Done means you can explain both matches, locate the licences and name a limitation. Direct reuse is restricted to registered items. These five cards are our original guides.

## Quick reference

```cards
- **Choose** Match a problem to a purpose and retain its limits.
- **Check** Inspect file-level licensing and scope.
- **Reuse** Register permitted adaptations and retain notices.
```

## Sources

- [Matt on open-source work, 2026-04-29](https://x.com/mattpocockuk/status/2049506712801935611)
- The five repositories above are functional entry points; licence descriptions use the checked outline snapshot.
- [dictionary-of-ai-coding](https://github.com/mattpocock/dictionary-of-ai-coding)
- [course-video-manager](https://github.com/mattpocock/course-video-manager)
- [zod-fetch](https://github.com/mattpocock/zod-fetch)
- [ts-error-translator](https://github.com/mattpocock/ts-error-translator)
- [ai-hero-cli](https://github.com/mattpocock/ai-hero-cli)
- [Site reuse register and boundaries](/en/about-and-copyright)

Unofficial, non-commercial study notes. No affiliation with or endorsement by Matt Pocock. Quoted works remain their authors’ copyright; MIT reuse retains its copyright and licence notices.
