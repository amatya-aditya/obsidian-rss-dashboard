# ADR 0003: Generalize starred-article import naming to Google Reader-compatible

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-09-11

## Context and problem

RSS Dashboard can import starred articles from a `starred.json` export. The underlying schema is the Google Reader API "Read later" format, which other tools could plausibly export too. The feature's user-facing name therefore had to balance two risks: naming a single service could mislead users of other compatible exporters, while a generic name could overstate what had actually been verified.

This decision was reached in two steps, within the same pre-release development window and before either state reached a public user:

1. **Explicit Inoreader naming.** The importer had, at that point, only ever been built against and tested against Inoreader's actual export — no other source had been verified compatible — so a generic name would have overstated what the feature did. The feature's internal identifiers (`StarredImportCandidate`, `import-starred-modal.ts`, `starredImportContentState`) were kept generic on purpose, anticipating this step.
2. **Generalization to Google Reader-compatible naming** (this decision), once a second export shape (FreshRSS) was verified against a sanitized fixture, the pure mapper's unit tests, and a manual import — see [GitHub Issue #330](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/330) and [GitHub Issue #337](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/337).

Because step 1 never shipped in a public release, this ADR records only the final, generalized decision rather than carrying a separate superseded record for an intermediate state no user ever saw. Step 1 was first committed as `0003-name-starred-import-explicitly-for-inoreader.md` and was replaced in place by this record.

## User stories

The decision is intended to preserve these core user expectations:

1. As an RSS Dashboard user, I want the command, modal, settings entry, and Feed Manager action to say **Import starred articles**, so that I am not forced to know which exporter produced my file.
2. As an RSS Dashboard user, I want the input described as a Google Reader-compatible `starred.json` export, so that I understand the accepted format without being promised support for every compatible service.
3. As an RSS Dashboard user, I want existing folders and feeds named **Inoreader starred imports** to remain unchanged, so that a display rename does not silently rewrite my data.

For a complete list of all 21 user stories that were identified, visit [GitHub Issue #330](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/330).

## Decision

All user-facing copy for the starred-article import feature — the command name, the Settings-tab section heading and button, the Feed Manager button, the modal title and description, and the default new-feed folder — uses generic language ("Import starred articles," "Starred imports," "Import labels as tags") rather than naming Inoreader explicitly. The parser is correspondingly generalized to tolerate the `starred.json` shape produced by FreshRSS, alongside the Inoreader shape it already handled.

Generic naming here is deliberately narrower than "supports every Google Reader-compatible service." It reflects that the underlying `starred.json` shape is a de facto lineage (Google Reader's original "Read later" API format, carried forward by Inoreader and adopted by FreshRSS and other readers) rather than a claim that every service emitting a similarly shaped export has been verified. The [starred import compatibility document](../starred-import-compatibility.md) carries the narrow, per-service compatibility wording this project commits to, and the fixture policy for confirming a new exporter.

## Consequences

- Internal identifiers were already generic before this decision (see step 1 above) and are unaffected: `StarredImportCandidate`, `starred-import-mapper.ts`, `starredImportContentState`, etc.
- Any future addition of a third confirmed-compatible exporter should update the [starred import compatibility document](../starred-import-compatibility.md) with its own fixture-backed evidence rather than assuming the generic product copy already covers it — the copy is generic, but the compatibility claims behind it are not, and stay per-service.

### Existing users and data

The default new-feed folder for new imports is **Starred imports**, not **Inoreader starred imports**. Existing folders, feeds, settings, and command IDs are never migrated or renamed by this decision — a vault that already has an "Inoreader starred imports" folder keeps it exactly as-is, and only future imports use the new default.

## Considered options

### Explicit Inoreader naming, permanently

Rejected. It would promise a name that gets more misleading, not less, the moment a second export format is verified — a user with a differently shaped starred export would have no reason to suspect an "Inoreader" importer would work for them until it silently failed to find the feature at all.

### Generalize naming to "any Google Reader-compatible service"

Rejected. This overstates verified compatibility. Only Inoreader and FreshRSS have actually been tested; claiming the broader lineage as supported would make a future support claim unfalsifiable.

### Generic product copy, paired with a per-service compatibility document

Chosen. The UI names the accepted data shape ("Google Reader-compatible `starred.json`") without naming a specific service, while the [starred import compatibility document](../starred-import-compatibility.md) states confirmed-versus-potential compatibility per service and carries the accountability for which services are actually tested — so a future support claim is falsifiable rather than a doc-free assumption.

## Implementation notes

The parser resolves a portable source URL from `origin.streamId` only when that value is itself an HTTP(S) URL, falling back to `origin.htmlUrl` otherwise, so an instance-local numeric stream ID such as FreshRSS's `feed/6` never becomes a local feed's URL. It prefers `summary.content` but falls back to `content.content`, the field FreshRSS uses instead.

## Related

- [Starred import compatibility](../starred-import-compatibility.md) — per-service compatibility claims and fixture policy
- [Starred import guide](../starred-import-guide.md) — user documentation
- [ADR 0011 — Starred state is independent from tags](0011-decouple-starred-state-from-tags.md)
- [GitHub Issue #330](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/330) — generalize starred article import for Google Reader-compatible exports
- [GitHub Issue #337](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/337) — FreshRSS-compatible parsing and generic product copy
