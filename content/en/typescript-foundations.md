---
slug: typescript-foundations
number: 13
title: TypeScript foundations
subtitle: Expressing What You Know with Types
section: typescript
order: 13
summary: Validate unfamiliar data, then preserve what you have learned through types.
head: s13-unknown
updated: 2026-10-21
---

## The error disappeared. Can you trust the data?

An API returns `{ "seats": "many" }`, but the application expects a seat count. An `any` annotation or assertion quiets the editor while leaving the runtime problem intact. A passing type check cannot establish the shape of external input.

Predict what asserting `{ seats: number }` does to a string value. It does not convert it. This lesson checks a value at the boundary, then preserves the information established there.

```figure
id: s13-unknown
```

## Narrow unknown with actual checks

`unknown` means the value has not been established yet. Check existence, shape and field constraints before reading properties or calculating. This example accepts only a nonnegative integer count and explicitly rejects other inputs.

```ts
function readSeats(value: unknown): number {
  if (typeof value !== "object" || value === null) {
    throw new Error("Expected an object");
  }
  if (!("seats" in value)) {
    throw new Error("Missing seats");
  }
  const seats = value.seats;
  if (typeof seats !== "number" ||
      !Number.isInteger(seats) || seats < 0) {
    throw new Error("Invalid seat count");
  }
  return seats;
}
```

These checks establish only the conditions they examine. They say nothing about account permissions or changing inventory, and do not repair input. A larger response may need another runtime validation approach with an equally explicit acceptance policy.

## Use a generic to retain a relationship

An identity function can accept text or numbers but lose the particular input type if its return annotation is a union. A generic expresses that the output keeps the input's type without requiring a separate implementation for each type.

```figure
id: s13-generic
```

```ts
function echoWide(value: string | number): string | number {
  return value;
}
function echo<T>(value: T): T {
  return value;
}
const wide = echoWide(12); // string | number
const precise = echo(12); // 12
```

```quote
text: If you don't know generics, I promise you'll understand them by the end of this thread.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/1625838626742435842
date: 2023-02-15
```

## Read the error as three plain statements

Identify the expected type, the actual type and the layer where they disagree. Then reduce the case. Passing `wide` to a number-only function fails because its declared type still includes text: the return declaration lost the relationship.

```figure
id: d13-error-read
```

## ts-reset changes declarations

In the collected version, ts-reset adjusts selected built-in declarations, including treating JSON parsing results as unknown so callers must check them. It provides no runtime input validation. Assess project compatibility and the effect of global declarations before adoption.

```note
kind: inference
Our suggestion: understand a declaration change in a small setting before adopting a tool. Our examples work without ts-reset; rejection of invalid data remains a runtime responsibility.
```

```note
kind: tip
Our original code was checked with TypeScript 5.7.3, strict mode and ES2022, with valid and invalid runtime inputs. Expected type errors were checked separately.
```

```exercise
title: Predict the boundary before running it
- Task: Predict readSeats for { seats: 3 }, { seats: "3" } and null. Run the cases and compare.
- Explain why echoWide's result cannot immediately be used as number, and which layer you would change.
answer: Only the first input returns 3; the others throw. echoWide's declaration permits text. If the contract is to return the input unchanged, use a generic to retain that relationship, or narrow at the caller. An assertion alone establishes no numeric condition.
```

## Done means you can explain and demonstrate the boundary

Explain what an assertion has not validated. Predict and run valid and invalid inputs, then describe a type mismatch in ordinary language. Identify the relationship a generic preserves. Continue with [practical type tools](/en/practical-type-tools).

## Quick reference

```cards
- **unknown** Check the value before relying on its shape.
- **Generics** Preserve a type relationship between inputs and outputs.
- **Errors** Identify expected, actual and location; reduce the case before fixing it.
```

## Sources

- Matt Pocock, [an introduction to generics](https://x.com/mattpocockuk/status/1625838626742435842), 2023-02-15.
- [ts-reset repository](https://github.com/mattpocock/ts-reset), independently interpreted from the collected version; no code reused.
- The code, response data and exercise are ours. [Copyright details](/en/about-and-copyright).

Unofficial, non-commercial study notes, with no affiliation with or endorsement by Matt Pocock. Quoted works belong to their authors; MIT reuse carries separate copyright and licence notices.
