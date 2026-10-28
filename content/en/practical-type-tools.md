---
slug: practical-type-tools
number: 14
title: Practical type tools
subtitle: Learning Type Tools through Real Problems
section: typescript
order: 14
summary: Choose a type tool for a concrete mistake and explain what it leaves unresolved.
head: d14-tool-picker
updated: 2026-10-21
---

## Two strings, one unnoticed mistake

A notification function expects a user ID, but its caller supplies an order ID. Both are declared as `string`, so the compiler has no distinction to enforce. Begin with that concrete confusion before choosing a tool.

Two other problems need different information: a configuration loses its literal values, or key handling omits symbols. Domain identity, precise values and key coverage are separate needs. Each tool has a boundary.

```figure
id: d14-tool-picker
```

## Brands preserve domain identity

A branded type adds a static distinction to an existing type, making user and order IDs incompatible. The marker below exists only in the type system. A trusted constructor grants the brand after validation instead of scattering assertions through callers.

```figure
id: s14-brand
```

```ts
declare const idKind: unique symbol;
type UserId = string & { readonly [idKind]: "user" };
type OrderId = string & { readonly [idKind]: "order" };
function userId(value: string): UserId {
  if (!/^usr_[0-9]+$/.test(value)) {
    throw new Error("Invalid user ID");
  }
  return value as UserId;
}
function notificationTarget(id: UserId): string {
  return `/users/${id}`;
}
notificationTarget(userId("usr_8"));
```

This constructor checks our chosen format. It establishes neither user existence nor permission to access the user. Network input still needs validation before branding, and an intentional assertion can bypass the static distinction.

## Preserve literal information with as const

A mutable configuration array may widen to `string[]`, losing its exact options. `as const` retains the literals so the array can supply a precise mode union.

```ts
const modes = ["quiet", "loud"] as const;
type Mode = (typeof modes)[number];
const current: Mode = "quiet";
```

Type-level readonly restricts changes made through that type. It does not freeze the object at runtime. Choose a separate mechanism if runtime freezing is needed, and understand how deeply it applies.

## PropertyKey describes the key space

A key can be a string, number or symbol. `PropertyKey` expresses that range, but the operation and runtime determine how keys are enumerated, converted or stored.

```quote
text: It represents any valid key in JavaScript: string, number or symbol.
author: Matt Pocock
url: https://x.com/mattpocockuk/status/1830935305639145678
date: 2024-09-03
```

```ts
const marker = Symbol("marker");
const labels: Record<PropertyKey, string> = {};
labels[marker] = "hidden from Object.keys";
labels[7] = "shelf";
const visible = Object.keys(labels); // ["7"]
const all = Reflect.ownKeys(labels); // ["7", marker]
```

On this object, a numeric property name becomes a string. `Object.keys` omits symbols; `Reflect.ownKeys` includes own symbol keys and non-enumerable keys. A type that permits a key does not establish that every API will preserve it.

## Exercise: choose the tool and name the gap

```note
kind: tip
Our original code was checked with TypeScript 5.7.3, strict mode and ES2022, with valid and invalid runtime inputs. Expected type errors were checked separately.
```

```exercise
title: Three mistakes and three boundaries
- A: An order ID reaches a user-notification function. B: A mode configuration widens to string[]. C: Object enumeration misses a symbol.
- Task: Choose a tool for each, name what remains unresolved and write a small example to check your prediction.
answer: A needs brands for domain identity, plus input and permission validation. B needs as const for precise values, with runtime freezing handled separately. C needs PropertyKey to describe the range and an appropriate enumeration API. A type change alone does not make Object.keys return symbols.
```

```note
kind: inference
Our suggestion: accompany a new type tool with a counterexample to a guarantee it does not make. Future maintainers can then see where the type contract ends and business validation begins.
```

## Done means you can demonstrate the distinction

Run your examples. Show the compiler rejecting the wrong branded ID, a mode union retaining its options, and the different enumeration results. Explain why input validation and runtime freezing still require separate decisions.

Continue with [state and module boundaries](/en/state-and-module-boundaries) to place these constraints in a larger design.

## Quick reference

```cards
- **Brands** Distinguish domain identities; validate external values separately.
- **as const** Retain literal and readonly information without freezing runtime objects.
- **PropertyKey** Describe three key types, then check the actual API behaviour.
```

## Sources

- Matt Pocock, [PropertyKey](https://x.com/mattpocockuk/status/1830935305639145678), 2024-09-03.
- Matt Pocock, [branded types](https://x.com/mattpocockuk/status/1625173884885401600), 2023-02-13; concept reference only.
- Matt Pocock, [as const](https://x.com/mattpocockuk/status/1623262073244250112), 2023-02-09; concept reference only.
