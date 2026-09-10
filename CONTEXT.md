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
