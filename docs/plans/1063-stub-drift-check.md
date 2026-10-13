---
status: in-progress
created: 2026-10-13
issue: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1063
milestone: ""
owner: unassigned
workstream: ""
sequence: null
depends_on: []
release_requirement: ""
implementation: ""
---

# Stub drift check: detect Obsidian release changes

**Risk:** Low. This is developer tooling: a maintenance script, a
machine-readable baseline, a test file, and documentation. It changes no
production code and no required gate.

## Goal

Detect when an Obsidian release stops containing something the test stub relies
on, so `#372`/`#431`-style divergences are found between probe sessions instead
of in production. The stub (`test_files/stubs/obsidian.ts`) is pinned to a
reference release (ADR 0014); this issue adds the missing detection around it.

## Accepted contract

- **DEC-001** The automated check is app-free: it reads the public
  `obsidian-<version>.asar.gz` release asset and needs no Obsidian install. Only
  the behavioral re-probe needs a device.
- **DEC-002** It is a canary, not a required gate. `check:stub-drift` is not part
  of `check:compliance`, `npm run build`, or any pull-request check. This
  supersedes `#431`'s "wire into `#253`" wording.
- **DEC-003** The pin (`OBSIDIAN_REFERENCE_VERSION`) and the baseline change only
  after a probe session and a green contract test.
- **DEC-004** Read, never copy: index names and strings only; commit no
  Obsidian-derived code (ADR 0014 rule 2).
- **DEC-005** One machine-readable baseline is the single record of the
  certified release.
- **DEC-006** Findings become one tracked issue labelled `obsidian-update`,
  updated rather than duplicated.

## Design

### `scripts/check-stub-drift.mjs` → `npm run check:stub-drift`

App-free. Downloads `obsidian-<version>.asar.gz` from `obsidian-releases`,
gunzips it, and reads `app.css` and `app.js` from the asar with
`@electron/asar`. It indexes a defined catalog of pinned facts and diffs them
against `test_files/stubs/obsidian-baseline.json`.

Flags: `--obsidian <x.y.z>` (pin), `--update-baseline` (certify), `--report
<file>` (Markdown findings), `--baseline <file>`, `--cache <dir>`, `--help`.

- Exit `0` when every baseline fact is present; exit non-zero, naming each
  missing fact, when one is gone.
- A catalog fact present in the release but not yet certified is reported as
  new and does **not** fail.
- `--update-baseline` refuses to certify a release that lacks a catalog fact, so
  a certification cannot silently accept drift.
- Without `--obsidian`, selects the newest public **stable** release that ships
  a desktop `.asar.gz`, skipping prereleases, drafts, and mobile-only releases
  (the real `v1.13.8` is APK-only). The selected asar is cached.

### Dependency

`@electron/asar@^4.3.1` (MIT) is the only new package; it reads the archive. It
is a devDependency, so `THIRD-PARTY.md` (bundled dependencies only) needs no
entry, and `npm audit --audit-level=high` reports no new advisory. Its `glob@13`
dependency sets an `engines` floor of Node >= 22.12, above the repository's
`engines.node` (>= 20.19); CI (`.nvmrc` = 22) and the dev machine satisfy it,
and only `check:stub-drift` needs it. `@electron/asar@3.x` avoids that floor
only by pulling the deprecated `glob@7`.

### Pinned facts (ASM-001)

A fact is a distinctive string the stub reproduces. Three error/exception
messages, indexed in `app.js`:

- `Folder already exists.`, `File already exists.`,
  `Destination file already exists!`

Fifteen CSS class names, indexed across `app.css` and `app.js`:

- `setting-item-heading`, `mod-cta`, `mod-destructive`, `is-disabled`,
  `is-enabled`, `checkbox-container`, `slider-value`, `notice-message`,
  `modal-container`, `menu-item`, `mod-checked`, `math`, `is-loaded`,
  `mjx-container`, `extra-setting-button`

Deliberately not indexed: numeric literals (`vault.cacheLimit`), lucide alias
mappings (`trash → trash-2`), and icon counts — they do not survive as
distinctive strings, so a false result would be worse than no check (per the
issue). Also not indexed: the `ENOENT: no such file or directory, open '<path>'`
and `EPERM: operation not permitted, unlink '<path>'` message shapes. Node
generates those from `fs` at run time; a full-file scan of the 1.14.4 asar finds
`no such file or directory` and `operation not permitted` **zero** times, so no
release artifact can confirm them. They stay with the contract test and the
device probe. This is the one place the issue's fact table could not be
confirmed against a real release; it does not block the mechanism.

### `test_files/stubs/obsidian-baseline.json`

`{ "obsidian": "<version>", "facts": { "<id>": { kind, match, sources } } }`,
written by `--update-baseline`. Certified at `1.14.4` first (the current pin).
Serialized in the repository's Prettier format so regenerating it does not fail
`format:check`.

### Canary (Part B — separate follow-up PR)

`.github/workflows/obsidian-canary.yml`: weekly `schedule` + `workflow_dispatch`
only, `permissions: contents: read, issues: write`, runs the check against the
newest release with `--report drift.md`, ensures the `obsidian-update` label,
files or updates one issue, and fails only when a pinned fact is gone. Actions
pinned by full commit SHA with a `# v7`-style comment, matching `test.yml`.

## Implementation and tests

- `scripts/check-stub-drift.mjs`: the check and its pure parts
  (`indexRelease`, `diffFacts`, `selectNewestStableRelease`, `parseArgs`,
  `serializeBaseline`, `parseBaseline`, `renderReport`, `runStubDrift`).
- `test_files/unit/check-stub-drift.test.ts`: `TEST-001` (CLI boundary over a
  canned asar built with `@electron/asar`), `TEST-003` (gone vs new
  dispositions; exact Prettier-shape baseline round-trip), `TEST-004`
  (newest-release selection over a recorded releases-API fixture with a
  mobile-only newest release).
- `test_files/unit/fixtures/obsidian-releases.json`: the recorded fixture.
- `test_files/stubs/obsidian-console-probes.md`: names `check:stub-drift` as the
  app-free half and separates it from the device-required probes.
- `docs/development/pre-release-checklist.md`: a release-cut line to resolve or
  defer any open `obsidian-update` issue, re-probe, bump the pin, and update the
  baseline.
- `docs/adr/0014-obsidian-test-stub-fidelity.md`: a 2026-10-13 amendment noting
  the app-free canary that complements the manual probes.

## Validation

`npm run format` and `format:check`, `npm run lint`, the focused vitest file,
`tsc --noEmit`, `check:platform`, `check:architecture`, `check:pre-release`,
`check:doc-links`, and `npm run build`.

`TEST-002` (no Obsidian source under `test_files/` or `scripts/`) is an
inspection seam: the baseline carries fact ids, match strings, and source file
names only; the script carries no extracted Obsidian code.

`TEST-006` is documentation: the checklist rule is manual. A `check:pre-release`
assertion would need a network call to the GitHub issues API, so it is
deliberately left out of the offline compliance gate; the plan records that
decision.

## Manual checks

- `npm run check:stub-drift -- --obsidian 1.14.4` → exit 0, all 18 facts present.
- `npm run check:stub-drift -- --obsidian 1.13.7` → exit 0 (every fact predates
  the pin), and `--obsidian 0.11.1` → exit 1, naming the four facts it lacks.
- Part B: dispatch the canary once after merge; confirm no issue is filed when
  nothing has gone, then confirm the filing path with the stubbed fixture.

## Staging

- **Part A (this PR, `chore/1063-stub-drift-check`)**: the script, baseline,
  tests, and docs (AC-001…004).
- **Part B (follow-up PR, `chore/1063-stub-drift-canary`)**: the workflow
  (AC-005), whose issue-filing path depends on Part A merging first.
