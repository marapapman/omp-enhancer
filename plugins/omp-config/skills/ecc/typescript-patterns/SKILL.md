---
name: typescript-patterns
description: Review and implement TypeScript with sound runtime boundaries, precise domain types, safe async behavior, and maintainable module contracts. Use for `.ts`, `.tsx`, declaration files, or TypeScript configuration changes.
---

# TypeScript Patterns

Bind recommendations to the repository's TypeScript version, `tsconfig`, runtime, module system, and framework conventions.

## Review Order

1. Parse untrusted JSON, environment values, DOM data, database rows, and API responses at runtime. Type annotations and assertions do not validate data.
2. Prefer discriminated unions, exhaustive `never` checks, branded identifiers, and narrow generics over boolean flag combinations or unconstrained strings.
3. Avoid `any`, double assertions, broad index signatures, non-null assertions, and type predicates that lack corresponding runtime checks.
4. Preserve optional versus nullable semantics and compiler options such as strict null checks, exact optional properties, and unchecked indexed access.
5. Trace promises, cancellation, retries, event listeners, and concurrent mutation. Await or intentionally detach every promise and surface failures with context.
6. Maintain ESM/CommonJS, package export, declaration, and build-target compatibility. Check emitted behavior when types erase or transpilation changes syntax.
7. Exercise public behavior with the repository's actual typecheck, test, and build commands when authorized. Add negative type fixtures only when the project has a stable convention for them.

Report the runtime input or caller that exposes each issue. Do not substitute broad type rewrites for a bounded fix.
