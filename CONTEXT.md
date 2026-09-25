# RSS Dashboard

The vocabulary used for user-facing RSS Dashboard behavior, including its podcast player.

## Podcast player

**Active episode**:
The episode currently loaded in the podcast player's audio element. It anchors the visible episode-list range whenever the player selects or advances to an episode.
_Avoid_: Current article, selected row

**Episode list**:
A bounded, ordered set of episode rows from one feed. It is read-only and does not imply a saved or customizable playlist.
_Avoid_: Playlist, queue

**Episode order**:
The current sequence of episodes after the player's selected sort or shuffle behavior has been applied. It determines an episode's before and after neighbors.
_Avoid_: Publication order, feed order

**Episode-list browsing**:
Loading or viewing a bounded range of episodes without changing the active episode or audio playback.
_Avoid_: Skipping, episode navigation

**Incremental loading**:
Adding the next bounded batch of episode rows to the rendered list. It preserves responsive performance for feeds with thousands of locally stored episodes.
_Avoid_: Full-list rendering, unbounded scrolling

## Sidebar feed management

**Per-feed refresh status**:
The transient status of one feed within a refresh batch: queued, actively fetching, or settled. A settled feed has completed fetch, parse, and in-memory merge successfully, or has recorded its fetch failure, and must no longer display an in-progress indicator even while other feeds continue. The batch persists settings once after all feeds settle.
_Avoid_: Global refresh status, fetch progress

**Global refresh batch**:
One user-initiated refresh of the eligible feed set. It remains active until every selected feed has settled; its progress control is independent of each [[Per-feed refresh status]].
_Avoid_: Feed refresh, all feeds spinner

**Sidebar selection**:
The active group of feeds and folders selected in the sidebar via click, modifier-click, or range-selection.
_Avoid_: Active feeds, multi-selection target, highlighted list

**Batch move**:
Relocating multiple selected feeds or folders together into a target destination folder or root in a single operation.
_Avoid_: Bulk drag, mass reorder, multi-drop

## Reader view

**Reader lightbox**:
The modal overlay presented over the reader view to display an article or hero image in its full resolution with pan and zoom capabilities.
_Avoid_: Modal dialog, photo popup, preview card, photo gallery

**Full-resolution image source**:
The unconstrained original media URL extracted by resolving direct image links, selecting the highest-resolution candidate in a srcset, or stripping CDN resize transformations.
_Avoid_: Thumbnail, cached preview, compressed version

## Article state

**Starred state**:
A per-article boolean, independent of tags, toggled solely by the star action. The filled star is its only visual indicator. Never derived from, or used to derive, any tag. See [ADR 0011](docs/adr/0011-decouple-starred-state-from-tags.md).
_Avoid_: Favorite, bookmarked, pinned

**Article tag**:
A user-assigned classification on an article, added or removed only through a tag action. A tag named "Favorite" or "Starred" carries no reserved meaning and behaves like any other tag. See [ADR 0011](docs/adr/0011-decouple-starred-state-from-tags.md).
_Avoid_: Label (reserved for imported Inoreader labels; see [[Label-derived tag]])

## Data retention and article lifecycle

**Auto-delete cutoff**:
The calculated timestamp before which unprotected articles are deleted from local storage, based on publication date and the configured retention duration.
_Avoid_: Expiration date, purge limit

**Retention protection**:
The user-selected set of article states (such as starred, saved to vault, or tagged) that shield an article from automatic deletion and feed capacity trimming.
_Avoid_: Pinned articles, whitelisted items, lock state

**First-seen timestamp**:
The moment this vault's local storage first recorded a given article. Scoped to local observation, not publication: an article deleted by auto-delete and later re-fetched under the same identity gets a new first-seen timestamp, since no prior local record survives to carry forward. Distinct from `pubDate`, which (when present) reflects the publisher's own claimed publish time.
_Avoid_: First-fetched date, discovery date, seen-at

**Effective date**:
The single date an article sorts and retains by: its `pubDate` when the source provides one, falling back to its first-seen timestamp when it does not (gated by the "use first-seen date for undated items" setting). The resolved value that sorting and auto-delete logic actually consume, as opposed to either of its two possible sources.
_Avoid_: Sort date, resolved date, display date

## Import preview

**Existing feed**:
A feed from an import file whose URL is already configured. In Update mode it
is informationally unavailable and is not selectable for import.
_Avoid_: Error feed, invalid feed, rejected feed

## Starred article import

**New feed candidate**:
A starred-import preview row group for an article whose source feed isn't yet a subscription. Grouped separately from articles belonging to already-subscribed feeds, with its own editable target folder; the feed subscription is always created regardless of any import option.
_Avoid_: New feed group, unknown feed

**Unimportable entry**:
A starred.json entry the importer could not turn into a candidate at all — missing a source feed identifier, or missing both a canonical and an alternate article link. Listed with its title (or raw id) and a specific reason instead of being silently dropped.
_Avoid_: Invalid entry, rejected article, skipped item

**New-feed metadata refresh**:
The optional, toggle-gated background fetch that populates a new feed candidate's real title, site URL, icon, and current items immediately after import. Independent of the feed subscription's creation, which always happens regardless of this toggle.
_Avoid_: Feed refresh, live fetch, feed sync

**Unfetched article**:
A starred-imported article whose content is still exactly what the export provided — no full-content fetch has ever succeeded for it. Distinguished from an article whose fetch was attempted and failed.
_Avoid_: Cached article, preview article, stub article

**Manual full-content fetch**:
The reader-triggered, on-demand fetch ("Fetch now") that retrieves an unfetched or failed article's full content. Never runs automatically for these articles — only the reader's separate automatic fetch-on-open, used for articles added through ordinary feed subscription, is automatic.
_Avoid_: Auto-fetch, background fetch, lazy load

**Label-derived tag**:
A tag on a starred-imported article that came from mapping one of the export's Inoreader labels. Gated entirely by the "Import labels as tags" toggle — turning it off removes only these tags.
_Avoid_: Imported tag, bulk tag

**Manually-assigned tag**:
A tag added or removed on a candidate article by hand, via its per-article tag chip in the import preview. Independent of label-derived tags and of the "Import labels as tags" toggle — it always carries through to the imported item regardless of that toggle's state.
_Avoid_: Ad hoc tag, user tag, manual tag override

## Article metadata pipeline

**Summary**:
The legacy `{{summary}}` template variable and its `extractSummary(...)`-derived value: the first ~220 characters of the feed's own `content`/`description` HTML, stripped to text. Frozen byte-identical forever — it never cascades to [[Description tier|description]] or [[Excerpt tier|excerpt]] even once those exist, and the name is not reserved for a future real-summarization feature. Distinct from [[Description tier|description]] (publisher-authored) and [[Excerpt tier|excerpt]] (the new derived fallback) — despite the shared etymology, `summary` names only this one frozen value.
_Avoid_: Using "summary" for a publisher description or the new excerpt fallback; description, excerpt

**Description**:
A publisher-authored description of the article, resolved via the [[Description tier]] precedence chain (`meta[name=description]` -> `og:description` -> `twitter:description` -> guarded feed description) and exposed as `{{description}}` and `ResolvedArticleMetadata.description`. Never a truncation of the article body — that is what [[Excerpt tier|excerpt]] is for. A candidate that turns out to be truncated body text is caught by the [[Degenerate description value]] guard and rejected from this tier.
_Avoid_: Summary, excerpt, using "description" for any RSS-supplied value that hasn't passed the guard

**Excerpt**:
A derived, non-publisher-authored preview of the article, resolved via the [[Excerpt tier]] fallback chain and exposed as `{{excerpt}}`. Reached only once every [[Description tier]] candidate is exhausted or rejected. Distinct from [[Summary]] (the frozen legacy value) even though both are derived rather than publisher-authored — they resolve independently and can differ.
_Avoid_: Summary (a different, frozen value), description (publisher-authored, a different tier)

**Feed description**:
The raw `<description>`/`<content>` value the RSS/Atom feed entry itself supplies, before any resolver precedence or guard is applied. One input to both the [[Description tier]] (as its lowest-precedence, guarded candidate) and the [[Excerpt tier]] (as a fallback), never itself the resolved output. Historically the only source for the Reader's "Feed description" label, which should not be shown for a value that actually came from a page-level [[Description tier]] signal.
_Avoid_: Description (the resolved, publisher-authored output — a feed description is only ever a candidate for it), RSS description

**Page metadata**:
Signals read from the fetched article page's `<head>` and body (meta tags, `<html lang>`, Readability's own fields) during a full-article fetch, as opposed to signals the RSS/Atom feed itself carries.
_Avoid_: Article metadata (doesn't distinguish source), HTML metadata

**Feed metadata**:
Signals carried by the RSS/Atom feed entry or channel itself — the feed-supplied `<description>`, feed-level `<language>`/`xml:lang` — independent of any page fetch.
_Avoid_: RSS metadata, feed signals

**Raw article metadata**:
Every [[Page metadata]] signal as found on the fetched page, one slot per signal, before any precedence is applied. Produced by `extractPageMetadata` from the `Document` that `Readability.parse()` is about to mutate, so extraction always runs first.
_Avoid_: Extracted metadata, page signals

**Resolved article metadata**:
One value per metadata field (description, language) after precedence is applied across [[Raw article metadata]] and [[Feed metadata]]. Produced by `resolveArticleMetadata`, held only for the current render or save — not a `FeedItem` shape itself. Individual fields may be copied onto `FeedItem` by the ticket that defines that field; the object as a whole is never persisted wholesale.
_Avoid_: Final metadata, merged metadata

**Persisted article metadata**:
The subset of [[Resolved article metadata]] fields written onto `FeedItem` once a full-article fetch resolves them: `description` (overwrites the feed-derived value), `language`, `author` (`string[]`; overrides the feed-derived value only when the feed side resolved to a single author entry), `canonicalUrl`, `metadataFetchedAt`, and `languageSource`. First-write-wins — once `metadataFetchedAt` is set on an item, a later feed refresh never overwrites these fields, since [[Feed metadata]] is the pre-fetch fallback, not a rival source. Distinct from `excerpt`, `siteName`, `modifiedAt`, and `descriptionSource`, which stay unpersisted (transient [[Resolved article metadata]] only).
_Avoid_: Enriched metadata (doesn't distinguish transient from persisted), saved metadata

**Metadata provenance**:
A `*Source` field on `FeedItem` recording which tier of [[Resolved article metadata]] a persisted value came from. Only `languageSource` earns persistence — the page/feed coverage gap (96% vs 57%) makes it load-bearing. `descriptionSource` stays internal-only: meta vs og agree 88% of the time, and the distinction that actually matters (description vs excerpt) is already implied by which `FeedItem` field the value landed in, not by a separate provenance string.
_Avoid_: Source tracking, metadata source

**Description tier**:
The resolver's precedence chain for the `description` field of [[Resolved article metadata]] — `meta[name=description]` → `og:description` → `twitter:description` → guarded feed-supplied description — with every candidate filtered through the [[Degenerate description value]] guard before acceptance. Distinct from the [[Excerpt tier]], which the resolver only reaches once every [[Description tier]] candidate has been rejected.
_Avoid_: Description hierarchy, description precedence

**Excerpt tier**:
The resolver's fallback chain for the `excerpt` field, reached only once the [[Description tier]] is exhausted: Readability's own `excerpt` (when it did not come from a page meta tag already tried), then the feed-supplied description, then truncated article text. Fills `excerpt`, never `description`, on [[Resolved article metadata]].
_Avoid_: Fallback tier, summary tier

**Degenerate description value**:
A [[Description tier]] candidate the resolver rejects outright: under ~40 normalized characters, normalized-equal to the title, punctuation/ellipsis-only, or a [[Duplicate intro]] of the article body. Rejection advances to the next candidate in the [[Description tier]]; only a [[Duplicate intro]] rejection is eligible to seed the [[Excerpt tier]] afterward; the other rejection reasons are discarded outright.
_Avoid_: Bad description, invalid description, junk value

**Duplicate intro**:
A description that restates the article's own opening text — exactly, or as a normalized prefix in either direction — rather than carrying independent publisher-authored prose. Detected identically wherever it's checked: the Reader's duplicate-suppression display and the resolver's [[Degenerate description value]] guard share one test.
_Avoid_: Restated intro, redundant description, duplicate lead

## Storage

**Automatic backup**:
A low-write recovery copy of the current legacy backup artifacts. Until the
[[Portable data bundle]] backup supersedes them, it exists to preserve a
recoverable snapshot without mirroring every persistence write. A plugin
session writes one snapshot after its first meaningful change and a second,
final snapshot on unload only when a later meaningful change made the first
snapshot stale. Every successful settings persistence is a meaningful change
for this transitional mechanism. A storage migration forces a pre-migration
snapshot and makes that snapshot current for the session. A snapshot is current
only after every enabled artifact writes successfully; a failure stays stale and
retries on a later save or unload. Snapshot writes are serialized.
Unload requests a final stale snapshot on a best-effort basis; the first-change
snapshot is the reliable recovery baseline.
_Avoid_: Continuous persistence, write-through backup

**Feed storage**:
Where and how feed content (articles and episodes) is persisted, independent of where plugin metadata is persisted. Its mode is one of Legacy JSON or Shard storage (v1 or v2).
_Avoid_: Storage (unqualified), article storage

**Metadata storage**:
Where the plugin's `data.json` (settings, feed definitions, folder organization, cleanup rules) is persisted: either the plugin's own directory or a user-chosen vault folder. Configured independently of feed storage, though Shard storage v2 forces it to a vault folder.
_Avoid_: Storage (unqualified), config storage

**Shard storage**:
A feed storage mode that persists one file per feed in a vault folder instead of one monolithic `data.json`, improving sync behavior over Legacy JSON. Comes in two versions: v1 keeps each article's state inside its feed's shard file; v2 moves article state into a separate file, leaving only feed content in the shard. v2 is the supported version; v1 is a [[deprecated storage mode]].
_Avoid_: Vault Shards, vault storage

**Deprecated storage mode**:
A feed storage mode the plugin still reads but will stop writing to when 3.0 ships: Legacy JSON and Shard storage v1. A vault on one of these still opens and displays its articles, but no longer refreshes feeds, records stars, tags, or saves, or auto-deletes by retention rule. Export remains available, and migrating to Shard storage v2 remains possible after the cutoff. See [ADR 0006](docs/adr/0006-deprecate-legacy-json-and-shard-storage-v1.md).
_Avoid_: Unsupported mode, legacy mode, read-only mode

**Feed content**:
The article or episode data (title, body, media, publish date) written into a feed's shard file under Shard storage v2. Distinct from that feed's article state, which v2 stores separately.
_Avoid_: Shard content, feed data

**Article state**:
The per-article interaction data — read, starred, tags, saved-to-vault, playback progress — that Shard storage v2 stores in a separate `user-state.json` rather than inside the feed's shard file. The same states referenced by [[retention protection]].
_Avoid_: User state (as a standalone term outside v2), read state

**Feed removal**:
A user's deliberate deletion or unsubscription of a feed on this device, singly, by folder, or all at once. Only a feed removal ends a feed's [[Article state]] immediately. Replacing the feed list through an import or restore is not a feed removal. See [ADR 0010](docs/adr/0010-hydration-gated-user-state-garbage-collection.md).
_Avoid_: Deleted feed (as a state), unsubscribed feed

**Unrecognized feed state**:
[[Article state]] whose feed is not in this device's feed list and was not the subject of a [[Feed removal]] here. It is kept, because the feed may exist on another device or return through a restore, and expires only after the 90-day horizon without the feed reappearing.
_Avoid_: Orphaned state (reserved for a leftover `user-state.json` file), stale state

**Portable data bundle**:
A combined export equivalent to a [[Feed bundle]] plus a [[Settings bundle]] together, used to move a full Shard storage setup between devices. Currently exposed identically on both the storage tab and the Import/Export tab; nothing about the bundle's content is tab-specific. See [ADR 0005](docs/adr/0005-split-portable-data-bundle-into-feed-and-settings-bundles.md) for the split, now implemented.
_Avoid_: Shard data, shard export

**Feed bundle**:
An export containing feeds, folders, tags, articles, and article state, with no app settings. One of the two independently exportable/importable pieces that together make up the [[Portable data bundle]]. Introduced by ADR 0005 to let a user move or share their subscriptions and reading history without their app preferences.
_Avoid_: Feed data bundle, subscriptions export

**Settings bundle**:
An export containing app preferences only (display, retention, storage config, auto-backup, etc.), with no feeds, folders, tags, or articles. The re-scoped counterpart to the [[Feed bundle]] that together make up the [[Portable data bundle]]; matches the existing `usersettings.json` shape. Introduced by ADR 0005.
_Avoid_: usersettings bundle, preferences export

**Storage migration**:
Moving feed content from its current feed storage mode into shard files for the first time, or upgrading from Shard storage v1 to v2. Distinct from storage repair and storage revert.
_Avoid_: Migrate, storage change

**Storage repair**:
Force-regenerating all shard files from the current in-memory feed data without changing feed storage mode, used to recover from an out-of-sync or incomplete shard folder. Distinct from storage migration and storage revert.
_Avoid_: Rebuild, resync

**Storage revert**:
Switching feed storage back to Legacy JSON, writing all feed content back into `data.json` and optionally deleting the shard folder. Distinct from storage migration and storage repair.
_Avoid_: Rollback, downgrade

**Metadata cleanup**:
The user's choice, offered right after a metadata storage move succeeds, to delete or keep the `data.json` copy left behind at the previous location.
_Avoid_: Backup cleanup, orphan file

## Update notifications

**What's New popup**:
The modal shown after an update when a curated [[Release summary]] is due: a major/minor release shows its [[Release line]] note once, while a meaningful patch may show an exact-version note. An unnoted patch does not interrupt or advance the marker; a user who skips a release line still receives that line's note when updating directly to a patch. It is dropped for the session — without recording anything — when the storage-upgrade warning applies, so the two startup modals never stack. Reachable again afterward from the About tab's "What's new" button, which reopens the most specific available note rather than linking out.
_Avoid_: Update notification, changelog viewer, whats-new dialog

**Release line**:
The `major.minor` part of a version, for example `2.7` for `2.7.0` and `2.7.1`. Release-line [[Release summary]] content is keyed by this value; an optional exact-version patch note can override it for a meaningful bug-fix release.
_Avoid_: Version series, minor version

**Release summary**:
The curated, hand-authored markdown note for a [[Release line]] or optional exact-version patch, embedded into the plugin at build time as text so the [[What's New popup]] can render it offline; images stay remote. Distinct from `CHANGELOG.md`, which remains the full history and the target of "Read full changelog", and from `docs/releases/<version>.md`, the consolidated public summary written at release-cut time.
_Avoid_: Changelog excerpt, release notes, what's-new text

**Last shown version**:
The persisted setting recording the running version whose [[Release summary]] was last shown or whose new release line was evaluated. Compared against the running version to decide whether the popup opens; an unnoted patch leaves it unchanged, while a shown exact patch or a newer release line records it. Distinct from `manifest.json`'s version, which always reflects the installed code regardless of what the user has seen.
_Avoid_: lastSeenVersion, seen version
