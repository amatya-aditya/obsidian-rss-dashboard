---
status: implemented
completed: 2026-08-21
released_in: 2.6.0
issue: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/177
implementation: ""
---

# Add Opt-in Disk Caching for Dashboard Preview Images

## Status and scope

- **Classification:** Enhancement.
- **Risk:** High. The feature writes downloaded content to local storage and
  touches Display settings, feed-refresh orchestration, dashboard rendering,
  storage-mode isolation, and desktop/mobile behavior.
- **Canonical issue:** [#177](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/177).
- **Milestone recommendation:** `vNext`, **Stretch**. Leave the milestone and
  release-requirement metadata empty until triage assigns the issue.
- **Affected surfaces:** Display settings, Card View, Feed View, Discover
  background ingestion, low-priority post-refresh work, and a plugin-owned
  cache root.
- **Unaffected surfaces:** Reader View, article-content images, List View,
  Discover rendering, feed parsing, image URL discovery, persisted feed record
  formats, vault-shard formats, settings export, portable export, and saved
  article data.

## Problem and user value

Dashboard Card and Feed views currently load their cover/preview images from
remote URLs. Revisiting image-heavy feeds can therefore repeat network work and
make browsing slower, particularly on constrained connections.

Users who want faster dashboard browsing need an explicitly enabled, bounded
local image cache without turning preview images into synchronized feed data or
changing Reader/article behavior. Users who prefer no local media persistence
must be able to leave caching off or remove every plugin-owned cache file.

## Domain language

- A **preview image** is the existing eligible image rendered by Dashboard Card
  View or Feed View. It follows each renderer's current source-precedence and
  URL-eligibility rules.
- The **image cache** is a device-local, plugin-owned collection of preview
  image files and its accompanying metadata/index. It is not a feed-data store.
- A **cache hit** is a present, validated local image for a preview URL. A
  **cache miss** continues to use the existing remote URL.
- An **eligible image** is a downloaded JPEG, PNG, WebP, GIF, or AVIF response
  no larger than 1 MiB (1,048,576 bytes).

## Proposed behavior

### Settings and management

Add an **Allow image caching** toggle to Display settings. It defaults to off
for every installation. Its description explains that caching can improve
Card/Feed browsing by storing preview images locally, is limited to 1 MiB per
image, consumes additional local storage, and is optional.

When enabled, Display settings also show:

- an **Image cache limit** slider and synchronized numeric field, defaulting
  to 100 MiB and accepting whole values from 1 MiB through 1024 MiB (1 GiB);
- a **No cache size limit** toggle that removes only the aggregate cap and
  retains the saved finite value for later use; the 1 MiB per-image limit still
  applies;
- **Clear image cache**, which first asks for confirmation and identifies the
  current cache total;
- live text such as **Cached image storage: 24.6 MB**; and
- a success or partial-failure notice after clearing.

The total updates after successful downloads, eviction, clear completion, and
any reconciliation needed after a partial clear without re-rendering the entire
settings tab for each write. It may change while a refresh warms or evicts the
cache, then settles when queued work completes. Lowering a finite limit trims
least-recently-used entries immediately and never initiates image downloads.
Turning the toggle off stops
cache reads and writes, cancels queued cache work, prevents in-flight work from
writing afterward, clears the verified cache root, and refreshes the displayed
total.

### Cache use and fetching

Card View and Feed View use a validated local file when the image cache is
enabled and contains the preview URL; otherwise they retain their present
remote-image behavior and error fallback. The cache must not alter each view's
existing candidate precedence, URL filters, lazy-loading behavior, or Feed
View's image/blur behavior. Reader and article-body images remain source-loaded
when the article opens.

After a successful manual or scheduled refresh, after a successful feed
addition (including from Discover), or after a feed is successfully hydrated
by OPML/background import, enqueue that feed's currently retained eligible
preview URLs, newest first. URLs are deduplicated. The queue has
concurrency two, runs at lower priority than feed refresh work, and never starts
downloads from scrolling, import placeholder creation, or enabling the setting.
A queue batch that produces usable cache entries refreshes the active Dashboard
once after both workers drain, so already-rendered Card and Feed previews can
resolve the new local URLs without re-rendering once per image.
A Discover/OPML feed remains owned by background ingestion from placeholder
creation through its queued or in-flight fetch. Manual and scheduled refreshes
skip those pending URLs, preventing duplicate feed requests and a stale
placeholder refresh from overwriting hydrated articles. The feeds become
refreshable normally as soon as background ownership ends.
A newly enabled cache begins filling after the next successful refresh or import
hydration only. Do not queue or read cached images while **Show cover images**
is off.

Do not cache sources declared or measured above 1 MiB. Enforce the limit from
both a usable declared length and the received bytes; never persist an
oversized, malformed, unsupported, or failed response. Those cases, and all
cache read/write failures, keep the existing remote-image fallback.

### Storage, lifetime, and safety

Use a dedicated plugin-owned, device-local cache root separate from
`RssDashboardSettings`, feed shards, vault-shard metadata, and portable/import
export data. The cache must not intentionally participate in the plugin's
settings/feed synchronization paths. A third-party tool configured to copy all
plugin files may still copy it; document that limitation rather than promising
that the plugin can prevent external synchronization.

Use a URL-derived cryptographic hash as the filename. Normalize the absolute
URL, preserve its query string, and ignore only its fragment before hashing.
This avoids unsafe paths and lets equivalent preview requests share one entry.
Keep cache index/metadata only with the cache, sufficient to determine size,
validate ownership, record last use, identify stale entries, and reconcile
files safely.

Cap the aggregate cache at the user-selected finite limit, 100 MiB by default.
Before or while admitting an entry, evict least-recently-used entries until the
new item fits. When **No cache size limit** is enabled, do not apply an aggregate
cap. A valid cached entry remains usable for 30 days. Once aged, retain that
valid local image while a
low-priority replacement attempt is queued; if the old local image is missing,
corrupt, or fails validation, use the remote URL.

Clear and eviction operations must validate each target against the exact cache
root, remove only verified cache files/metadata, and leave article data,
settings, saved articles, feed data, and unrelated vault files untouched.
When Feed Manager's existing **Delete all feeds** confirmation is accepted,
clear the verified image cache automatically as dependent plugin-owned data.
Disclose a nonzero cache total in that same confirmation, do not add a second
prompt, and report partial deletion failures. Deleting one feed does not clear
the shared cache.

## Acceptance criteria

1. New installations default **Allow image caching** to off; the setting
   explains the Card/Feed performance, 1 MiB-per-image, and local-storage
   trade-off.
2. The setting exposes confirmed clearing and live, correctly refreshed cache
   size text.
3. With caching enabled, Card and Feed use a validated local cache hit without
   changing existing image candidate precedence or eligibility.
4. Cache misses and all cache read/download/write/validation failures render
   through the existing remote-image fallback without breaking the preview.
5. Only JPEG, PNG, WebP, GIF, and AVIF responses at or below 1 MiB are stored;
   unsupported, malformed, unknown, SVG, HTML/error, and oversized payloads
   are never persisted.
6. Cache downloads are scheduled only after successful manual or automatic feed
   refreshes or successful OPML/background-import hydration, are
   URL-deduplicated and newest-first, and run at no more than two concurrent
   operations.
7. Card/feed scrolling and enabling the preference do not create a cache
   download burst; enabling takes effect for cache population at the next
   successful refresh.
8. No cache reads or downloads occur while **Show cover images** or **Allow
   image caching** is off.
9. Reader/article-content images, List View, Discover, feed parsing, article
   page fetching, OG/Twitter image discovery, and stored image URL selection
   remain unchanged.
10. A hash derived from the normalized URL including query and excluding
    fragment names cache files; different query-string variants do not collide.
11. The cache remains at or below the saved finite limit (100 MiB by default)
    after writes/eviction, and least recently used entries are selected for
    removal. Selecting no cache size limit removes only this aggregate cap;
    the per-image limit remains in force and the prior finite value is retained.
12. Lowering the finite limit immediately trims least-recently-used entries and
    never re-fetches fresh entries solely because the limit changed.
13. Entries older than 30 days remain usable when valid while replacement is
    attempted in the background; missing/corrupt/invalid stale entries fall
    back remotely.
14. Cache metadata and bytes remain outside all plugin settings, feed-data,
    vault-shard, portable-export, and import/export serialization paths.
15. Disabling or confirming clear cancels queued work, blocks late writes,
    removes only validated cache-owned data, updates the total, and surfaces
    partial deletion failures.
16. Desktop and mobile behavior work with each supported storage mode, without
    assuming a desktop-only filesystem API or a `file://` image URL.
17. Confirming **Delete all feeds** discloses nonzero cached-preview storage,
    clears the verified cache without a second prompt, preserves unrelated
    plugin data, and reports partial cache-clear failures. Deleting one feed
    leaves the shared cache intact.
18. Discover/OPML placeholders that are pending or in flight in background
    ingestion are excluded from concurrent refreshes; existing feeds continue
    refreshing, and hydrated articles and their cache-warming callback are not
    overwritten by stale placeholder results.

## Implementation direction

1. Add focused failing service tests for URL keys, supported response validation,
   byte limits, cache index reconciliation, size accounting, LRU eviction,
   30-day refresh behavior, queue deduplication/concurrency, clear/disable
   cancellation, and remote fallback.
2. Add a focused cache service using mobile-compatible Obsidian adapter APIs
   and a plugin-owned root. Keep its metadata entirely alongside cache files;
   never add cache state to persisted settings or feed types.
3. Extend `DisplaySettings`, defaults, normalization/migration, and the Display
   settings tab. Saving relevant toggles refreshes the active dashboard through
   its established seam.
4. Integrate the cache resolver with Card and Feed preview rendering without
   changing source precedence or making global-document/timer assumptions.
5. Schedule the cache queue after existing refresh-success paths without
   occupying the refresh semaphore or delaying feed completion.
6. Prove all storage/synchronization serializers exclude the cache and document
   the third-party whole-plugin-sync limitation where users can understand it.

Likely files:

- `src/types/types.ts`
- `src/utils/settings-loader.ts`
- `src/settings/tabs/display-settings-tab.ts`
- `src/components/article-list/utils/article-preview-utils.ts`
- `src/components/article-list/views/card-view.ts`
- `src/components/article-list/views/feed-view.ts`
- `main.ts`
- a new focused cache service under `src/services/`
- `src/services/feed-storage-repository.ts` and import/export seams, for
  exclusion verification only
- matching tests under `test_files/unit/services/`,
  `test_files/unit/components/article-list/views/`, and settings tests

## Validation and manual checks

- Follow Red -> Green -> Refactor with jsdom tests and Obsidian API stubs.
- Run focused cache-service, Card View, Feed View, and Display-settings tests.
- Run `npm run check:platform`, TypeScript checking, `npm run lint`, and
  `npm run build`; run `npm run test:unit` because refresh, storage, and shared
  preview behavior are affected.
- Confirm `git status --short` after validation and remove only verified
  generated artifacts.
- On desktop and mobile, test opt-in/default-off, cache hit/miss, remote error,
  supported/unsupported/oversized sources, finite-limit eviction, no-limit
  behavior, stale replacement,
  toggle-off cleanup, clear confirmation/partial failure, queue concurrency,
  no scroll-triggered downloading, and Card/Feed previews with both settings
  combinations.
- In Feed Manager, verify Delete all feeds discloses nonzero cached-preview
  storage, clears it after the existing confirmation without a second prompt,
  reports partial deletion failures, and does not clear the shared cache when
  deleting one feed.
- Verify every supported storage mode and portable/settings import-export leave
  cache bytes and metadata out while image URL fallback still works on a second
  device without a local cache.

## Non-goals, risks, dependencies, and sequencing

- This does not fetch article pages or discover OG/Twitter images. The existing
  `cover-image-fallback-og-fetch` plan remains separate and is not a dependency;
  if implemented later, its resolved URLs can become normal cache candidates.
- This does not synchronize cache bytes between devices, cache every article
  image, modify Reader images, or promise to defeat third-party tools that
  synchronize all plugin files.
- Cache storage, binary response validation, adapter portability, and late
  writes after clearing are the principal risks; implementation must prove them
  through service tests and desktop/mobile manual checks.
- The feature is recommended as `vNext` Stretch. Formal milestone assignment,
  labels beyond the feature template's `enhancement`, and issue identity await
  maintainer review and GitHub creation.

## Changelog and lifecycle

After implementation and validation, add a concise **Unreleased -> Added**
entry with the canonical issue link. Mark the plan implemented, move it to
`docs/archive/plans/unreleased/`, and update the archive catalog and inbound
links. At release cut, move it to the applicable version archive and reconcile
the release notes.
