---
name: work-on-rss-dashboard-change
description: Plan and implement user-visible features, bug fixes, and GitHub issues for the RSS Dashboard Obsidian plugin, including TDD, risk-based Obsidian audit checks, validation, CHANGELOG updates, and manual testing. Use for requests to add, change, or fix plugin behavior or address a GitHub issue. Do not use for read-only explanations, status checks, general repository questions, or release-only work that does not modify plugin behavior.
---

# Work on an RSS Dashboard Change

Follow this workflow from request intake through verified handoff. Keep the
workflow proportional to risk while preserving the repository's audit gates.

## 1. Establish the Change Contract

- Accept a feature or bug description and an optional canonical GitHub issue URL.
- Treat a sufficient user-supplied description as the change source of truth.
  Preserve an accompanying issue URL without retrieving it.
- Retrieve the issue only when the description is missing or materially
  ambiguous, linked discussion or attachments are needed, or the user requests
  verification. Use an available GitHub connector, CLI, or public browser tool.
  If an attempted retrieval fails, use the supplied text and disclose the
  failure.
- Read `AGENTS.md` and every file it requires. Read
  `.agents/project-context.md` before scoping the implementation.
- Run `git status --short` and preserve unrelated changes.
- On Windows, set the command's working directory to the repository and use
  repository-relative paths for Git and file commands. Avoid embedding an
  absolute repository path in `git -C` or composing paths inside a command.
  When an absolute PowerShell path is unavoidable, pass one quoted,
  consistently backslash-separated path to a named parameter such as
  `-LiteralPath`.
- Treat warnings about inaccessible Git user configuration (for example a
  global ignore file) as an environment limitation: report them, but do not
  change user or global Git configuration to silence them.
- When the request is driven by a file under `docs/plans/`, read **Plan
  Lifecycle and Archive** in `docs/development/README.md`, record the matching
  plan path, and keep it current as the implementation changes.
- Do not begin implementation from a dated draft. For accepted work, require a
  canonical GitHub issue, rename the plan to `<issue-number>-<slug>.md`, store
  the exact issue URL, and replace draft dependency filenames with issue URLs.
  The issue may remain unassigned, but milestone work must name its milestone
  and whether it is Required or Stretch.
- Inspect the relevant production code, tests, types, documentation, and nearby
  patterns before asking questions that the repository can answer.
- State observable acceptance criteria. Classify the work as a feature or fix,
  identify affected surfaces, and assign low, medium, or high risk.

Ask the user only when a missing product decision would materially change the
result. Do not invent issue details, acceptance criteria, or hidden audit
findings.

## 2. Select Obsidian Review Gates

Read [references/obsidian-change-gates.md](references/obsidian-change-gates.md)
and apply only the rows matching the affected surfaces. Use its risk rules to
select automated and manual validation.

Inspect the live Obsidian community listing only for release, compliance,
security, platform, storage, or audit-remediation work. For ordinary changes,
use the local policies and scorecard to avoid unnecessary network work.

## 3. Plan and Implement with TDD

- Map each acceptance criterion to an automated test or an explicit manual check.
- Put new tests under the matching `test_files/unit/` area and follow the
  testing guide's jsdom, Obsidian stub, cleanup, and observable-behavior rules.
- Follow Red -> Green -> Refactor. Confirm the regression test fails for the
  expected reason before implementing the smallest compliant change.
- Follow `eslint.config.mjs`; do not add suppressions or weaken rules.
- Keep unrelated refactors and formatting out of the patch.

If the current collaboration mode is Plan Mode, stop after a decision-complete
`<proposed_plan>`. Otherwise, continue through implementation unless a material
decision requires user input.

## 4. Record the User-Visible Change

- After the behavior is complete, add one concise bullet under
  `CHANGELOG.md` -> `Unreleased` -> `Features` or `Fixes`.
- Append `[GH Issue #N](exact-url)` when a canonical GitHub issue URL is
  supplied. Preserve the exact URL so GitHub can create the repository
  cross-reference.
- Update an existing matching bullet rather than creating a duplicate.
- When no issue URL exists, write the same user-facing bullet without a link.
- Do not add a changelog entry for internal-only refactors, tests, or tooling.
- Do not update `docs/releases/` for an individual issue. At release cut, use
  the versioned changelog entries to consolidate related changes into an
  audience-focused `docs/releases/<version>.md` summary.

## 5. Validate Efficiently

Use a staged validation ladder:

1. During implementation, run ESLint against changed TypeScript files with
   `npm exec -- eslint <changed-files> --max-warnings=0` and run focused tests
   with `npm run test:unit -- <matching-test-file>`.
2. Run `npm run check:platform` early when `main.ts` or `src/**/*.ts` changes.
   For CSS changes, run `npm run check:css-scope` and
   `npm run check:important` early.
3. Run the full `npm run test:unit` suite for high-risk or broad changes,
   including storage migrations, synchronization, shared state or types,
   parser infrastructure, lifecycle orchestration, or multiple subsystems.
4. Run `npm run build` once before handoff as the complete compliance, full
   lint, type-check, and production-bundle gate.
5. Run `git status --short` and confirm no unexpected generated files appear.

If a check cannot run or fails, report the exact command and reason. Where
possible, distinguish a reproducible pre-existing failure from a regression.
Never claim compliance for an unrun or failing check, and do not modify
unrelated files merely to make a broad check green.

For documentation-only changes, run only relevant document or skill validation
and explain why application checks were not applicable.

## 6. Close the Matching Plan

Run this step only after behavior is complete and every required validation
gate passes. Leave incomplete or failing work in `docs/plans/`.

When the change has a matching active plan:

- Reconcile the plan with the implementation, tests, limitations, and manual
  checks actually delivered.
- Follow the metadata and destination rules in `docs/development/README.md`.
- Move an implemented plan to `docs/archive/plans/unreleased/` unless a release
  version is already assigned; use `docs/archive/plans/v<version>/` when it is.
- Update every repository link to the moved plan and its entry in
  `docs/archive/README.md`.
- Preserve issue and implementation links without inventing missing values.

Do not create a plan merely to satisfy this step when the work had no matching
plan.

## 7. Hand Off

Lead with the completed outcome. Include:

- The implemented behavior and acceptance criteria satisfied.
- Tests and validation commands with results.
- The changelog entry and issue link, when present.
- The updated and archived plan path, when the work started from a plan.
- Risk-selected manual test steps with expected outcomes.
- Any remaining limitation, unverified external state, or failing check.
