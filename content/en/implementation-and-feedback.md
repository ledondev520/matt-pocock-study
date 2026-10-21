---
slug: implementation-and-feedback
number: 7
title: Implementation and Feedback
subtitle: Letting Agents Verify Their Work
section: workflow
order: 7
summary: Use repeatable failure and passing evidence to decide whether a change is complete.
head: d07-feedback-loop
updated: 2026-10-21
---

## The agent says the form is finished

The code changed, but nobody started the application. Your first submission reveals that a missing service address still produces a success message. A useful execution environment makes that failure visible while the work is happening.

```figure
id: s07-done-vs-run
```

## Establish an expectation before implementing

Start with a bounded ticket. Reproduce the failure, or define an observable expectation for new behavior. Implement, run relevant checks, repair failures, and rerun. Keep evidence of the resulting behavior.

HITL means a person participates in key decisions. AFK means the agent proceeds independently once task boundaries and feedback are sufficiently clear. Keep a person involved when goals, scope, or acceptance still require judgment.

```quote
text: Fix the environment your agent runs in
author: Matt Pocock
url: https://x.com/mattpocockuk/status/2105740664973775163
date: 2026-10-01
```

## Match each check to a question

A TypeScript project may need type checking, relevant tests, formatting, and lint. Interactive behavior also needs an operable development server, readable logs, or a smoke-test CLI. Choose feedback that addresses the actual risks.

<!-- compare -->
| Question | Useful feedback | Remaining concern |
|---|---|---|
| Do type relationships hold? | Type checking | External data and runtime behavior |
| Does key behavior meet expectations? | Relevant tests and a smoke CLI | Exceptional paths |
| Does the interface respond correctly? | Development server and readable logs | Results of real interaction |
| Are format and conventions satisfied? | Formatting checks and lint | Design decisions requiring context |

## A check must detect a meaningful mistake

A test that repeats implementation logic may reproduce the same mistake. State the bad behavior that should fail, then establish whether the check catches it. If a design boundary can prevent that class of error, improve the boundary too.

Keep the necessary behavior checks to confirm what users observe. A passing result supports the properties it actually examines; other risks still require judgment.

```figure
id: d07-feedback-loop
```

## Start automation with one low-risk task

Observe evidence and rework from a small task before expanding automation. Ralph loops offer historical context, and Sandcastle offers a tool entry point. Neither establishes that unattended releases are reliable.

```figure
id: s07-hitl-afk
```

```note
kind: inference
Our recommendation: before expanding, check whether failures were visible, results were reviewable, and human intervention was still needed. Narrow the task when its boundaries remain unclear.
```

## Exercise: record three stages of evidence

Predict what the interface and logs should show when the service address is missing. Arrange a failing run and a run after the repair using the same input. A final screenshot alone leaves the original defect untested.

```figure
id: s07-evidence
```

```exercise
title: Reproduce false success and verify the repair
- Failure evidence: remove the service address in a test environment, submit the form, and record the incorrect confirmation.
- Repair: return an explicit failure for invalid configuration, preserve input, and permit retrying.
- Passing evidence: show an error under the same conditions, then restore configuration and record a real successful submission.
- Repeatability: document startup, configuration conditions, input, and expected output without recording credentials.
answer: Use the same input and state each run's configuration. Demonstrate both the absence of false success and a working valid path. Logs help locate the fault; interface results establish what the user sees.
```

## What counts as done?

A collaborator can repeat the runs and decide whether they passed. Failure evidence, repair, and passing evidence correspond to the same behavior. Record any unrun checks as verification gaps before moving into [review and PR](/en/review-and-pr).

## Quick reference

```cards
- **Set an expectation** Reproduce a defect or define observable new behavior.
- **Use meaningful checks** Catch real mistakes and preserve valid paths.
- **Deliver evidence** Make runs repeatable and results decidable before expanding automation.
```

## Sources

- [Matt Pocock · 2026-10-01](https://x.com/mattpocockuk/status/2105740664973775163)
- [Feedback loops](https://www.aihero.dev/essential-ai-coding-feedback-loops-for-type-script-projects)
- [Ralph](https://x.com/mattpocockuk/status/2009276031622918474)

Independent, unofficial, noncommercial study notes. This site has no affiliation with or endorsement from Matt Pocock. Referenced works belong to their authors; MIT reuse carries separate copyright and license notices.
