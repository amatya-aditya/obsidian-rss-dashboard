---
status: accepted
created: 2026-10-11
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/431"
milestone: "vNext"
owner: unassigned
workstream: ""
sequence: null
depends_on: []
release_requirement: stretch
implementation: ""
---

# Stub Fidelity Follow-Ups Plan

This plan carries the remaining work of [issue #431](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/431): the rest of #372's Track B audit. Track B steps 1 and 2 are done (types in #362/#417, behavior in #420–#430) and three production bugs came out of them (#421, #423, #429). The rules are unchanged from `docs/adr/0014-obsidian-test-stub-fidelity.md`: model the latest stable desktop release, add a switch only for a verified minimum-version difference, never weaken the stub, and fix production code when a faithful stub breaks a test. Console probes stay in `test_files/stubs/obsidian-console-probes.md`; from this plan on they are driven by the merged CDP harness ([#977](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/977), `scripts/obsidian-cdp.mjs`), documented under [Driving the vault over CDP](../development/fixture-vault.md#driving-the-vault-over-cdp).

Each slice below is its own pull request. The priority tiers are severity- and ROI-ranked so the highest-value work lands first if the issue cannot be finished in one stretch.

## Ground truth

- The stub header pins **Obsidian 1.13.7 desktop** (`test_files/stubs/obsidian.ts`, lines 1–10); the current stable is **1.14.4** (October 5, 2026, Electron 43.7.5). `manifest.json` keeps `minAppVersion` 1.8.7; the #372 plan's "1.11.5 after #403" note does not match the manifest and is flagged, not fixed, here (DEC-013).
- Installer version and running app version differ: the renderer updates in place while `Obsidian.exe` keeps the installer's version. Every probe session starts with a version guard that records the running app version with the observations.
- The reference bump is executed **by re-observing**: the first probe session re-runs every recorded expectation against the running stable and updates the stub header pin and the contract test's version annotations in the same change. There is no separate 1.13.7 pass; the running app code is already current.
- 1.14 developer notes that matter here: MathJax 4.1.3 replaced MathJax 3 and Temml (the math DOM shape `src/utils/math-rendering.ts` reads back), and `SettingDefinitionItem` gained an optional `id`. The re-observation covers both.
- Old-version installers are published as release assets on [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases/releases) (`Obsidian-1.8.7.exe`, `Obsidian-1.14.4.exe`, and so on).

## Acceptance criteria

- **AC-001 Probe library.** A committed repl probe set under `test_files/stubs/probes/` covers the ten unaudited APIs and the small probes; each step prints a quotable result; `obsidian-console-probes.md` stays the human record, annotated with the running app version.
- **AC-002 Reference re-observed.** The stub header pin and the contract-test version annotations move to the stable observed in the probe session (target 1.14.4); every previously recorded expectation is re-exercised; any behavior change is triaged under the ADR rules.
- **AC-003 Divergences closed.** Every confirmed divergence is either fixed (contract expectation first, stub second, production triaged) or documented with its reason in the probes record. No divergence is left silent.
- **AC-004 Production items.** The `fixSavedFilePaths` item is closed as superseded by #843 with a collision regression test; `loadAndNormalizeSettings` takes a deep partial; `EditFeedModal` removes the native close button on mobile like its siblings, the dead `hide-default-close-button` class is gone, and other modals are swept for dead close-button classes.
- **AC-005 Mobile probed.** The mobile `adapter.remove` error shape is observed on the real Obsidian Android app in an emulator, or recorded as blocked with a ready recipe if the emulator slice drops.
- **AC-006 Drift check.** A documented, re-runnable local drift check compares probe results against the records; ADR 0014 carries an amendment describing it; the peer signal (obsidian-test-mocks pinned-baseline bump) is listed as a trigger.
- **AC-007 Mutation spike concluded.** A time-boxed Stryker run over two critical modules ends with an adopt/drop decision; if adopted, the follow-up gets its own issue.
- **AC-008 Gates.** Every slice passes the repository gates for its footprint (format, lint, `check:platform`, `check:architecture`, focused tests, type-check); CI runs the full build.

## Decisions

| ID      | Status  | Decision                                                                                                                                                                                                                                                                                                 |
| ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-001 | Settled | Probes run through `scripts/obsidian-cdp.mjs repl`; drivers are committed under `test_files/stubs/probes/` (one file per API group, quotable JSON per step); records stay in `obsidian-console-probes.md`; disposable profile plus a scratch vault, never the fixture or real vault.                     |
| DEC-002 | Settled | Audit order, highest risk first: `requireApiVersion`, `setIcon`, `Setting`, `Menu`, `moment`, `MarkdownRenderer`, `Scope`, `Platform`, `Notice`, `AbstractInputSuggest`. Re-rank if the reference re-observation surprises.                                                                              |
| DEC-003 | Settled | One divergence per pull request; `requireApiVersion` splits into additive prerequisites and the faithful flip; APIs found faithful get one batched confirmations PR.                                                                                                                                     |
| DEC-004 | Settled | `requireApiVersion` becomes a version constant defaulting to the pinned reference, plus a test hook to set another version; the import-time resolution in `settings-ui-compat.ts` is documented in the contract test.                                                                                    |
| DEC-005 | Settled | `AbstractInputSuggest` stays thin with a comment: no production consumer; it is modeled faithfully when one appears.                                                                                                                                                                                     |
| DEC-006 | Settled | Drift is a local re-run of the probe library diffed against the records. Triggers: reference pin bump, `minAppVersion` change, obsidian-test-mocks pinned-baseline bump, opportunistically after an Obsidian stable release. The CI half is already covered by the unit suite running the contract test. |
| DEC-007 | Settled | `EditFeedModal` gets the same mobile `removeNativeModalCloseButton` call as the add-feed and folder auto-tag modals; the dead `hide-default-close-button` class is deleted; other modals are swept.                                                                                                      |
| DEC-008 | Settled | The `ArticleSaver.fixSavedFilePaths` item is obsolete (method removed in #843). A regression test pins the current collision behavior and the three dead `fixSavedFilePaths` mocks are removed.                                                                                                          |
| DEC-009 | Settled | Reference handling: record at the running stable; bump by re-observation; the running version is verified per probe session. No 1.13.7-first pass.                                                                                                                                                       |
| DEC-010 | Settled | Mobile verification uses the real Obsidian Android app in an emulator over the webview devtools socket; this satisfies ADR 0014's device rule in spirit (real app and Capacitor layer, not desktop emulation). The method is recorded with the observations.                                             |
| DEC-011 | Settled | The ADR 0014 amendment ships with the drift slice, not with this plan.                                                                                                                                                                                                                                   |
| DEC-012 | Settled | The mutation spike uses `@stryker-mutator/vitest-runner` on feed refresh and article saving; adoption is gated on whether the signal is worth the run time.                                                                                                                                              |
| DEC-013 | Flagged | The manifest `minAppVersion` (1.8.7) versus the #372 plan's "(1.11.5 after #403)" line is a separate question, out of scope here.                                                                                                                                                                        |

## Prioritized slices

Tiers reflect severity if the divergence remains and, separately, return on the effort to close it. Slices inside a tier can land in any order; the PR shapes are working titles.

| #   | Slice                                                        | Tier | Why this rank                                                                                                                                                                         |
| --- | ------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Probe library plus reference re-observation (AC-001, AC-002) | 1    | Enabler for everything else and the cheapest way to catch a 1.14 production breakage (the math DOM is the live suspect). Mostly agent-driven through the CDP harness.                 |
| S2  | `requireApiVersion` fidelity (AC-003)                        | 1    | Widest silent divergence: every `"1.7.2"` leaf gate and the import-time `"1.13.0"` settings gate run the legacy branch in tests while real Obsidian runs the modern one.              |
| S3  | `EditFeedModal` parity and modal sweep (AC-004)              | 1    | Cheapest user-visible fix; the dead class is unambiguously wrong and the siblings already do it right.                                                                                |
| S4  | `setIcon` SVG modeling (AC-003)                              | 2    | 293 call sites and a production read-back (`querySelector("svg")`) that tests currently exercise in the fallback branch only.                                                         |
| S5  | `Setting` chrome methods (AC-003)                            | 2    | 221 rows; `setDisabled` is called by production (`sidebar-settings-tab.ts`) and is a silent no-op in the stub today.                                                                  |
| S6  | `Menu` `setDisabled` and `setChecked` (AC-003)               | 2    | A latent "not a function" crash (`reader-view.ts` disables a MenuItem) and silent no-ops across 85 items.                                                                             |
| S7  | `moment` gaps the probes find (AC-003)                       | 2    | User-visible dates through `{{date:FORMAT}}`; fix what is cheap and document the boundary (locale-sensitive tokens).                                                                  |
| S8  | Remaining production items (AC-004)                          | 2    | Small, closes two checkboxes: the ArticleSaver collision regression test with the dead-mock removal, and the deep-partial settings parameter.                                         |
| S9  | Confirmations PR (AC-003)                                    | 3    | Contract expectations for APIs the probes find faithful (`MarkdownRenderer` shapes, `Platform` desktop flags, `Notice` instance shape, `Scope` note, `AbstractInputSuggest` comment). |
| S10 | Drift runbook and ADR amendment (AC-006)                     | 3    | Mechanism for detecting future drift; nothing breaks while it waits.                                                                                                                  |
| S11 | 1.8.7 close-button confirmation (AC-003)                     | 4    | Confirmation only; both selectors are kept regardless until `minAppVersion` moves.                                                                                                    |
| S12 | Mobile emulator slice (AC-005)                               | 4    | Heavy machine setup; unblocks the mobile half of `adapter.remove` and `Platform` but touches no user-facing code.                                                                     |
| S13 | Mutation spike (AC-007)                                      | 4    | Exploratory by design; adopt only if the signal pays for the run time.                                                                                                                |

Every slice's pull request follows the #372 rules: the contract expectation lands first with the version it was observed on, the stub change second, and breaking tests are triaged (fix behavior-checking tests, delete wiring-only ones, list each deletion in the PR).

## Test seams

- **TEST-001 Contract expectations (AC-002, AC-003).** Every divergence or confirmed behavior lands in `test_files/stubs/obsidian.contract.test.ts` next to the stub, annotated with the app version it was observed on; `StubSignatureChecks` keeps the typing honest.
- **TEST-002 Probe library (AC-001, AC-006).** The repl files are the executable record; the drift check re-runs them against the running app and diffs against the marked-up outputs. Not part of CI (it needs a real Obsidian install).
- **TEST-003 Production fixes (AC-004).** `test_files/unit/services/article-saver.test.ts` pins that a concurrent file at the target path cannot clear `saved`; `test_files/unit/modals/edit-feed-modal.test.ts` mirrors the add-feed native-button assertions; a type-level check pins the deep-partial parameter; sibling-caller host tests follow the testing guide when the deep partial changes callers.
- **TEST-004 Mutation spike (AC-007).** Stryker reports a mutation score for the two target modules; the adopt/drop decision and the numbers go in the spike's PR.

## Risks and containment

- **The reference re-observation surfaces a large change** (e.g., the MathJax 4 DOM). Contain: the probe run files it as its own issue and the pin stays at 1.13.7 until resolved; the other slices continue.
- **The `requireApiVersion` flip breaks many tests.** Contained by the two-step slice and the #372 triage rules; each affected test gets a behavior judgment, not a blanket edit.
- **Probing an old version (1.8.7).** The auto-updater can re-reach an installed old build; run that probe in a second OS user or offline, and restore the installer afterward.
- **Emulator setup friction on Windows.** The mobile slice drops to its own issue rather than blocking #431.

## Out of scope

- Changing `minAppVersion` or the #403 follow-up.
- Faithfully modeling `AbstractInputSuggest` without a production consumer.
- Mobile UI behavior beyond `adapter.remove` and `Platform`; desktop `emulateMobile` claims stay out.
- Adopting obsidian-test-mocks or any new runtime dependency. Stryker is a spike-only dev dependency if adopted.

## Tracking

- The decision log is posted as a comment on [#431](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/431).
- Checkboxes on #431 tick as slices merge; the plan moves to `docs/archive/plans/unreleased/` when the issue completes.
