---
status: proposed
created: 2026-09-09
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/233"
milestone: ""
owner: unassigned
workstream: importers
sequence: 1
depends_on: []
release_requirement: ""
implementation: ""
---

# Refactor OPML importer into reusable import shell

Parent issue: [#233](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/233).

## What to build

Extract a minimal, format-agnostic "importer shell" from the existing OPML importer (`ImportOpmlModal`, `OpmlManager`, `OpmlImportPreviewModel`) that owns the shared modal lifecycle (file pick → validate → preview → execute) and shared UI chrome (stat badges, toolbar scaffolding), while OPML-specific behavior (file-type validation messages, the XML-cleaner-tool link, the Update/Overwrite mode selector and its confirmation warning) stays inside an OPML-specific plug-in to that shell.

This is a structural refactor, not a feature change: the OPML import flow must remain behaviorally identical to a user — same file picker, same error messages, same preview tree with per-item checkboxes and inline rename, same Select all/none and Expand/Collapse all, same Auto-fix invalid names, same Update vs. Overwrite modes, same background ingestion via `plugin.ingestFeedsForBackgroundImport(...)`.

`OpmlImportPreviewModel` is reused unchanged (still feed/folder-shaped) via the shell's pluggable preview-model/renderer slot — it is not itself generalized in this ticket. A future importer (starred.json) will supply its own, differently-shaped preview-selection model against whatever minimal interface the shell requires.

## Blocked by

None (can start immediately)

## Acceptance criteria

- [ ] A shared importer shell exists that owns lifecycle state (idle → validating → preview → executing → done/error), accepting a pluggable `validate(content)`, `parse(content)`, and preview-list renderer/selection-model.
- [ ] The OPML importer is refactored to be a plug-in to this shell; `OpmlManager` parsing/generation logic and `BackgroundImportService` are untouched.
- [ ] `OpmlImportPreviewModel`'s existing behavior (toggle, rename, folder-merge-on-collision, `getStats()`, `getSelectedImportableFeeds()`, `getDerivedFoldersForSelectedFeeds()`) is unchanged and still exercised by the refactored modal.
- [ ] All existing OPML-related tests pass unchanged (`test_files/unit/modals/opml-import-preview-model.test.ts`, `test_files/unit/modals/import-opml-modal.test.ts`, `test_files/unit/services/opml-manager.test.ts`).
- [ ] A new test exercises the shell's lifecycle in isolation using a fake validator/parser/renderer (no OPML-specific code in the shell).
- [ ] **Manual gate:** the repository owner has run a stress-test pass against the refactored OPML importer (file picker; valid and malformed OPML files; per-feed/folder selection; inline rename; folder-merge-on-collision; Auto-fix invalid names; Select/Expand all-none; both Update and Overwrite modes including the overwrite confirmation warning; background ingestion still populates feeds and fetches content) and confirmed sign-off on issue #233. No downstream ticket (234-*) may start before this is confirmed.
