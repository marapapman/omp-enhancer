---
name: angular-developer
description: Use for Angular-specific code or architectural guidance covering projects, components, services, reactivity, forms, dependency injection, routing, SSR, accessibility, animations, styling, testing, or CLI tooling.
origin: ECC
---

# Angular Developer Guidelines

## Linked resource boundary

This loaded Skill may reveal only its own exact linked resource URIs. Select the
smallest task-relevant references from the lists below, copy their exact URIs
unchanged into one remaining linked-resource batch, and wait for them before
continuing:

`RESOURCE EXTENSION | source=skill://ecc-skill-catalog/angular-developer/SKILL.md | reads=<only-needed-exact-URIs-listed-below>`

Relative paths are labels from the upstream source, not load instructions. This
Skill does not traverse them or select another Skill.

## Execution and effect boundary

Examples below are reference commands, not permission to execute them. Every
external effect requires explicit user authorization for the exact target and
effect plus current native permission. Project scaffolding, dependency download
or installation, network access, source writes, and build or test execution are
distinct effects. Inspecting the local Angular version does not authorize any of
them.

## When to Activate

- Working in any Angular project or codebase
- Creating or scaffolding a new Angular project, application, or library
- Generating components, services, directives, pipes, guards, or resolvers
- Implementing reactivity with Angular Signals, `linkedSignal`, or `resource`
- Working with Angular forms (signal forms, reactive forms, or template-driven)
- Setting up dependency injection, routing, lazy loading, or route guards
- Adding accessibility (ARIA), animations, or component styling
- Writing or debugging Angular-specific tests (unit, component harness, E2E)
- Configuring Angular CLI tooling or the Angular MCP server

1. Always analyze the project's Angular version before providing guidance, as best practices and available features can vary significantly between versions. If creating a new project with Angular CLI, do not specify a version unless prompted by the user.

2. When generating code, follow Angular's style guide and best practices for maintainability and performance. Use the Angular CLI for scaffolding components, services, directives, pipes, and routes to ensure consistency.

3. When the current task authorizes code changes and native execution is
   available, use the project's focused checks and proportionate `ng build`
   evidence. Report failures; do not start an automatic repair loop.

## Creating New Projects

If no guidelines are provided by the user, use these defaults when creating a new Angular project:

1. Use the latest stable version of Angular unless the user specifies otherwise.
2. Prefer Signal Forms for new projects only when the target Angular version supports them. Find out more: `skill://ecc-skill-catalog/angular-developer/references/signal-forms.md`.

**Command selection reference for `ng new`:**
When the authorized task is to create a new Angular project, determine a proposed
command with these checks; execution still follows the effect boundary above:

**Step 1: Check for an explicit user version.**

- **IF** the user requests a specific version (e.g., Angular 15), propose the
  pinned `npx` form only when its package download is also authorized.
- **Command:** `npx @angular/cli@<requested_version> new <project-name>`

**Step 2: Check for an existing Angular installation.**

- **IF** no specific version is requested, run `ng version` in the terminal to check if the Angular CLI is already installed on the system.
- **IF** the command succeeds and returns an installed version, use the local/global installation directly.
- **Command:** `ng new <project-name>`

**Step 3: Fallback to Latest.**

- **IF** no specific version is requested AND `ng version` fails, do not fall
  back to `npx` automatically. Ask for the separate package-download and network
  effect or return the pinned command as a non-executed option.
- **Command:** `npx @angular/cli@latest new <project-name>`

## Components

When working with Angular components, consult the following references based on the task:

- **Fundamentals**: Anatomy, metadata, core concepts, and template control flow (@if, @for, @switch). Read components.md: `skill://ecc-skill-catalog/angular-developer/references/components.md`
- **Inputs**: Signal-based inputs, transforms, and model inputs. Read inputs.md: `skill://ecc-skill-catalog/angular-developer/references/inputs.md`
- **Outputs**: Signal-based outputs and custom event best practices. Read outputs.md: `skill://ecc-skill-catalog/angular-developer/references/outputs.md`
- **Host Elements**: Host bindings and attribute injection. Read host-elements.md: `skill://ecc-skill-catalog/angular-developer/references/host-elements.md`

If you require deeper documentation not found in the references above, read the documentation at `https://angular.dev/guide/components`.

## Reactivity and Data Management

When managing state and data reactivity, use Angular Signals and consult the following references:

- **Signals Overview**: Core signal concepts (`signal`, `computed`), reactive contexts, and `untracked`. Read signals-overview.md: `skill://ecc-skill-catalog/angular-developer/references/signals-overview.md`
- **Dependent State (`linkedSignal`)**: Creating writable state linked to source signals. Read linked-signal.md: `skill://ecc-skill-catalog/angular-developer/references/linked-signal.md`
- **Async Reactivity (`resource`)**: Fetching asynchronous data directly into signal state. Read resource.md: `skill://ecc-skill-catalog/angular-developer/references/resource.md`
- **Side Effects (`effect`)**: Logging, third-party DOM manipulation (`afterRenderEffect`), and when NOT to use effects. Read effects.md: `skill://ecc-skill-catalog/angular-developer/references/effects.md`

## Forms

In most cases for new apps, **prefer signal forms**. When making a forms decision, analyze the project and consider the following guidelines:

- If the application version supports Signal Forms and this is a new form, **prefer signal forms**.
- For older applications or existing forms, match the application's current form strategy.

- **Signal Forms**: Use signals for form state management. Read signal-forms.md: `skill://ecc-skill-catalog/angular-developer/references/signal-forms.md`
- **Template-driven forms**: Use for simple forms. Read template-driven-forms.md: `skill://ecc-skill-catalog/angular-developer/references/template-driven-forms.md`
- **Reactive forms**: Use for complex forms. Read reactive-forms.md: `skill://ecc-skill-catalog/angular-developer/references/reactive-forms.md`

## Dependency Injection

When implementing dependency injection in Angular, follow these guidelines:

- **Fundamentals**: Overview of Dependency Injection, services, and the `inject()` function. Read di-fundamentals.md: `skill://ecc-skill-catalog/angular-developer/references/di-fundamentals.md`
- **Creating and Using Services**: Creating services, the `providedIn: 'root'` option, and injecting into components or other services. Read creating-services.md: `skill://ecc-skill-catalog/angular-developer/references/creating-services.md`
- **Defining Dependency Providers**: Automatic vs manual provision, `InjectionToken`, `useClass`, `useValue`, `useFactory`, and scopes. Read defining-providers.md: `skill://ecc-skill-catalog/angular-developer/references/defining-providers.md`
- **Injection Context**: Where `inject()` is allowed, `runInInjectionContext`, and `assertInInjectionContext`. Read injection-context.md: `skill://ecc-skill-catalog/angular-developer/references/injection-context.md`
- **Hierarchical Injectors**: The `EnvironmentInjector` vs `ElementInjector`, resolution rules, modifiers (`optional`, `skipSelf`), and `providers` vs `viewProviders`. Read hierarchical-injectors.md: `skill://ecc-skill-catalog/angular-developer/references/hierarchical-injectors.md`

## Angular Aria

When building accessible custom components for any of the following patterns: Accordion, Listbox, Combobox, Menu, Tabs, Toolbar, Tree, Grid, consult the following reference:

- **Angular Aria Components**: Building headless, accessible components (Accordion, Listbox, Combobox, Menu, Tabs, Toolbar, Tree, Grid) and styling ARIA attributes. Read angular-aria.md: `skill://ecc-skill-catalog/angular-developer/references/angular-aria.md`

## Routing

When implementing navigation in Angular, consult the following references:

- **Define Routes**: URL paths, static vs dynamic segments, wildcards, and redirects. Read define-routes.md: `skill://ecc-skill-catalog/angular-developer/references/define-routes.md`
- **Route Loading Strategies**: Eager vs lazy loading, and context-aware loading. Read loading-strategies.md: `skill://ecc-skill-catalog/angular-developer/references/loading-strategies.md`
- **Show Routes with Outlets**: Using `<router-outlet>`, nested outlets, and named outlets. Read show-routes-with-outlets.md: `skill://ecc-skill-catalog/angular-developer/references/show-routes-with-outlets.md`
- **Navigate to Routes**: Declarative navigation with `RouterLink` and programmatic navigation with `Router`. Read navigate-to-routes.md: `skill://ecc-skill-catalog/angular-developer/references/navigate-to-routes.md`
- **Control Route Access with Guards**: Implementing `CanActivate`, `CanMatch`, and other guards for security. Read route-guards.md: `skill://ecc-skill-catalog/angular-developer/references/route-guards.md`
- **Data Resolvers**: Pre-fetching data before route activation with `ResolveFn`. Read data-resolvers.md: `skill://ecc-skill-catalog/angular-developer/references/data-resolvers.md`
- **Router Lifecycle and Events**: Chronological order of navigation events and debugging. Read router-lifecycle.md: `skill://ecc-skill-catalog/angular-developer/references/router-lifecycle.md`
- **Rendering Strategies**: CSR, SSG (Prerendering), and SSR with hydration. Read rendering-strategies.md: `skill://ecc-skill-catalog/angular-developer/references/rendering-strategies.md`
- **Route Transition Animations**: Enabling and customizing the View Transitions API. Read route-animations.md: `skill://ecc-skill-catalog/angular-developer/references/route-animations.md`

If you require deeper documentation or more context, visit the [official Angular Routing guide](https://angular.dev/guide/routing).

## Styling and Animations

When implementing styling and animations in Angular, consult the following references:

- **Using Tailwind CSS with Angular**: Integrating Tailwind CSS into Angular projects. Read tailwind-css.md: `skill://ecc-skill-catalog/angular-developer/references/tailwind-css.md`
- **Angular Animations**: Using native CSS (recommended) or the legacy DSL for dynamic effects. Read angular-animations.md: `skill://ecc-skill-catalog/angular-developer/references/angular-animations.md`
- **Styling components**: Best practices for component styles and encapsulation. Read component-styling.md: `skill://ecc-skill-catalog/angular-developer/references/component-styling.md`

## Testing

When writing or updating tests, consult the following references based on the task:

- **Fundamentals**: Best practices for unit testing, async patterns, and `TestBed`. Read testing-fundamentals.md: `skill://ecc-skill-catalog/angular-developer/references/testing-fundamentals.md`
- **Component Harnesses**: Standard patterns for robust component interaction. Read component-harnesses.md: `skill://ecc-skill-catalog/angular-developer/references/component-harnesses.md`
- **Router Testing**: Using `RouterTestingHarness` for reliable navigation tests. Read router-testing.md: `skill://ecc-skill-catalog/angular-developer/references/router-testing.md`
- **End-to-End (E2E) Testing**: Best practices for E2E tests with Cypress or Playwright. Read e2e-testing.md: `skill://ecc-skill-catalog/angular-developer/references/e2e-testing.md`

## Tooling

When working with Angular tooling, consult the following references:

- **Angular CLI**: Creating applications, generating code (components, routes, services), serving, and building. Read cli.md: `skill://ecc-skill-catalog/angular-developer/references/cli.md`
- **Angular MCP Server**: Available tools, configuration, and experimental features. Read mcp.md: `skill://ecc-skill-catalog/angular-developer/references/mcp.md`

## Anti-Patterns

- Using `null` or `undefined` as initial signal form field values — use `''`, `0`, or `[]` instead
- Accessing form field state flags without calling the field first: `form.field.valid()` — use `form.field().valid()`
- Starting new forms with older form APIs when the target Angular version supports Signal Forms
- Setting `min`, `max`, `value`, `disabled`, or `readonly` HTML attributes on `[formField]` inputs — define these as schema rules instead
- Calling `inject()` outside an injection context — use `runInInjectionContext` when needed
- Using `effect()` for derived state that should use `computed()`
- Referencing `$parent.$index` in nested `@for` loops — Angular does not support `$parent`; use `let outerIdx = $index` instead

## Related Skills

These are compatibility candidates for Main's initial `WORKFLOW PLAN` only when
they independently match the user task and are visible. This loaded Skill does
not select or load them after COMMIT:

- `skill://ecc-skill-catalog/tdd-workflow/SKILL.md` — task-child TDD method applicable to Angular components and services
- `skill://ecc-skill-catalog/security-review/SKILL.md` — security checklist for web applications including Angular-specific concerns
- `skill://ecc-skill-catalog/frontend-patterns/SKILL.md` — general frontend patterns for comparison with React/Next.js approaches
