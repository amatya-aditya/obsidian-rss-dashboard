---
status: implemented
completed: 2026-08-22
released_in: 2.6.0
issue: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/181
implementation: ""
---

# CI Security Hardening Baseline

Canonical issue: [#181](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/181).

## Problem and value

The repository already runs compliance checks, linting, unit tests, and a
release build, but it does not block known npm vulnerabilities or consistently
apply common CI supply-chain controls. A security assessment on 2026-08-22
found seven npm-audit findings, including one high-severity finding in the
production dependency graph because test-only `jsdom` is declared as a runtime
dependency.

This work establishes a maintainable security baseline: vulnerable dependency
updates are visible and blocking, CI installs do not run unreviewed lifecycle
scripts, workflow tokens are least-privilege, and routine dependency updates
are proposed automatically.

## Scope

1. Move `jsdom` from `dependencies` to `devDependencies`; it is used only by
   tests. Update direct and transitive dependencies and `package-lock.json` to
   resolve current audit findings without `npm audit fix --force`.
2. Add high/critical production-only and full-graph npm-audit gates to the
   pull-request and release workflows.
3. Declare `contents: read` for the test workflow and change its install step
   to `npm ci --ignore-scripts`, subject to successful test and build
   validation.
4. Add weekly Dependabot version updates for npm and GitHub Actions with
   explicit PR limits and conservative grouping.

## Acceptance criteria

- `npm audit --omit=dev --audit-level=high` exits successfully after the
  dependency remediation.
- `npm audit --audit-level=high` is executed by both pull-request and release
  CI, and fails those workflows for high or critical findings.
- The test workflow has only `contents: read` token permission and uses
  `npm ci --ignore-scripts`; unit tests and the production build remain green.
- `.github/dependabot.yml` configures weekly updates for npm and GitHub
  Actions, with a bounded number of open PRs.
- The affected workflows, dependency files, and documentation are reviewed and
  the repository's required validation completes successfully.

## Implementation direction

Likely files:

- `package.json` and `package-lock.json`
- `.github/workflows/test.yml`
- `.github/workflows/release.yml`
- `.github/dependabot.yml` (new)
- `docs/development/security-hardening-tracker.md`

Sequence the work so dependency remediation precedes the blocking audit gates.
Keep the audit commands explicit in the workflows instead of hiding them in a
generic script, so failed security checks are immediately clear in CI logs.

## Validation and manual checks

- Run `npm audit --omit=dev --audit-level=high` and
  `npm audit --audit-level=high` locally after lockfile changes.
- Run the focused unit tests covering dependency/install changes, then
  `npm run test:unit` if dependency updates have broad impact.
- Run ESLint for changed TypeScript files, `npm run check:platform` if `src/`
  TypeScript changes, type-checking, and `npm run build`.
- Confirm a pull-request workflow and a release-workflow dry run execute the
  expected audits and retain their intended permissions.
- Finish with `git diff --check` and `git status --short`.

## Non-goals

- Enabling GitHub repository settings that require owner permissions.
- Attesting an SBOM or redesigning release packaging.
- Replacing the existing compliance, test, or release workflow.
- Suppressing audit findings or using forced dependency upgrades.

## Risks, dependencies, and follow-up

`npm ci --ignore-scripts` can expose a dependency that incorrectly requires an
install script; retain the change only if the existing tests and build pass.
Dependency upgrades may require compatibility fixes, so each update must retain
the locked, reproducible install behavior.

The implementation maps to Beads
`obsidian-rss-dashboard-dsm.1` through `obsidian-rss-dashboard-dsm.4`.
Related but separate follow-ups are release provenance/SBOM work
(`obsidian-rss-dashboard-dsm.5`) and repository-owner configuration for CodeQL,
Dependabot security updates, secret protection, branch/tag rules, and Actions
policy (`obsidian-rss-dashboard-dsm.6` through `.10`).

## Implementation and verification

- Moved `jsdom` and its transitive graph to `devDependencies`; a non-forced,
  lockfile-only remediation updated vulnerable transitive packages. The direct
  `esbuild` update to 0.28.2 cleared the remaining advisory without using
  `npm audit fix --force`.
- Added explicit production-only and full-graph high/critical npm audit gates
  to the test and release workflows.
- Restricted the test job token to `contents: read` and retained
  `npm ci --ignore-scripts` after a clean-install validation passed.
- Added weekly npm and GitHub Actions Dependabot version updates, with limits
  of five and three open pull requests respectively and grouped minor/patch
  updates.
- In an isolated clean worktree, `npm ci --include=dev --ignore-scripts`, full
  lint/platform/type-check/build validation, both audit commands, and the full
  unit suite passed (191 files, 1,714 tests). A native-binary lock prevented a
  clean reinstall in the shared checkout, so the isolated worktree avoided
  disrupting the active plugin environment.
