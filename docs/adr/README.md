# Architecture Decision Records

Documentation explains **how RSS Dashboard works**. Architecture Decision Records (ADRs) preserve **why it works that way**.

ADRs record important product, UX, architecture, storage, data-model, compatibility, and development decisions. They capture the problem that prompted a decision, the approach chosen, meaningful alternatives considered, and the consequences of that choice.

You do not need to be a developer to read them. Some ADRs are highly technical, while others document product behavior and design decisions that directly affect how RSS Dashboard works.

## How to read an ADR

Most ADRs follow the same basic structure:

- **Context and problem** — what prompted the decision and why it mattered.
- **Decision** — what RSS Dashboard chose to do.
- **Consequences** — what becomes better, worse, different, or deliberately unchanged.
- **Considered options** — other reasonable approaches that were evaluated.
- **Historical precedent** — relevant prior art or established conventions, when useful.
- **Implementation notes** — technical details maintainers may need, when useful.
- **Related** — connected ADRs, issues, documentation, or external references.

Not every ADR needs every optional section.

## ADR lifecycle

ADRs may have the following statuses:

- **proposed** — under consideration.
- **accepted** — adopted and represents current project policy.
- **superseded** — replaced by a newer ADR.
- **deprecated** — no longer recommended or relied upon.
- **rejected** — formally considered but not adopted.

Once accepted, ADRs are historical records. If a decision later changes materially, a new ADR should supersede the previous one rather than rewriting the original decision with hindsight.

See the [ADR Policy](POLICY.md) for the complete lifecycle, authoring, and maintenance rules.

## Decisions

| ADR                                                                            | Decision                                                                | Status   | Summary                                                                                                                               |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [0001](0001-reader-full-resolution-lightbox.md)                                | Full-Resolution Reader Lightbox                                         | accepted | Use a custom full-window lightbox so reader images can be inspected at their original resolution without leaving Obsidian.            |
| [0002](0002-configurable-retention-protections-and-unread-expiration.md)       | Configurable Retention Protections and Unread Expiration                | accepted | Let users choose whether starred, saved, tagged, and unread articles are protected from automatic expiration and item-limit cleanup.  |
| [0003](0003-generalize-starred-import-to-google-reader-compatible-naming.md)   | Generalize Starred-Article Import Naming to Google Reader-Compatible    | accepted | Use service-neutral starred-import language while keeping compatibility claims limited to exporters that have actually been verified. |
| [0004](0004-split-article-state-from-feed-content-in-shard-storage-v2.md)      | Split Article State from Feed Content in Shard Storage v2               | accepted | Separate frequently changing article state from relatively stable feed content to reduce cross-device sync conflicts.                 |
| [0005](0005-split-portable-data-bundle-into-feed-and-settings-bundles.md)      | Split the Portable Data Bundle into a Feed Bundle and a Settings Bundle | accepted | Allow feed data and application preferences to be exported and imported independently while retaining the combined portable bundle.   |
| [0006](0006-deprecate-legacy-json-and-shard-storage-v1.md)                     | Deprecate Legacy JSON and Shard Storage v1                              | accepted | Converge on Shard storage v2 by making the older storage modes read-only in 3.0 while preserving a migration path.                    |
| [0007](0007-article-metadata-pipeline-seam.md)                                 | Article-Metadata Pipeline Seam                                          | accepted | Separate raw page-metadata extraction from feed-aware metadata resolution so precedence rules remain centralized and testable.        |
| [0008](0008-first-seen-date-fallback-for-undated-items.md)                     | First-Seen Date Fallback for Undated Items                              | accepted | Record when articles are first observed and optionally use that timestamp for sorting and retention when no publish date exists.      |
| [0009](0009-curated-whats-new-release-notes.md)                                | Curated What's New Release Notes                                        | accepted | Use hand-authored, build-embedded What's New notes instead of generating user-facing update copy from the technical changelog.        |
| [0010](0010-hydration-gated-user-state-garbage-collection.md)                  | Hydration-Gated User-State Garbage Collection                           | accepted | Remove article state only on positive evidence — a validated shard read or an explicit feed removal — never on absence alone. |
| [0011](0011-decouple-starred-state-from-tags.md)                               | Starred State Is Independent from Tags                                  | accepted | Treat stars and tags as independent article state so starring never creates, removes, or reserves a user tag.                         |
| [0012](0012-guard-storage-folder-changes-instead-of-detecting-twin-folders.md) | Guard Storage Folder Changes Instead of Detecting Twin Folders          | accepted | Warn before a storage folder change on a device missing articles, rather than detecting and switching to a dotted or undotted twin folder. |
| [0013](0013-render-reddit-posts-from-rss-content.md)                           | Render Reddit Posts from RSS Content                                    | accepted | Show Reddit posts from their RSS content, without spoofing a crawler to reach Reddit's formatted pages; the official API is deferred. |
| [0014](0014-obsidian-test-stub-fidelity.md)                                    | The Obsidian Test Stub Models Observed Obsidian Behavior                | accepted | Base the unit-test stub on contract-tested observations of real Obsidian, never its source, and fix production code when a faithful stub breaks a test. |

## Creating a new ADR

Before creating an ADR, read the [ADR Policy](POLICY.md) to determine whether the decision warrants a durable record.

Start from [ADR-TEMPLATE.md](ADR-TEMPLATE.md), assign the next unused four-digit number, and use a descriptive kebab-case filename:

`NNNN-short-decision-title.md`

Example:

`0012-example-decision-title.md`

When the ADR is added or its status changes, update the index above.

## References and further reading

RSS Dashboard's ADR approach is informed by established ADR practices while intentionally keeping the process lightweight:

- [Michael Nygard — Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [MADR — Markdown Architectural Decision Records](https://adr.github.io/madr/)
- [ADR Templates](https://adr.github.io/adr-templates/)

RSS Dashboard uses these as influences rather than as a rigid external standard. The project's own requirements are defined in the [ADR Policy](POLICY.md).
