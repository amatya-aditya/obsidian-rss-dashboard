# Architecture Guardrails

`main.ts` is the plugin composition root. Its long-term role is Obsidian
lifecycle integration, module construction and wiring, registration, startup
and shutdown orchestration, and thin compatibility delegation. Feature logic,
persistence implementations, migrations, UI construction, and substantial
state machines belong behind focused module interfaces under `src/`.

These guardrails stop new drift while the monolithic files are broken up
([#436](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/436)).
They are not extraction mandates: existing debt is recorded and can only
shrink.

## Architecture Preflight

Before a meaningful implementation change, identify:

- the module that owns the behavior and the files likely to change;
- whether the change introduces a new responsibility or crosses an existing seam;
- whether a touched file is ratcheted, or a touched function is suppressed in
  `eslint-suppressions.json`;
- whether the change adds coupling, a runtime cycle, or an import of `main.ts`;
- whether any `main.ts` change is composition/delegation or implementation.

Tiny, local changes need only a sentence when none of these signals apply.
When ownership is unclear, prefer a small interface that gives callers useful
behavior without exposing the plugin class or a cluster of pass-through modules.

## Enforced Checks

Every check below fails the build. Test files and `test_files/stubs/` are
never measured.

| Check | Where | Fails when |
| --- | --- | --- |
| File line ratchet | `npm run check:architecture` | A ratcheted file grows, or shrinks without its baseline being lowered in the same change |
| `main.ts` importer ratchet | `npm run check:architecture` | A new production module imports `main.ts`, or an allowance is no longer needed |
| Service dependency direction | `npm run check:architecture` | A service imports a view, component, modal, settings module, or `main.ts` |
| Runtime-cycle ratchet | `npm run check:architecture` | A new runtime import cycle appears, or an allowance is no longer needed |
| Function length | ESLint `max-lines-per-function` | A function in `main.ts` or `src/` exceeds 150 lines, not counting blank lines and comments |
| Complexity | ESLint `complexity` | A function in `main.ts` or `src/` exceeds cyclomatic complexity 20 |
| Characterization tests | CI, `refactor/*` PRs only | A `*.characterization.test.ts` file is modified, deleted, or renamed |

`check:architecture` runs in `check:compliance`, so it is part of
`npm run build`, the pre-push hook, and CI. `check:architecture` also prints
two non-failing observations: production files over 1,000 lines and functions
with more than 5 parameters.

### Line ratchets

`scripts/architecture-baseline.json` → `ratchets.fileMaxLines` holds the
current physical line count of each refactor target:

- `main.ts`
- `src/components/sidebar.ts`
- `src/services/feed-storage-repository.ts`
- `src/views/dashboard-view.ts`
- `src/views/reader-view.ts`

The ratchet only goes down. When a change shrinks one of these files, lower
its baseline to the new count in the same change; the check fails until you
do. Remove importer or cycle allowances in the same change that eliminates
them.

### ESLint suppressions

Functions that already broke the length or complexity limit when the rules
were introduced are recorded in `eslint-suppressions.json`, as a count per
file and rule. ESLint reads it automatically. A new violation in any file
fails lint; so does one more violation in a file that already has
suppressions.

After a refactor removes a violation, prune the file in the same PR:

```bash
npx eslint . --prune-suppressions
```

Never add suppressions by hand or with `--suppress-all` or `--suppress-rule`
to make a change pass. That is an exception (see below).

### Characterization tests

A characterization test pins current behavior, bugs included, before a
refactor. Name it `*.characterization.test.ts` and keep it in the matching
`test_files/unit/` folder. Mark a pinned bug with
`// BUG: pinned, see #<issue>`.

On a pull request from a `refactor/*` branch, CI runs
`scripts/check-characterization-tests.mjs` against the PR base. Adding a
characterization test, copying one, or renaming a test to the suffix is
allowed; modifying, deleting, or renaming one away fails. If pinned behavior
must change, do it in a separate, non-refactor PR first.

## Exceptions

Raising a line ratchet, expanding an importer or cycle allowance, or adding
an ESLint suppression is an architecture exception. It needs a stated
justification in the PR description, approved by a maintainer: the
responsibility being added, why the existing seams cannot own it, and the
follow-up issue that restores the guardrail.

A baseline correction, where the baseline is regenerated because it was
measured against a different base, is recorded in the commit message rather
than treated as an exception.

## Change Report

For a change report relative to a Git ref, run:

```bash
npm run check:architecture -- --base HEAD
```

Use the branch merge-base instead of `HEAD` when reviewing a committed branch.
Report each ratcheted file's line delta, parameter-count crossings, new
`main.ts` importers, dependency-direction results, and runtime-cycle results
at handoff, for example:

```text
main.ts LOC delta: -74
src/services/feed-storage-repository.ts LOC delta: +0
new threshold crossings: 0
new main.ts importers: none
new runtime cycles: none
```

For documentation-only or tiny local changes, state why the report is not
applicable.

## Dependency Direction

The current source graph supports this enforced rule:

```text
views / components / modals / settings -> services -> utils / types
```

Services may collaborate with other services and depend on utilities and types.
They may not import views, components, modals, settings, or `main.ts`.
Production modules outside `main.ts` should move toward narrow interfaces
instead of importing `RssDashboardPlugin`; the existing importer list is
ratcheted so it can shrink but not grow.

This is deliberately not a universal layer model. Some UI modules collaborate
across their directory labels, and `domain-icon-helpers.ts` currently spans
utility, parser, and settings concerns. Add a dependency rule only after the
source graph demonstrates a stable seam.

## Interpreting Size and Complexity

The limits are prompts for architectural review, chosen near the
repository's upper tail: at the 2026-09-12 baseline they flagged about 1.4%
of functions by size and 1.2% by complexity. A limit being hit should lead to
these questions:

1. Does the module still have one coherent responsibility?
2. Is its interface smaller and easier to use than its implementation?
3. Is mutable state forming a hidden workflow or state machine?
4. Can behavior be tested directly through the module interface instead of
   through `RssDashboardPlugin` or private implementation details?
5. Would splitting improve locality, or merely create pass-through files?

File size alone cannot answer those questions. A cohesive type catalog may be
large without being a god object, while several small modules in a runtime
cycle still represent architectural debt.

## Architectural Lessons

Keep permanent prevention rules in this document and incident history under
`docs/archive/investigations/`. When an incident reveals a reusable lesson,
record its history as **Trigger -> Failure -> Prevention -> Validation**, then
promote only the stable prevention and validation rules here.
