---
id: module-portability
type: submodule-design
status: draft
title: Service area — import, export, and backups
parent: architecture
---

# Service area — import, export, and backups

## Responsibility

Move a user's data in and out of the plugin: OPML subscriptions, the split
feed and settings bundles, Google-Reader-compatible starred import, imported
settings, and the automatic and manual backups that precede all of it.

Entry points: `ImportExportService`, `OpmlManager`,
`OpmlImportPreviewModel`, `StarredImportPreviewModel` / `starred-import-mapper`
/ `starred-import-merge`, `ImportConfirmationModel`, `SettingsImportApplier`,
`BackupService`, `AutoBackupCoordinator`.

## Boundary

It reads and writes through the storage area's repository and runs ahead of
the write paths; it must not import UI. Preview models are pure data: the
modal shell (`ImporterShell` in `src/modals/`) composes them, so each import
flow is testable without a dialog.

## Invariants

- **Two bundles, one portable bundle.** Feed data and settings export and
  import independently, while the combined portable bundle keeps working
  ([ADR 0005](../../docs/adr/0005-split-portable-data-bundle-into-feed-and-settings-bundles.md)).
- **Imported settings merge one group deep**: a file carrying some keys of a
  nested group keeps the user's other values
  ([ADR 0027](../../docs/adr/0027-merge-imported-settings-one-group-deep.md)).
- **Starred import stays service-neutral** and claims compatibility only with
  exporters that were verified
  ([ADR 0003](../../docs/adr/0003-generalize-starred-import-to-google-reader-compatible-naming.md)).
  It tolerates FreshRSS's instance-local item origins.
- **An import backs up first and restores on failure** — no partial state,
  including the metadata location the bundle declares.
- One confirmation model decides apply versus skip for every bulk import, so
  the two flows cannot disagree.

## Known gaps

FreshRSS exists only through the starred-import path; there is no FreshRSS
API client and no server return path yet. The automatic-backup consolidation
planned for 3.0 is not built.
