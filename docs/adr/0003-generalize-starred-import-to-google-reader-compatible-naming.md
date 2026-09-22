# Generalize starred-article import naming to Google Reader-compatible

## Status

accepted

## Decision

All user-facing copy for the starred-article import feature — the command
name, the Settings-tab section heading and button, the Feed Manager button,
the modal title and description, and the default new-feed folder — uses
generic language ("Import starred articles," "Starred imports," "Import
labels as tags") rather than naming Inoreader explicitly. The parser is
correspondingly generalized to tolerate the `starred.json` shape produced by
FreshRSS, alongside the Inoreader shape it already handled: it resolves a
portable source URL from `origin.streamId` only when that value is itself an
HTTP(S) URL, falling back to `origin.htmlUrl` otherwise (so an
instance-local numeric stream ID such as FreshRSS's `feed/6` never becomes a
local feed's URL), and it prefers `summary.content` but falls back to
`content.content` (the field FreshRSS uses instead).

This decision was originally reached in two steps, within the same
pre-release development window and before either state reached a public
user:

1. **Explicit Inoreader naming.** The importer had, at that point, only ever
   been built against and tested against Inoreader's actual export — no
   other source had been verified compatible — so a generic name would have
   overstated what the feature did. The underlying `starred.json` schema is
   the Google Reader API "Read later" format that other tools could
   plausibly export too, and the feature's internal identifiers
   (`StarredImportCandidate`, `import-starred-modal.ts`,
   `starredImportContentState`) were kept generic on purpose, anticipating
   this step.
2. **Generalization to Google Reader-compatible naming** (this decision),
   once a second export shape (FreshRSS) was verified against a sanitized
   fixture, the pure mapper's unit tests, and a manual import — see
   [GH Issue #330](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/330)
   and [GH Issue #337](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/337).

Because step 1 never shipped in a public release, this ADR records only the
final, generalized decision rather than carrying a separate superseded
record for an intermediate state no user ever saw.

Generic naming here is deliberately narrower than "supports every Google
Reader-compatible service." It reflects that the underlying `starred.json`
shape is a de facto lineage (Google Reader's original "Read later" API
format, carried forward by Inoreader and adopted by FreshRSS and other
readers) rather than a claim that every service emitting a similarly-shaped
export has been verified. See
[docs/starred-import-compatibility.md](../starred-import-compatibility.md)
for the narrow, per-service compatibility wording this project commits to,
and the fixture policy for confirming a new exporter.

## Considered Options

- **Explicit Inoreader naming, permanently.** Rejected: it would promise a
  name that gets more misleading, not less, the moment a second export
  format is verified — a user with a differently-shaped starred export
  would have no reason to suspect an "Inoreader" importer would work for
  them until it silently failed to find the feature at all.
- **Generalize naming to "any Google Reader-compatible service."** Rejected:
  this overstates verified compatibility. Only Inoreader and FreshRSS have
  actually been tested; claiming the broader lineage as supported would
  make a future support claim unfalsifiable.
- **Generic product copy, paired with a compatibility document that states
  confirmed-vs-potential compatibility per service** (chosen): the UI names
  the accepted data shape ("Google Reader-compatible `starred.json`")
  without naming a specific service, while
  [docs/starred-import-compatibility.md](../starred-import-compatibility.md)
  carries the accountability for which services are actually tested — so a
  future support claim is falsifiable rather than a doc-free assumption.

## Consequences

- The default new-feed folder for new imports is **Starred imports**, not
  **Inoreader starred imports**. Existing folders, feeds, settings, and
  command IDs are never migrated or renamed by this decision — a vault that
  already has an "Inoreader starred imports" folder keeps it exactly as-is,
  and only future imports use the new default.
- Internal identifiers were already generic before this decision (see step 1
  above) and are unaffected: `StarredImportCandidate`,
  `starred-import-mapper.ts`, `starredImportContentState`, etc.
- Any future addition of a third confirmed-compatible exporter should update
  [docs/starred-import-compatibility.md](../starred-import-compatibility.md)
  with its own fixture-backed evidence rather than assuming the generic
  product copy already covers it — the copy is generic, but the compatibility
  claims behind it are not, and stay per-service.
