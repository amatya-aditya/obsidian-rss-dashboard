# Contributing to RSS Dashboard

Thank you for your interest in contributing! This guide walks you through how to set up your development environment, make changes, and submit your work. Whether you're fixing a bug, adding a feature, or improving documentation, we appreciate your help.

---

## Before You Start

### Code of Conduct

We are committed to providing a welcoming and inspiring community for all. Please treat everyone with respect and create a harassment-free environment for participation.

### Ways to Contribute

- **Report bugs** — Found something broken? [Open an issue](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues) with details and steps to reproduce.
- **Suggest features** — Have an idea? [Start a discussion](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues) or chat on [Discord](https://discord.gg/9bu7V9BBbs).
- **Fix bugs** — Pick an open issue labeled `bug` or `good-first-issue`.
- **Add features** — Check the [public roadmap](docs/plans/public-roadmap.md) and coordinate before starting large work.
- **Improve docs** — Clarify guides, add examples, fix typos. Documentation PRs are always welcome.
- **Write tests** — Help increase test coverage and prevent regressions.

---

## Development Setup

### Prerequisites

- **Node.js 22** — Required for all development and CI.
  - If you use `nvm` (Mac/Linux): `nvm use` (reads `.nvmrc`)
  - If you use `nvm-windows` (Windows): `nvm use 22`
  - Check your version: `node --version` (should be v22.x.x)

### Clone & Install

```bash
git clone https://github.com/amatya-aditya/obsidian-rss-dashboard.git
cd obsidian-rss-dashboard
nvm use
npm ci
```

Use `npm ci` (clean install) instead of `npm install` to ensure locked dependency versions match CI.

### Local Development

```bash
npm run dev
```

This runs the development build in watch mode. Open Obsidian, enable the plugin, and changes will hot-reload.

---

## Repository Structure

The codebase is organized for clarity and scalability:

- **`src/`** — All plugin source code (TypeScript)
  - `services/` — Core business logic (feed fetching, storage, article processing)
  - `views/` — UI components (dashboard, reader, discover)
  - `modals/` — Dialog windows (feed manager, settings, etc.)
  - `settings/` — Plugin settings and configuration tabs
  - `utils/` — Shared utilities and helpers
- **`test_files/unit/`** — Unit and integration tests (matching `src/` structure)
- **`docs/`** — User-facing documentation and guides
- **`docs/development/`** — Developer documentation and architecture

For detailed architecture and design decisions, see [Development Docs](docs/development/README.md).

---

## Development Workflow

### 1. Branch from `dev`

Always create a new branch off `dev`:

```bash
git checkout dev
git pull origin dev
git checkout -b feat/231-your-feature-name
```

**Branch naming convention:** `<type>/<issue-number>-<short-slug>` — see [docs/agents/branch-naming.md](docs/agents/branch-naming.md) for full detail and worktree naming.
- `feat/231-short-slug` — new functionality
- `fix/231-short-slug` — bug fixes
- `docs/231-short-slug` — documentation only
- `chore/231-short-slug` — maintenance, dependencies, config

Do not prefix with `dev/`. The slash is just a naming convention, not a folder. Example: `feat/231-youtube-shorts-autotag`.

### 2. Make Focused Commits

Keep commits small and focused on one concern:

```bash
git add src/path/to/file.ts
git commit -m "feat: brief, clear description of what changed"
```

Write commit messages that explain the _why_, not just the _what_. Your future self will thank you.

### 3. Stay Current

While you're working, if `dev` moves forward, rebase your branch to stay current:

```bash
git fetch origin
git rebase origin/dev
```

This keeps your feature history linear and readable. (This guidance applies to your personal branch, not shared branches like `dev`.)

### 4. Test Before Opening a PR

Run the full test suite and linter locally:

```bash
npm run test:unit
npm run lint
npx tsc -noEmit
```

All must pass before you open a PR.

---

## Testing

We use **Test-Driven Development (TDD)** and value meaningful assertions over chasing coverage percentages.

### Running Tests

```bash
npm run test:unit                          # Run all tests once
npx vitest                                  # Watch mode (recommended while developing)
npm run test:unit -- --coverage            # Generate coverage report
```

### Writing Tests

- **Test organization:** Place tests in `test_files/unit/` mirroring the `src/` structure. For example:
  - Source: `src/services/feed-fetcher.ts`
  - Tests: `test_files/unit/services/feed-fetcher.test.ts`
- **Coverage focus:** Prioritize critical user flows, bug fixes, and pure business logic. Coverage is a floor, not a goal.
- **Deterministic tests:** Avoid real network/time; use stubs and fixtures.

### Coverage Gate (Ratcheting)

CI enforces global coverage thresholds (configured in `vitest.config.mjs`). We use a ratchet so the minimum acceptable coverage rises over time and cannot silently drift downward.

- Only raise thresholds when the measured global metric is comfortably above the current threshold.
- Avoid raising thresholds in the same PR that significantly expands the measured surface area (e.g., broadening `coverage.include`).

For deeper guidance and current priorities, see [Testing Guide](docs/development/test_coverage/testing-guide.md).

---

## Code Quality & Compliance

Before opening a PR, address all lint and type errors:

```bash
npm run lint                   # Check for style violations
npx tsc -noEmit               # Type check without emitting files
npm run check:platform        # Platform compatibility check
npm run check:important       # CSS !important declarations check
npm run check:doc-links       # Relative links in Markdown resolve
```

### Compliance Declarations

Every PR must follow these non-negotiable rules:

1. **No unsafe HTML rendering** — Use `sanitizeAndAppendHtml(...)` for feed/article content; never direct `innerHTML`.
2. **No undocumented lint disables** — If you need `eslint-disable`, include an inline reason explaining why.
3. **Avoid `any` sprawl** — Use boundary typing (a single `as unknown as TypedInterface` cast at the adapter boundary) instead of spreading `as any` through code.
4. **Platform-safe APIs** — Use `activeDocument`, `window.setTimeout(...)`/`window.clearTimeout(...)`, and the other `window.*` timer APIs instead of `activeWindow.*` or bare timers, as enforced by `npm run check:platform`. Avoid `globalThis` in production UI paths.
5. **Obsidian DOM helper conventions** — Prefer `createDiv()`, `createEl(...)`, `createSpan()`, and `createFragment()` over manual DOM construction in production code. Keep test-only polyfill exceptions scoped to test files and documented.
6. **Obsidian-safe imports and APIs** — Follow existing import restrictions and approved API surfaces (for example, import guidance around `moment`).
7. **No `!important` in CSS** — Resolve conflicts by checking cascade order and ownership first, then build a narrowly scoped selector from an existing plugin root, component, and state or element selector. `npm run check:important` rejects every declaration; an `audit-ok` comment does not create an exception.
8. **AI-generated patches** — Must satisfy the same rules as hand-written code. Fix violations before opening a PR.

### Required Before PR

- Run `npm run lint` and address violations in changed files.
- Run `npm run test:unit` (or targeted tests with rationale) and confirm passing status.
- When code parses or generates from a real repository file (`CHANGELOG.md`, `package.json`, config files, etc.), verify against the actual checked-in file — not just hand-written test fixtures. Line-ending style, encoding, and other real-world formatting quirks won't show up in a synthetic test string. A changelog parser here once passed its full test suite and still shipped broken, because every test fixture used plain `\n` while the repo's actual `CHANGELOG.md` is CRLF-terminated — the parser silently matched nothing against the real file.
- If you add or change lint suppressions, verify each has a specific inline explanation.
- Check `docs/plugin-scorecard.md` for current high-priority compliance backlog items relevant to your changes.

For implementation examples and approved patterns, see [Compliance Patterns](docs/development/compliance-patterns.md).

---

## Architecture Decision Records (ADRs)

Deliberate, hard-to-reverse, non-obvious decisions are recorded in `docs/adr/` as short, sequentially numbered files (`0001-slug.md`, `0002-slug.md`, ...). Write one when a decision meets all three:

- **Hard to reverse** — the cost of changing your mind later is meaningful.
- **Surprising without context** — a future reader would look at the code and wonder why it's built this way.
- **The result of a real trade-off** — genuine alternatives existed and one was picked for specific reasons.

Skip an ADR for anything obvious, easily reversed, or where there was no real alternative. See [ADR 0006](docs/adr/0006-deprecate-legacy-json-and-shard-storage-v1.md) (a deprecation policy with real trade-offs) or [ADR 0009](docs/adr/0009-curated-whats-new-release-notes.md) (a build-vs-runtime choice with rejected alternatives) for what a good one looks like.

`CONTEXT.md` at the repo root is the companion glossary — sharpen or add a term there when a PR introduces or clarifies project-specific vocabulary; general programming concepts don't belong in it.

---

## Pull Requests

### Opening a PR

1. Push your branch: `git push -u origin feat/231-your-feature`
2. Open a PR targeting `dev` on GitHub.
3. Fill in the PR template with:
   - Clear description of what changed and why
   - How to test the change (steps or test commands)
   - Any related issues (e.g., "Fixes #123")
4. Ensure CI checks pass (tests, lint, type checking).

### Review Process

- At least one maintainer review is required before merge.
- Address feedback in new commits; don't force-push (it helps reviewers see what changed).
- Keep conversations constructive and collaborative.

### Merge & Cleanup

- Maintainers will merge when approved.
- Delete your branch after merge: `git branch -d feat/231-your-feature`

---

## Branching Strategy

We use a stable `master` branch with active development on `dev`. This section documents the complete branching model for contributors and maintainers.

### Branch Types

**`master`**
- Always production-ready and stable
- **No direct commits** — changes arrive only via merged release branches
- Every commit on master corresponds to a tagged release
- Protected branch; PRs require review and all checks passing

**`dev`**
- The living integration branch — all contributor work lands here
- Must always be **at or ahead of master**
- After every stable release, `master` is merged back into `dev` immediately
- **Do not rebase shared `dev`** — use merge if syncing with master
- Should be stable enough to cut a release branch from at any time

**Feature / Fix Branches** (`feat/...`, `fix/...`, `docs/...`, `chore/...`)
- Always branch off `dev`, never off master
- PR back into `dev` when work is complete and self-tested
- Delete after merge to keep the repo clean

**Release Branches** (`release/x.x.x`)
- Cut from `dev` when features for a release are complete
- Only stabilization work (bug fixes from beta testing) happens here — no new features
- Merge into `master` when stable, then immediately back into `dev`

### Contributing Workflow

1. **Sync dev:**
   ```bash
   git checkout dev && git pull origin dev
   ```

2. **Create branch:**
   ```bash
   git checkout -b feat/231-your-feature
   ```

3. **Stay current (while working):**
   ```bash
   git fetch origin && git rebase origin/dev
   ```

4. **Open PR** targeting `dev` when complete and tested.

5. **Delete branch** after merge.

---

## Release Process

This section documents how releases are cut, tested, and published.

### Step 1 — Feature Complete

All planned features and fixes for the release have merged into `dev`.

### Step 2 — Cut Release Branch

```bash
git checkout dev && git checkout -b release/2.3.0
```

### Step 3 — Bump Version

Before tagging, bump the version with `npm version` to keep `package.json`, `package-lock.json`, `manifest.json`, and `versions.json` in sync:

**For first Beta:**
```bash
npm version 2.3.0-beta.1 --no-git-tag-version
git add package.json package-lock.json manifest.json versions.json
git commit -m "2.3.0-beta.1"
```

**For Stable release:**
```bash
npm version 2.3.0 --no-git-tag-version
git add package.json package-lock.json manifest.json versions.json
git commit -m "2.3.0"
```

### Step 4 — Tag and Announce Beta

```bash
git tag 2.3.0-beta.1
git push --set-upstream origin release/2.3.0 --tags
```

Use `--set-upstream` on the first push of a new release branch so your local branch tracks `origin/release/...` and tools like VS Code stop showing `Publish Branch`.

Pushing the Beta tag triggers this repo's GitHub Actions release workflow, which builds the plugin and creates a GitHub pre-release with the standard Obsidian assets attached (`main.js`, `manifest.json`, `styles.css`). The workflow also emits GitHub artifact attestations for `main.js` and `styles.css` so release assets have verifiable build provenance.

If the workflow is unavailable for any reason, create the GitHub release manually from the same tag and upload those files yourself. Manual uploads do not create attestations — for compliance, re-run the release workflow from the tag afterward so attestations are generated in GitHub Actions.

Announce to testers via BRAT and collect feedback.

### Step 5 — Stabilize (if needed)

Fix beta issues on the release branch only:

```bash
npm version 2.3.0-beta.2 --no-git-tag-version
git add package.json package-lock.json manifest.json versions.json
git commit -m "2.3.0-beta.2"
git tag 2.3.0-beta.2 && git push origin release/2.3.0 --tags
```

If `release/x.x.x` already exists and you need to cut another Beta:

1. Open a PR to bring the release-bound work from `dev` into `release/x.x.x` first, and merge it **without squashing** so the release branch keeps the same commit history that was tested on `dev` (use **Create a merge commit**, never **Squash and merge**, for release-branch integration PRs).
2. Only open a full `dev` → `release/x.x.x` PR when every new commit on `dev` is intended for that release. If `dev` already contains work meant for a later release, open a narrower PR or cherry-pick only the fixes/features that belong in the current one.
3. After the release branch contains the exact changes you want to ship, bump to the next Beta version on the release branch, tag it, and push it.

### Step 6 — Ship Stable

Before running the commands below, finalize the changelog per [release-notes-workflow.md](docs/development/release-notes-workflow.md) and work through the [pre-release checklist](docs/development/pre-release-checklist.md) — including renaming `CHANGELOG.md`'s `## Unreleased` heading to the release version and adding the release line's curated What's New note under `src/release-notes/notes/`. Neither is part of the version-bump commit below.

When confident:

```bash
npm version 2.3.0 --no-git-tag-version
git add package.json package-lock.json manifest.json versions.json
git commit -m "2.3.0"

git checkout master && git merge release/2.3.0
git tag 2.3.0 && git push origin master --tags

git checkout dev && git pull --ff-only origin dev
git merge origin/master && git push origin dev

git branch -d release/2.3.0
```

Pushing the stable tag triggers GitHub Actions to build and create a release with plugin assets (`main.js`, `manifest.json`, `styles.css`). Stable releases should be published through the workflow path so attestation records exist for `main.js` and `styles.css`; if you ever need to do it manually, upload those same files to a release created from tag `2.3.0`.

### Tag Retention

- Keep all published `x.x.x-beta.n` tags for traceability and bisecting regressions.
- Do not move, retarget, or reuse published tags, and do not recreate a deleted tag name at a different commit.
- If a tag was created by mistake and must be removed, document the removal in the changelog or release notes.
- Having many tags in a mature project is normal and preferred over rewriting history.

### Versioning (SemVer)

We follow [Semantic Versioning](https://semver.org):

| Part | When to bump |
|------|--------------|
| **MAJOR** | Incompatible API changes or breaking user setups |
| **MINOR** | New functionality in a backward-compatible manner |
| **PATCH** | Backward-compatible bug fixes |

Pre-release labels: `x.x.x-beta.n` (testing) and `x.x.x` (stable). No Alphas or RCs.

---

## Naming Conventions & Validation

Folder and feed titles must adhere to these rules for Obsidian compatibility:

**Forbidden characters:** `[ ] # ^ | / \ : * " < > ?`  
**No leading dots** (e.g., `.rss-data` is invalid; use `rss-data`)  
**No empty names**

### Implementation

- **User input:** Validate with `isValidFolderName(name)` or `isValidFeedTitle(title)` from `src/utils/validation.ts`. Provide feedback via `Notice`.
- **Automated imports:** Use `sanitizeName(name)` to replace forbidden characters and strip leading dots.
- **Tests:** Update `test_files/unit/validation.test.ts` when changing validation logic.

---

## Key Rules

- **Never commit directly to `master` or `dev`** — always via PR
- **One concern per branch** — don't mix features with unrelated fixes
- **Keep branches short-lived** — long-running branches cause merge conflicts
- **Rebase your personal feat/fix branch** — keeps history linear and readable
- **Merge `master` into shared `dev` after every stable release** — preserves history
- **Beta fixes go on the release branch** — not back on dev until the release merges
- **Only Beta and Stable releases** — no Alphas or RCs

---

## Quick Reference

```bash
# Start new work
git checkout dev && git pull origin dev
git checkout -b feat/231-my-feature

# While working, stay current
git fetch origin && git rebase origin/dev

# Before PR: test and lint
npm run test:unit && npm run lint && npx tsc -noEmit

# Cut a release branch
git checkout dev && git checkout -b release/2.3.0

# Bump and tag Beta
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

---

## Need Help?

- 💬 **[Discord Community](https://discord.gg/9bu7V9BBbs)** — Ask questions and connect with other contributors.
- 📖 **[Development Docs](docs/development/README.md)** — Architecture, design patterns, and internal guides.
- 🐛 **[GitHub Issues](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues)** — Report issues or browse ongoing work.
- 📋 **[Public Roadmap](docs/plans/public-roadmap.md)** — See what's being planned.

---

**Thank you for contributing!** We're excited to work with you and grateful for your help making RSS Dashboard better.
