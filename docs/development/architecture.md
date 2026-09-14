# Architecture Guardrails

`main.ts` is the plugin composition root. Its long-term role is Obsidian
lifecycle integration, module construction and wiring, registration, startup
and shutdown orchestration, and thin compatibility delegation. Feature logic,
persistence implementations, migrations, UI construction, and substantial
state machines belong behind focused module interfaces under `src/`.

## Architecture Preflight

Before a meaningful implementation change, identify:

- the module that owns the behavior and the files likely to change;
- whether the change introduces a new responsibility or crosses an existing seam;
- whether a touched file is already reported as unusually large or complex;
- whether the change adds coupling, a runtime cycle, or an import of `main.ts`;
- whether any `main.ts` change is composition/delegation or implementation.

Tiny, local changes need only a sentence when none of these signals apply.
When ownership is unclear, prefer a small interface that gives callers useful
behavior without exposing the plugin class or a cluster of pass-through modules.

## Executable Checks

Run `npm run check:architecture`. The check has two kinds of output:

- **Warnings** expose current outliers without failing the build: production
  files over 1,000 physical lines, functions over 150 lines, branch complexity
  over 20, and functions with more than 5 parameters.
- **Errors** stop new drift: `main.ts` growing beyond its baseline, a new
  production importer of `main.ts`, a service importing UI/settings or
  `main.ts`, or a new runtime import cycle.

The warning thresholds are repository-derived observability levels, not style
targets. At the 2026-09-12 baseline they flag 12 of 161 production files
(7.45%), 60 of 4,425 functions by size (1.36%), 51 functions by complexity
(1.15%), and 23 functions by parameter count (0.52%). Declarative UI builders,
type catalogs, and other cohesive exceptions still require human judgment.

The baseline is stored in `scripts/architecture-baseline.json`. Lower
`mainTsMaxLines` whenever `main.ts` shrinks, and remove importer or cycle
allowances in the same change that eliminates them. Increasing the line limit
or expanding an allow-list is an architecture exception: explain the
responsibility, why the existing seams cannot own it, and the follow-up that
restores the ratchet.

For a change report relative to a Git ref, run:

```bash
npm run check:architecture -- --base HEAD
```

Use the branch merge-base instead of `HEAD` when reviewing a committed branch.
Report the `main.ts` LOC delta, threshold crossings, new `main.ts` importers,
dependency-direction results, and runtime-cycle results at handoff.

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

Metrics are prompts for architectural review. A warning should lead to these
questions:

1. Does the module still have one coherent responsibility?
2. Is its interface smaller and easier to use than its implementation?
3. Is mutable state forming a hidden workflow or state machine?
4. Can behavior be tested directly through the module interface instead of
   through `RssDashboardPlugin` or private implementation details?
5. Would splitting improve locality, or merely create pass-through files?

File size alone cannot answer those questions. A cohesive type catalog may be
large without being a god object, while several small modules in a runtime
cycle still represent architectural debt.

## Handoff Architecture Diff

For meaningful code changes, handoff includes either the output of
`check:architecture -- --base <ref>` or an equivalent concise report:

```text
main.ts: -74 LOC
new feed-refresh-coordinator.ts: +122 LOC
threshold crossings: none
new main.ts importers: none
service-to-UI dependencies: none
new runtime cycles: none
```

For documentation-only or tiny local changes, state why an architecture diff
is not applicable.

## Architectural Lessons

Keep permanent prevention rules in this document and incident history under
`docs/archive/investigations/`. When an incident reveals a reusable lesson,
record its history as **Trigger -> Failure -> Prevention -> Validation**, then
promote only the stable prevention and validation rules here.
