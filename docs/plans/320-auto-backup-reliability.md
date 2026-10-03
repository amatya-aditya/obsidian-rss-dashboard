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

- Create one configured recovery snapshot after the first successful settings
  persistence in a plugin session.
- Treat later successful persistences as stale state and create one final
  best-effort snapshot on unload only when state is stale.
- Serialize snapshot writes and retry a failed snapshot after a later
  persistence or unload.
- Force one configured snapshot before a storage migration, then treat it as
  current for the session.
- Keep portable-bundle export separate from automatic backups.
- Preserve the current backup filenames and settings semantics for this fix.
- Add focused service and lifecycle regression tests.
- Report backup failures without blocking normal plugin shutdown.

## Implementation progress

- Bug 1: in progress. Portable-bundle export is not produced by automatic
  backups in either shard storage mode.
- Bug 2: in progress. Configured backups complete after settings persistence;
  one initial snapshot establishes a recovery baseline and unload writes only
  when a later persistence made it stale. Unload remains best effort because
  its synchronous lifecycle cannot await Vault adapter writes.
- Bug 3: in progress. When no legacy preferences export exists, the user
  preferences backup is generated from current settings as
  `rss-dashboard-user-preferences.json.backup`.

## Explicit non-goals

- No new plugin-local default paths.
- No #318 cleanup or legacy-folder deletion workflow.
- No new backup destination setting.
- No replacement of the current per-file backups with the two-file design.
- No settings behavior changes; the preferences-backup wording is adjusted only
  to satisfy the repository's sentence-case UI rule.

## Acceptance criteria

- The first successful settings persistence in a session writes enabled backup
  artifacts exactly once.
- Later successful persistences do not rewrite backups until unload; unload
  writes once only when a later persistence made the snapshot stale.
- A storage migration writes one configured pre-migration snapshot.
- Snapshot writes never overlap, and a failed snapshot remains eligible for a
  later retry.
- Automatic backups never create `portable-data-bundle.json.backup`.
- A failed backup is logged and does not throw an unhandled rejection during
  unload.
- Tests cover direct service behavior and plugin lifecycle invocation.
- Existing backup files and toggle behavior remain compatible.
- The post-2.7.0 storage plan remains unchanged and separately testable.
