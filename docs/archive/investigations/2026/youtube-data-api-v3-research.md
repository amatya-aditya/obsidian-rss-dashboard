# YouTube Data API v3 with a user-supplied key: capabilities, quota and policy

**Ticket:** [#1072](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1072) (child of map [#1071](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1071))
**Researched:** 2026-10-13
**Scope:** Facts only. The scope decision belongs to [#1077](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1077).

Sources are Google's YouTube developer documentation, the YouTube API Services
Terms and Developer Policies, Obsidian's developer policies, and
`obsidian.d.ts` (package `obsidian` 1.13.1). Claims a primary source does not
state are marked **Unverified**.

## Repo baseline

- Channel feeds resolve to `https://www.youtube.com/feeds/videos.xml?channel_id=...`
  (`src/services/media-service.ts`). That feed returns only the latest 15 entries.
- All plugin HTTP goes through Obsidian `requestUrl`.
- Playback uses an embedded YouTube iframe player.
- `manifest.json` on `dev` declares `minAppVersion` 1.8.7.

## 1. Quota model

- New projects get "100 search.list calls, 100 videos.insert calls" per day, and
  "10,000 units per day combined for all other endpoints". Quotas reset at
  midnight Pacific Time.
  [Quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost),
  [Getting started](https://developers.google.com/youtube/v3/getting-started)
- Since **1 June 2026**, `search.list` and `videos.insert` draw on their own
  buckets. A `search.list` call costs 1 unit from a bucket of **100 calls per
  day**. The old "100 units per search" figure no longer applies.
  [Revision history](https://developers.google.com/youtube/v3/revision_history)
- Every request costs at least 1 unit, even an invalid one. Each extra page
  costs the method's price again.
  [Quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost)
- The docs say `part` and `fields` cut latency and bandwidth. They do not say
  either one changes quota cost.
  [Getting started](https://developers.google.com/youtube/v3/getting-started)
- A quota increase requires an API Compliance Audit (Developer Policies III.D.3).
  YouTube may disable a project left inactive for 90 consecutive days (III.D.4).
  [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)

| Method                 | Cost (units)      | Key-only (public data)?        |
| ---------------------- | ----------------- | ------------------------------ |
| `channels.list`        | 1                 | Yes (see API keys below)       |
| `playlistItems.list`   | 1 per page (≤50)  | Yes                            |
| `videos.list`          | 1                 | Yes, except owner-only parts   |
| `videos.batchGetStats` | 1 (own bucket)    | Not required for public videos |
| `search.list`          | 1 (100 calls/day) | Yes                            |
| `commentThreads.list`  | 1                 | Yes for public threads         |
| `captions.list`        | 50                | **No.** OAuth scopes required  |
| `captions.download`    | 200               | **No.** OAuth plus edit rights |

**API keys:** "A request that does not provide an OAuth 2.0 token must send an
API key." OAuth is needed only for private user data.
[Registering an application](https://developers.google.com/youtube/registering_an_application)
Writes always need user authorization, and "unauthorized requests only retrieve
public data".
[Getting started](https://developers.google.com/youtube/v3/getting-started)
Google recommends passing the key in the `x-goog-api-key` header. The `?key=`
query parameter also works but exposes the key "to theft through URL scans".
[Google Cloud: use API keys](https://docs.cloud.google.com/docs/authentication/api-keys-use)

## 2. More than 15 videos per channel

**`playlistItems.list` on the uploads playlist**

- `channels.list` returns `contentDetails.relatedPlaylists.uploads`, "the ID of
  the playlist that contains the channel's uploaded videos".
  [channels resource](https://developers.google.com/youtube/v3/docs/channels)
- `playlistItems.list` costs 1 unit per call. `maxResults` runs from 0 to 50
  (default 5). Pages chain through `pageToken` and `nextPageToken`.
  [playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list)
- Reading the newest 50 uploads therefore costs 1 unit. A full backfill costs
  about ⌈uploads ÷ 50⌉ units, plus the one-time `channels.list` lookup.
- **Unverified:** the docs state neither the order of uploads-playlist items
  (assumed newest first) nor any cap on how many can be retrieved. The
  `UC…` → `UU…` channel-to-uploads ID shortcut is undocumented.

**`search.list` with `channelId`**

- Costs 1 unit from the separate 100-calls-per-day bucket. `maxResults` runs from
  0 to 50.
- With `channelId` and `type=video`, results are "constrained to a maximum of 500
  videos".
- The docs warn that `order=date` can be incomplete or delayed by indexing. For a
  channel's latest uploads they say to use `playlistItems.list`, and "do not
  use `search.list`".
  [search.list](https://developers.google.com/youtube/v3/docs/search/list)
- At 100 calls a day, `search.list` cannot cover one call per channel per
  refresh once a user follows more than 100 channels.

## 3. Richer metadata (`videos.list`, 1 unit)

[videos resource](https://developers.google.com/youtube/v3/docs/videos),
[videos.list](https://developers.google.com/youtube/v3/docs/videos/list)

- **Duration:** `contentDetails.duration` is an ISO 8601 string (`PT#M#S`,
  `PT#H#M#S`, `P#DT#H#M#S`). It may differ from playback length by about a second.
- **Live and premiere:** `snippet.liveBroadcastContent` is `live`, `none` or
  `upcoming`.
  - `liveStreamingDetails` appears only for upcoming, live or finished broadcasts.
    Its fields are `scheduledStartTime`, `scheduledEndTime`, `actualStartTime`
    (set once the broadcast starts), `actualEndTime` (set once it ends) and
    `concurrentViewers` (only while live, and only if the count isn't hidden).
  - **Unverified:** the docs give no field that tells a Premiere apart from a
    scheduled live stream.
- **Counts:** `statistics.viewCount`, `likeCount` and `commentCount` are public.
  `dislikeCount` has been private since 13 December 2021 and is returned only to
  the owner.
  - Since 24 August 2026, a view counts when playback starts, on every format
    including Shorts.
- **Other public fields:** `contentDetails.definition` (`hd`/`sd`),
  `contentDetails.caption` (`true`/`false`, so caption availability shows without
  OAuth), `contentDetails.projection`, and `status.uploadStatus`.
- **Owner only:** `fileDetails` (which holds the real stream aspect ratio),
  `processingDetails` and `suggestions`. Other callers get a 403.
- **Batching:** `id` takes a comma-separated list of video IDs.
  - **Unverified:** the docs do not state the per-call maximum. 50 is the commonly
    cited figure and matches `maxResults`, but this pass did not confirm it.
- **`videos.batchGetStats`** (added 3 June 2026): returns `snippet.publishTime`,
  view, like and comment counts, and `duration`/`durationMillis`. It costs 1 unit
  "in its own granular quota bucket". Authentication "is not required for public
  videos". The ID limit is not stated.
  [videos.batchGetStats](https://developers.google.com/youtube/v3/docs/videos/batchGetStats),
  [Revision history](https://developers.google.com/youtube/v3/revision_history)

### Telling Shorts apart (old #37)

No API field flags a Short. The API reference mentions Shorts only in the
view-count note. YouTube's Help Center defines a Short as a video "with a square
or vertical aspect ratio up to three minutes in length". The three-minute limit
applies to uploads from 15 October 2024; the earlier limit was 60 seconds.
[YouTube Help: Shorts length](https://support.google.com/youtube/answer/15424877)

| Heuristic                                                    | Source of the signal                                                                                                                                                               | Reliability                                                                                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contentDetails.duration` ≤ 180 s (≤ 60 s before 2024-10-15) | `videos.list`, key-only                                                                                                                                                            | Necessary but not sufficient: short landscape videos are not Shorts.                                                                                        |
| Vertical or square aspect ratio                              | `player.embedWidth/embedHeight` when `maxWidth`/`maxHeight` is set. The docs say these are returned only "if the aspect ratio is known", and the player defaults to 4:3 otherwise. | **Unverified** whether these dimensions reflect a Short's vertical ratio. The authoritative ratio (`fileDetails.videoStreams[].aspectRatio`) is owner-only. |
| Duration ≤ 180 s **and** vertical/square embed               | Both of the above                                                                                                                                                                  | Closest match to YouTube's own definition. Inherits the embed-ratio caveat.                                                                                 |
| `#shorts` in title or description                            | `snippet`                                                                                                                                                                          | Optional for creators, so it gives both false positives and false negatives.                                                                                |
| `/shorts/` link in RSS                                       | RSS feed                                                                                                                                                                           | The earlier post-mortem found the feed rarely uses `/shorts/` links ([youtube-shorts-tagging-failure.md](./youtube-shorts-tagging-failure.md)).             |
| Probing `youtube.com/shorts/{id}` for a redirect             | Not an API                                                                                                                                                                         | Hits a YouTube page outside the API. Developer Policies III.E.6 forbids scraping "YouTube Applications".                                                    |
| `UUSH…` "Shorts uploads" playlist                            | Not documented                                                                                                                                                                     | **Unverified**, and not in any primary source.                                                                                                              |

## 4. Comments

- `commentThreads.list` costs 1 unit. `maxResults` runs from 1 to 100 (default 20).
  `order` is `time` or `relevance`; `textFormat` is `html` or `plainText`.
  Requests filter by `videoId` or `allThreadsRelatedToChannelId`.
  [commentThreads.list](https://developers.google.com/youtube/v3/docs/commentThreads/list)
- The page has no Authorization section listing scopes. Only `moderationStatus`
  "can only be used in a properly authorized request". Public threads therefore
  work with only a key, following the "requests without OAuth send an API key"
  rule above.
- When a video has comments turned off, the API returns `403 commentsDisabled`.
- **Display rule:** clients must "display the full text of a comment or comment
  reply", or truncate it with an easy way to read the rest.
  [Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)

## 5. Captions and transcripts: the OAuth belief is confirmed

- **`captions.list`** "requires authorization with at least one of" the scopes
  `youtube.force-ssl` or `youtubepartner`. It costs 50 units, and the response
  "does not contain the actual captions".
  [captions.list](https://developers.google.com/youtube/v3/docs/captions/list)
- **`captions.download`** requires OAuth with one of the same scopes, and "requires
  the user to have permission to edit the video". It costs 200 units.
  [captions.download](https://developers.google.com/youtube/v3/docs/captions/download)
- **Verdict:** with only an API key, the Data API cannot list or download
  captions or transcripts for third-party videos. Downloading requires OAuth as a
  user who can edit the video. A key-only client can still read
  `contentDetails.caption` to learn whether a video has captions.
- Fetching transcripts any other way, such as from undocumented player endpoints,
  falls outside the API. The scraping ban in Developer Policies III.E.6 would
  apply.
  [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)

## 6. Estimated cost per refresh

Assumptions: the uploads-playlist ID is cached after a one-time `channels.list`
lookup (1 unit per channel, once). Each channel refresh reads one page of
`playlistItems.list` (1 unit, up to 50 items). New video IDs are enriched with
`videos.list` in batches of 50 (1 unit per batch; the 50-ID limit is
**Unverified**).

| Channels | `playlistItems` | `videos.list` (all new IDs batched) | Units per refresh | Per day, hourly | Per day, every 15 min     |
| -------- | --------------- | ----------------------------------- | ----------------- | --------------- | ------------------------- |
| 10       | 10              | 1                                   | ~11               | ~264            | ~1,056                    |
| 50       | 50              | 1–2                                 | ~51–52            | ~1,248          | ~4,992                    |
| 200      | 200             | 1–4                                 | ~201–204          | ~4,896          | ~19,584 (**over** 10,000) |

- **Alternative:** keep RSS for new-video discovery, which costs no quota, and
  call `videos.list` only for new IDs. That costs ⌈new IDs ÷ 50⌉ units per
  refresh; 200 channels × 15 IDs = 3,000 IDs = 60 units at worst.
- **Backfill:** one channel with 1,000 uploads costs about 20 `playlistItems`
  units plus about 20 `videos.list` units.
- **Comments:** 1 unit per page per video opened.
- **`search.list`:** cannot serve per-channel refresh above 100 calls a day.

## 7. YouTube policies that bind a client like ours

From the [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
and the [API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service).

- **Credentials (III.D.1):**
  - Use only "API Credentials assigned to you and to your API Project".
  - Each API Client gets "exactly one (1) API Project", and one project must not
    serve several clients.
  - Never share credentials with third parties, and never "embed your API
    Credentials in open source projects". The maintainers therefore cannot ship
    a shared key in this repository.
  - **Unverified:** neither document addresses end users who supply their own
    key, or says who is the "developer" of the API Client in that case.
- **Terms link (III.A.1):** clients "must display a link to YouTube's Terms of
  Service". They must also state that using the client binds users to those
  Terms.
- **Privacy policy (III.A.2; Terms §7):** the client needs a privacy policy that
  is "prominently displayed and easily accessible", says the client "uses
  YouTube API Services", links the Google Privacy Policy, and explains what user
  data is accessed, stored, used and shared.
- **Storage and refresh (III.E.4):**
  - Non-Authorized Data (everything a key-only client gets) may be stored
    "not longer than 30 calendar days". After that the client "must either
    delete or refresh the stored data".
  - Statistics must not be stored for more than 30 days.
  - Stored data must stay reasonably current, and displays must show "the most
    updated API Data available". Historical data is allowed only when "presented
    accurately in context of time".
  - **Consequence:** API-derived fields kept in the vault longer than 30 days,
    such as durations and counts, need a refresh or deletion path.
- **Derived metrics (III.E.4.h):** clients must not "replace API Data with
  similar, independently calculated data" or derive new metrics from API Data.
  Non-API figures shown beside API Data need a clear disclosure.
- **Deletion (III.E.4.g, III.D.2):** stored data must be deleted "within 7
  calendar days" of a user's request. The OAuth revocation rules apply only to
  Authorized Data.
- **Attribution (III.F.2):** clients must make clear that YouTube is the source,
  using YouTube Brand Features. They must not obscure YouTube's attribution or
  present non-YouTube content as YouTube's.
- **Audiovisual content (III.E.1, III.I.6–9):**
  - Clients must not download, cache or store copies of audiovisual content.
    Offline playback and background playback are not allowed.
  - Clients must not separate or modify audio from video, or modify or block any
    part of the YouTube player.
- **Scraping (III.E.6):** clients must not scrape YouTube Applications, or
  encourage or enable others to.
- **Embedded player (Required Minimum Functionality):**
  - The player must be at least 200×200 px. Autoplay may start only when more
    than half the player is visible.
  - No overlays may sit on the player.
  - The client must send an HTTP Referer, so it must not set `noreferrer` or a
    restrictive Referrer-Policy.
    [RMF](https://developers.google.com/youtube/terms/required-minimum-functionality)
    These rules apply to the existing player whether or not the Data API is used.
- **Audits (III.H):** YouTube may audit any client's use.

## 8. Obsidian developer policy

From the [Developer policies](https://docs.obsidian.md/Community+directory/Developer+policies):

- Network use is allowed only if the README "clearly explain[s] which remote
  services are used and why they're needed". A YouTube Data API call is one such
  remote service.
- Client-side telemetry is prohibited. Server-side telemetry needs a privacy
  policy link.
- An account requirement "for full access" must be disclosed. **Unverified:** the
  policy does not say whether needing a Google Cloud key for an optional feature
  counts as that.
- The policy says nothing about API keys or secrets.
- Obsidian announced on 12 May 2026 that plugins "will declare what they access:
  network, file system, clipboard". This is planned, not yet in force.
  [Future of plugins](https://obsidian.md/blog/future-of-plugins/)
- **Secret storage:** `obsidian.d.ts` provides `app.secretStorage` (a
  `SecretStorage` with `setSecret`/`getSecret`/`listSecrets`, `@since 1.11.4`)
  and a `SecretComponent` settings control (`@since 1.11.1`, `setValue`/`onChange`
  since 1.11.4). Using them needs `minAppVersion` ≥ 1.11.4; `dev` currently
  declares 1.8.7.

## 9. `requestUrl` for these endpoints

- `obsidian.d.ts` describes `requestUrl` as working "without any CORS
  restrictions". `RequestUrlParam` accepts `headers`, so the key can travel as
  `x-goog-api-key` instead of in the URL. Passing `throw: false` returns 4xx
  bodies such as `403 commentsDisabled` or `quotaExceeded` instead of throwing.
- The declaration makes no distinction between desktop and mobile.
- **Unverified (no live test):** this pass did not call `googleapis.com` through
  `requestUrl` on desktop or mobile. The plugin already fetches YouTube feeds and
  pages through `requestUrl` on both platforms.

## Open questions primary sources do not settle

1. Whether a user-supplied key fits III.D.1. Neither document covers end users
   bringing their own credentials.
2. The order of uploads-playlist items, and whether a retrieval cap exists.
3. The per-call ID maximum for `videos.list` and `videos.batchGetStats`.
4. Whether `player.embedWidth/embedHeight` reliably shows a Short's vertical
   ratio.
5. How to tell a Premiere apart from a scheduled live stream.
6. A live `requestUrl` test against `googleapis.com` on mobile.
