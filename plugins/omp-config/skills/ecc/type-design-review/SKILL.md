---
name: type-design-review
description: Review data types, schemas, public interfaces, and state machines for explicit invariants, illegal states, compatibility, and safe boundary parsing. Use for API/type redesigns and schema-heavy code reviews.
---

# Type Design Review

Review types as behavioral contracts, not as cosmetic annotations.

## Procedure

1. List the domain states, transitions, invariants, trust boundaries, and compatibility obligations the type must express.
2. Identify illegal or ambiguous states currently representable: contradictory flags, partially initialized records, unvalidated strings, sentinel values, and nullable combinations.
3. Prefer the smallest representation that makes valid construction obvious: tagged unions, constrained value objects, opaque identifiers, explicit units, or separate input and validated forms.
4. Keep parsing and validation at external boundaries. Do not use type assertions, casts, or unchecked deserialization to claim runtime safety.
5. Review variance, mutability, equality, hashing, serialization, defaulting, and ownership semantics where the language exposes them.
6. Evaluate migration cost for callers, stored data, wire formats, generated clients, and public APIs. Require an explicit compatibility plan before breaking a contract.
7. Test construction, transition, serialization, malformed input, and backward-compatibility cases through public behavior.

Return concrete examples of the invalid state or unsafe transition. Do not recommend a larger type hierarchy unless it eliminates a demonstrated risk.
