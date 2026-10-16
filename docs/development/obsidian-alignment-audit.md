# Upstream Obsidian Alignment Audit

This document is the umbrella record for "ensure the plugin aligns with upstream
Obsidian rules, policies, guidelines, and opinionated conventions." It itemizes
every requirement on the upstream pages below, states the local pass test for
each one, and records the evidence and verdict.

It complements [Plugin Scorecard](./plugin-scorecard.md), which tracks the
automated community-scanner results. This audit is the human/agent reading of
the prose requirements; the scorecard is the machine reading. When the two
disagree, record both and explain the difference rather than overwriting either.

## How to read this document

Each upstream bullet becomes one row with a stable ID, the local criterion that
decides pass or fail, the evidence, and a verdict:

| Verdict       | Meaning                                                                                 |
| ------------- | --------------------------------------------------------------------------------------- |
| ✅ Pass       | Meets the criterion.                                                                    |
| ➖ N/A        | The requirement does not apply; the reason is recorded.                                 |
| 📝 Note       | Deliberate, documented deviation. Not a defect, but a reader should know.               |
| ⚠️ Finding    | Needs remediation. Severity is recorded in the [findings register](#findings-register). |
| ❓ Unverified | Not yet assessed. Should be empty when the audit is current.                            |

Severity reflects how upstream treats the requirement: a **policy** violation
removes the plugin from the directory (Blocking); a **submission requirement**
blocks publishing (High); a **guideline** is a recommendation that may still be
required depending on severity (Low–Medium).

## Sources

Pinned so a re-audit is reproducible. Re-fetch and compare before treating a
verdict as current.

| Phase | Page                                                                                                                             | Repository path                                                 | Revision  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------- |
| 1     | [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)                                                | `en/Plugins/Releasing/Plugin guidelines.md`                     | `3c8fe03` |
| 1     | [Mobile development](https://docs.obsidian.md/Plugins/Getting+started/Mobile+development) (transcluded into the guidelines page) | `en/Plugins/Getting started/Mobile development.md`              | `44f5dd0` |
| 2     | [Developer policies](https://docs.obsidian.md/community-directory/developer-policies)                                            | `en/Community directory/Developer policies.md`                  | `29188ec` |
| 3     | [Submission requirements for plugins](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)          | `en/Community directory/Submission requirements for plugins.md` | `29188ec` |

All four live in [`obsidianmd/obsidian-developer-docs`](https://github.com/obsidianmd/obsidian-developer-docs).
Fetched October 11, 2026.

Local base revision for evidence: `origin/dev` at `1469c4c2` (rechecked
October 16, 2026; original audit at `926aacb6`). File and line references
below are relative to that revision and drift as code moves; the criterion,
not the line number, is the durable part.

## Criteria definitions

The criteria below resolve the guidelines that are ambiguous as written. They
are deliberately pragmatic: a deviation that is intentional, explained, and
low-risk is a **Note**, not a Finding. Change a criterion here before changing a
verdict, so the two stay consistent.

- **Console logging** — no `console.debug` or `console.log` in production
  unless gated behind an explicit opt-in flag. `console.warn`/`console.error`
  are allowed. Upstream: the default console should show only errors.
- **Regex lookbehind** — production regexes must avoid `(?<=` / `(?<!` unless a
  documented fallback exists, because lookbehind is unsupported on iOS before
  16.4 and the plugin supports mobile.
- **`setHeading` scope** — settings _section_ headings use
  `new Setting(el).setName(...).setHeading()`. Modal titles follow Obsidian's
  `Modal`/`h2` convention and are out of scope. Static `createEl("h1"–"h4")` in
  content areas is out of scope for this criterion but should be revisited if a
  theme reports inconsistent heading styling.
- **Hardcoded styling** — no static literal colors, sizes, or fonts assigned
  inline. Dynamic geometry (`top`/`left`/`width`/`transform`), user-derived
  values (`tag.color`, a configured reader font), and CSS custom properties are
  allowed; static presentation belongs in `src/styles/` with Obsidian CSS
  variables.
- **Adapter API** — `vault.adapter` is allowed for artifacts the Vault API
  cannot address: dot-prefixed folders Obsidian leaves out of the vault index
  (`.rss-dashboard-data`, `.rss-meta`), caches, backups, and shard storage.
  Vault-indexed notes use the Vault API. Each adapter usage should be
  attributable to a non-indexed path.
- **`innerHTML` family** — zero _assignment_ to `innerHTML`, `outerHTML`, or
  `insertAdjacentHTML` in production paths. Reading `.innerHTML` to extract or
  compare markup is allowed. The sanitizer must build nodes programmatically.
  Test-only usage is allowed.
- **Promise style** — sequential async flows use `async`/`await`. A
  fire-and-forget `void promise.then(render)` for a pure UI re-render with
  handled errors is tolerated; anything that reads the result must be awaited.
- **Resource cleanup** — repeating or long-lived resources are registered
  (`registerEvent`, `registerInterval`, `registerDomEvent`) or explicitly
  cleared on close/unload. Listeners on elements that are garbage-collected
  with the plugin are exempt, per the upstream note.

## Phase 1 — Plugin guidelines

| ID  | Upstream requirement                                            | Criterion                                                                                  | Evidence                                                                                                                                                                                                                      | Verdict    |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| G1  | Avoid using the global `app` instance                           | No `window.app`, `globalThis`, or bare `app`; use `this.app`                               | 0 matches in `src/`                                                                                                                                                                                                           | ✅ Pass    |
| G2  | Avoid unnecessary logging to console                            | See [console logging](#criteria-definitions)                                               | 0 ungated `console.debug` calls; all production logging routed through gated `debug-logger.ts` — fixed by [#1017](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1017)                                        | ✅ Pass    |
| G3  | Organize the code base using folders                            | Multi-file plugin uses folders                                                             | `src/` is split into `services/`, `views/`, `components/`, `modals/`, `settings/`, `discover/`, `utils/`, `types/`; `main.ts` is the composition root                                                                         | ✅ Pass    |
| G4  | Rename placeholder class names                                  | No `MyPlugin`/`SampleSettingTab`/sample names                                              | 0 matches in `src/`                                                                                                                                                                                                           | ✅ Pass    |
| M1  | Node/Electron APIs are desktop-only                             | No Node/Electron import or `require` in `src/` or dependencies; else `isDesktopOnly: true` | No `fs`/`path`/`crypto`/`os`/`child_process`/`electron` imports; runtime deps are `@mozilla/readability` and `turndown`; `isDesktopOnly: false` is therefore correct                                                          | ✅ Pass    |
| M2  | Regex lookbehind on iOS                                         | See [regex lookbehind](#criteria-definitions)                                              | 0 production lookbehind regexes; `math-rendering.ts:126` match is a comment — fixed by [#1018](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1018)                                                           | ✅ Pass    |
| U1  | Headings under settings only if more than one section           | No top-level plugin-name or "General" heading in the settings tab                          | `src/settings/settings-tab.ts` is a tab orchestrator with no top-level heading; each tab uses section headings                                                                                                                | ✅ Pass    |
| U2  | Avoid "settings" in settings headings                           | No section heading text contains "settings"                                                | 0 matches in `src/settings/` — fixed by [#1021](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1021)                                                                                                          | ✅ Pass    |
| U3  | Use sentence case in UI                                         | `obsidianmd/ui/sentence-case` passes; command names, settings, buttons spot-checked        | Rule enforced as an error per [Plugin Scorecard](./plugin-scorecard.md); command names in `main.ts` are sentence case                                                                                                         | ✅ Pass    |
| U4  | Use `setHeading` instead of `<h1>`, `<h2>`                      | See [`setHeading` scope](#criteria-definitions)                                            | 34 `createEl("h1"–"h4")` sites, almost all modal titles; settings sections use `setHeading()` throughout                                                                                                                      | 📝 Note    |
| S1  | Avoid `innerHTML`, `outerHTML`, `insertAdjacentHTML`            | See [`innerHTML` family](#criteria-definitions)                                            | 0 assignments in `src/`; 19 matches are reads (`doc.body.innerHTML`) or a comment; `sanitizeAndAppendHtml` builds nodes with `createEl` and an allow-list in `src/utils/safe-html.ts`                                         | ✅ Pass    |
| R1  | Clean up resources when the plugin unloads                      | See [resource cleanup](#criteria-definitions)                                              | `registerEvent` (20) and `registerDomEvent` (13) used; the 4 `window.setInterval` calls (`mobile-navigation-modal.ts:132`, `podcast-player.ts:1036,1130`, `video-player.ts:318`) are each cleared in `onClose`/`stopTracking` | ✅ Pass    |
| R2  | Don't detach leaves in `onunload`                               | No `detachLeavesOfType` in `onunload`                                                      | 0 matches                                                                                                                                                                                                                     | ✅ Pass    |
| C1  | Avoid setting a default hotkey                                  | No `hotkeys:` in `addCommand`                                                              | 0 matches                                                                                                                                                                                                                     | ✅ Pass    |
| C2  | Use the appropriate callback type                               | `checkCallback` for conditional commands; editor callbacks only when an editor is required | `main.ts` uses `callback` plus `checkCallback` for `toggle-sidebar`; no command requires an open editor                                                                                                                       | ✅ Pass    |
| W1  | Avoid accessing `workspace.activeLeaf` directly                 | No read of `.activeLeaf`; `setActiveLeaf` is a different API and allowed                   | 6 matches, all `workspace.setActiveLeaf(...)`                                                                                                                                                                                 | ✅ Pass    |
| W2  | Avoid managing references to custom views                       | `registerView` factory returns a new instance; access via `getLeavesOfType`                | `main.ts:990–1036` returns `new …View(...)`; no `this.view =` assignment                                                                                                                                                      | ✅ Pass    |
| V1  | Prefer the Editor API over `Vault.modify` for the active file   | No `vault.modify` on the active note; editor used for active-note edits                    | The plugin writes saved-article files, not the active note; see V2                                                                                                                                                            | ✅ Pass    |
| V2  | Prefer `Vault.process` over `Vault.modify` for background files | Background note modification uses `vault.process`                                          | `article-saver.ts:756` uses `vault.modify(existingSavedFile, …)` to rewrite a saved note                                                                                                                                      | ⚠️ Finding |
| V3  | Prefer `FileManager.processFrontMatter` for frontmatter         | In-place frontmatter mutation uses `processFrontMatter`                                    | The plugin creates notes from a template and rewrites whole files; it does not parse-and-edit frontmatter of an existing note                                                                                                 | ➖ N/A     |
| V4  | Prefer the Vault API over the Adapter API                       | See [Adapter API](#criteria-definitions)                                                   | 63 `adapter.*` calls in 8 files; paths are dot-prefixed/non-indexed (`metadata-location.ts:21` → `.rss-dashboard-data`, `feed-storage-repository.ts:99` → `.rss-dashboard-data/feeds`, caches, backups)                       | 📝 Note    |
| V5  | Avoid iterating all files to find one by path                   | Use `getFileByPath`/`getFolderByPath`/`getAbstractFileByPath`; no `getFiles().find`        | `getAbstractFileByPath` ×19; `getFiles()` ×0                                                                                                                                                                                  | ✅ Pass    |
| V6  | Use `normalizePath` for user-defined paths                      | Every user-supplied or constructed path is normalized                                      | `normalizePath` used across `article-saver.ts`, `feed-storage-repository.ts`, `image-cache-service.ts`, `preview-image-cache.ts`, `saved-article-association-service.ts`                                                      | ✅ Pass    |
| E1  | Reconfigure editor extensions via `updateOptions`               | N/A if no `registerEditorExtension`                                                        | No `registerEditorExtension`/`updateOptions`                                                                                                                                                                                  | ➖ N/A     |
| ST1 | No hardcoded styling                                            | See [hardcoded styling](#criteria-definitions)                                             | 34 `.style.*` assignments are positioning (`top`/`left`/`width`/`maxHeight`/`transform`), user tag colors (`tag.color`), or a configured reader font; no static literal colors or sizes                                       | ✅ Pass    |
| T1  | Prefer `const` and `let` over `var`                             | No `var` declarations                                                                      | 0 matches                                                                                                                                                                                                                     | ✅ Pass    |
| T2  | Prefer `async`/`await` over Promise                             | See [Promise style](#criteria-definitions)                                                 | 43 `.then(` matches, predominantly `void …then(() => this.render())` fire-and-forget UI re-renders                                                                                                                            | 📝 Note    |

## Phase 2 — Developer policies

| ID  | Policy                                               | Criterion                                                                 | Evidence                                                                                                                                                           | Verdict |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| P1  | No obfuscation                                       | Standard minified bundle; public source; no encoded strings or anti-debug | esbuild production bundle; source in a public repository                                                                                                           | ✅ Pass |
| P2  | No dynamic ads over the internet                     | No ad loading                                                             | 0 matches                                                                                                                                                          | ✅ Pass |
| P3  | No static ads outside the plugin's interface         | No ads                                                                    | README: "No ads"                                                                                                                                                   | ✅ Pass |
| P4  | No client-side telemetry                             | No analytics/telemetry dependency or endpoint                             | No analytics packages; no telemetry calls; `docs/SECURITY.md` "No Telemetry"                                                                                       | ✅ Pass |
| P5  | No self install/update                               | Plugin never writes itself or runs installers                             | No self-update logic; no `child_process`                                                                                                                           | ✅ Pass |
| P6  | Themes must not load network assets                  | N/A (plugin, not theme)                                                   | —                                                                                                                                                                  | ➖ N/A  |
| D1  | Payment disclosure                                   | README states the plugin is free; `fundingUrl` is donations only          | README: "free, open-source"; `manifest.json` `fundingUrl` → Buy Me a Coffee                                                                                        | ✅ Pass |
| D2  | Account disclosure                                   | No account required                                                       | No login or account flow                                                                                                                                           | ✅ Pass |
| D3  | Network-use disclosure                               | README clearly explains which remote services are used and why            | README links `docs/SECURITY.md`, which enumerates the CORS proxies, RSS2JSON, Google favicons, iTunes lookup, Kagi Smallweb, and YouTube endpoints with purpose    | ✅ Pass |
| D4  | Files-outside-vault disclosure                       | No filesystem access outside the vault                                    | No Node `fs`; all storage is inside the vault (including dot-prefixed folders)                                                                                     | ✅ Pass |
| D5  | Static ads inside the interface                      | N/A (no ads)                                                              | —                                                                                                                                                                  | ➖ N/A  |
| D6  | Server-side telemetry                                | N/A (none)                                                                | —                                                                                                                                                                  | ➖ N/A  |
| D7  | Closed-source code                                   | N/A (open source)                                                         | Public repository, MIT                                                                                                                                             | ➖ N/A  |
| L1  | LICENSE file and clear license                       | LICENSE present; license stated                                           | `LICENSE` (MIT); README states MIT                                                                                                                                 | ✅ Pass |
| L2  | Comply with original licenses, including attribution | Bundled third-party licenses respected and attributed                     | `THIRD-PARTY` notices file added for `@mozilla/readability` and `turndown` — fixed by [#1020](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1020) | ✅ Pass |
| L3  | Respect the trademark policy                         | No "Obsidian" use that implies a first-party plugin                       | Name is "RSS Dashboard"; "Obsidian" appears only descriptively                                                                                                     | ✅ Pass |
| F1  | Fork criteria                                        | Not a fork, or fork criteria met                                          | Original repository, no upstream fork                                                                                                                              | ✅ Pass |

## Phase 3 — Submission requirements

| ID  | Requirement                                   | Criterion                                                                 | Evidence                                                                                                                                  | Verdict |
| --- | --------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| SR1 | Only use `fundingUrl` for financial support   | `fundingUrl` points to a donation service, or is absent                   | `manifest.json` → Buy Me a Coffee                                                                                                         | ✅ Pass |
| SR2 | Set an appropriate `minAppVersion`            | Matches the highest API version actually required                         | `1.8.7` matches the vault local-storage API added in 1.8.7 (`vault-local-storage.ts`) and the `settings-ui-compat.ts` 1.8.7–1.12.x branch | ✅ Pass |
| SR3 | Keep descriptions short and simple            | ≤250 chars, ends with a period, sentence case, no emoji, correct acronyms | 145 chars, ends with a period, sentence case; "RSS", "YouTube", "PDF" capitalized                                                         | ✅ Pass |
| SR4 | Don't include the plugin ID in the command ID | Command IDs are unprefixed                                                | IDs such as `open-dashboard`, `refresh-feeds`, `toggle-sidebar`                                                                           | ✅ Pass |
| SR5 | Remove all the sample code                    | No sample-plugin remnants                                                 | 0 matches for `MyPlugin`/`SampleSettingTab`                                                                                               | ✅ Pass |

## Findings register

Each finding needs a GitHub issue before remediation starts. Severity follows
the mapping above.

**All findings from the initial audit are resolved.** No open findings remain
at base revision `1469c4c2`.

| Finding | Severity | Summary                                                               | Issue                                                                        | Status               |
| ------- | -------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------- |
| G2      | Low      | 15 ungated `console.debug` calls across 5 files                       | [#1017](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1017) | ✅ Closed 2026-10-11 |
| M2      | Medium   | Two production regexes use lookbehind, unsupported on iOS before 16.4 | [#1018](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1018) | ✅ Closed 2026-10-11 |
| V2      | Low      | `vault.modify` rewrites a saved note instead of `vault.process`       | [#1019](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1019) | ✅ Closed 2026-10-11 |
| L2      | Low      | Bundled Apache-2.0/MIT dependencies have no attribution               | [#1020](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1020) | ✅ Closed 2026-10-11 |
| U2      | Low      | Settings heading "Settings bundle" repeats "settings"                 | [#1021](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1021) | ✅ Closed 2026-10-11 |

Documented notes that are not findings, so a reader knows they were considered:

- **U4** — 34 static heading elements, almost all modal titles; settings
  sections use `setHeading`.
- **V4** — 63 adapter calls, all for dot-prefixed/non-indexed artifacts. The
  rationale should also land in [Compliance Patterns](./compliance-patterns.md)
  so it is not re-litigated each audit.
- **T2** — fire-and-forget `.then()` re-render pattern.

## Recheck commands

Run from the repository root. Adjust the base revision before relying on the
verdicts.

```powershell
# G2 — ungated console logging
Get-ChildItem src -Recurse -File -Include *.ts | Select-String 'console\.(debug|log)'

# M2 — regex lookbehind
Get-ChildItem src -Recurse -File -Include *.ts | Select-String '\(\?<[=!]'

# S1 — innerHTML assignment (should be empty)
Get-ChildItem src -Recurse -File -Include *.ts | Select-String 'innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML'

# U2 — "settings" in settings headings
Get-ChildItem src\settings -Recurse -File -Include *.ts | Select-String 'setName\([^)]*[Ss]ettings'

# V2 — Vault.modify in production
Get-ChildItem src -Recurse -File -Include *.ts | Select-String 'vault\.modify'

# V4 — Adapter API usage
Get-ChildItem src -Recurse -File -Include *.ts | Select-String 'adapter\.'
```

The repo's own gates cover several rows already: `npm run check:compliance`
(architecture, CSS scope, platform, `!important`, release compatibility,
pre-release, doc links, format), `npm run lint` (including
`obsidianmd/ui/sentence-case`), and `npm run build`.

## Related docs

- [Plugin Scorecard](./plugin-scorecard.md) — automated scanner history and the
  public listing snapshot
- [Compliance Patterns and Audit Guardrails](./compliance-patterns.md) —
  approved implementation patterns
- [Architecture Guardrails](./architecture.md) — module ownership and
  dependency direction
- [Obsidian Settings Reference](./obsidian-settings-reference.md) — settings UI
  patterns
- [SECURITY.md](../SECURITY.md) — network, clipboard, and vault disclosures
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — compliance declarations and CSS
  policy
- [.instructions.md](../../.instructions.md) — AI contribution policy card
- [Development Docs index](./README.md)
