# Architecture Policy

Status: draft policy pending PR [#253](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/253); guardrails are warning-oriented unless a rule protects a known dependency boundary or an established ratchet. Baseline completed 9/12/2026.

## Purpose

Keep the plugin easy to change, test, and navigate. This policy targets
architectural drift, not aesthetic uniformity. Thresholds are evidence-based
and should be revisited when the production codebase changes materially.

## Boundaries

- `main.ts` is the composition root: lifecycle wiring, dependency assembly,
  registration, and narrow coordination belong here.
- Domain behavior belongs in services or focused modules.
- Views, components, modals, and settings may depend on the composition root
  only through the existing public bridge; new production importers of
  `main.ts` require review.
- Services must not import views, components, modals, settings, or `main.ts`.
- New runtime dependency cycles require review and should be removed before
  merge unless explicitly documented.

## Evidence-based warning thresholds

The baseline audit covered 161 production TypeScript files and 4,425 functions:

| Metric                | Initial warning | Baseline flagged | Policy  |
| --------------------- | --------------: | ---------------: | ------- |
| Production file size  |      >1,000 LOC |    12/161 (7.5%) | warning |
| Function size         |        >150 LOC |  60/4,425 (1.4%) | warning |
| Cyclomatic complexity |             >20 |  51/4,425 (1.2%) | warning |
| Parameter count       |              >5 |  23/4,425 (0.5%) | warning |

These cutoffs sit near the repository's upper tail (roughly p90-p99), so they
identify meaningful outliers without making the current codebase non-compliant.
They are not automatic extraction mandates.

## `main.ts` ratchet

Record the current line count as a baseline. A change may not increase it.
When it shrinks, update the baseline in the same change. Ratchets are errors;
size and complexity outliers remain warnings until the baseline is reduced.

## Validation and workflow

- Run the architecture check during change preflight and at handoff.
- Report changed architectural boundaries, threshold crossings, importer/cycle
  changes, and the `main.ts` line-count delta in the PR.
- CI should validate the script, but not block release work on legacy warnings.
- Update this policy only with measured repository evidence and a documented
  rationale.

## Ownership and follow-up

The policy is guardrail work. Existing debt is tracked separately in the
architecture program plan and should be reduced incrementally, beginning with
`main.ts`. Do not combine a broad decomposition with unrelated feature work.
