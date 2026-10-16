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

**Status: pre-registered, not yet sampled.** This file was committed on
2026-10-16 with the method and the decision rule below, before any page was
fetched for the sample. The thresholds and signal definitions are fixed; the
findings sections are written afterwards from the data. Nothing in the rule may
be revised after the sample is taken.

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

Sample collected: _not yet_.

### Per page

| Host           | Page label | S1/S2 | Feed proves a video | Signal present (`og:video`) | Signal present (JSON-LD) | Signal present (lazy attr) | Signal present (body link) | IDs yielded | Verdict | Notes |
| -------------- | ---------- | ----- | ------------------- | --------------------------- | ------------------------ | -------------------------- | -------------------------- | ----------- | ------- | ----- |
| _to be filled_ |            |       |                     |                             |                          |                            |                            |             |         |       |

### Per signal

| Signal         | Pages present | Valid IDs | Article video | Related / promo / ad | Unverifiable | Precision | Recall on S1 |
| -------------- | ------------- | --------- | ------------- | -------------------- | ------------ | --------- | ------------ |
| _to be filled_ |               |           |               |                      |              |           |              |

### False positives and conflicts

- Wrong-video hits and what signal produced them:
- Conflicting trusted IDs (`og:video` vs JSON-LD) and how often:
- Other signals observed, and whether any deserve a follow-up:
- Script vs in-vault disagreement on any page:

### Extraction logic used

_Quoted inline once the sample is taken, so the numbers stay auditable after the
scratch script is deleted._

## Limits

- The sample cannot speak for publishers it did not include.
- A page that builds its player purely in script with no server-side declaration
  is invisible to this method by construction; the report states what fraction of
  S1 that is.
- Desktop only. iOS and Android are not tested and are not claimed.
- Verdicts on individual videos are human judgements made once, from the page as
  served at sampling time.

## Verdict

_TBD — recorded here and on
[#1176](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1176)
once the sample is taken._
