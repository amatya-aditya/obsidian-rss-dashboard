# ADR 0022: RSS-First Reader Content Selection

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

The maintainer endorsed the RSS-first direction, explicit version switching,
source-based terminology, and separate tickets for separate concerns in
[#954](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/954).
The implementation and this text were reviewed in
[PR #1053](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/1053),
merged into `dev` on 2026-10-13 as
[`48d91e49`](https://github.com/amatya-aditya/obsidian-rss-dashboard/commit/48d91e49cc5b9dd54f12fbe147c43be719625b6a),
so the reading behavior, terminology, and shared request budget below are
current project policy. The deferred saving, note-upgrade, and parity questions
recorded below remain open, as questions this record leaves to separate
decisions rather than conditions of its acceptance.

## Date

2026-10-13

## Context and problem

A subscribed feed can already contain a readable article when the Reader opens.
Waiting for page extraction delays that reading, and automatically replacing
visible content after extraction can interrupt a user's place. The extracted
page is also not necessarily a more complete or better version: a publisher
may provide the complete article in the feed, while its page contains a shorter
body, unrelated material, or restricted content.

The Reader needs to distinguish where a version came from without ranking its
quality or completeness. Reading choice is a separate concern from what gets
saved to a vault note, how that note records its source, and whether an existing
note should later be upgraded.

## User stories

1. As a reader, I want available feed-provided content to appear immediately,
   so that page extraction does not block reading.
2. As a reader, I want to choose when to view another version and return to my
   place in each, so that background fetching does not interrupt me.
3. As a user who saves articles, I want background reading activity to leave my
   saved notes alone, so that reading does not silently rewrite my work.

## Decision

Show available **RSS content** first in both the inline and dedicated Reader.
Use **RSS content** for content provided by the subscribed feed, including Atom
and JSON Feed, which may already contain the complete article. Use **Fetched
content** for content extracted from the linked page. These names describe
source, not completeness or superiority. The existing storage term **Feed
content** keeps its separate meaning.

Keep each version available independently during the current article display.
When the existing fetch-on-open policy allows page fetching, it may prepare
Fetched content in the background. Finishing that work makes a version
available; it does not replace the visible RSS content. Switching the visible
version requires an explicit reader action. Preserve a separate scroll
position for each version when switching back and forth. While fetching is
pending or fails, available RSS content remains readable.

Scope version caches, selection, and scroll state to one article display in
one Reader instance. Navigation, redisplay, and closing the Reader invalidate
its previous asynchronous work. A late result must not replace a newer article,
change another Reader's selection, or persist metadata onto the wrong article.
Repeated switching within a display reuses its version cache rather than
starting another fetch for an already available version.

Use one direct-first, sequential request budget for a page fetch, including its
proxy attempts and any extraction fallback. Fallback must not restart a fresh
network budget after the direct or proxy path has exhausted it. Do not race
direct requests against proxies, introduce speculative requests, or change
proxy, timeout, or automatic-fetch defaults. Existing restrictions on automatic
fetching, including starred-imported articles that require manual fetching,
remain in effect.

### Saving and other deferred decisions

This decision concerns reading only. Background fetching, version availability,
and version switching never rewrite saved vault notes. It does not add a
saving-source chooser, persist a new note-provenance contract, or decide how to
upgrade an existing note. Those concerns require separate tickets and review.

The saving side was settled separately, in [issue
#1183](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1183)
(2026-10-15): the version a save writes is the **Default save version** setting,
optionally overridden by the saved template applied to the article ([issue
#1185](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1185)).
No saving-source chooser was added. A save surface reports the version it will
write ([issue
#1184](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1184))
but does not offer a choice, so the version is switched in the setting or in a
saved template and never per save.

Accepted [ADR 0018](0018-generate-safe-article-filenames-from-template-patterns.md)
and [ADR 0019](0019-saved-note-association-authority.md) continue to govern
explicit Save and saved-note associations. In particular, this record does not
prohibit an explicit Save from updating an identified existing note or change
legacy title-based reuse during explicit Save. It does not introduce proactive
saved-note reconciliation or recovery.

The maintainer also raised possible **Feed source parity**, described as
95–100% byte-identical content. That is a future concern, not an accepted
matching rule or part of this implementation. A separate decision must define
byte normalization, whether similarity rather than equality is intended, the
threshold, and the resulting user experience before a comparison can influence
version availability, selection, or saving.

## Consequences

### Benefits

- Available RSS content is readable without waiting for page extraction.
- Users control visible version changes and retain their place in each version.
- Source-based labels avoid promising that a fetched page is the full article.
- Display-scoped state and stale-result guards prevent one reading session's
  fetch from changing another session's content or metadata.
- A shared sequential budget bounds fetching without multiplying requests
  through fallback or introducing proxy races.

### Trade-offs

- Users must explicitly switch to Fetched content even when extraction succeeds.
- Keeping two versions and scroll positions adds transient Reader state.
- A shared request budget can leave less time for a fallback; an unavailable
  fetched version is preferable to an unbounded chain of requests.
- The Reader does not deduplicate equivalent versions or promise a comparison
  of their completeness. Saving-source and note-upgrade questions remain open.

### Existing users and data

- Existing fetch and proxy preferences retain their values and defaults.
- Version selection and caches are display-local, not a new persistent article
  schema or a remembered per-feed preference.
- No saved-note migration, automatic rewrite, or new provenance field is
  introduced. Existing save contracts remain unchanged.
- Fetch failure preserves the available RSS version; it is not evidence that
  the publisher supplied an incomplete feed article.

## Considered options

- **Wait for extraction before showing the article:** Offers one settled result,
  but blocks reading content already available from the feed.
- **Show RSS content, then automatically replace it:** Avoids the initial wait,
  but interrupts reading and treats the fetched version as preferable without
  evidence. It can also lose the user's place.
- **Show RSS content and switch versions explicitly (chosen):** Preserves reading
  continuity and source choice at the cost of an extra action and transient
  state for both versions.
- **Race direct and proxy fetches:** Could reduce latency in some environments,
  but increases concurrent requests and changes network behavior beyond this
  reading concern. Keep the existing direct-first sequence and shared budget.
- **Design reading, saving, provenance, upgrades, and parity together:** Could
  produce a unified workflow, but couples independently reviewable decisions
  and risks changing accepted save behavior. Defer the other concerns.

## Related

- [Issue #954 — RSS-first Reader](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/954)
- [Maintainer's version-toggle approval and saving questions](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/954#issuecomment-6134769975)
- [Maintainer's terminology, separate-concern guidance, and parity suggestion](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/954#issuecomment-6135038655)
- [Reader vocabulary](../../CONTEXT.md#reader-view)
- [ADR 0018 — Generate Safe Article Filenames from Template Patterns](0018-generate-safe-article-filenames-from-template-patterns.md)
- [ADR 0019 — Saved-note association authority](0019-saved-note-association-authority.md)
