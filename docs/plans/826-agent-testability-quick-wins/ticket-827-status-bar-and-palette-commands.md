# Ticket AGTEST-T1: Version status bar accessibility and palette commands

Namespace / source revision / canonical source: AGTEST / r1 / `docs/plans/826-agent-testability-quick-wins/spec.md`, derived from `docs/plans/826-agent-testability-quick-wins.md`, base `bc639d6ec41f84c6a695afef198120dbe9b79159`
Readiness: **ready**, with the two excluded commands listed under Non-goals. See "Findings at drafting time" for one scoping note.
Dependencies: none

Suggested GitHub title: `feat(commands): accessible version status bar item and palette commands for agent testability (AGTEST-T1)`
Suggested template: `.github/ISSUE_TEMPLATE/feature_request.md`; branch `feat/<issue>-agent-testability-commands` off `origin/dev`; PR targets `dev`. Parent program: #681. Related: #803, PR #816.

## Terms

**Version status bar item**: the small text label the plugin adds to Obsidian's status bar (bottom of the window) when "Show version in status bar" is on. It shows the build label, e.g. `Version 2.7.0 · build 96cd0b7 · 2026-09-24 18:03 UTC`. Added by #803/#816 in `src/settings/version-status-bar.ts`. It is unrelated to article read/unread status or starred state. Where this ticket says "status filter", it means the dashboard's all/unread/read filter.

## Contract snapshot

**Acceptance**

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                               | Verification                                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| AC-002 | The version status bar item has `role="status"` and accessible name `RSS Dashboard version <x>`, where `<x>` is the manifest version.                                                                                                                                                                                                                                                                                                                     | jsdom assertion by role + name (TEST-001). Keep the text static after creation so it is not re-announced.      |
| AC-003 | Clicking the version status bar item opens the dashboard. If the dashboard is already open it is revealed, not duplicated. With the setting off, no item and no click path exists.                                                                                                                                                                                                                                                                        | jsdom click with a stubbed open-dashboard callback (TEST-001); fixture-vault check (TEST-002).                 |
| AC-004 | A command registration module registers the AC-005/AC-006 commands with stable kebab-case ids recorded in the testing docs; the `main.ts` change is a one-line delegate; `onload` order is preserved.                                                                                                                                                                                                                                                     | Unit test over the registered command list; `npm run check:architecture`; diff review of `main.ts` (TEST-003). |
| AC-005 | Settings commands open settings at each tab in `SETTINGS_TAB_NAMES` (`src/settings/tab-names.ts`). Dashboard commands: focus search, clear filters, filter all/unread/read/starred, switch list/card/feed, collapse all folders, expand all folders. Reader commands: next/previous article, close reader, toggle star, toggle read, open tags, open original. Each delegates to the view method the hotkey uses (DEC-007) and sets no default `hotkeys`. | Stub-view delegation tests, `hotkeys` undefined (TEST-003); fixture-vault palette run per command (TEST-004).  |
| AC-006 | Commands use `checkCallback` and are listed only when applicable: reader commands only while a Reader is open; dashboard commands only while a dashboard view exists. `checking=true` has no side effects.                                                                                                                                                                                                                                                | Unit test calling `checkCallback(true)` per state, asserting the return value and no mutation (TEST-003).      |
| AC-015 | The PR records environment, evidence, and the before/after time to reach a Reader action; the testing docs list the stable command ids.                                                                                                                                                                                                                                                                                                                   | PR body review; docs diff.                                                                                     |
| AC-016 | `npm run format:check`, ESLint on changed files, `npm run check:platform`, `npm run check:architecture`, related unit tests, and `tsc --noEmit --skipLibCheck` pass.                                                                                                                                                                                                                                                                                      | Command output at the reviewed revision.                                                                       |

**Decisions**

- DEC-004 (settled): no default `hotkeys` on new commands; document suggested bindings only.
- DEC-007 (settled): commands delegate to the same view methods the hotkeys call; they do not reimplement behavior.
- DEC-008 (settled): ids stable and kebab-case, they are a test contract; registration in a new module (e.g. `src/commands/`) called from `onload` in the existing order; `main.ts` gains only a one-line delegate.
- DEC-010 (settled): cite the WCAG 2.2 criterion on the PR (2.1.1 Keyboard, 4.1.2 Name/Role/Value).
- DEC-001/DEC-002 (settled, shipped in #816): the version status bar item shows the full build label and is off by default. Do not change the text.
- DEC-006 (out-of-scope): see Non-goals.

**Testing seams**

| ID       | Behavior               | Boundary                                                | Verification                                                                                                       | Reason                                       |
| -------- | ---------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| TEST-001 | AC-002, AC-003         | `VersionStatusBarFeature` public API, jsdom element     | Extend `test_files/unit/settings/version-status-bar.test.ts`: role + name; click calls the open-dashboard callback | Existing seam from #816                      |
| TEST-002 | AC-003                 | Real plugin in the fixture vault                        | Enable the setting, click the item, observe the dashboard leaf                                                     | The callback must hit the real workspace     |
| TEST-003 | AC-004, AC-005, AC-006 | Command module with a fake `addCommand` and a stub view | Collect commands; assert ids, delegation, `checkCallback` states                                                   | Public boundary of the new module            |
| TEST-004 | AC-005                 | Command palette in the fixture vault                    | Run each command by name; observe the view state                                                                   | Obsidian dispatch cannot be faked faithfully |

**Constraints:** AGENTS.md rules (branch from `origin/dev`, architecture preflight before touching `main.ts`, no `eslint-disable`, `activeDocument`/`window.*` timers, no `!important`); tests under `test_files/unit/`; command naming follows the existing style in `main.ts` (~line 1001).

**Non-goals**

- `Copy diagnostics` (AC-007/008): blocked on UNK-001 (field allowlist). Separate ticket.
- `Mark all read` palette command: blocked on UNK-002 (confirmation behavior). Excluded from AC-005 for this ticket.
- Icon-button helper, roving tabindex, live region, ready flag, menus, dialogs, landmarks (AC-009 to AC-014).
- Any change to the build-label text or the status-bar setting.
- Mobile and popout verification: remains `UNVERIFIED` unless checked.

## Findings at drafting time (from reading `src/` at base `bc639d6e`)

ASM-001 is partly confirmed. These view methods exist and the hotkeys use them: `actionNavigateNext/Previous`, `actionToggleReadStatus`, `actionToggleStarStatus`, `actionToggleTagsMenu`, `actionSetViewStyle("list"|"card"|"feed")`, `actionSetStatusFilter("all"|"unread"|"read")`.

These AC-005 commands have no matching `action*` method in the hotkey files: filter **starred** (the status filter takes only all/unread/read), focus search, clear filters, collapse/expand all folders, close reader, open original, and open settings at a tab. Resolution for this ticket (a routine implementation choice, no user decision needed): where the behavior already exists in the view/sidebar/settings code, add a thin `action*` wrapper that calls it and delegate to that; do not copy the logic into the command module. Where the behavior does not exist at all, **do not invent it**: leave that command out and record it on the issue as a follow-up. The PR must list which commands shipped and which were left out.

## Completion

- Evidence per AC-002 to AC-006 at the reviewed revision, citing TEST-001 to TEST-004; fixture-vault run covers every shipped command by palette name and the version status bar item click.
- AC-015: ids documented in the testing docs; PR carries the before/after timing and environment.
- AC-016: raw command output for each gate; `git status --short` clean of generated files.
- Integration responsibility: whole-spec integration is verified later, after T2/T3 follow-ups; AC-002 to AC-006 are owned wholly by this ticket.

## Spec-wide coverage ledger

| AC               | Disposition           | Owner / contributing / integration verifier                          | Reason                                                                                                   |
| ---------------- | --------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| AC-001           | represented           | shipped in #816; regression covered by TEST-001 in T1                | Source: spec AC-001                                                                                      |
| AC-002           | represented           | T1                                                                   |                                                                                                          |
| AC-003           | represented           | T1                                                                   |                                                                                                          |
| AC-004           | represented           | T1                                                                   |                                                                                                          |
| AC-005           | represented (partial) | T1 for all commands except `Mark all read`; `Mark all read` deferred | Deferral cites UNK-002, user instruction 2026-10-06 ("leave them as blockers")                           |
| AC-006           | represented           | T1                                                                   |                                                                                                          |
| AC-007           | deferred              | later ticket                                                         | UNK-001 unresolved; user instruction 2026-10-06                                                          |
| AC-008           | deferred              | later ticket                                                         | UNK-001 unresolved; user instruction 2026-10-06                                                          |
| AC-009 to AC-011 | deferred              | later ticket                                                         | Slice 2, not in this horizon; also UNK-004 (#502 overlap). User instruction: one ticket for Slice 1 only |
| AC-012, AC-013   | deferred              | later ticket                                                         | Slice 3; UNK-005 for AC-012                                                                              |
| AC-014           | deferred              | later ticket                                                         | Slice 4 outline only                                                                                     |
| AC-015           | represented           | T1 (recurs per later ticket)                                         |                                                                                                          |
| AC-016           | represented           | T1 (recurs per later ticket)                                         |                                                                                                          |

Reverse coverage: status bar item semantics, click handler, command module, tab/dashboard/reader commands, checkCallback availability, docs of ids, and the new `action*` wrappers each map to AC-002 to AC-006 or AC-015; the thin `action*` wrappers are the enabling task for AC-005 under DEC-007.
Dependency check: no dependencies, no cycles; deferred tickets are unnumbered and do not exist yet.
Publication readback: not published. Draft only.
