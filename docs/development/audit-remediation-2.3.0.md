# Audit Remediation — v2.3.0 Working Checklist

> **Workflow**: Use this file as the active working list during remediation. Once all items are checked off, update `plugin-scorecard.md` with a post-mortem summary and close this file out.
>
> **Current score**: 72% compliant (up from 46% in v2.2.0)
> **Target**: 100% compliant

---

## 🔴 Risks (Must Fix)

- [x] **Dynamic `<script>` element creation** — Locate and remove all dynamic script element injection. Replace with a safe alternative (static imports, Obsidian API, or a sanctioned content injection pattern). Add CI/CD lint rule to block future regressions. See `.github/workflows/` for enforcement rule.

- Notes:
  - Added CI/CD ESlint rule to eslint.config.mjs - "no-restricted-syntax" - to block future regressions
  - Plan: 'docs\development\2.3.0-audit\remove-dynamic-youTube-script-injection.md'
  - Implemented plan
  - Tested new implementation - working.
  - ESLint passes.

- [x] **Direct filesystem access via Node.js `fs` module** — Plugin is accessing the filesystem outside of the Obsidian vault API (`vault.read`, `vault.modify`, etc.). Audit all `fs` usages and migrate to the Obsidian API. Flag any cases where `fs` is genuinely required and document the justification in `docs/SECURITY.md`.

- Notes:
  - Plan: `docs/development/2.3.0-audit/remediate-direct-filesystem-access.md`
  - Audited all instances of `fs` usage and completely eliminated Node.js `fs` and `path` dependencies from the production codebase.
  - Migrated OPML import file pickers in `main.ts` and `src/modals/import-opml-modal.ts` to standard, sandboxed browser `<input type="file" accept=".opml,.xml,.backup">` elements, which use standard HTML5 File APIs.
  - Removed the desktop-only synchronous backup flow (`performAutoBackupsSyncDesktop()`) from `src/services/backup-service.ts` and `main.ts`, which bypassed the vault sandbox.
  - Configured auto-backups to run as a standard asynchronous best-effort task on `onunload` using cross-platform sandboxed `vault.adapter` APIs.
  - Removed all `window.require("fs")` and `window.require("path")` calls from the codebase, meaning no security exemptions are needed in `docs/SECURITY.md`.
  - Updated the unit tests in `test_files/unit/services/backup-service.test.ts` and `test_files/unit/main/plugin-lifecycle.test.ts` to reflect the removal of `performAutoBackupsSyncDesktop()`.
  - Confirmed all lint checks and unit tests pass clean.

---

## 🟡 Warnings (Address or Document)

> Warnings do not block compliance but will reduce score. Per project policy, warnings that cannot be eliminated must be documented in `CONTRIBUTING.MD` with an inline justification comment in the source file.

### CSS — `!important` Usage (900 warnings)

- [ ] Audit entire codebase for `!important` declarations — replace with higher-specificity selectors or CSS variables where feasible
- [ ] For any `!important` that must remain (e.g. Obsidian theme override conflicts), add an inline comment: `/* audit-ok: !important required to override Obsidian theme specificity */`
- [ ] Document the approved exception pattern in `CONTRIBUTING.MD`

- Note: Line from @controls.css - \* We use !important on display toggles to prevent overrides from later-loaded stylesheets (modals.css, discover.css) - need to investigate further

### CSS — Partially Supported Browser Features

#### `css-scrollbar` (14 warnings)

- [x] `styles.css` (7 occurrences) — evaluate if scrollbar styling is critical; consider wrapping in a `@supports` query or removing
- [x] `src/styles/modals.css:2762`, `2763-2767`, `2814`
- [x] `src/styles/sidebar.css:347`, `348-349`, `789`, `1159`

#### `multicolumn` (8 warnings)

- [x] `styles.css` (4 occurrences)
- [x] `src/styles/card-view.css:654`
- [x] `src/styles/modals.css:1579`
- [x] `src/styles/settings.css:556`, `974`

#### `css-display-contents` (2 warnings)

- [x] `styles.css:1`
- [x] `src/styles/controls.css:1087`

### CSS — Duplicate Property Declarations

#### `max-height` (8 warnings)

- [x] `styles.css`
- [x] `src/styles/modals.css:2492`, `2544`
- [x] `src/styles/reader.css:457`
- [x] `src/styles/sidebar.css:739`

#### `height` (4 warnings)

- [x] `styles.css` (2 occurrences)
- [x] `src/styles/modals.css:2488`, `2540`

#### `min-height` (4 warnings)

- [x] `styles.css` (2 occurrences)
- [x] `src/styles/modals.css:2490`, `2542`

#### `padding` (2 warnings)

- [x] `styles.css:1`
- [x] `src/styles/articles.css:56` — resolved by consolidating the two `@media (max-width: 1200px)` blocks into one

#### `position` (2 warnings)

- [x] `styles.css:1`
- [x] `src/styles/controls.css:186`

#### `bottom` (2 warnings)

- [x] `styles.css:1`
- [x] `src/styles/dropdown-portal.css:46`

#### `color` (1 warning)

- [x] `src/styles/articles.css:58` — resolved by merging `.video` and `.youtube` feed-icon rules into a single grouped selector

#### `border` (1 warning)

- [x] `src/styles/articles.css:54` — confirmed false positive (different selectors); no change needed

#### `line-height` (1 warning)

- [x] `src/styles/modals.css:461`

> **Note on `styles.css` duplicate warnings**: Many of these point to `styles.css:1`, which is the build-bundled output. The root cause is likely in the source CSS files — fix there; the bundled file should clear automatically.

---

## 🔵 Other

- [ ] **Extra release artifact** — `obsidian-rss-dashboard.zip` is included in the release but only `main.js`, `manifest.json`, and `styles.css` are supported. Remove the `.zip` from the release workflow or add it as a separate GitHub Release asset outside the plugin registry entry.

- [ ] **Clipboard access disclosure** — Already disclosed in scorecard. Verify `docs/SECURITY.md` entry is current and accurate for v2.3.0 (no changes needed if clipboard usage hasn't changed).

---

## CI/CD & Governance (New — See Recommendations)

- [ ] Add GitHub Actions step to block dynamic `<script>` element creation (grep/ESLint rule)
- [ ] Add GitHub Actions step to block direct `fs` module usage in `src/` (grep or ESLint `no-restricted-imports`)
- [ ] Update `CONTRIBUTING.MD` with CSS warning exception policy (inline comment format + approved patterns)
- [ ] Update `CONTRIBUTING.MD` with guidance on `!important` — when it's acceptable and how to document it

---

## Remediation Sign-off

Once all boxes are checked:

1. Run full audit scan against the patched codebase
2. Update `plugin-scorecard.md` with v2.3.0 post-mortem summary
3. Archive this file under `docs/development/` for historical record
