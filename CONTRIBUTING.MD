# Git Branching Strategy

Last updated: 2026-04-01

## Overview

This document outlines the branching strategy for all contributors. Following these conventions keeps our codebase stable, our release process predictable, and collaboration smooth.

---

## Branch Structure

```
master                          ← stable, tagged releases only
└── dev                         ← active development, always current with master
      ├── feature/your-feature  ← contributor work branches
      ├── fix/your-fix
      └── ...
            ↓  PRs merge into dev
           dev
            ↓  when features are complete, cut a release branch
      release/x.x.x
            ↓  stable → merge to master, then back to dev
           master (tag x.x.x)
```

---

## Branch Descriptions

### `master`

- Always production-ready and stable
- **No direct commits** — changes arrive only via merged release branches
- Every commit on master corresponds to a tagged release

### `dev`

- The living integration branch — all contributor work lands here
- Must always be **at or ahead of master**
- After every stable release, master is merged back into dev immediately
- Should be stable enough to cut a release branch from at any time

### Feature / Fix Branches

- All contributor work happens here
- Always branch off `dev`, never off master
- Naming conventions:
  - `feature/short-description` — new functionality
  - `fix/short-description` — bug fixes
  - `docs/short-description` — documentation only
  - `chore/short-description` — maintenance, dependencies, config
- PR back into `dev` when work is complete and self-tested

### `release/x.x.x`

- Cut from `dev` when features for a release are complete
- Only stabilization work (bug fixes from Beta testing) happens here — no new features
- Merges into `master` when stable, then immediately back into `dev`

---

## Contributor Workflow

1. **Sync your local dev** with the latest remote before starting work:

   ```
   git checkout dev
   git pull origin dev
   ```

2. **Create a branch** off dev using whichever method you prefer:

   **Command line:**

   ```
   git checkout -b feature/your-feature-name
   ```

   **GitHub Desktop:**
   - Confirm you're on `dev` in the branch dropdown
   - Click the dropdown → **New Branch**
   - Type your branch name — Desktop automatically bases it off your current branch

   **GitHub website:**
   - Navigate to the repo and switch to the `dev` branch using the branch dropdown (top left of the file list)
   - Once you're viewing `dev`, open the dropdown again
   - Type your new branch name in the **"Find or create a branch"** box — it will show "Create branch from **'dev'**"
   - Hit Enter

   > **Note on branch names:** The slash in `feature/your-name` is just a naming convention, not a folder path. Type the full name including the slash — e.g. `feature/youtube-shorts-autotag`. Do not prefix it with `dev/`.

3. **Make commits** — keep them small and focused. One concern per commit.

4. **Stay current** — if dev moves forward while you're working, rebase:

   ```
   git fetch origin
   git rebase origin/dev
   ```

5. **Open a Pull Request** targeting `dev` when your work is:
   - Complete and self-tested
   - Not breaking any existing functionality
   - Reviewed by at least one other contributor

6. **Delete your branch** after it merges.

---

## Testing and TDD Approach

We strongly encourage a **Test-Driven Development (TDD)** workflow. When adding new features or fixing bugs, follow the Red-Green-Refactor cycle:

1. **Red**: Write a failing test for the new functionality or bug reproduction.
2. **Green**: Write the minimal code required to pass the test.
3. **Refactor**: Clean up the code while ensuring the test stays green.

### Test Coverage Philosophy

Coverage is a **floor, not a goal**. We use coverage to prevent regressions and to make refactors safe, but we value **meaningful assertions** over chasing percentages.

- Prefer tests around critical user flows, bug fixes, and pure business logic.
- For refactors (especially large files), start with **characterization tests** that lock in current behavior, then refactor behind that safety net.
- Keep tests deterministic (avoid real network/time; use stubs/fixtures).

### Coverage Gate (Ratcheting)

CI enforces global coverage thresholds (configured in `vitest.config.mjs`). We use a ratchet so the minimum acceptable coverage rises over time and cannot silently drift downward.

- Only raise thresholds when the measured global metric is comfortably above the current threshold (see the ratchet rules in `docs/development/test_coverage/test-coverage-improvement-plan.md`).
- Avoid raising thresholds in the same PR that significantly expands the measured surface area (e.g., broadening `coverage.include`).

### Current Test Suite

As of **2026-04-01**, the suite contains **741 passing tests across 103 passing files**. This is the automated test baseline intended to ship with `2.2.0`. Most are **unit tests** plus fast **integration-style** tests (JSDOM + Obsidian stubs) that validate UI rendering and business logic without launching the full Obsidian app. Tests live under `test_files/unit/`.

Current global coverage snapshot (from `npm run test:unit -- --coverage`):

- **Statements** : 46.77% (7385/15789)
- **Branches** : 37.32% (3386/9071)
- **Functions** : 41.51% (1089/2623)
- **Lines** : 47.66% (7137/14974)

### Running and Writing Tests

- **Run all tests**: `npm run test:unit`
- **Generate coverage reports**: `npm run test:unit -- --coverage`
- **Recommended**: Keep the test runner open in watch mode (`npx vitest`) while developing.
- **Organization**: Please organize new tests into domain folders (e.g., `services/`, `views/`, `utils/`) matching the `src/` directory to prevent clutter in the root `test_files/unit/` folder.
- For deeper context and current priorities, see `docs/development/test_coverage/test-coverage-improvement-plan.md` and `docs/development/refactorability-testing.md`.

---

## Release Process

### Step 1 — Feature Complete

All planned features and fixes for the release have merged into `dev`.

### Step 2 — Cut the Release Branch

```
git checkout dev
git checkout -b release/2.3.0
```

### Step 3 — Tag and Announce Beta

```
git tag 2.3.0-beta.1
git push origin release/2.3.0 --tags
```

Announce to testers via BRAT. Collect feedback.

### Step 4 — Stabilize

Fix any issues found during Beta testing **on the release branch**, not on dev. Tag new beta versions as needed:

```
git tag 2.3.0-beta.2
```

### Step 5 — Ship

When confidence is high and no new issues are surfacing:

```
# Merge to master and tag
git checkout master
git merge release/2.3.0
git tag 2.3.0
git push origin master --tags

# Merge release branch back to dev so Beta fixes aren't lost
git checkout dev
git merge release/2.3.0
git push origin dev

# Clean up
git branch -d release/2.3.0
```

---

## Versioning (SemVer)

We follow [Semantic Versioning](https://semver.org). Given `MAJOR.MINOR.PATCH`, increment:

| Part      | When to bump                                      |
| --------- | ------------------------------------------------- |
| **MAJOR** | Incompatible API changes or breaking user setups  |
| **MINOR** | New functionality in a backward compatible manner |
| **PATCH** | Backward compatible bug fixes                     |

_Note: Only **Beta** and **Stable** releases are permitted. No Alphas or RCs._

### Pre-release Labels

| Label          | Meaning                             |
| -------------- | ----------------------------------- |
| `x.x.x-beta.n` | Feature testing, expect rough edges |
| `x.x.x`        | Stable release                      |

## Naming Conventions and Validation

To ensure compatibility across different operating systems and Obsidian's internal linking system, all folder and feed titles must adhere to the following rules:

1.  **Forbidden Characters**: The following characters are strictly prohibited in folder names and feed titles:
    `[ ] # ^ | / \ : * " < > ?`
2.  **Leading Dots**: Names cannot start with a dot (`.`).
3.  **Empty Names**: Names cannot be empty or consist only of whitespace.

### Implementation Guidelines

- **User Input**: Always validate user-provided folder names and feed titles using `isValidFolderName(name)` or `isValidFeedTitle(title)` from `src/utils/validation.ts`. Provide immediate feedback via `Notice`.
- **Automated Imports**: When importing data (e.g., OPML), use `sanitizeName(name)` to automatically replace forbidden characters with underscores and strip leading dots.
- **Testing**: Any changes to validation logic must be accompanied by updates to `test_files/unit/validation.test.ts`.

---

## Key Rules

- **Never commit directly to `master` or `dev`** — always via PR or merge
- **One concern per branch** — don't mix a feature with unrelated fixes
- **Keep branches short-lived** — long-running branches cause merge conflicts
- **Rebase, don't merge, to stay current** — keeps history linear and readable
- **Dev must always reflect master** — sync immediately after every stable release
- **Beta fixes go on the release branch** — not back on dev until the release branch merges
- **No Alpha/RC versions** — only Beta and Stable releases are permitted.

---

## Quick Reference

```
# Start new work
git checkout dev && git pull origin dev
git checkout -b feature/my-feature

# Stay current while working
git fetch origin && git rebase origin/dev

# Cut a release branch
git checkout dev && git checkout -b release/2.3.0

# Tag the Beta
git tag 2.3.0-beta.1 && git push origin release/2.3.0 --tags

# Ship a release
git checkout master && git merge release/2.3.0
git tag 2.3.0 && git push origin master --tags
git checkout dev && git merge release/2.3.0 && git push origin dev
```
