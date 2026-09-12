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
## Data retention and article lifecycle

**Auto-delete cutoff**:
The calculated timestamp before which unprotected articles are deleted from local storage, based on publication date and the configured retention duration.
_Avoid_: Expiration date, purge limit

**Retention protection**:
The user-selected set of article states (such as starred, saved to vault, or tagged) that shield an article from automatic deletion and feed capacity trimming.
_Avoid_: Pinned articles, whitelisted items, lock state

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

## Storage

**Feed storage**:
Where and how feed content (articles and episodes) is persisted, independent of where plugin metadata is persisted. Its mode is one of Legacy JSON or Shard storage (v1 or v2).
_Avoid_: Storage (unqualified), article storage

**Metadata storage**:
Where the plugin's `data.json` (settings, feed definitions, folder organization, cleanup rules) is persisted: either the plugin's own directory or a user-chosen vault folder. Configured independently of feed storage, though Shard storage v2 forces it to a vault folder.
_Avoid_: Storage (unqualified), config storage

**Shard storage**:
A feed storage mode that persists one file per feed in a vault folder instead of one monolithic `data.json`, improving sync behavior over Legacy JSON. Comes in two versions: v1 keeps each article's state inside its feed's shard file; v2 moves article state into a separate file, leaving only feed content in the shard.
_Avoid_: Vault Shards, vault storage

**Feed content**:
The article or episode data (title, body, media, publish date) written into a feed's shard file under Shard storage v2. Distinct from that feed's article state, which v2 stores separately.
_Avoid_: Shard content, feed data

**Article state**:
The per-article interaction data — read, starred, tags, saved-to-vault, playback progress — that Shard storage v2 stores in a separate `user-state.json` rather than inside the feed's shard file. The same states referenced by [[retention protection]].
_Avoid_: User state (as a standalone term outside v2), read state

**Portable data bundle**:
A combined export containing both metadata and all feed shard files together, used to move a full Shard storage setup between devices. Currently exposed identically on both the storage tab and the Import/Export tab; nothing about the bundle's content is tab-specific. See [ADR 0005](docs/adr/0005-split-portable-data-bundle-into-feed-and-settings-bundles.md) for the planned split into a Feed bundle and a Settings bundle.
_Avoid_: Shard data, shard export

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
