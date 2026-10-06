---
status: in-progress
created: 2026-10-06
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/826"
milestone: ""
owner: unassigned
workstream: accessibility
sequence: null
depends_on:
  - 681-accessibility-rollout.md
release_requirement: ""
implementation: ""
---

# Agent Testability Quick Wins

## Summary

Make plugin state and controls readable and operable through user-facing semantics, so automated and AI-driven tests run faster and keyboard and screen-reader users get the same access. This extends [681 — Accessibility Rollout](681-accessibility-rollout.md) (step 4, agent operation). Human access stays the purpose; agent speed is the added benefit.

Not a conformance claim. Cite the applicable WCAG 2.2 criterion on each PR (2.1.1 Keyboard, 2.4.3 Focus Order, 4.1.2 Name/Role/Value, 4.1.3 Status Messages).

## Handoff notes (for the implementing session)

This plan was drafted in a remote session with no GitHub write access and no running Obsidian. Facts below come from grepping `src/` and `main.ts`; verify before relying on them.

- Start from `AGENTS.md`: branch off `origin/dev`, read the mandatory files (`.instructions.md`, `eslint.config.mjs`, testing guide, branch naming), and run the architecture preflight in `docs/development/architecture.md` before touching `main.ts`.
- Create the GitHub issue(s) first, store the URL in `issue:`, and rename the draft per `docs/development/README.md` (Plan Lifecycle).
- One slice per issue and PR, targeting `dev`.
- Verify in the fixture vault (`docs/development/fixture-vault.md`), not only jsdom.

## Already shipped

The version readout from Slice 1a landed before this plan was filed, in [#803](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/803) and [PR #816](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/816):

- `src/settings/version-status-bar.ts` (`VersionStatusBarFeature`) owns the status bar item; `main.ts` only wires it.
- Text is the full build label from `formatBuildLabel` (version, commit, `+dirty`, UTC build time), not version only. This supersedes Decision 1 below, because #373 needs the build to tell local builds apart.
- Off by default, with a "Show version in status bar" toggle in the display settings tab, plus the command `show-version-in-status-bar` ("Toggle version in status bar").
- The fixture vault's `data.json` enables it.
- Unit tests in `test_files/unit/settings/version-status-bar.test.ts`.

Still missing from the original 1a spec, so it becomes a small follow-up in Slice 1 (see below): `role="status"`, an accessible name, and click-to-open-dashboard.

## Findings

- 10 palette commands exist (`main.ts:985-1058`, plus the status bar toggle from #816): open dashboard/discover, refresh, OPML and preferences import/export, apply feed limits, toggle sidebar. None cover Reader actions, settings tabs, filters, or view modes.
- No palette command sets `hotkeys`.
- Rich in-view shortcuts already exist and are documented in `docs/user/keyboard-shortcuts.md` (mirrored in `src/modals/shortcut-help-modal.ts`). They are registered in `src/hotkeys/dashboard-hotkeys.ts` (DOM keydown on the dashboard) and `src/hotkeys/reader-hotkeys.ts` (Obsidian `Scope` on the Reader). Examples: `r` refresh, `f` star, `m` read/unread, `t` tags, `o`/`Enter` open, `j`/`l` prev/next, `Shift+1/2/3` filters, `1/2/3` view mode, `Shift+s/r/d` focus sidebar/reader/dashboard.
  - These only fire when the view has focus, are skipped inside inputs and modals, and are unbound for several actions (settings tabs, clear filters, close reader).
  - So palette commands are not a duplicate of the shortcuts: they work from any focus and are discoverable by name. They must delegate to the same view `action*` methods the hotkeys call, not reimplement behavior.
- The only status bar items are the optional version item (#816) and the transient import-progress item in `src/services/background-import-service.ts`.
- 43 `role: "button"` on non-native elements and 65 `tabindex` uses; migration is tracked in #502. Only star and tags are reliably tabbable in the Reader toolbar.
- No stable test hooks (`data-*`) beyond what CSS needs.

## Decisions

Resolved so the implementer does not have to re-ask:

1. Status bar content: the build label shipped in #816 (version, build id, build time). No counts; they add update cost and duplicate the diagnostics command. _Revised: was version only._
2. Status bar default: off for users, with a "Show version in status bar" setting; the fixture vault's `data.json` enables it. _Shipped in #816._
3. Diagnostics command: ship to everyone, no developer gate. Output is redacted: counts, ids, view and filter state, setting names/values that are non-sensitive; never feed URLs, tokens, or note content. Delivered to the clipboard plus a Notice.
4. Hotkeys on new commands: none by default (collisions with user bindings). Document suggested bindings only.
5. Arrow-key toolbars on mobile: no mobile-specific work. Roving tabindex degrades to normal tap/Tab behavior; verify it does not break touch.
6. Playwright/CDP package, axe-core, lint rule: out of scope here (see Out of scope).

## Scope

Plugin-owned UI only. Host Obsidian UI and article content are out of scope.

### Slice 1: Status item semantics and commands

**1a. Status bar item semantics (remaining work only)**

- Add `role="status"` and an accessible name (`RSS Dashboard version <x>`) to the existing item.
- Click opens the dashboard.
- Extend `version-status-bar.test.ts`; keep the logic in `VersionStatusBarFeature`.

**1b. Palette commands**

All use the existing naming style (Obsidian adds the plugin name), `checkCallback` so they only appear when applicable, and delegate to existing view methods.

- Settings: open settings at each tab (General, About, and the rest in `src/settings/tab-names.ts`).
- Dashboard: focus search, clear filters, filter all/unread/read/starred, switch list/card/feed view, mark all read, collapse/expand all folders.
- Reader: next/previous article, close reader, toggle star, toggle read, open tags, open original.
- State: `Copy diagnostics` (Decision 3).
- Command ids stable and kebab-case; they become a test contract, so add them to the testing docs.

Put registration in a new module (for example `src/commands/`), called from `onload` in the existing order. Do not grow `main.ts`.

### Slice 2: Shared icon-button helper and Reader toolbar

- One `createIconButton()` factory: native `<button type="button">`, required accessible name, optional `aria-pressed`, `aria-expanded`, `aria-haspopup`.
- `data-rss-action` and `data-rss-region` set inside the helper only. Tests prefer role + name; hooks only disambiguate duplicates and must never hide an inaccessible user path.
- Roving tabindex for the Reader toolbar: one Tab stop, arrows/Home/End move within, Tab leaves.
- Migrate Reader toolbar and submenus first; remaining `role="button"` divs follow #502 (do not duplicate its styling spike; check #502 before starting).

### Slice 3: Announcements and readiness

- One `aria-live="polite"` region for refresh started/finished, "N new articles", and errors.
- `data-rss-ready` flag on the view root after initial render, so harnesses wait on a signal instead of a timeout.

### Slice 4: Menus, dialogs, landmarks

- Menus: `role="menu"`/`menuitem`, arrow-key navigation, Esc closes, focus returns to the trigger. Candidates: filter menu, tags dropdown, sidebar context menus.
- Dialogs: `role="dialog"`, `aria-modal`, focus trap, defined initial focus.
- Landmarks: sidebar `navigation`, article list `main`, cards `article`, `aria-current` on the active feed/article.

## Verification

- jsdom unit tests under `test_files/unit/` per `docs/development/test_coverage/testing-guide.md`: helper semantics, command availability and delegation, status item, live region.
- Keyboard path and visible focus checked in the fixture vault for each changed flow.
- AX-tree capture of the Reader toolbar before and after; screenshots for focus visibility.
- Record the time to reach a Reader action, before and after, in the PR. (Reading the version is already a single glance with the status bar on.)
- Record environment and evidence; mark mobile and popout as unknown unless checked.
- Required gates from `AGENTS.md`: `npm run format`, lint on changed files, `npm run check:platform`, `npm run check:architecture`, related unit tests, `tsc --noEmit --skipLibCheck`.

## Out of scope

- Playwright/CDP helper package and AX-snapshot regression suite. Revisit after slices 1-3 (681 open decision).
- axe-core scan and a lint rule against non-native buttons. Separate tickets; any `eslint.config.mjs` change needs maintainer approval.
- Any blanket WCAG conformance claim.

## Risks

- Command-name churn: ids and names become a test contract; keep them stable.
- Diagnostics leaking sensitive data: redaction needs a unit test with a feed URL containing credentials.
- Roving tabindex can strand focus if the active item is removed; test re-render paths.

## Related

- [681 — Accessibility Rollout](681-accessibility-rollout.md)
- [Accessibility declaration](../../ACCESSIBILITY.md)
- [Keyboard shortcuts](../user/keyboard-shortcuts.md)
- [Issue #502 — Native icon buttons](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/502)
- [Issue #803](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/803) and [PR #816](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/816) — version status bar (shipped)
