# Git and Testing Workflow

This document captures the local quality gates used during day-to-day development.

## What is currently enforced

### Unit test gate (pre-commit)

- Hook: `.githooks/pre-commit`
- Command: `npm run --silent test:unit`
- Purpose: block commits if fast unit tests fail.

### Build gate (pre-push)

- Hook: `.githooks/pre-push`
- Command: `npm run --silent build`
- Purpose: block pushes if lint, TypeScript checks, or production bundle fails.

## Test suite currently in use

- Script: `test:unit` in `package.json`
- Runner: `vitest run --config vitest.config.mjs`
- Current scope: `test_files/unit/**/*.test.ts`

## Setup for new machines/contributors

1. Install dependencies:
   - `npm install`
2. Ensure hooks are installed (runs automatically via `prepare`):
   - `npm run hooks:install`
3. Verify hooks path:
   - `git config --local --get core.hooksPath`
   - Expected value: `.githooks`

## Daily developer flow (recommended)

1. Before commit: `npm run test:unit`
2. Before push: `npm run build`
3. Let hooks enforce both automatically as a safety net.

## CI recommendation

Mirror local checks in CI so required checks match developer workflow:

1. `npm ci`
2. `npm run test:unit`
3. `npm run build`

## Temporary bypass (only for emergencies)

- Skip local hooks for one command by setting:
  - `SKIP_GIT_HOOKS=1`

Use bypass sparingly and follow up with a clean commit that passes all checks.
