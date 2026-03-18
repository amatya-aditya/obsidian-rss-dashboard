# Git Branching Strategy

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
            ↓  tag RCs here, announce to testers
        x.x.x-rc.1 → rc.2 → ...
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
- Only stabilization work (bug fixes from RC testing) happens here — no new features
- RC tags are made on this branch
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

## Release Process

### Step 1 — Feature Complete

All planned features and fixes for the release have merged into `dev`.

### Step 2 — Cut the Release Branch

```
git checkout dev
git checkout -b release/2.3.0
```

### Step 3 — Tag and Announce RC

```
git tag 2.3.0-rc.1
git push origin release/2.3.0 --tags
```

Announce to testers via BRAT. Collect feedback.

### Step 4 — Stabilize

Fix any issues found during RC testing **on the release branch**, not on dev. Tag new RCs as needed:

```
git tag 2.3.0-rc.2
```

### Step 5 — Ship

When confidence is high and no new issues are surfacing:

```
# Merge to master and tag
git checkout master
git merge release/2.3.0
git tag 2.3.0
git push origin master --tags

# Merge release branch back to dev so RC fixes aren't lost
git checkout dev
git merge release/2.3.0
git push origin dev

# Clean up
git branch -d release/2.3.0
```

---

## Versioning (SemVer)

We follow [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`

| Part      | When to bump                                       |
| --------- | -------------------------------------------------- |
| **MAJOR** | Breaking changes — existing user setups will break |
| **MINOR** | New features added, backwards compatible           |
| **PATCH** | Bug fixes only, no new features                    |

### Pre-release Labels

| Label          | Meaning                                           |
| -------------- | ------------------------------------------------- |
| `2.3.0-beta.1` | Feature may still be changing, expect rough edges |
| `2.3.0-rc.1`   | Feature complete, testing for release confidence  |
| `2.3.0`        | Stable release                                    |

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
- **RC fixes go on the release branch** — not back on dev until the release branch merges

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

# Tag an RC
git tag 2.3.0-rc.1 && git push origin release/2.3.0 --tags

# Ship a release
git checkout master && git merge release/2.3.0
git tag 2.3.0 && git push origin master --tags
git checkout dev && git merge release/2.3.0 && git push origin dev
```
