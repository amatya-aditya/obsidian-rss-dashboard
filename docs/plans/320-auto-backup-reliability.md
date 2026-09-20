---
status: in-progress
created: 2026-09-19
issue: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/320
milestone: 2.7.0
owner: unassigned
workstream: reliability
sequence: null
depends_on: []
release_requirement: required
implementation: ""
---

# Auto-backup reliability

Status: accepted pre-2.7.0 release fix. This plan restores the current
auto-backup behavior; it does not introduce the post-2.7.0 storage redesign.

## Problem

Auto-backups are reported as not working reliably. Static review identifies two
release risks:

- Portable-bundle backup is gated on `storageMode === "vault-shards"`, while
  the current default is `vault-shards-v2`.
- `onunload()` starts an asynchronous backup without awaiting it, so Obsidian
  may finish unloading before the writes complete.

The existing service tests call `performAutoBackups()` directly but do not prove
that the plugin lifecycle completes the backup operation.

## Scope

- Make configured current auto-backups run reliably on plugin unload where the
  platform permits.
- Ensure portable-bundle backup behavior covers the current supported storage
  modes without changing its existing format.
- Preserve the current backup filenames and settings semantics for this fix.
- Add focused service and lifecycle regression tests.
- Report backup failures without blocking normal plugin shutdown.

## Implementation progress

- Bug 1: in progress. Portable-bundle backup now covers both supported shard
  storage modes with a focused service regression test.
- Bug 2: in progress. Configured backups complete after settings persistence;
  unload remains a best-effort fallback because its synchronous lifecycle
  cannot await Vault adapter writes.
- Bug 3: in progress. When no legacy preferences export exists, the user
  preferences backup is generated from current settings as
  `rss-dashboard-user-preferences.json.backup`.

## Explicit non-goals

- No new plugin-local default paths.
- No #318 cleanup or legacy-folder deletion workflow.
- No new backup destination setting.
- No replacement of the current per-file backups with the two-file design.
- No settings-label changes; those belong to the post-2.7.0 storage plan.

## Acceptance criteria

- Enabled configured backups are written when the plugin unload path runs.
- The supported v2 storage mode does not skip portable-bundle backup creation.
- A failed backup is logged and does not throw an unhandled rejection during
  unload.
- Tests cover direct service behavior and plugin lifecycle invocation.
- Existing backup files and toggle behavior remain compatible.
- The post-2.7.0 storage plan remains unchanged and separately testable.
