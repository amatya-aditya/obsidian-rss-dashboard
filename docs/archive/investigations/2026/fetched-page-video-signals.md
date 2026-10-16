# Fetched-page video signals

Research record for issue [#1176](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1176).
It exists to answer one go/no-go question for the fetched version of an article:
does a fetched page carry a recoverable YouTube video ID **in what it serves**,
often enough and reliably enough to justify showing a
[Video placeholder](../../../../CONTEXT.md#reader-view) in the fetched version?

Related: [#1168](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1168)
(each version of an article stays faithful to its source — the rule this
investigation can narrowly reopen), [#1173](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1173)
(the Video placeholder and the player reused here), [#439](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/439)
and [#969](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/969).

**Status: pre-registered, sampled, and decided — no-go.** The method and the
decision rule below were committed on 2026-10-16, before any page was fetched
for the sample. The sample was taken afterwards; the findings and the verdict
are appended below. Nothing in the rule was revised after the sample was taken.

## The gap being measured

A feed's content can embed a YouTube video, and the Reader already turns a
recognized embed into a Video placeholder ([#1173](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1173)).
A fetched page usually does not serve that embed: the player is added by script
after load, so the fetched HTML contains no iframe to recognize
([#1168](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1168)).
Many such pages still _describe_ their video in what they serve. A page that
states its video in an `og:video` property or a JSON-LD `VideoObject` is
describing the video it serves, not carrying over a feed-only embed — which is
why this investigation exists and why it does not reopen the #1168 decision
further than that.

## Method

### Instruments

Two, because they answer different questions:

1. **A disposable sampling script** for breadth — plain HTTPS requests over the
   sample, recording signals and IDs only. It lives in the machine's scratch
   area and is never committed.
2. **One in-vault pass** for fidelity — the built plugin, a scratch vault, and
   the fixture page defined below. The plugin fetches with the host
   application's own user agent and headers, and this project deliberately
   stopped spoofing a browser user agent on fetch paths
   ([#1162](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1162)),
   so a site may serve the script and the plugin different pages. The number
   that matters is the one the plugin sees.

The two must agree on at least the fixture page; a disagreement on a real page is
itself a finding and is recorded.

### Sampling frame

- **S1 — video-bearing pages.** Article pages reached from feed entries whose
  content embeds a YouTube video. This is the population the feature exists for
  and the denominator for recall. Built from the known case in
  [#1168](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1168)
  plus a handful of hand-picked video-heavy publishers, widened by a small feed
  scan for entries that embed.
- **S2 — control pages.** Article pages from the same hosts whose feed entry
  carries no embed. These measure how often a page-level signal fires when the
  feed proves nothing, which is the false-positive exposure a page-level signal
  would add.
- **Fixture rows.** The fixture vault's existing YouTube cases are included as
  known controls, so this ticket's own scope is visibly covered:
  `fx-rss-tech`'s "Article with an inline YouTube video" (the feed content embeds
  a video; the served page is expected to carry nothing) and the `fx-youtube`
  entries.

### Sample size and stop rule

Roughly ten real hosts spanning four CMS families, up to five S1 pages and two to
three S2 pages each. Stop a host once two consecutive S1 pages show the same
signal pattern. The whole sample is time-boxed at about a day: a finished spike
with a smaller sample is worth more than an unfinished one with a larger sample.

### Signals recorded

Recorded in their widest reading, one column each:

| Signal                | Accepted shapes                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `og:video`            | `og:video`, `og:video:url`, `og:video:secure_url`, `og:video:type`                                                                                  |
| JSON-LD `VideoObject` | `embedUrl`, `contentUrl`, `url`, including `@graph` nesting                                                                                         |
| Lazy-load attribute   | `data-src` / `data-lazy-src` on an `iframe`, `div`, `a` or `img`                                                                                    |
| Body link             | `youtube.com/watch` or `youtu.be` anchors inside the extracted article body only, excluding navigation, footer, comments and related-content markup |
| Other                 | anything else observed, recorded in a column but never used for the decision                                                                        |

Any URL a signal yields is read by the recogniser described under _Decision
rule_; a signal "present" means a signal that yielded a video ID at all, and
presence and validity are reported separately.

### Verification protocol

Every extracted ID is classified by opening the page and the video:

- **article** — the article's own video
- **related** — a recommended or related-video widget
- **promo** — a site, channel or template promo
- **ad** — advertising
- **unverifiable** — cannot be confirmed either way

Recorded per hit: host, page label, signal name, video ID, verdict, and a
one-line reason. No article text is recorded, and no fetched page HTML is
committed. **Unverifiable counts against the signal**, because an ID that cannot
be vouched for is one that cannot ship.

### Harvester hygiene

Sequential requests with about a second between them, confined to the sampled
article URLs, no following links out of a page, an honest user agent, and stop on
403 or 429 for that host and record the host as not sampled. Harvested pages stay
in the scratch area and are deleted once this report is written.

## Decision rule (pre-registered)

**Trusted tier** — a signal that may decide a video on its own:

1. `og:video:secure_url`
2. `og:video:url`
3. `og:video`
4. JSON-LD `VideoObject.embedUrl`
5. JSON-LD `VideoObject.contentUrl`
6. JSON-LD `VideoObject.url`

The first entry that yields a valid video ID wins. If two trusted signals yield
**different** valid IDs, nothing is shown: a page carrying two videos has no
single right answer, and refusing is cheaper than guessing.

**Corroborating only** — recorded and reported, never trusted on its own: body
`youtube.com/watch` and `youtu.be` links, and lazy-load `data-src` /
`data-lazy-src` attributes. A body link to an unrelated video is the classic
false positive here, and this tier exists so that it can be measured without
being trusted.

**Validation** — whatever URL shape a signal uses, only the 11-character video ID
is taken from it, `https:` sources only, YouTube hosts only, and the ID must pass
the same 11-character validation the sanitizer already uses. Page markup, iframe
attributes and `src` values are never copied.

**Go** if and only if the trusted tier:

- produces **no wrong-video hit** (related, promo or ad) anywhere in the verified
  sample, and
- produces **no unverifiable hit** anywhere in the verified sample, and
- reaches a recall floor of **one third** of the S1 pages (the trusted tier
  finds the video on at least a third of the pages whose feed proves one exists).

**No-go** otherwise. A no-go closes
[#1176](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1176)
with this report and leaves the
[#1168](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1168)
decision standing. A go means the fetched version shows the Video placeholder for
IDs recovered from the trusted tier, and only those.

The rule is precision-first on purpose: a miss costs a nice-to-have, while a
wrong video is a visible fidelity violation. Pre-registering it is what stops a
thin or flattering sample from being read as a go.

**Known constraint the sample must respect.** The only place the raw page exists
in the plugin is the page-metadata extraction step that runs before the article
is extracted; everything downstream sees extracted body HTML from which meta
tags, scripts and lazy attributes are already gone. The measurement therefore
reads the raw page, exactly as the plugin would have to, and a signal that is
only reachable after the page is extracted does not count.

## Findings

### Executive summary

Sample collected: 2026-10-16, in one sequential pass about a second apart.

**Verdict: no-go.** The trusted tier reaches 5 of the 28 real S1 pages, **17.9%**,
against the pre-registered floor of one third. Precision passed — no wrong video
and no unverifiable ID in the verified sample — but the go condition is a
conjunction of three tests and the recall test fails outright, so the fetched
version keeps mirroring its source per
[#1168](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1168). The
sample was not starved for evidence either: 19 of those same 28 pages name their
video server-side — 15 in a `data-yt-video-token` facade, 4 in a
`data-react-props` blob — in shapes the pre-registered trusted tier does not
include. The recall failure is one of **signal shape**, not of hidden videos. The wider tier the
sample also measured would have cleared recall — it names a video on 20 of the 28
real S1 pages — while still turning an in-prose mention of an unrelated clip into
a video placeholder on 2 of the 48 control pages.

### Per page

| Host                                                        | Page label | S1/S2   | Feed proves a video | `og:video` | JSON-LD   | Lazy attr | Body link | IDs yielded                                                                                                            | Verdict             | Notes                                                                             |
| ----------------------------------------------------------- | ---------- | ------- | ------------------- | ---------- | --------- | --------- | --------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------- |
| theconversation.com                                         | #1         | S1      | y                   | —          | —         | y (no id) | —         | —                                                                                                                      | — (no signal)       | video named only in a React placeholder's `data-react-props`                      |
| theconversation.com                                         | #2         | S1      | y                   | —          | —         | y (no id) | —         | —                                                                                                                      | — (no signal)       | —                                                                                 |
| theconversation.com                                         | #3         | S1      | y                   | —          | —         | y (no id) | —         | —                                                                                                                      | — (no signal)       | —                                                                                 |
| theconversation.com                                         | #4         | S1      | y                   | —          | —         | y (no id) | —         | —                                                                                                                      | — (no signal)       | —                                                                                 |
| theconversation.com                                         | #5         | S1      | y                   | —          | —         | y (no id) | y         | `y4-HxZFJF8Y`                                                                                                          | — (no signal)       | —                                                                                 |
| theconversation.com                                         | #6         | S2      | —                   | —          | —         | y (no id) | —         | —                                                                                                                      | —                   | `data-src` on images only                                                         |
| theconversation.com                                         | #7         | S2      | —                   | —          | —         | y (no id) | y         | `4b52A3sKz-I`                                                                                                          | mention             | in-prose link to a video mentioned in the text                                    |
| theconversation.com                                         | #8         | S2      | —                   | —          | —         | y (no id) | —         | —                                                                                                                      | —                   | —                                                                                 |
| pcgamer.com                                                 | #1         | S1      | y                   | —          | —         | y (no id) | y         | `m5x0PSKano0`                                                                                                          | — (no signal)       | YouTube facade declared in `data-yt-video-token` + `img.youtube.com` thumbnail    |
| pcgamer.com                                                 | #2         | S1      | y                   | —          | —         | y (no id) | y         | `l5bWocJHxd0`                                                                                                          | — (no signal)       | —                                                                                 |
| pcgamer.com                                                 | #3         | S1      | y                   | —          | —         | y (no id) | y         | `sjZ5I8l32CI`, `U6sbm1OaJb8`                                                                                           | — (no signal)       | —                                                                                 |
| pcgamer.com                                                 | #4         | S1      | y                   | —          | —         | y (no id) | y         | `L3hDMe8B3Vk`                                                                                                          | — (no signal)       | —                                                                                 |
| pcgamer.com                                                 | #5         | S1      | y                   | —          | —         | y (no id) | y         | `rz1B4B2yBZY`, `JWxoRY7AFSw`                                                                                           | — (no signal)       | —                                                                                 |
| pcgamer.com                                                 | #6         | S2      | —                   | —          | —         | y (no id) | —         | —                                                                                                                      | —                   | —                                                                                 |
| pcgamer.com                                                 | #7         | S2      | —                   | —          | —         | y (no id) | —         | —                                                                                                                      | —                   | —                                                                                 |
| pcgamer.com                                                 | #8         | S2      | —                   | —          | —         | y (no id) | —         | —                                                                                                                      | —                   | —                                                                                 |
| techradar.com                                               | #1         | S1      | y                   | —          | —         | y (no id) | —         | —                                                                                                                      | — (no signal)       | YouTube facade declared in `data-yt-video-token` + `img.youtube.com` thumbnail    |
| techradar.com                                               | #2         | S1      | y                   | —          | —         | y (no id) | y         | `sXKnmgmbkoE`, `u5qW1gMMSVI`, `HzGx48E64Xg`, `for_t1ySDvk`, `KkYCY5YR12U`, `tlSDDuWxO_0`, `Rs49eRHFD9c`, `tE2fffQqMUw` | — (no signal)       | 8 distinct IDs; the page names none of them in the trusted tier                   |
| techradar.com                                               | #3         | S1      | y                   | —          | —         | y (no id) | y         | `5XksBGj1jaM`                                                                                                          | — (no signal)       | —                                                                                 |
| techradar.com                                               | #4         | S1      | y                   | —          | —         | y (no id) | y         | `Qq8yAg8urfY`                                                                                                          | — (no signal)       | —                                                                                 |
| techradar.com                                               | #5         | S1      | y                   | —          | —         | y (no id) | y         | `ZfF1D73Vqnc`                                                                                                          | — (no signal)       | —                                                                                 |
| techradar.com                                               | #6         | S2      | —                   | —          | —         | y (no id) | —         | —                                                                                                                      | —                   | —                                                                                 |
| techradar.com                                               | #7         | S2      | —                   | —          | —         | y (no id) | —         | —                                                                                                                      | —                   | —                                                                                 |
| techradar.com                                               | #8         | S2      | —                   | —          | —         | y (no id) | —         | —                                                                                                                      | —                   | —                                                                                 |
| space.com                                                   | #1         | S1      | y                   | —          | —         | y (no id) | y         | `QSJVOZOUmek`                                                                                                          | — (no signal)       | YouTube facade declared in `data-yt-video-token` + `img.youtube.com` thumbnail    |
| space.com                                                   | #2         | S1      | y                   | —          | —         | y (no id) | y         | `-jPQmjMWy9I`                                                                                                          | — (no signal)       | —                                                                                 |
| space.com                                                   | #3         | S1      | y                   | —          | —         | y (no id) | y         | `te5_f-oF2lw`, `oSVTAUKyrL8`, `sXKnmgmbkoE`                                                                            | — (no signal)       | three IDs, one per embedded video                                                 |
| space.com                                                   | #4         | S1      | y                   | —          | —         | y (no id) | y         | `DErVmP1J1UQ`                                                                                                          | — (no signal)       | —                                                                                 |
| space.com                                                   | #5         | S2      | —                   | —          | —         | y (no id) | —         | —                                                                                                                      | —                   | —                                                                                 |
| space.com                                                   | #6         | S2      | —                   | —          | —         | y (no id) | —         | —                                                                                                                      | —                   | —                                                                                 |
| space.com                                                   | #7         | S2      | —                   | —          | —         | y (no id) | —         | —                                                                                                                      | —                   | —                                                                                 |
| vice.com                                                    | #1         | S1      | y                   | y          | y         | —         | —         | `0yvSkYpVZ_I`                                                                                                          | **article**         | `og:video` and JSON-LD agree; the page's own video facade uses the same ID        |
| vice.com                                                    | #2         | S1      | y                   | y          | y         | —         | —         | `WnpfP9Y8fms`                                                                                                          | **article**         | the article embeds three videos; the declaration names the first                  |
| vice.com                                                    | #3         | S1      | y                   | y          | y         | —         | —         | `AER8IMw5IwY`                                                                                                          | **article**         | single video; no divergence                                                       |
| vice.com                                                    | #4         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| vice.com                                                    | #5         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| vice.com                                                    | #6         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| macrumors.com                                               | #1         | S1      | y                   | —          | y         | y (no id) | —         | `-OAfpqnMZWY`                                                                                                          | **article**         | JSON-LD only; no `og:video`                                                       |
| macrumors.com                                               | #2         | S1      | y                   | —          | y         | y (no id) | —         | `ecSG3kLrcp0`                                                                                                          | **article**         | —                                                                                 |
| macrumors.com                                               | #3         | S2      | —                   | —          | —         | y (no id) | —         | —                                                                                                                      | —                   | `img.youtube.com` thumbnails only                                                 |
| macrumors.com                                               | #4         | S2      | —                   | —          | —         | y (no id) | —         | —                                                                                                                      | —                   | —                                                                                 |
| macrumors.com                                               | #5         | S2      | —                   | —          | —         | y (no id) | —         | —                                                                                                                      | —                   | —                                                                                 |
| github.blog                                                 | #1         | S1      | y                   | —          | —         | —         | —         | —                                                                                                                      | — (no signal)       | a live entry of the same feed; the page serves nothing                            |
| github.blog                                                 | #2         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| github.blog                                                 | #3         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| github.blog                                                 | #4         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| vox.com                                                     | #1         | S1      | y                   | —          | —         | —         | —         | —                                                                                                                      | — (no signal)       | no signal of any kind                                                             |
| vox.com                                                     | #2         | S2      | —                   | —          | —         | y (no id) | —         | —                                                                                                                      | —                   | —                                                                                 |
| vox.com                                                     | #3         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| vox.com                                                     | #4         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| arstechnica.com                                             | #1         | S1      | y                   | —          | —         | —         | —         | —                                                                                                                      | — (no signal)       | no signal of any kind                                                             |
| arstechnica.com                                             | #2         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| arstechnica.com                                             | #3         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| arstechnica.com                                             | #4         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| tomshardware.com                                            | #1         | S1      | y                   | —          | —         | —         | y         | `eF6bMSjPepM`                                                                                                          | — (no signal)       | YouTube facade declared in `data-yt-video-token` + `img.youtube.com` thumbnail    |
| tomshardware.com                                            | #2         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| tomshardware.com                                            | #3         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| tomshardware.com                                            | #4         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| theguardian.com                                             | #1         | S2      | —                   | —          | —         | —         | y         | `qt5p-_tE8d0`                                                                                                          | mention             | in-prose link to a video of the event; not an embed                               |
| theguardian.com                                             | #2         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| theguardian.com                                             | #3         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| bbc.co.uk                                                   | #1         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| bbc.co.uk                                                   | #2         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| bbc.co.uk                                                   | #3         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| techcrunch.com                                              | #1         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| techcrunch.com                                              | #2         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| techcrunch.com                                              | #3         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| kotaku.com                                                  | #1         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| kotaku.com                                                  | #2         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| kotaku.com                                                  | #3         | S2      | —                   | —          | —         | y         | y         | `5rMxDCCJul8`                                                                                                          | article (own embed) | the page's own lazy YouTube embed, on a page whose feed proves nothing            |
| gizmodo.com                                                 | #1         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| gizmodo.com                                                 | #2         | S2      | —                   | —          | —         | y         | —         | `stmWapR3CWY`                                                                                                          | article (own embed) | the page's own lazy YouTube embed, on a page whose feed proves nothing            |
| gizmodo.com                                                 | #3         | S2      | —                   | —          | —         | —         | —         | —                                                                                                                      | —                   | —                                                                                 |
| cbssports.com                                               | #1         | S2      | —                   | —          | y (no id) | y (no id) | —         | —                                                                                                                      | —                   | `VideoObject` names the publisher's own player, not YouTube                       |
| cbssports.com                                               | #2         | S2      | —                   | —          | y (no id) | y (no id) | —         | —                                                                                                                      | —                   | —                                                                                 |
| cbssports.com                                               | #3         | S2      | —                   | —          | y (no id) | y (no id) | —         | —                                                                                                                      | —                   | —                                                                                 |
| youtube.com                                                 | #1         | S1      | y                   | y          | —         | —         | —         | `IBVmenOroPs`                                                                                                          | out of scope        | the page _is_ the video; the plugin's full-view player owns this surface          |
| youtube.com                                                 | #2         | S1      | y                   | y          | —         | —         | —         | `fMgcm9aXZyY`                                                                                                          | out of scope        | —                                                                                 |
| example.com (the `fx-rss-tech` inline-YouTube entry's page) | fixture    | fixture | y                   | —          | —         | —         | —         | —                                                                                                                      | — (no signal)       | 404 and no signals; the in-vault Reader reports "Could not fetch article content" |

Signal legend: **`og:video`** = any of `og:video`, `og:video:url`,
`og:video:secure_url`; **JSON-LD** = a `VideoObject` node; **Lazy attr** =
`data-src` / `data-lazy-src` anywhere; **Body link** = a `youtube.com/watch` or
`youtu.be` anchor inside the extracted article body. `y (no id)` means the signal
was there but yielded no YouTube video ID — a non-YouTube `src`, a `data-src` on
an image, and so on.

### Per signal

"Article video" counts only the real article pages: the two fixture rows whose
page is a `youtube.com` page are out of scope for that column, for precision and
for recall, so each row states its own page population.

| Signal                                                        | Pages with the signal                   | Pages with a valid YouTube ID               | Article video            | Related / promo / ad    | Unverifiable | Precision   | Recall on the 28 real S1 pages |
| ------------------------------------------------------------- | --------------------------------------- | ------------------------------------------- | ------------------------ | ----------------------- | ------------ | ----------- | ------------------------------ |
| `og:video` (incl. `:url`, `:secure_url`)                      | 5 (3 real S1 + 2 YouTube fixture pages) | 5                                           | 3                        | 0                       | 0            | 3/3         | 3/28 = 10.7%                   |
| JSON-LD `VideoObject`                                         | 8 (5 S1, 3 S2)                          | 5                                           | 5                        | 0                       | 0            | 5/5         | 5/28 = 17.9%                   |
| **Trusted tier (`og:video` ∪ JSON-LD)**                       | **10 (7 S1, 3 S2)**                     | **7 (5 real S1 + 2 YouTube fixture pages)** | **5**                    | **0**                   | **0**        | **5/5**     | **5/28 = 17.9%**               |
| Lazy attribute (`data-src` / `data-lazy-src`) — corroborating | 2 (both control pages)                  | 2                                           | 2                        | 0                       | 0            | not trusted | 0/28                           |
| Body link (`youtube.com/watch`, `youtu.be`) — corroborating   | 18 (15 S1, 3 S2)                        | 18                                          | 20 of 25 distinct S1 IDs | 5 of 25 distinct S1 IDs | 0            | not trusted | 15/28 = 53.6%                  |

Counting the two fixture rows whose page _is_ a YouTube page — which the ticket
puts out of scope, and which the plugin's full-view player already owns — lifts
the trusted tier to 7 of 30 = 23.3%. Neither reading clears the one-third floor.

Where the recall went, by host (S1 pages / pages yielding a trusted ID):

| Host             | S1 pages | Trusted IDs | What the page actually serves                                                                                                  |
| ---------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| The Conversation | 5        | 0           | a React placeholder (`data-react-props` carrying the ID) on 4 of the 5 when re-read after the sample; no trusted signal on any |
| PC Gamer         | 5        | 0           | a YouTube facade (`data-yt-video-token` + `img.youtube.com` thumbnail)                                                         |
| TechRadar        | 5        | 0           | the same facade                                                                                                                |
| Space.com        | 4        | 0           | the same facade                                                                                                                |
| Tom's Hardware   | 1        | 0           | the same facade                                                                                                                |
| GitHub Blog      | 1        | 0           | nothing at all                                                                                                                 |
| Vox              | 1        | 0           | nothing at all                                                                                                                 |
| Ars Technica     | 1        | 0           | nothing at all                                                                                                                 |
| Vice             | 3        | 3           | `og:video` + JSON-LD naming the article's video                                                                                |
| MacRumors        | 2        | 2           | JSON-LD naming the site's own video for the article                                                                            |

So the failure is one of **signal shape**, not of missing videos. Future plc's
titles put the video's own page in a facade whose ID lives in a
`data-yt-video-token` attribute and an `img.youtube.com/vi/<id>/…` URL; The
Conversation puts it in `data-react-props`. Both are server-side declarations of
the same kind #1176 was looking for, and both fall outside the tier the
maintainer pre-registered. Widening the tier to include them is the obvious
follow-up, and it is exactly what pre-registering the tier was meant to prevent
this ticket from doing after seeing the data — a new spike, under a new
pre-registered rule, is the route.

### False positives and conflicts

- **Wrong-video hits from the trusted tier: none.** All five trusted-tier IDs
  were the page's own video:
  - Vice #1–#3 (`og:video` + `VideoObject.embedUrl`) — the page's own
    `wp-block-savage-platform-youtube-placeholder` under the article's heading
    carries the same ID, and the `VideoObject` is scoped to the article
    (`isPartOf` the article node) and named after it.
  - MacRumors #1–#2 (`VideoObject.embedUrl` only) — the site's own video for the
    article, published on its own channel; the page's JSON-LD is the only place
    the ID appears.
- **Unverifiable hits: none.** Every ID resolved at YouTube's oEmbed endpoint,
  and every one matched the page that declared it.
- **Conflicting trusted IDs: none observed.** Vice is the only host where
  `og:video` and JSON-LD both fired, and they agreed on the same ID. The
  refusal-on-conflict rule was therefore never exercised by this sample.
- **A wrong-video near-miss, worth recording.** Two of the three Vice pages are
  listicles that embed three YouTube videos, one per item, while `og:video` and
  the `VideoObject` name only the first. The feed content for the same entries
  carries all three iframes, so the RSS version shows three placeholders and a
  metadata-derived one would show one. That is a completeness gap rather than a
  wrong video — the ID is a video the article presents and the page names as its
  own — but it is the shape a template-derived `og:video` takes, and it is the
  mechanism by which a wrong video would arrive if the declaration ever named a
  promo or a related video instead. It did not in this sample.
- **The corroborating tier is mostly right and still cannot be trusted.** Its IDs
  were classified in full, because the decision turns on whether a wider tier
  would have been safe:

  | Corroborating tier, S1                         | Distinct IDs | What they are                                                                                                                                                                                                       |
  | ---------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Body link on the four Future plc titles        | 20           | the article's own server-side facade: its watch link, one per embedded video (a trailer or a source video the article is built on)                                                                                  |
  | `youtu.be` / `youtube.com/watch` link in prose | 5            | a related or topical video, not the article's own: a bird-ringing explainer, a 1994 film clip beside the 2026 trailer, a song from the game under discussion, a third-party analysis video, a NASA press conference |
  | Unverifiable                                   | 0            | every ID resolved at YouTube's oEmbed endpoint                                                                                                                                                                      |

  On the 48 control pages the tier is dirty in exactly the way that matters for a
  placeholder:
  - The Conversation #7 — an in-prose link to a comedy clip cited as a
    reference. The page embeds no video; the feed proves none. A pure false
    positive: showing it would put an unrelated video in the article.
  - The Guardian #1 — an in-prose link to "a video of the event" the prose
    describes. A mention, not an embed.
  - Kotaku #3 and Gizmodo #2 — genuine server-side lazy embeds (`data-src`, plus a
    `<noscript>` iframe on Kotaku), i.e. the page's own video on a page whose feed
    proves nothing. These fire the tier on pages the feed gives no evidence for.

  So the wider tier (trusted ∪ body link ∪ lazy `data-src`) names a video on 20 of
  the 28 real S1 pages — recall 71.4%, more than twice the floor — and 20 of its
  25 distinct S1 IDs are the article's own video. What stops it is the 5 related
  IDs among them and the 2 prose mentions on control pages: both are the
  "wrong video" outcome the pre-registration refuses, and neither is separable
  from the good hits without a signal that distinguishes an embed from a mention.

### Script vs in-vault agreement

The two instruments agreed everywhere they were both run.

- **The fixture rows.** The script read the seeded entry's page
  (`example.com/rss-dashboard-fixture/rss-tech/15`) as **404** with no signals.
  In the vault, the Reader opened the same seeded entry and reported
  _"Could not fetch article content"_ — the same outcome from the other side. The
  two `fx-youtube` entries in the sample (the vault seeds four) are YouTube pages
  themselves: the script reads a trusted `og:video`, and the plugin routes those
  items to its full-view video player, which is the surface the ticket puts out of
  scope.
- **A real page.** In the vault, the Reader opened a live GitHub Blog entry from
  the same feed and stopped the article fetch with its own transport: the fetched
  version rendered 5,961 characters of article text with no video placeholder and
  no iframe, and the fetched metadata was stored on the item. The script found no
  signal on the same page. This is the #1176 gap reproduced end to end: the RSS
  version of that article shows one placeholder, the fetched version shows none.
- **The request identity.** The plugin's outbound request to the fixture
  server's echo feed carried
  `Mozilla/5.0 … obsidian/1.14.4 Chrome/150.0.7871.250 Electron/43.7.7 Safari/537.36`
  with no `sec-ch-ua` family, exactly as the repository's fixture-vault notes
  record. The script sent the same identity shape at a different Obsidian
  version (`obsidian/1.8.10 Chrome/126…`). No host in the sample is known to
  treat the two differently, but the sample cannot prove that for every host;
  this is the one place the two instruments were not byte-identical.
- **One host was not sampled.** Android Authority answered 403 to the script's
  request. It was not re-tried through the plugin, so whether Obsidian's own user
  agent reaches it is unknown rather than known-good.

### Other signals observed

Recorded, never used for the decision, exactly as the pre-registration requires.

| Shape                                                                  | Pages | What it is, and why it would matter in a future rule                                                                                                                                |
| ---------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-yt-video-token` + `img.youtube.com/vi/<id>/…` (a YouTube facade) | 15 S1 | exact ID in the attribute; carried by all 15 S1 pages of the four Future plc titles (counted in the sample, re-verified post-sample at 15 of 15)                                    |
| `data-react-props` with `videoId` on a React placeholder               | 4 S1  | exact ID in the JSON prop; **post-sample re-read** of the same five URLs, because the sampler's own regex missed `data-react-props='{"videoId":…}'` and its count (1) is not usable |
| `img.youtube.com` thumbnail only                                       | 23    | a thumbnail URL is not a video declaration on its own                                                                                                                               |
| `<video>` element                                                      | 2     | the publisher's own player, not YouTube                                                                                                                                             |
| `itemprop="contentUrl"` microdata                                      | 3     | one is the publisher's player; microdata needs its own reading                                                                                                                      |
| `twitter:player`                                                       | 2     | YouTube's own pages                                                                                                                                                                 |
| `ytInitialPlayerResponse`                                              | 2     | YouTube's own pages                                                                                                                                                                 |
| `VideoObject` naming a non-YouTube `contentUrl`                        | 3     | CBS Sports names its own player; the recogniser correctly yields nothing                                                                                                            |

A page that serves the embed inside `<noscript>` (the WordPress "lazy YouTube"
plugin's shape, seen on Kotaku and Gizmodo) also deserves a note for a future
ticket: Mozilla Readability's `_removeScripts` removes `script` and `noscript`
elements before the sanitizer runs, so an embed placed there is invisible to the
extractor no matter what the signal tier does.

### Extraction logic used

Quoted inline so the numbers stay auditable after the scratch script is deleted.
The recogniser is the shape the implementation block would have used; the signal
readers are the ones the plugin would need.

```js
// Only the 11-character ID is ever taken from a URL.
function recognizeId(raw) {
  let value = (raw ?? "").trim();
  if (!value) return null;
  if (value.startsWith("//")) value = `https:${value}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null; // insecure sources rejected
  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null; // non-YouTube hosts rejected
  const path = url.pathname;
  const pick = (re) => {
    const m = re.exec(path);
    return m && /^[A-Za-z0-9_-]{11}$/.test(m[1]) ? m[1] : null;
  };
  return (
    pick(/^\/embed\/([^/]+)/) ??
    pick(/^\/v\/([^/]+)/) ??
    pick(/^\/shorts\/([^/]+)/) ??
    pick(/^\/live\/([^/]+)/) ??
    (host.endsWith("youtu.be") ? pick(/^\/([^/]+)/) : null) ??
    (/^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get("v") ?? "")
      ? url.searchParams.get("v")
      : null)
  );
}
```

```js
// The trusted tier, read from the raw Document before Readability runs.
const trusted = [
  ...metaValues(doc, "og:video:secure_url"),
  ...metaValues(doc, "og:video:url"),
  ...metaValues(doc, "og:video"),
  ...jsonLdVideoObjectFields(doc, ["embedUrl", "contentUrl", "url"]),
];
// The corroborating tier.
const corroborating = [
  ...lazyAttributes(doc).map((el) => el.getAttribute("data-src") ?? ""),
  ...lazyAttributes(doc).map((el) => el.getAttribute("data-lazy-src") ?? ""),
  ...anchorsInsideExtractedArticleBody(articleHtml), // youtube.com/watch, youtu.be
];
```

```js
// The plugin's read order, mirrored: signals from the raw page, body links from
// the extracted article.
const pageMetadata = extractPageMetadata(doc); // before Readability mutates doc
const article = new Readability(doc).parse();
const bodies = anchorsInside(new DOMParser().parseFromString(article.content));
```

## Limits

- The sample cannot speak for publishers it did not include.
- A page that builds its player purely in script with no server-side declaration
  is invisible to this method by construction. 4 of the 28 real S1 pages served
  nothing detectable at all: GitHub Blog, Vox and Ars Technica, one page each, and
  one The Conversation page.
- The disposable script undercounted one shape: its `data-react-props` pattern
  could not match `data-react-props='{"videoId":…}'`, so the sample's own count
  for that shape (1 page) is not usable and the report uses a post-sample re-read
  of the same URLs (4 of 5 pages) instead. The bug affects the _Other signals_
  column only: every trusted-tier and corroborating-tier reader matched the
  values the report reports, and the self-check against plain string counts on
  the raw HTML agreed host for host.
- A page can change between the sample and a later reading. One S1 page's body
  link was re-read after the sample and no longer appeared in what the site
  served, so re-running this method will not reproduce every row exactly. The
  classification stands as at sampling time.
- One host (Android Authority) answered 403 to the harvester and is not sampled.
  The plugin fetches with Obsidian's own user agent, so it may see the pages
  this script could not; that host is therefore a gap, not a miss.
- 11 of the 17 candidate hosts had a video-bearing feed entry and 6 embed
  nothing, so 10 hosts carry the S1 denominator and 6 contribute control pages
  only.
- The corroborating tier's S1 IDs were classified in full after the sample, but
  that classification is not part of the pre-registered evidence: the rule never
  trusted the tier, and its numbers are reported as context for a future ticket.
- Post-sample re-checks (the 15-of-15 facade count, The Conversation's React
  props count, and one body-link page that had changed) are recorded as context
  and are marked as re-checks. They are not part of the sample and the report's
  numbers do not rest on them.

- Desktop only. iOS and Android are not tested and are not claimed.
- Verdicts on individual videos are human judgements made once, from the page as
  served at sampling time.

## Verdict

**No-go.** Recorded on
[#1176](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1176) on
2026-10-16.

The trusted tier produced no wrong video (0 of 5) and no unverifiable ID (0 of 5)
— precision passed. It reached 5 of the 28 real S1 pages, **17.9%**, against the
pre-registered floor of one third. **Recall failed, so the go condition failed**,
and the fetched version keeps mirroring its source per
[#1168](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1168).

What this closes and what it leaves open:

- **Closed here**: showing a Video placeholder in the fetched version from an
  `og:video` or JSON-LD `VideoObject` signal. The evidence does not justify it on
  the pre-registered rule.
- **Not a finding against the feature**: the pages are full of server-side video
  declarations — all 15 S1 pages of the four Future plc titles carry a
  `data-yt-video-token` facade, The Conversation carries a `data-react-props`
  blob, and 15 S1 pages carry a YouTube body link. The tier was the limiting
  factor. A future ticket that pre-registers `data-yt-video-token` and the
  thumbnail URL as trusted, and confirms precision on a fresh sample, could
  plausibly clear both bars; the recall evidence for a wider tier is already
  here.
- **Landed with this verdict**: the `Video embed` glossary entry's stale claim
  about saved notes, which is wrong independently of the verdict.

No implementation, fixture page, test, or setting was built, because the
implementation block is gated on a go.
