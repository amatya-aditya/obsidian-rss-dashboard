# Compliance Patterns and Audit Guardrails

Last updated: 2026-05-13

This document defines approved patterns for audit-sensitive changes. Use it with `CONTRIBUTING.MD` and `docs/plugin-scorecard.md`.

## Scope

These rules apply to production code by default and to tests where noted.

## 1) Safe HTML Rendering

### Required

- Do not inject untrusted content with direct `innerHTML` assignment in production rendering paths.
- Use approved sanitizing and append utilities already used in the codebase (for example, `sanitizeAndAppendHtml(...)`).

### Why

This blocks the audit class for unsafe HTML injection and aligns with SDL scanner expectations.

### Pattern

```ts
// Bad
container.innerHTML = html;

// Good
sanitizeAndAppendHtml(container, html);
```

## 2) Lint Disable Comments

### Required

- Avoid `eslint-disable` unless there is no viable typed or structural alternative.
- Every disable must include a short inline reason.

### Pattern

```ts
// Bad
// eslint-disable-next-line @typescript-eslint/no-explicit-any

// Good
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Obsidian internal API is untyped here; narrowed immediately below.
```

## 3) Type Safety at Boundaries

### Required

- Do not propagate `as any` across a file.
- Prefer one boundary cast at input edges, then use typed interfaces throughout the rest of the flow.

### Pattern

```ts
// Better boundary cast pattern
const pluginApi = plugin as unknown as PluginTestFixture;
```

## 4) Popout-Compatible Window and Document Usage

### Required

- In production UI paths, prefer `activeDocument` over global `document` where popout compatibility rules apply.
- Prefer `window.setTimeout(...)`, `window.clearTimeout(...)`, and other `window.*` timer APIs over `activeWindow.*` or bare timer calls.
- Use `window.crypto` (or Obsidian-provided APIs) instead of `globalThis` for browser globals.

### Pattern

```ts
// Prefer in popout-aware UI code
const el = activeDocument.createElement("div");
const handle = window.setTimeout(() => {
  // ...
}, 100);
window.clearTimeout(handle);
view.registerDomEvent(activeDocument, "keydown", handler);
```

## 5) Obsidian DOM Helper Conventions

### Required

- In production code, prefer Obsidian DOM helpers:
  - `createDiv()` instead of `document.createElement("div")`
  - `createEl("input")`, `createEl("button")`, etc.
  - `createSpan()` and `createFragment()` where applicable
- Keep exceptions localized and documented when test polyfills require plain DOM calls.

## 6) Import and API Restrictions

### Required

- Follow current lint restrictions on module imports and approved alternatives.
- If a restricted import is encountered, use the codebase-approved source (for example, Obsidian-provided APIs).

## Quick Review Checklist

Before opening a PR:

1. `npm run lint` passes for changed files.
2. `npm run test:unit` or targeted tests pass.
3. No new undocumented lint suppressions.
4. No new unsafe HTML injection in production paths.
5. New UI changes follow popout-safe and DOM-helper conventions.

## Related Docs

- `CONTRIBUTING.MD` (Compliance Declarations)
- `docs/plugin-scorecard.md` (live backlog and priorities)
- `docs/SECURITY.md` (stakeholder-facing security disclosures)
