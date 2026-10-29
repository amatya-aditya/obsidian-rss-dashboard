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

| ADR                                                                            | Decision                                                                 | Status   | Summary                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0001](0001-reader-full-resolution-lightbox.md)                                | Full-Resolution Reader Lightbox                                          | accepted | Use a custom full-window lightbox so reader images can be inspected at their original resolution without leaving Obsidian.                                                       |
| [0002](0002-configurable-retention-protections-and-unread-expiration.md)       | Configurable Retention Protections and Unread Expiration                 | accepted | Let users choose whether starred, saved, tagged, and unread articles are protected from automatic expiration and item-limit cleanup.                                             |
| [0003](0003-generalize-starred-import-to-google-reader-compatible-naming.md)   | Generalize Starred-Article Import Naming to Google Reader-Compatible     | accepted | Use service-neutral starred-import language while keeping compatibility claims limited to exporters that have actually been verified.                                            |
| [0004](0004-split-article-state-from-feed-content-in-shard-storage-v2.md)      | Split Article State from Feed Content in Shard Storage v2                | accepted | Separate frequently changing article state from relatively stable feed content to reduce cross-device sync conflicts.                                                            |
| [0005](0005-split-portable-data-bundle-into-feed-and-settings-bundles.md)      | Split the Portable Data Bundle into a Feed Bundle and a Settings Bundle  | accepted | Allow feed data and application preferences to be exported and imported independently while retaining the combined portable bundle.                                              |
| [0006](0006-deprecate-legacy-json-and-shard-storage-v1.md)                     | Deprecate Legacy JSON and Shard Storage v1                               | accepted | Converge on Shard storage v2 by making the older storage modes read-only in 3.0 while preserving a migration path.                                                               |
| [0007](0007-article-metadata-pipeline-seam.md)                                 | Article-Metadata Pipeline Seam                                           | accepted | Separate raw page-metadata extraction from feed-aware metadata resolution so precedence rules remain centralized and testable.                                                   |
| [0008](0008-first-seen-date-fallback-for-undated-items.md)                     | First-Seen Date Fallback for Undated Items                               | accepted | Record when articles are first observed and optionally use that timestamp for sorting and retention when no publish date exists.                                                 |
| [0009](0009-curated-whats-new-release-notes.md)                                | Curated What's New Release Notes                                         | accepted | Use hand-authored, build-embedded What's New notes instead of generating user-facing update copy from the technical changelog.                                                   |
| [0010](0010-hydration-gated-user-state-garbage-collection.md)                  | Hydration-Gated User-State Garbage Collection                            | accepted | Remove article state only on positive evidence — a validated shard read or an explicit feed removal — never on absence alone.                                                    |
| [0011](0011-decouple-starred-state-from-tags.md)                               | Starred State Is Independent from Tags                                   | accepted | Treat stars and tags as independent article state so starring never creates, removes, or reserves a user tag.                                                                    |
| [0012](0012-guard-storage-folder-changes-instead-of-detecting-twin-folders.md) | Guard Storage Folder Changes Instead of Detecting Twin Folders           | accepted | Warn before a storage folder change on a device missing articles, rather than detecting and switching to a dotted or undotted twin folder.                                       |
| [0013](0013-render-reddit-posts-from-rss-content.md)                           | Render Reddit Posts from RSS Content                                     | accepted | Show Reddit posts from their RSS content, without spoofing a crawler to reach Reddit's formatted pages; the official API is deferred.                                            |
| [0014](0014-obsidian-test-stub-fidelity.md)                                    | The Obsidian Test Stub Models Observed Obsidian Behavior                 | accepted | Base the unit-test stub on contract-tested observations of real Obsidian, never its source, and fix production code when a faithful stub breaks a test.                          |
| [0015](0015-main-ts-decomposition.md)                                          | Decompose main.ts into Injected Modules Behind a Plugin Facade           | accepted | Keep main.ts as the composition root and move feature clusters into injected service modules one at a time, with public plugin methods kept as delegates.                        |
| [0016](0016-wcag-22-aa-accessibility-reference.md)                             | Use WCAG 2.2 AA as the Accessibility Reference                           | accepted | Apply WCAG 2.2 AA as the design and audit reference for applicable plugin-owned UI without claiming conformance before verification.                                             |
| [0017](0017-select-saved-article-templates-by-feed-then-global-default.md)     | Select Saved Article Templates by Feed, Then Global Default              | accepted | Use one feed-specific template when assigned, otherwise the selected global saved template, and fall back to the built-in template when neither applies.                         |
| [0018](0018-generate-safe-article-filenames-from-template-patterns.md)         | Generate Safe Article Filenames from Template Patterns                   | accepted | Allow optional per-template filename stems, preserve existing article paths, and add numeric suffixes instead of replacing a different note.                                     |
| [0019](0019-saved-note-association-authority.md)                               | Saved-Note Association Authority                                         | accepted | Use events, plugin metadata, and explicit saved-note opens without proactive note-existence checks.                                                                              |
| [0020](0020-keep-tag-changes-consistent-across-reader-views.md)                | Keep Tag Changes Consistent Across Reader Views                          | accepted | Make tag deletion remove every article assignment and keep open Reader views current after tag changes.                                                                          |
| [0021](0021-store-the-left-handed-layout-per-device.md)                        | Store the Left-Handed Layout per Device                                  | accepted | Keep the Left-handed layout Display setting in vault-local storage so it stays per device instead of syncing through the settings file.                                          |
| [0022](0022-rss-first-reader-content-selection.md)                             | RSS-First Reader Content Selection                                       | accepted | Show RSS content immediately and let readers explicitly switch to Fetched content without background replacement or changes to saved-note contracts.                             |
| [0023](0023-set-the-3-0-support-floor-at-obsidian-1-11-5.md)                   | Set the 3.0 Support Floor at Obsidian 1.11.5                             | proposed | Declare Obsidian 1.11.5 as the 3.0 support floor so SecretStorage needs no version guards, and hold 1.13.0 for a later release.                                                  |
| [0024](0024-enforce-the-read-only-cutoff-at-the-persistence-choke-point.md)    | Enforce the 3.0 Read-Only Cutoff at the Persistence Choke Point          | accepted | Freeze a deprecated vault entirely at the persistence choke point, exempt the frozen importer, and keep the read-only predicate after the write paths go.                        |
| [0025](0025-identify-outbound-requests-as-obsidian.md)                         | Identify Outbound Requests as Obsidian, Not as a Browser                 | accepted | Send no User-Agent override on any request, so a 403 from an anti-bot filter is never caused by an incomplete claim to be Chrome.                                                |
| [0026](0026-let-a-saved-template-override-the-save-version.md)                 | Let a Saved Template Override the Default Save Version                   | accepted | Give a saved template an optional Save version, so a feed assigned that template writes its own version and the rest follow the Default save version.                            |
| [0027](0027-merge-imported-settings-one-group-deep.md)                         | Merge Imported Settings One Group Deep                                   | accepted | Merge each affected nested settings group one level deep on import, so a file that carries only some of a group's keys keeps the rest of the user's values.                      |
| [0028](0028-plan-lives-in-its-issue-body.md)                                   | A Plan Lives in Its Issue Body                                           | accepted | Keep the plan in its issue body, so the ticket a reader arrives at carries the answer and there is no second copy to drift.                                                      |
| [0029](0029-record-the-version-a-save-wrote-in-the-note.md)                    | Record the Version a Save Wrote in the Note                              | accepted | Record the version a save actually wrote in the note through a `{{contentSource}}` row, so a fallback to feed text is not labelled as a fetched page.                            |
| [0030](0030-read-video-progress-from-the-nested-player-frame.md)               | Read Video Progress from the Nested Player Frame                         | accepted | Read the Reader video's exact position by handshaking with the player nested in Obsidian's embed host, instead of estimating or hosting a relay page.                            |
| [0031](0031-store-a-manually-fetched-page-cover-image-in-coverimage.md)        | Store a Manually Fetched Page Cover Image in `coverImage`                | accepted | A manual card action reads the article page's declared image and stores it in `coverImage`, so a blank card can be filled without making page fetching automatic.                |
| [0032](0032-record-fetched-cover-image-provenance-and-restore-it.md)           | Record a Fetched Cover Image's Provenance and Restore It from the Feed   | accepted | A page-derived cover is marked on the item, so the control can offer to put the feed's own image back — locally, with no request.                                                |
| [0033](0033-use-the-pages-own-image-as-the-fetched-heros-source.md)            | Use the Page's Own Image as the Fetched Version's Hero                   | accepted | Store the page's declared image on the item as `pageImage`, the fetched version's hero, while the card reads the displayed cover and the RSS version keeps the feed's own image. |
| [0034](0034-treat-a-bot-challenge-as-a-blocked-fetch.md)                       | Treat a Bot Challenge as a Blocked Fetch, Not a Paywall                  | accepted | A WAF/bot-challenge 403 is a blocked fetch with its own message and retry, while a real 401/403 gate keeps the paywall wording.                                                  |
| [0035](0035-test-real-obsidian-sync-in-the-real-vault.md)                      | Test Real Obsidian Sync in the Real Vault                                | accepted | An attended Real Sync pass may attach an agent over CDP to the real profile.                                                                                                     |
| [0036](0036-merge-a-synced-data-json-against-an-ancestor.md)                   | Merge a Synced data.json Against an Ancestor                             | proposed | Merge a delivered data.json per entry against a device-local ancestor, so an edit made on one device survives a save on another.                                                 |
| [0037](0037-read-site-specific-content-only-from-the-fetched-page.md)          | Read Site-Specific Content Only from the Page the Fetch Already Returned | accepted | Allow a site-specific content extractor only if it reads the page the fetch already returned, with no extra request or impersonation; narrows ADR 0013 to Reddit.                |
| [0038](0038-rank-cors-proxies-from-passive-session-health.md)                  | Rank CORS Proxies from Passive, Session-Only Health                      | accepted | Order and bench the `auto` proxies from the outcomes of real fetches, in memory for the session, with no probe traffic and no extra proxy contacted.                             |
| [0039](0039-use-user-managed-secretstorage-references.md)                      | Use User-Managed SecretStorage References for Credentials                | accepted | Store credential references, never values; keep FreshRSS resolution feature-local and defer a shared module until a second real consumer exists.                                 |
| [0040](0040-support-youtube-api-channel-feeds-with-user-managed-keys.md)       | Support YouTube API Channel Feeds with User-Managed Keys                 | proposed | Keep the 50-item API source uncommitted pending policy and data gates; share credential resolution only if YouTube becomes a real second consumer.                               |

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
