# RSS Dashboard

The vocabulary used for user-facing RSS Dashboard behavior, including its podcast player.

## Accessibility

**Plugin accessibility scope**:
The RSS Dashboard views, controls, and content whose interaction and presentation the plugin owns across desktop, mobile, and popout use. Obsidian's host interface and third-party article content are outside that direct scope, though their integration and known barriers still matter to users.
_Avoid_: Obsidian accessibility (unqualified), all content

## Article footer

**Article footer**:
The row at the bottom of an article in card view and feed view that holds the article's action buttons (read, save, star, tags) and its date. In the standard layout the buttons come first at the left, with Mark read leftmost, and the date sits at the right. List view has its own footer arrangements and is not covered by this term.
_Avoid_: Card footer (when feed view is also meant), toolbar (the buttons alone)

**Mirrored footer**:
The [[Article footer]] with its order reversed: Mark read at the far right, the other buttons extending leftward from it, and the date at the left. Offered as the "Left-handed layout" setting, kept per device. Mark read stays the first footer Tab stop, so keyboard focus starts at the primary action and moves leftward through the other buttons.
_Avoid_: Left-handed mode, RTL layout, flipped footer

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

**Global feed operation**:
A cancellable operation over many feeds whose progress and Stop control appear on the sidebar's All feeds row: a refresh of all feeds (started by the user or by the schedule), or adding feeds from Discover or an OPML import and fetching their articles. It shares one lock with every other refresh of several feeds: a new one the user starts is refused with a notice, and a scheduled refresh waits until the lock is free. See [ADR 0015](docs/adr/0015-main-ts-decomposition.md).
_Avoid_: Global operation (unqualified), bulk job, background task

**Sidebar selection**:
The active group of feeds and folders selected in the sidebar via click, modifier-click, or range-selection.
_Avoid_: Active feeds, multi-selection target, highlighted list

**Batch move**:
Relocating multiple selected feeds or folders together into a target destination folder or root in a single operation.
_Avoid_: Bulk drag, mass reorder, multi-drop

**Feed error**:
A stored, user-readable message recording why a feed last failed, shown on its sidebar row and in the feed's details dialog. Two kinds: a [[Refresh failure]] and an [[Import failure]]. One feed holds at most one of each.
_Avoid_: Fetch error (unqualified), refresh error (when either kind is meant)

**Refresh failure**:
The [[Feed error]] from the most recent failed fetch, stored on `lastFetchError`, cleared on the next successful fetch.
_Avoid_: Fetch error (when only the refresh kind is meant)

**Import failure**:
The [[Feed error]] from the feed's most recent failed background import, stored on `importError` alongside `importStatus` `failed` or `timed_out`; cleared by a successful import or refresh.
_Avoid_: Fetch error, import error (when the concept is meant)

**Failing feed**:
A feed currently holding a [[Refresh failure]] and/or an [[Import failure]]. Counted once however many kinds it holds. Storage-health warnings are not feed errors.
_Avoid_: Failed feed (when only a fetch failure is meant)

**Feed error dialog**:
The dialog presenting one feed's refresh details and its [[Feed error]]s, with a copy action. Opened from the sidebar error badge, or from the feed's `Refresh details` and `View fetch error` menu items; titled `Feed error` from the badge and `View fetch error`, and `Refresh details` from the `Refresh details` item.
_Avoid_: Fetch error dialog, refresh details modal (when the merged dialog is meant)

## Sidebar search

**Sidebar search**:
A search over the sidebar's feeds, folders, and individual tags. It does not search article titles or article body text. The hamburger menu has a separate article-title search.
_Avoid_: Global search, full-text search

**Sidebar search qualifier**:
An optional `feed:`, `folder:`, or `tag:` prefix that narrows sidebar search to that category. For Dashboard tags, `tag:Saved` and `tag:#Saved` refer to the same tag; matching tags also reveal feeds carrying them.
_Avoid_: Required search prefix, tag operator (when describing the general Dashboard qualifier)

## Reader view

**Reader view**:
RSS Dashboard's article-reading experience, including dedicated views and the inline presentation inside the dashboard. Use a location-qualified term when the specific presentation matters. External browser is a separate destination, not a Reader view.
_Avoid_: Dashboard preview, inline article preview, dedicated Reader view (when referring to the general experience)

**RSS content**:
The article content supplied by the subscribed feed, including RSS, Atom, and JSON Feed. It may already contain the complete article. The Reader uses this label to distinguish the feed-provided version from [[Fetched content]], not to imply a summary or incomplete version. Distinct from [[Feed content]], the existing storage term. See proposed [ADR 0022](docs/adr/0022-rss-first-reader-content-selection.md).
_Avoid_: Partial content, summary (when naming the reading version), Feed content (the storage term)

**Fetched content**:
The article content extracted from the linked page, offered as another reading version alongside [[RSS content]]. The source label does not promise a complete, longer, or better article; extraction may produce less useful content than the feed provides. See proposed [ADR 0022](docs/adr/0022-rss-first-reader-content-selection.md).
_Avoid_: Full content, full article (when naming the reading version), complete version

**Reader view location**:
The setting that chooses where clicked articles and media open: [[Reader view (main)]], [[Reader view (right sidebar)]], [[Reader view (left sidebar)]], [[Reader view (inline)]], or [[External browser destination]]. The separate [[Saved article open location]] setting offers the same four in-app locations without the external browser destination.
_Avoid_: Reader view (unqualified when a location matters), article location

**Reader view (main)**:
A dedicated Reader view opened in Obsidian's main view area. This corresponds to the "Main view (split)" option in Reader view location settings.
_Avoid_: Main Reader (when the setting label matters)

**Reader view (right sidebar)**:
The Reader view presentation opened in Obsidian's right sidebar.
_Avoid_: Right Reader, sidebar preview

**Reader view (left sidebar)**:
The Reader view presentation opened in Obsidian's left sidebar.
_Avoid_: Left Reader, sidebar preview

**Reader view (inline)**:
The article-reading presentation rendered inside the dashboard view instead of a separate Obsidian view. It is also available as a Saved article open location.
_Avoid_: Inline article preview, inline reader (when a precise term is needed)

**Saved article open location**:
The setting that chooses where a saved article opens: [[Reader view (main)]], [[Reader view (right sidebar)]], [[Reader view (left sidebar)]], or [[Reader view (inline)]]. It does not offer the external browser destination.
_Avoid_: Reader view location (when referring to this separate setting)

**External browser destination**:
The Reader view location option that opens an article or media in the external browser instead of a plugin-owned Reader view.
_Avoid_: External Reader view

**Reader lightbox**:
The modal overlay presented over the reader view to display an article or hero image in its full resolution with pan and zoom capabilities.
_Avoid_: Modal dialog, photo popup, preview card, photo gallery

**Full-resolution image source**:
The unconstrained original media URL extracted by resolving direct image links, selecting the highest-resolution candidate in a srcset, or stripping CDN resize transformations.
_Avoid_: Thumbnail, cached preview, compressed version

**Remote image load failure**:
A third-party image resource that the host application cannot load. By itself, this does not mean the plugin failed; the host may report the resource failure independently.
_Avoid_: Plugin image error

**Video placeholder**:
The click-to-play block the Reader shows in place of a recognized YouTube embed before the reader plays it: a play control, the video's title, and a [[Video embed|Watch on YouTube]] button-styled link. Nothing is requested from YouTube or Obsidian's embed host until the reader chooses to play. Also the reusable unit the fetched version can place when a page names a video.
_Avoid_: Video thumbnail, preview card, embedded player

**Video embed**:
A recognized YouTube video played inline in article content, built only from the validated 11-character video ID through Obsidian's embed host; the feed's own iframe markup is never copied. Shown in the Reader's [[RSS content]] and in [[Reader view (inline)]]. The "Watch on YouTube" link sits beneath the player as the always-working fallback. Unchanged in [[Fetched content]]. A [[Saved note]] does not hold this unit: the save writes a native Markdown video embed that Obsidian renders itself, with the watch link beside it.
_Avoid_: iframe passthrough, inline iframe

**Full-view video player**:
The Reader's dedicated player for a YouTube feed item (the Reader's video view), shown instead of article content. It plays through the same https embed host as a [[Video embed]] and keeps a "Watch on YouTube" link beneath it. It resumes from a saved position through the host's `start` parameter; live playback-progress events cannot reach the host, so this player does not save new progress. Distinct from a [[Video embed]], which appears inside article content.
_Avoid_: YouTube player (unqualified), embedded player

## Article state

**Starred state**:
A per-article boolean, independent of tags, toggled solely by the star action. The filled star is its only visual indicator. Never derived from, or used to derive, any tag. See [ADR 0011](docs/adr/0011-decouple-starred-state-from-tags.md).
_Avoid_: Favorite, bookmarked, pinned

**Article tag**:
A user-assigned classification on an article, normally added or removed through a tag action; the [[Saved tag]] is an exception cleared with Saved state. A tag named "Favorite" or "Starred" carries no reserved meaning and behaves like any other ordinary tag. See [ADR 0011](docs/adr/0011-decouple-starred-state-from-tags.md).
_Avoid_: Label (reserved for imported Inoreader labels; see [[Label-derived tag]])

## Saving articles

**Default save**:
Saving an article to a note with the resolved folder and template and no per-save overrides. [[Default save version]] decides which version the note holds.
_Avoid_: Quick save, simple save

**Default save version**:
The setting that decides which version a save writes: [[RSS content]] (the feed item's content, falling back to the feed description, then the summary) or [[Fetched content]] (the article page, falling back to RSS content when the fetch fails). A save surface names the version its save will write; the version is switched in this setting or in a saved template's [[Save version]] field, never per save. See [ADR 0022](docs/adr/0022-rss-first-reader-content-selection.md).
_Avoid_: Save full content (the retired toggle), full content

**Custom save**:
A one-time save where the user chooses the folder, template, and filename pattern in the save dialog. It may also change the feed's template assignment. Offered on every Save button beside [[Default save]]; the keyboard save action is always a Default save.
_Avoid_: Advanced save, save as

**Save version**:
Which version of an article a save writes, and so what the saved note holds. The [[Default save version]] setting decides it, optionally overridden by the [[Saved template]] applied to the article. A note records the version it holds through the `{{contentSource}}` row, which names the version written rather than the version requested: a Fetched content save that fell back to the feed item's own text records [[RSS content]]. The row is written only when the template that saved the note holds `{{contentSource}}`, so a [[Default article template]] saved before the row existed records it once the user adds the variable or resets the template. See [ADR 0029](docs/adr/0029-record-the-version-a-save-wrote-in-the-note.md).
_Avoid_: Full content (the retired toggle), summary mode

**Saved template**:
A named reusable article-note body with per-template save options such as a folder and filename pattern.

**Global default template**:
The saved template selected for article saves that have no feed-specific template assignment.

**Default article template**:
The editable fallback note template used for article saves that have no feed-assigned or global default saved template.
_Avoid_: global template (when referring to this fallback rather than a saved template).

**Feed-assigned template**:
A saved template selected for future article saves from one configured feed. It takes precedence over the global default for that feed.

**Filename pattern**:
An optional saved-template expression that produces the filename stem for an article note, using supported article metadata placeholders but not the article body.

**Filename stem**:
The sanitized filename portion before the automatically added `.md` extension.

**Filename pattern override**:
A one-save replacement for the selected saved template's filename pattern. It changes the name used for that saved note without changing the saved template.

**Saved note**:
A vault note associated with a feed article through the article's save action.
_Avoid_: Saved article (when referring to the note rather than the feed article), article backup

**Saved-note association**:
The recorded relationship between a feed article and its current saved note. An observed rename or move preserves that relationship; opening a saved note does not establish a different association by matching its filename.
_Avoid_: Filename match, recovered article

**Saved state**:
The article state recording its association with a saved note. A missing association, observed note deletion, or confirmed absence during an explicit saved-note open clears it; unobserved changes can leave it stale.
_Avoid_: Backed up, protected forever

**Saved tag**:
The case-insensitive Saved article-tag assignment used as a convenience indicator for saved articles. It is cleared with Saved state, including manually assigned variants, because assignment provenance is not distinguished.
_Avoid_: Saved state (the tag is a separate indicator), starred tag

**Tag definition**:
A named tag in the available-tag collection, with a color and which can be assigned to articles. Deleting a tag definition from a tag-management control also removes its [[Tag assignment|assignments]] from every article. See [ADR 0020](docs/adr/0020-keep-tag-changes-consistent-across-reader-views.md).
_Avoid_: Tag palette entry (when discussing the tag itself rather than its color)

**Tag assignment**:
The association between a [[Tag definition]] and one article. Removing an assignment from an article leaves the definition and assignments on other articles intact; deleting the definition removes every assignment.
_Avoid_: Tag definition, tag palette entry

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
A tag added or removed on a candidate article by hand, via its per-article tag chip in the import preview. Independent of [[Label-derived tag|Label-derived tags]] and of the "Import labels as tags" toggle — it always carries through to the imported item regardless of that toggle's state.
_Avoid_: Ad hoc tag, user tag, manual tag override

## Article metadata pipeline

**Preview**:
The text shown under an article's title on cards and in the feed view, and the text a keyword rule's **Preview** field matches. It is the guarded [[Feed description]] blurb when the article also ships a body, otherwise the summary, description, then content, cut at 420 characters. Shown only when the Show summary display setting is on, but a keyword rule matches it either way. Its setting label and keyword-rule field keep the stored name `applyToSummary`; **Summary** stays reserved for the legacy `{{summary}}` value.
_Avoid_: Summary (the frozen legacy `{{summary}}` value), excerpt (the derived metadata fallback)

**Summary**:
The legacy `{{summary}}` template variable and its `extractSummary(...)`-derived value: the first ~220 characters of the feed's own `content`/`description` HTML, stripped to text. Frozen byte-identical forever — it never cascades to [[Description tier|description]] or [[Excerpt tier|excerpt]] even once those exist, and the name is not reserved for a future real-summarization feature. Distinct from [[Description tier|description]] (publisher-authored) and [[Excerpt tier|excerpt]] (the new derived fallback) — despite the shared etymology, `summary` names only this one frozen value.
_Avoid_: Using "summary" for a publisher description or the new excerpt fallback; description, excerpt

**Description**:
A publisher-authored description of the article, resolved via the [[Description tier]] precedence chain (`meta[name=description]` -> `og:description` -> `twitter:description` -> guarded feed description) exposed as `{{description}}` and `ResolvedArticleMetadata.description`, and persisted as `FeedItem.publisherDescription`. Never a truncation of the article body — that is what [[Excerpt tier|excerpt]] is for. A candidate that turns out to be truncated body text is caught by the [[Degenerate description value]] guard and rejected from this tier.
_Avoid_: Summary, excerpt, using "description" for any RSS-supplied value that hasn't passed the guard, `FeedItem.description` (that field holds the [[Feed description]])

**Excerpt**:
A derived, non-publisher-authored preview of the article, resolved via the [[Excerpt tier]] fallback chain and exposed as `{{excerpt}}`. Reached only once every [[Description tier]] candidate is exhausted or rejected. Distinct from [[Summary]] (the frozen legacy value) even though both are derived rather than publisher-authored — they resolve independently and can differ.
_Avoid_: Summary (a different, frozen value), description (publisher-authored, a different tier)

**Feed description**:
The raw item blurb the feed entry itself supplies (RSS `<description>`, Atom `<summary>`, JSON Feed `summary`; the body is `content`, a separate field), before any resolver precedence or guard is applied. Stored on `FeedItem.description`, which every refresh rewrites; the resolved [[Description tier|description]] is stored separately, as `publisherDescription` (the audit in #666 decided to keep the `description` name). One input to both the [[Description tier]] (as its lowest-precedence, guarded candidate) and the [[Excerpt tier]] (as a fallback), never itself the resolved output. Historically the only source for the Reader's "Feed description" label, which should not be shown for a value that actually came from a page-level [[Description tier]] signal.
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

**Cover image**:
The image a card, a feed-view hero, or a Reader hero shows for an article, stored on the feed item in the `coverImage` field. It normally comes from the feed's own markup (media tags, an enclosure, or the first image in the blurb); after a [[Cover image fetch]] it may instead be the article page's [[Page cover image]]. The Reader's "hero" names a layout region, not a separate image. See [ADR 0031](docs/adr/0031-store-a-manually-fetched-page-cover-image-in-coverimage.md).
_Avoid_: Preview image (the documentation's older name), hero image (the Reader layout region), card image, thumbnail

**Page cover image**:
The image an article page declares for itself through `og:image`, falling back to `twitter:image`, resolved against the article URL. Read only by a [[Cover image fetch]]; never at refresh or render time, and never by scanning the page body, where the first image is usually a byline avatar or a site logo. A formula image, a tracking pixel, a `data:` URL, and any non-`http(s)` value are refused. See [ADR 0031](docs/adr/0031-store-a-manually-fetched-page-cover-image-in-coverimage.md).
_Avoid_: og image, social image, page hero, article thumbnail

**Cover image fetch**:
The manual dashboard action that reads an article page's [[Page cover image]] and stores it as the item's [[Cover image]], offered in an article's context menu and as a control on a card, in Card and Feed views while cover-image display is on. One request per activation, sharing a request already in flight for the same link; it stores no page content and changes no other article field. Distinct from the Reader's fetch that produces [[Fetched content]].
_Avoid_: Fetch card image, image fetch, full fetch, article fetch (the Reader's fetch)

**Persisted article metadata**:
The subset of [[Resolved article metadata]] fields written onto `FeedItem` once a full-article fetch resolves them: `publisherDescription` (stored beside `FeedItem.description`, which keeps the [[Feed description]]), `language`, `authors` (`string[]`; overrides the feed-derived value only when the feed side resolved to a single author entry, while `FeedItem.author` stays a string holding the same names joined with `", "`), `canonicalUrl`, `metadataFetchedAt`, and `languageSource`. First-write-wins — once `metadataFetchedAt` is set on an item, a later feed refresh never overwrites these fields, since [[Feed metadata]] is the pre-fetch fallback, not a rival source. Distinct from `excerpt`, `siteName`, `modifiedAt`, and `descriptionSource`, which stay unpersisted (transient [[Resolved article metadata]] only).
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
A feed storage mode the plugin still reads but will stop writing to when 3.0 ships: Legacy JSON and Shard storage v1. Its arrival at 3.0 is the [[Storage cutoff]], after which a vault on one of these is a [[Read-only vault]]: it opens and displays its articles, but refreshes nothing and records nothing — not stars, tags, saves, retention auto-deletes, or any other setting. Export remains available, and migrating to Shard storage v2 remains possible through the [[Frozen importer]]. See [ADR 0006](docs/adr/0006-deprecate-legacy-json-and-shard-storage-v1.md).
_Avoid_: Unsupported mode, legacy mode, read-only mode

**Storage cutoff**:
The release that turns the [[deprecated storage mode]]s read-only: 3.0. It is keyed to the release rather than a date, because a major release ships when its contents are ready. Users below the [[declared floor]] never receive it and keep writable deprecated modes. See [ADR 0006](docs/adr/0006-deprecate-legacy-json-and-shard-storage-v1.md).
_Avoid_: Cutoff date, sunset, deprecation release

**Read-only vault**:
A vault whose feed storage is a [[deprecated storage mode]] on a release carrying the [[storage cutoff]]. It displays its articles, marks read state in memory for the session, exports a [[portable data bundle]], and can migrate to Shard storage v2. It writes nothing else; preference changes made while read-only are lost on quit, exactly like read marks. The state is enforced at the persistence choke point and is distinct from a failed settings load. See [ADR 0024](docs/adr/0024-enforce-the-read-only-cutoff-at-the-persistence-choke-point.md).
_Avoid_: Read-only mode (that names a [[deprecated storage mode]], not a vault), frozen vault, locked vault

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
An export containing app preferences, including storage settings (display, retention, auto-backup, etc.), with no feeds, folders, tags, or articles. The re-scoped counterpart to the [[Feed bundle]] that together make up the [[Portable data bundle]]; matches the existing `usersettings.json` shape. Introduced by ADR 0005.
_Avoid_: usersettings bundle, preferences export

**Replacing import**:
An import that discards the current feeds, folders, tags, articles, and article state and puts the file's in their place: a [[Portable data bundle]], a [[Feed bundle]], or a user preferences file that carries feeds, folders, or tags. An OPML import in **Replace** mode is also a Replacing import: it replaces every feed and folder with the file's, though it brings no articles or article state. What the user had before and did not export is gone once it completes. Its preferences still merge rather than replace: each preference the file carries is applied and every [[Omitted key]] keeps its current value, exactly as for an [[Overwriting import]].
_Avoid_: Restore, overwrite (reserved for [[Overwriting import]])

**Overwriting import**:
An import that sets each app preference present in the file to the file's value and leaves every [[Omitted key]] unchanged: a [[Settings bundle]], or a user preferences file with no feeds, folders, or tags. Never touches feeds, articles, or article state.
_Avoid_: Replace, settings restore

**Merging import**:
An import that adds to the current feeds or articles without removing any: an OPML import in **Update** mode and starred-article imports.
_Avoid_: Append, sync

**Omitted key**:
A preference key an import file does not carry. It keeps its current value, so only the keys the file carries change; a settings group the file omits keeps its current value whole.
_Avoid_: Missing setting, skipped setting, defaulted setting

**Import confirmation**:
The last-chance prompt shown after an import file has been read and validated, and before anything is written, for every [[Replacing import]] and [[Overwriting import]]. It compares what the user has now with what the file brings, names any change to the storage location, and lets the user cancel or export a [[Portable data bundle]] first. Cancelling leaves every setting, shard file, and article state exactly as it was.
_Avoid_: Import preview (reserved for the feed-selection preview of OPML imports), warning

**Storage migration**:
Moving feed content from its current feed storage mode into shard files for the first time, or upgrading from Shard storage v1 to v2. Distinct from storage repair and storage revert.
_Avoid_: Migrate, storage change

**Frozen importer**:
The one-way path that reads a Legacy JSON or Shard storage v1 vault and writes Shard storage v2. It is exempt from the [[read-only vault]] invariant, is tested once against committed samples of both deprecated shapes, and is then not changed, so migration stays possible after the [[storage cutoff]] without keeping the deprecated write paths. The exemption is enforced by an import allowlist rather than convention. See [ADR 0024](docs/adr/0024-enforce-the-read-only-cutoff-at-the-persistence-choke-point.md).
_Avoid_: Converter, upgrader, migration tool

**Storage repair**:
Force-regenerating the shard files of every feed whose articles are loaded in memory, skipping feeds with none, without changing feed storage mode, used to recover from an out-of-sync or incomplete shard folder. Applies to Shard storage v2 only: repair writes, so a [[read-only vault]] is never repaired. Distinct from storage migration and storage revert.
_Avoid_: Rebuild, resync

**Storage revert**:
Switching feed storage back to Legacy JSON, writing all feed content back into `data.json` and optionally deleting the shard folder. Removed at the [[storage cutoff]], so a [[read-only vault]] cannot be returned to a writable deprecated mode. Distinct from storage migration and storage repair.
_Avoid_: Rollback, downgrade

**Metadata cleanup**:
The user's choice, offered right after a metadata storage move succeeds, to delete or keep the `data.json` copy left behind at the previous location. Clearing the Metadata location is a move back to the plugin folder: it first asks the user to confirm moving the vault `data.json` to the trash, and Metadata cleanup is offered afterward only for any other copy left behind, such as `user-state.json` under Shard storage v2.
_Avoid_: Backup cleanup, orphan file

## CORS proxy

**Proxy check**:
The on-demand diagnostic in **Settings → RSS Dashboard → General → Proxy** that asks each proxy to fetch one fixed neutral page (`https://example.com/`) and reports that proxy's response time. It answers "which proxy is slow, and does this one still work at all?" for the full-article fetch; feed refresh keeps its own hardcoded proxy list, so a green board says nothing about it. A result is **fast** under 2 s, **slow** up to the shared 5 s deadline, **timed out** past it, or **failed** with the reason, and the fastest is marked. Results last for the session only — the next run replaces them and a reload drops them — and nothing is scored, reordered, or persisted. No request is sent until a button is pressed.
_Avoid_: Ping (the check times a complete response body, not time to first byte), proxy health, proxy benchmark

## Version support

**Declared floor**:
The oldest Obsidian app version the plugin declares support for, stated in `manifest.json` `minAppVersion` and mirrored by the matching `versions.json` entry and by `MINIMUM_SUPPORTED_APP_VERSION` in `scripts/check-release-compatibility.mjs`. Obsidian serves a user the newest plugin release whose declared floor their app version satisfies, so raising it is what stops an older app receiving updates. It is also the number `obsidianmd/no-unsupported-api` measures API calls against. See [ADR 0023](docs/adr/0023-set-the-3-0-support-floor-at-obsidian-1-11-5.md).
_Avoid_: Minimum version, minver, supported version

**Feature floor**:
The Obsidian version that first provides an API a feature needs. Distinct from the [[declared floor]]: a feature floor above it is reachable by checking the version at runtime, which the linter accepts, but that choice obliges the plugin to define and maintain what users below that version get instead.
_Avoid_: Required version, API version

**Guarded feature**:
A feature whose API sits at a [[feature floor]] above the [[declared floor]], offered only after a runtime version check. It obligates the plugin to define the below-floor behavior for as long as that floor is declared. Distinct from a feature gated by the [[declared floor]] alone, where users below it receive no release carrying the feature at all.
_Avoid_: Backwards-compatible feature, versioned feature

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
