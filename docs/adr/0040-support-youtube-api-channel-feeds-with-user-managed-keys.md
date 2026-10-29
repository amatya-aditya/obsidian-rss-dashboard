# ADR 0040: Support YouTube API Channel Feeds with User-Managed Keys

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

proposed

## Date

2026-10-29

## Context and problem

Users have asked to enter a YouTube Data API key to receive more channel videos.
The intended MVP goal is up to 50 uploads for one channel. RSS Dashboard already
supports YouTube channel RSS feeds and embedded playback; neither needs a Data
API key. The exact number of items returned by the existing RSS source is not a
fixed product contract.

The candidate API flow is small: resolve one public channel with `channels.list`,
then request its uploads with `playlistItems.list` and `maxResults=50`. These
public list calls use an API key rather than OAuth. `playlistItems.list` allows
up to 50 results per page, and the current quota table assigns one unit to each
list call. `search.list`, comments, captions, and metadata enrichment are not
needed for this goal. The API documentation does not establish that an uploads
playlist is returned newest-first, so the product cannot yet promise that one
page contains the 50 most recent uploads.

A key can also be used for public video metadata through `videos.list` and
published comments through `commentThreads.list`; each method currently costs
one unit per call. Captions methods require OAuth, including for videos the user
does not own, so a key alone does not provide a transcript feature. The Data API
does not document a dedicated Shorts field; classifying Shorts from duration or
shape would be a heuristic, not an API-backed filter. `search.list` has its own
100-call daily bucket and is not part of this MVP.

The feature has material policy and data-lifecycle questions. Google's policy
requires API Clients to use credentials assigned to that client and project,
and restricts sharing credentials or allowing third-party use. It does not
settle whether a key owned by each plugin user, entered into this distributed
third-party client, is allowed. YouTube's API Data aggregation rules also raise
a question for a dashboard that combines channels from different content owners.
Non-authorized API Data has refresh-or-delete requirements, while RSS Dashboard
lets users protect and save items, retain local feed history, export data, and
copy article content into notes. The current retention behavior is not evidence
that those API requirements can be met.

This remains a proposal. It does not supersede
[ADR 0039](0039-use-user-managed-secretstorage-references.md), which remains the
current credential decision, or authorize code changes, a public feature
promise, or user guidance to create a Google Cloud project.

## Verified facts and unresolved interpretations

The current Google and Obsidian documentation establishes these facts:

- `channels.list` resolves documented channel IDs, handles, and usernames for
  one quota unit; `playlistItems.list` accepts up to 50 items per page and costs
  one unit. The documented default is 10,000 units per day for most methods,
  with a separate 100-call `search.list` bucket. A request without OAuth needs
  an API key. The IFrame player does not require authorization. If both list
  calls run per channel refresh, 50 channels refreshed hourly use about 2,400
  units a day; 200 hourly use about 9,600; 200 every 15 minutes use about
  38,400, before retries. Every request, including an invalid one, costs at
  least one unit.
- The YouTube error reference lists `403 quotaExceeded`, generic `403
forbidden`, invalid/missing request parameter errors, and `404
channelNotFound`. Its global error table also identifies `keyInvalid`,
  `keyExpired`, and `403 accessNotConfigured` for project/API configuration.
  Google's API-key guidance explains that key restrictions can reject a call,
  but the exact YouTube response for each restriction needs verification. Error
  handling must inspect the reason code, not infer the cause from HTTP status
  alone.
- `videos.list` can return public video resource fields such as snippets,
  duration, live-stream details, and statistics for one unit per call;
  `commentThreads.list` returns published comment threads for one unit per
  call. The caption guide requires OAuth for both listing and downloading
  tracks. No dedicated Shorts classification field appears in the documented
  video resource; YouTube's current Help criteria use upload date, aspect ratio,
  and duration, so a heuristic does not establish the Shorts classification.
- Google says API credentials must be assigned to the API Client and its
  project, calls for exactly one project per API Client, and prohibits making
  credentials available to third parties. The policy does not specifically
  resolve the proposed case where each end user creates a project and uses that
  key with this distributed plugin.
- Google prohibits aggregation of API Data across different recognized
  YouTube content owners. Its compliance guide says API data shown alongside
  other platforms must be clearly distinguished, and gives a search engine that
  labels YouTube versus other videos as an acceptable example. RSS Dashboard
  shows a feed title on article rows, but the default feed views can mix
  channels and platforms. Whether that source label is sufficient and whether
  a chronological feed list counts as cross-owner aggregation need
  authoritative interpretation.
- Non-authorized API Data may be stored only as needed and for no longer than
  30 calendar days, after which it must be refreshed or deleted. The policy
  separately requires API Clients that access or use user data to provide a
  deletion-request path and honor requests within seven calendar days. Whether
  that user-data rule applies to this public, no-OAuth feed use case needs to be
  confirmed.
- Google's API-key guidance recommends client and API restrictions, says only
  one client-restriction type can be configured on a key, recommends sending
  the key in the `x-goog-api-key` header instead of the URL, and advises client
  applications to send requests through a server that adds the key. Obsidian
  documents SecretStorage as local to a vault and does not promise sync. The
  number and scope of SecretStorage references needed across desktop, Android,
  and iOS are product decisions that depend on the accepted key restrictions.
- Obsidian documents `requestUrl` as making HTTP/HTTPS requests without CORS
  restrictions and supports request headers. That documentation does not prove
  that requests to Google work on every supported desktop and mobile host.
  YouTube's Required Minimum Functionality requires embedded-player identity
  through `Referer`; its guidance specifically calls out desktop and mobile
  WebViews. Current repository player verification records Linux desktop only.
- The `playlistItems.list` reference documents page size and pagination, but
  does not promise that a channel's uploads playlist is returned newest-first.

The unresolved items above are product and policy interpretations, not API
facts. If the applicable rules remain unclear after reviewing the policies,
Google's compliance guidance says to apply for an API Compliance Audit and
include a clear description of the use case and its end users. No audit request
has been submitted.

## Proposed consumer contract

If the release gates below are resolved, the YouTube MVP would:

- Add an optional API-backed source for one public channel's uploads, returning
  up to 50 items in one page, subject to the channel's available uploads and
  RSS Dashboard's per-feed item limit. Until ordering is verified, describe the
  limit as “up to 50 uploads per request,” not “the 50 most recent.” It would
  not promise a complete channel archive.
- Let a user-selected SecretStorage reference opt eligible YouTube channel
  feeds into the API source, replacing RSS for discovery. Without a configured
  reference, the existing RSS source continues. The exact scope of the setting
  (one plugin-wide reference or separate references for supported platforms)
  remains open until the key-restriction and policy questions are resolved.
- Accept a channel ID, `@` handle, or legacy username only when the documented
  `channels.list` filters resolve it. Search queries, playlist subscriptions,
  individual video URLs, and `/c/` custom URLs are outside this MVP. The
  existing RSS resolver's HTML fetch remains a separate policy question and
  cannot be assumed permissible because the user supplies a key.
- Use `channels.list` to find the channel's uploads playlist, then call
  `playlistItems.list` with `maxResults=50`. It would not call `search.list`,
  `videos.list`, `commentThreads.list`, or caption methods. The documented
  default quota is 10,000 units per project per day for most methods, but a
  project's actual allocation may differ. At the documented one-unit cost per
  list call, one single-page refresh uses about two units before retries.
  Refreshes would follow the existing feed schedule and add no API-specific
  polling.
- Keep RSS and IFrame playback usable without a key. With no API key selected,
  channel feeds keep their existing RSS behavior. If a saved SecretStorage
  reference does not resolve, preserve the reference, explain the problem, and
  block that feed's refresh until the user repairs or clears it. Do not silently
  downgrade a broken selected reference to RSS. If a resolved key's request
  fails, preserve existing items, report the feed error, and try RSS with a
  clear indication that the API result was not refreshed. Quota errors must not
  cause repeated rapid retries.
- Have users manage their own SecretStorage entries and select one through
  Obsidian's `SecretComponent`. Settings and portable bundles may contain the
  reference ID, never the key. Send the key in Google's `x-goog-api-key` header,
  not in the URL, and do not log it. The request sends the key and channel
  identifier directly to Google; user-facing privacy information must explain
  that. SecretStorage is documented as local to the vault; no sync behavior is
  promised.

The user's Google Cloud project would own the key and quota. However, the
policy gate means setup instructions and key entry must not ship until user-owned
keys in this distributed client are cleared. Google recommends not embedding
keys in client code and recommends sending client requests to a server that
adds the key. SecretStorage protects the saved setting, but the key is available
to RSS Dashboard at runtime. This proposal does not claim that moving the key to
SecretStorage resolves Google's client-side key guidance.

## Proposed SecretStorage module

Keep FreshRSS's resolver feature-local while it is the only implemented
consumer. If the YouTube feature clears its policy and data gates and proceeds,
build a shared SecretStorage resolver in the same implementation slice as that
real second consumer, then use it from both FreshRSS and YouTube. If YouTube
cannot proceed, do not extract a hypothetical shared module.

The proposed module has one operation:

```ts
resolve(referenceId: string): Promise<
  | { status: "available"; value: string }
  | { status: "missing" }
  | { status: "read-error" }
>
```

The caller handles an unset reference before calling `resolve`. The shared
Obsidian SecretStorage adapter distinguishes a missing entry from a thrown read
error and returns a stable result without logging the value. The caller owns the
user-facing message, retry behavior, and request decision. The module does not
create, list, edit, or delete entries and does not own either feature's
`SecretComponent`. The interface has no version gate, structural cast, or
capability-unavailable state at the 3.0 support floor.

This seam is justified only if the module centralizes common resolution
outcomes and error semantics for both real callers. A thin pass-through around
`app.secretStorage.getSecret` would provide little depth, leverage, or locality.
`main.ts` remains the composition root, consistent with
[ADR 0015](0015-main-ts-decomposition.md).

## Release gates

Do not implement or release the API-backed source until all of these are
resolved with evidence:

1. **Key ownership and third-party use.** Obtain authoritative guidance on
   whether each user may create a Google Cloud project and key for use by this
   distributed plugin, given YouTube's API Client credential-assignment and
   third-party-use rules. Also decide which restrictions are meaningful for
   Obsidian desktop, Android, and iOS. Google documents only one client
   restriction type per key; a single cross-platform key may not support the
   restrictions each platform needs.
2. **Cross-owner and cross-source display.** Obtain authoritative guidance on
   whether RSS Dashboard's chronological views, which can show YouTube API
   items beside items from other YouTube channels and other platforms, count as
   prohibited aggregation or combining API Data. The app shows each item's feed
   title, and YouTube's compliance guide gives a clearly distinguished
   multi-platform video search as an acceptable example, but that does not
   settle this feed-reader use case or the content-owner view restriction. If
   the existing source labels and separate items are insufficient, redesign the
   presentation or defer the feature.
3. **Retention, deletion, and copies.** Define how API-derived non-authorized
   data is refreshed or deleted within the documented 30-day window. Confirm
   whether the seven-calendar-day user-data deletion rule applies to this
   public, no-OAuth feed use case; if so, define how a user request removes
   covered data. Account for protected and starred items, saved notes, local
   history, portable bundles, and any backups. The existing age-retention
   setting is configurable and protected items can persist, so it does not
   establish compliance.
4. **Privacy and presentation.** Define the required privacy-policy notice and
   agreement before access, YouTube Terms acceptance/link, Google Privacy
   Policy link, data-use explanation, YouTube attribution, and any item freshness
   indicators. Confirm whether the existing embedded-player Referer and app
   identity satisfy YouTube's requirements on desktop and mobile.
5. **Existing resolver.** Resolve whether fetching YouTube channel HTML to
   discover channel IDs is permitted under the policy against scraping YouTube
   applications. If not, remove that path or limit API-backed feeds to
   documented identifiers before release.
6. **Platform behavior.** Verify API requests, required headers, error handling,
   and embedded playback on every supported desktop and mobile platform. The
   current player verification records Linux desktop only; mobile remains
   unverified.
7. **Product ordering.** Verify whether one uploads-playlist page is ordered
   newest-first and whether it fulfills the 50-item goal. The current API
   reference documents page size, not that product guarantee.

The exact error mapping and recovery copy should use Google's current error
reference and be verified for invalid and restricted keys. The feature must
preserve existing content on failed refreshes; a documented quota-exhaustion
error should pause keyed retries rather than repeatedly spending the remaining
quota. Other request failures should retain the agreed RSS fallback behavior.

There is no implementation or release commitment while these gates are open.
If they remain unresolved at the 3.0 cutoff, defer the YouTube API source beyond
3.0. Keep the existing RSS and IFrame paths available.

## Consequences if accepted

### Benefits

- A small API consumer could serve the user request for up to 50 channel uploads
  without introducing search or OAuth features.
- Users without a key would retain the existing RSS and IFrame behavior.
- A shared SecretStorage module could earn its seam through two real callers
  and centralize missing-entry and read-error semantics.

### Trade-offs and constraints

- Users would need to create and maintain a Google Cloud project, key, and
  quota, subject to the unresolved policy gate.
- The 50-item goal would depend on the API response, a verified playlist order,
  and the user's per-feed item limit.
- A SecretStorage reference may not resolve on another device; the user would
  need to select a local entry there.
- API-derived data may require a shorter retention period than the user's
  ordinary feed archive. This may require changes to retention, starred/saved
  behavior, exports, and note saving.
- The YouTube source must not ship if policy constraints cannot be met.

## Considered options

### Keep YouTube RSS as the only source

Retain this as the current behavior and no-key path. Defer the Data API source
if its policy, aggregation, retention, or platform gates cannot be cleared.

### Add a broad YouTube Data API surface

Do not add search, playlists, comments, captions, metadata enrichment, or
Shorts filtering to this MVP. Those introduce separate quota, OAuth, policy,
or product decisions that do not establish the 50-upload contract.

### Create a shared resolver before YouTube ships

Do not extract a shared module while FreshRSS is its only real consumer. The
seam would be hypothetical and the module risks becoming a shallow pass-through.

## Related

- [GitHub Issue #1076 — Design the shared credential seam on SecretStorage](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1076)
- [GitHub Issue #1077 — Scope the first YouTube Data API release](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1077)
- [GitHub Issue #1072 — YouTube Data API research](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1072)
- [ADR 0039 — Use User-Managed SecretStorage References for Credentials](0039-use-user-managed-secretstorage-references.md)
- [ADR 0015 — Decompose main.ts into injected modules](0015-main-ts-decomposition.md)
- [ADR 0023 — Set the 3.0 support floor at Obsidian 1.11.5](0023-set-the-3-0-support-floor-at-obsidian-1-11-5.md)
- [ADR 0030 — Read video progress from the nested player frame](0030-read-video-progress-from-the-nested-player-frame.md)
- [YouTube Data API policies](https://developers.google.com/youtube/terms/developer-policies)
- [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service)
- [Complying with YouTube's Developer Policies](https://developers.google.com/youtube/terms/developer-policies-guide)
- [YouTube Terms of Service](https://www.youtube.com/t/terms)
- [Google Privacy Policy](https://policies.google.com/privacy)
- [YouTube quota costs](https://developers.google.com/youtube/data/determine_quota_cost)
- [channels.list](https://developers.google.com/youtube/data/reference/rest/v3/channels/list)
- [playlistItems.list](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/list)
- [videos.list](https://developers.google.com/youtube/data/reference/rest/v3/videos/list)
- [commentThreads.list](https://developers.google.com/youtube/data/reference/rest/v3/commentThreads/list)
- [search.list](https://developers.google.com/youtube/data/reference/rest/v3/search/list)
- [Caption implementation guide](https://developers.google.com/youtube/data/guides/implementation/captions)
- [YouTube API error reference](https://developers.google.com/youtube/data/reference/rest/v3/errors)
- [Google APIs global error reference](https://developers.google.com/youtube/data/reference/rest/v3/core_errors)
- [YouTube Shorts criteria](https://support.google.com/youtube/answer/15424877)
- [Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
- [Google API key best practices](https://docs.cloud.google.com/docs/authentication/api-keys-best-practices)
- [Google API key restrictions](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys)
- [Obsidian requestUrl](https://docs.obsidian.md/Reference/TypeScript%20API/requestUrl)
- [Obsidian SecretStorage guide](https://docs.obsidian.md/plugins/guides/secret-storage)
