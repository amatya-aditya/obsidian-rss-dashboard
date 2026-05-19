# Git Branching Strategy

Last updated: 2026-05-19

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
- After every stable release, **merge `master` back into `dev` immediately**
- **Do not rebase shared `dev`** after it has diverged or after others have based work on it
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

4. **Stay current while working on your own branch** — if `dev` moves forward while you're working, rebase your feature/fix branch onto `origin/dev`:

   ```
   git fetch origin
   git rebase origin/dev
   ```

   This guidance applies to **your personal work branch**, not to shared branches like `dev`. To sync shared `dev` after a stable release, merge `origin/master` into `dev` instead of rebasing `dev`.

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

As of **2026-05-19**, the suite contains **1245 passing tests across 137 passing files**. This is the automated test baseline intended to ship with `2.3.0`. Most are **unit tests** plus fast **integration-style** tests (JSDOM + Obsidian stubs) that validate UI rendering and business logic without launching the full Obsidian app. Tests live under `test_files/unit/`.

Current global coverage snapshot (from `npm run test:unit -- --coverage`):

- Statements : 55.6% ( 11284/20293 )
- Branches : 46.73% ( 5538/11851 )
- Functions : 50.7% ( 1792/3534 )
- Lines : 56.69% ( 10943/19303 )

### Running and Writing Tests

- **Run all tests**: `npm run test:unit`
- **Generate coverage reports**: `npm run test:unit -- --coverage`
- **Recommended**: Keep the test runner open in watch mode (`npx vitest`) while developing.
- **Organization**: Please organize new tests into domain folders (e.g., `services/`, `views/`, `utils/`) matching the `src/` directory to prevent clutter in the root `test_files/unit/` folder.
- For deeper context and current priorities, see `docs/development/test_coverage/test-coverage-improvement-plan.md` and `docs/development/refactorability-testing.md`.

## Compliance Declarations (Audit Guardrails)

To prevent repeat audit regressions, every PR must follow these declarations. Treat these as codebase policy, not suggestions.

### Non-Negotiable Rules

1. **No unsafe HTML rendering in production code**
   - Do not use direct `innerHTML` assignment for feed/article content paths.
   - Use approved safe rendering utilities (for example, `sanitizeAndAppendHtml(...)`) used in current rendering flows.

2. **No undocumented lint disables**
   - If an `eslint-disable` is absolutely required, include an inline reason that explains the necessity and scope.
   - Prefer refactoring over disabling whenever possible.

3. **Avoid `any` sprawl; use boundary typing**
   - Do not spread `as any` through implementation or tests.
   - Use a single boundary cast pattern (`as unknown as TypedInterface`) at the adapter boundary, then keep downstream code typed.

4. **Use popout-safe window/document APIs in production UI paths**
   - Prefer `activeDocument` instead of global `document` where required for popout compatibility.
   - Prefer `activeWindow.setTimeout(...)` / `activeWindow.clearTimeout(...)` over global timer functions in UI flows.

5. **Follow Obsidian DOM helper conventions in production code**
   - Prefer framework helpers such as `createDiv()`, `createEl(...)`, `createSpan()`, and `createFragment()` where applicable.
   - Keep test-only polyfill exceptions scoped to test files and documented.

6. **Prefer Obsidian-safe imports and APIs**
   - Follow existing import restrictions and approved API surfaces (for example, import guidance around `moment`).

### AI-Assisted Contributions

- AI-generated patches must satisfy the same declarations as hand-written code.
- If generated output conflicts with these rules, correct the patch before opening a PR.
- Keep fixes policy-aligned, minimal, and test-backed.

### Required Before PR

- Run `npm run lint` and address violations in changed files.
- Run `npm run test:unit` (or targeted tests with rationale) and confirm passing status.
- If you add or change lint suppressions, verify each has a specific inline explanation.
- Check `docs/plugin-scorecard.md` for current high-priority compliance backlog items relevant to your changes.
- For implementation patterns and examples, use `docs/development/compliance-patterns.md`.

---

## Release Process

### Step 1 — Feature Complete

All planned features and fixes for the release have merged into `dev`.

### Step 2 — Cut the Release Branch

```
git checkout dev
git checkout -b release/2.3.0
```

### Step 3 — Bump the Version First

Before tagging a Beta or Stable release, bump the version with `npm version` so `package.json`, `package-lock.json`, `manifest.json`, and `versions.json` stay in sync.

For the first Beta on a new release branch:

```
npm version 2.3.0-beta.1 --no-git-tag-version
git add package.json package-lock.json manifest.json versions.json
git commit -m "2.3.0-beta.1"
```

For the final Stable release:

```
npm version 2.3.0 --no-git-tag-version
git add package.json package-lock.json manifest.json versions.json
git commit -m "2.3.0"
```

### Step 4 — Tag and Announce Beta

```
git tag 2.3.0-beta.1
git push --set-upstream origin release/2.3.0 --tags
```

Pushing the Beta tag triggers this repo's GitHub Actions release workflow, which builds the plugin and creates a GitHub pre-release with the standard Obsidian assets attached:

- `main.js`
- `manifest.json`
- `styles.css`

The release workflow also emits GitHub artifact attestations for `main.js` and `styles.css` so release assets have verifiable build provenance.

If the workflow is unavailable for any reason, create the GitHub release manually from the same tag and upload those files yourself.

Note: manual uploads do not create GitHub artifact attestations. For compliance, re-run the release workflow from the tag so attestations are generated in GitHub Actions.

Use `--set-upstream` on the first push of a new release branch so your local branch tracks `origin/release/...` and tools like VS Code stop showing `Publish Branch`.

Announce to testers via BRAT. Collect feedback.

### Step 5 — Stabilize

Fix any issues found during Beta testing **on the release branch**, not on dev. Tag new beta versions as needed:

```
npm version 2.3.0-beta.2 --no-git-tag-version
git add package.json package-lock.json manifest.json versions.json
git commit -m "2.3.0-beta.2"
git tag 2.3.0-beta.2
git push origin release/2.3.0 --tags
```

Each pushed Beta tag should produce or be matched by a GitHub pre-release from that same tag.

If the `release/x.x.x` branch already exists and you need to cut another Beta (for example, `2.3.0-beta.3` after `2.3.0-beta.2`):

1. Open a PR to bring the release-bound work into `release/x.x.x` first.
2. Preserve the original commits when doing this work. If you open a PR from `dev` to `release/x.x.x`, **merge it without squashing** so the release branch keeps the same commit history that was tested on `dev`.
3. Only open a full `dev` → `release/x.x.x` PR when every new commit on `dev` is intended for that release. If `dev` already contains work meant for the next release, open a narrower PR or cherry-pick only the fixes/features that belong in the current release.
4. After the release branch contains the exact changes you want to ship, bump to the next Beta version on the release branch, tag it, and push it.

Preferred shared-branch workflow:

- Open a PR into `release/x.x.x`.
- Merge it with **Create a merge commit**.
- Do **not** use **Squash and merge** for release-branch integration PRs.
- After that PR is merged, bump/tag the next Beta on `release/x.x.x`.

Alternative local command-line flow if you are performing that same integration directly instead of through a PR, when `release/2.3.0` already exists and `dev` contains the next approved `2.3.0` changes:

```
git checkout release/2.3.0
git pull origin release/2.3.0
git merge origin/dev

npm version 2.3.0-beta.3 --no-git-tag-version
git add package.json package-lock.json manifest.json versions.json
git commit -m "2.3.0-beta.3"
git tag 2.3.0-beta.3
git push origin release/2.3.0 --tags
```

### Step 6 — Ship

When confidence is high and no new issues are surfacing:

```
# Bump to the final stable version on the release branch first
npm version 2.3.0 --no-git-tag-version
git add package.json package-lock.json manifest.json versions.json
git commit -m "2.3.0"

# Merge to master and tag
git checkout master
git merge release/2.3.0
git tag 2.3.0
git push origin master --tags

# Sync shared dev with the released history from master
git checkout dev
git pull --ff-only origin dev
git merge origin/master
git push origin dev

# Clean up
git branch -d release/2.3.0
```

Pushing the stable tag triggers this repo's release workflow, which creates a GitHub release from that tag and attaches the standard Obsidian plugin assets. If you ever need to do it manually, create the GitHub release from tag `2.3.0` and upload `main.js`, `manifest.json`, and `styles.css`.

Stable releases should be published through the workflow path so attestation records exist for `main.js` and `styles.css`.

### Tag Retention Policy

Published release tags (including Beta tags) should be treated as immutable release history and kept in the repository after a Stable release ships.

- Keep all published `x.x.x-beta.n` tags to preserve traceability for bug reports, changelog links, and bisecting regressions.
- Do not move, retarget, or reuse an existing published tag name.
- If a tag was created by mistake and must be removed, document the removal in the changelog or release notes.
- Do not recreate a deleted tag name at a different commit.

Having many tags in a mature open-source project is normal and preferred over rewriting release history.

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
- **Rebase your personal work branch to stay current** — keeps feature/fix history linear and readable
- **Merge `master` into shared `dev` after every stable release** — preserves shared history and avoids rewriting teammates' commits
- **Dev must always reflect master** — sync immediately after every stable release
- **Beta fixes go on the release branch** — not back on dev until the release branch merges
- **No Alpha/RC versions** — only Beta and Stable releases are permitted.

---

## Quick Reference

```
# Start new work
git checkout dev && git pull origin dev
git checkout -b feature/my-feature

# Stay current while working on your branch
git fetch origin && git rebase origin/dev

# Cut a release branch
git checkout dev && git checkout -b release/2.3.0

# Bump and tag the Beta
npm version 2.3.0-beta.1 --no-git-tag-version
git add package.json package-lock.json manifest.json versions.json
git commit -m "2.3.0-beta.1"
git tag 2.3.0-beta.1 && git push --set-upstream origin release/2.3.0 --tags

# Ship a release
npm version 2.3.0 --no-git-tag-version
git add package.json package-lock.json manifest.json versions.json
git commit -m "2.3.0"
git checkout master && git merge release/2.3.0
git tag 2.3.0 && git push origin master --tags
git checkout dev && git pull --ff-only origin dev
git merge origin/master && git push origin dev
```
