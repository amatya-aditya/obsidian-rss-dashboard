# ADR 0024: Enforce the 3.0 read-only cutoff at the persistence choke point

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

Decided in
[#1078](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1078) and
decomposed in
[`docs/plans/1078-slice-readonly-cutoff-spec.md`](../plans/1078-slice-readonly-cutoff-spec.md).

## Date

2026-10-14

## Context and problem

[ADR 0006](0006-deprecate-legacy-json-and-shard-storage-v1.md) decided that
Legacy JSON and Shard storage v1 become read-only at 3.0, that read state may
still be marked during a session, that migration to v2 stays available through a
frozen one-way importer, and that the deprecated write paths are removed. It did
not say how the read-only state is enforced, or how the importer coexists with
it.

Two properties of the current code make that an open decision rather than an
implementation detail. Nearly every write funnels through a single path —
`SettingsStore.saveSettings` to `FeedStorageRepository.persistSettings` — so
enforcement can live in one place. But `SettingsStore.loadSettings` can also
persist without any user command (after normalization, migration, saved-path
cleanup, or folder repair), and `AutoBackupCoordinator` writes a final snapshot
on unload. A cutoff that only blocks user commands would leak writes on load and
shutdown.

There is also a chicken-and-egg problem. The frozen importer migrates _from_ a
deprecated mode and therefore must write at the exact moment the vault is
read-only.

## Decision

**A deprecated vault freezes entirely.** While feed storage is on Legacy JSON or
Shard storage v1, no generic persistence occurs at all — feed content, article
state, and unrelated preferences alike. Preference changes made while read-only
are lost on quit, exactly like read marks.

**Enforcement is a runtime predicate on the storage mode**, checked at the
persistence choke point rather than at each service entry point. It is not a
build-time flag and not a version comparison: users below the 3.0 floor never
receive the release, so the plugin never straddles the floor and needs no
`requireApiVersion` activation. The predicate is introduced before the write paths
are removed and is kept after them, so the contract stays provable by a test at
the seam instead of being inferred from the absence of code.

**Read-only is its own state**, distinct from `settingsLoadFailed`, which means
"the load failed, so writes are suppressed". It carries its own signal and its own
UI.

**The invariant covers the load and unload paths**, not only user commands: the
load-time saves, the metadata write, folder-path repair, and the unload snapshot
are all suppressed.

**The frozen importer is an explicit exemption.** It takes captured state in and
writes through a narrow v2-only adapter, and it does not call the gated
persistence path. This is what keeps migration possible while the vault is
read-only.

**Export is unaffected and carries in-session read marks.** An export or
migration performed during a read-only session includes read state marked in that
session, because export reads live in-memory items and making it read from disk
would add a new path to the module the cutoff exists to shrink.

## Consequences

### Benefits

- One invariant, one place to test. The read-only contract is asserted at the
  seam instead of reconstructed from the absence of a dozen call sites.
- The load and unload write paths are covered by construction, which a
  per-command gate would have missed.
- Migration survives the cutoff without keeping the deprecated write paths alive.

### Trade-offs

- A user who changes a preference while read-only loses it on quit. This is
  deliberate and must be stated in the prompt copy, not only for read state.
- The predicate outlives the write paths it was introduced to gate. A future
  reader will wonder why a mode with no write path still has a write guard; this
  record is the answer.
- The importer needs a route that bypasses the invariant, which is a deliberate
  exception to an otherwise absolute rule and must be enforced by the importer's
  import allowlist rather than by convention.

### Existing users and data

Users below the 3.0 floor never receive 3.0 and keep writable deprecated modes
with the staged 2.x prompt. No compatibility path is needed or provided for them
inside 3.0. See
[ADR 0023](0023-set-the-3-0-support-floor-at-obsidian-1-11-5.md).

## Considered options

### Block writes at each service entry point

Rejected. It spreads the invariant across refresh, star, tag, save, and retention
paths, and it cannot see the load-time and unload writes at all. It also makes the
UI the enforcement mechanism, so a missed control becomes a data-integrity bug.

### Allow a separate safe persistence contract for preferences

Rejected. The Legacy path serializes the whole live settings object, so any
surviving write is a legacy-format write. A split contract would oblige every
caller to be classified as data or preference, and would create a second v2 write
route beside the importer — reintroducing the multi-path complexity the cutoff
exists to delete.

### Make read-only structural only, with no runtime predicate

Rejected. Once the write paths are deleted, "read-only" would be an inference from
missing code rather than a property under test. Keeping the predicate costs
nothing and keeps the contract assertable.

### Exempt the importer only by convention

Rejected. An undocumented bypass of an absolute invariant is exactly the kind of
thing a later refactor removes. The exemption is recorded here and enforced by the
importer's import allowlist.

## Related

- [ADR 0006 — Deprecate Legacy JSON and Shard storage v1](0006-deprecate-legacy-json-and-shard-storage-v1.md)
- [ADR 0023 — Set the 3.0 support floor at Obsidian 1.11.5](0023-set-the-3-0-support-floor-at-obsidian-1-11-5.md)
- [Plan: Slice the ADR 0006 read-only cutoff into an implementable spec](../plans/1078-slice-readonly-cutoff-spec.md)
- [Glossary: Storage](../../CONTEXT.md#storage)
