# ADR 0039: Use User-Managed SecretStorage References for Credentials

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-10-28

## Context and problem

FreshRSS needs a credential to connect to a user's server. A YouTube Data API
key has been discussed as a future feature, but no such credential consumer is
implemented yet. Credential values must remain outside vault settings and portable data so they are not copied or exposed as ordinary plugin data.

Obsidian SecretStorage provides encrypted storage at the 3.0 support floor
([ADR 0023](0023-set-the-3-0-support-floor-at-obsidian-1-11-5.md)). The existing
FreshRSS design stores a reference to a user-managed secret, not its value, and
keeps session tokens in memory. The remaining decision is how the plugin
selects and resolves that reference, what portable settings contain, and
whether to create a shared module before a second consumer exists.

## Decision

Users create and manage credential entries in Obsidian SecretStorage, then
select an entry through Obsidian's native `SecretComponent`. RSS Dashboard
stores only the selected entry's reference. It does not create or write
credential values.

FreshRSS resolves a reference through a FreshRSS-owned adapter outside
`main.ts`. Its narrow service interface accepts a reference and returns the
secret value or `null` when no entry exists. The adapter reads
`app.secretStorage` directly. Because #1075 settles the floor at 1.11.5 (documented in ADR 0023), the 3.0 path has no runtime version gate, structural cast, or `capability-unavailable` state. `main.ts` remains the composition root and wires the
feature module, consistent with [ADR 0015](0015-main-ts-decomposition.md).

When a saved reference resolves to `null`, the plugin preserves the reference,
explains that the entry is unavailable on this device, and lets the user
reselect or clear it. It makes no request until a usable credential is
available. If SecretStorage throws while resolving the reference, the plugin
preserves the reference, reports a distinct retryable read error, and makes no
request. A missing entry is not a capability or version failure.

Credential values never enter settings, `data.json`, portable bundles, or
logs. Settings and portable bundles may contain the SecretStorage reference
only. Session tokens remain in memory. The plugin makes no promise about
whether Obsidian syncs SecretStorage entries; a reference that does not resolve
on the current device must be repaired there through the picker.

There is no shared credential module yet. FreshRSS keeps its feature-local
adapter. When a second real credential consumer is implemented, its needs will
show whether a shared module has a useful interface and enough depth to justify
the seam. A future YouTube API key consumer may adopt the same SecretStorage
rules, but its implementation is not specified here.

This ADR records the target contract; it does not claim that the existing FreshRSS implementation has already been brought into alignment. That implementation work remains separate.

## Consequences

### Benefits

- Credential values stay in Obsidian's encrypted secret store rather than
  ordinary plugin settings, exports, or logs.
- Users retain control over creating and managing their entries.
- A portable reference can help identify the intended entry without exporting
  or copying the credential itself.
- Missing entries are recoverable without silently discarding a user's saved
  reference or making a request without a usable credential.
- FreshRSS has a testable, feature-local adapter, while a shared module can be
  based on a second consumer's actual needs.

### Trade-offs

- A portable reference does not guarantee that the referenced entry exists or
  resolves on another device. Users may need to select a local entry there.
- SecretStorage read errors need their own retryable presentation and must not
  be reported as a missing entry.
- The FreshRSS adapter and any future consumer may temporarily contain similar
  SecretStorage access until evidence supports a shared module.

### Existing users and data

- Existing credential references remain unchanged; no migration or credential
  rewrite occurs.
- Existing settings and exports continue to carry a reference ID only. The
  credential value and session tokens are not added to those files.
- If an existing reference is missing on a device, the plugin preserves it
  until the user explicitly reselects or clears it.

## Considered options

### Create a shared credential module for FreshRSS and YouTube now

Rejected. FreshRSS is the only implemented SecretStorage consumer. Designing a
shared interface for an unimplemented YouTube feature would create a
hypothetical seam before its needs are known. Revisit the boundary when a
second consumer exists.

### Let the plugin create or store credentials

Rejected. Users manage entries in SecretStorage and select them through
Obsidian's native component. The plugin stores a reference and resolves the
value only when needed.

### Exclude SecretStorage references from portable settings

Rejected. The reference ID is useful configuration metadata and contains no
credential value. If it cannot be resolved on another device, the user can
reselect a local entry; the export never transfers the secret.

## Related

- [GitHub Issue #1076 — Design the shared credential seam on SecretStorage](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1076)
- [GitHub Issue #1075 — Pick the 3.0 minAppVersion floor](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1075)
- [GitHub Issue #1073 — Research the Obsidian floor candidates](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1073)
- [GitHub Issue #224 — FreshRSS credentials](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/224)
- [GitHub Issue #341 — Wayfinder: FreshRSS Core/Connector integration boundary](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/341)
- [ADR 0005 — Split the portable data bundle](0005-split-portable-data-bundle-into-feed-and-settings-bundles.md)
- [ADR 0042 — Keep FreshRSS in Core for v1](0042-keep-freshrss-in-core.md)
- [ADR 0015 — Decompose main.ts into injected modules](0015-main-ts-decomposition.md)
- [ADR 0023 — Set the 3.0 support floor at Obsidian 1.11.5](0023-set-the-3-0-support-floor-at-obsidian-1-11-5.md)
