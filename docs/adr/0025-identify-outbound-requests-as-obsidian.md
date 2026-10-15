# ADR 0025: Identify outbound requests as Obsidian, not as a browser

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

Decided in
[#1162](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1162),
which audited every affected call site.

## Date

2026-10-15

## Context and problem

Some websites refuse requests they read as automated. The plugin used to answer
that by claiming to be a desktop Chrome browser: `User-Agent: Mozilla/5.0 …
Chrome/120.0.0.0 Safari/537.36`, and at most call sites a Chrome 91 string with
`Feedbro/4.0` appended.

That claim is incomplete, and the incompleteness is itself the signal. A real
Chromium browser sends `sec-ch-ua`, `sec-ch-ua-mobile` and `sec-ch-ua-platform`
alongside its `User-Agent`, describing the browser and operating system in
structured form. A script that copies only the `User-Agent` string sends a
request that says "Chrome" in a way no Chrome has ever said it, and anti-bot
filters in front of a site answer **403** — the same site that serves a browser
without complaint. Measured directly while investigating
[#1109](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1109):
`stratechery.com/feed/` and `1000wordphilosophy.com/feed/` both answer 403 to
that Chrome string and 200 to the same request without a `User-Agent` override.

The failure mode is easy to misread, which is why this record exists. In the
Reader, the 403 is thrown by Obsidian's `requestUrl`, classified as _restricted_
by `isRestrictedStatus`, and surfaced as "Fetched content is restricted" — a
notice that reads like a paywall, not like a self-inflicted bot signal. #1109
fixed the full-article fetch. #1162 found the same pattern at fourteen more call
sites: feed fetch, feed preview, feed discovery, the WordPress and proxy
fallbacks, and the Mastodon, Apple Podcasts and YouTube resolvers.

Two facts made a single policy preferable to per-site judgement calls. First,
the Plugin already relies on Obsidian's own `User-Agent` going out when no
override is set: that is exactly what fixed #1109. Second, the same host can
behave in opposite ways for different user agents — `reddit.com/r/programming/.rss`
answers 403 to a request with no `User-Agent` at all and 200 to Obsidian's own —
so "remove the User-Agent" and "keep a browser User-Agent" are both wrong as
blanket rules.

## Decision

**No outbound request sets a `User-Agent`.** Requests carry the `Accept` value
that matches what they read — a feed, an HTML page, or a JSON API — and nothing
else. Obsidian supplies its own `User-Agent`, which is what the server sees.

**One module owns the request header sets.** The feed, page and JSON requests
audited here take the header set for what they are fetching from
`src/utils/request-headers.ts` instead of writing their own `Accept` object, so
the policy has one home and one test. The full-article fetch is the one
exception, and it already carries the same policy (see Implementation notes). A production module that hard-codes a `User-Agent` again
fails that test.

**An explicit `User-Agent` returns only with evidence.** If a host is later shown
to refuse Obsidian's own `User-Agent` and to accept a specific one, that call
site may set it again — in the shared module, with the host named, the reason
recorded, and a test pinning the value.

**The policy is not a claim about crawling.** This project does not disguise
itself as a browser to obtain content a site denies to non-browsers; it identifies
itself honestly and lets the site decide. That is the same reasoning
[ADR 0013](0013-render-reddit-posts-from-rss-content.md) already applied when it
chose to render Reddit posts from RSS rather than spoof a crawler.

## Consequences

### Benefits

- Feed fetch, preview, discovery and the resolvers stop failing on sites that
  block a Chrome `User-Agent` without its client hints, which was the reported
  bug: adding or previewing such a feed no longer depends on a browser identity.
- One header policy, one place to read it, and one test that fails if a call
  site reintroduces an override.
- Requests now describe what actually sent them, which is the honest signal for
  the site's operators and for the plugin's own security disclosures.

### Trade-offs

- A site that serves browser user agents only, and refuses Obsidian's, would stop
  working where it used to. None is known today: the audit found no call site
  that needed a browser identity, and the probes found hosts that reject a bare
  request but accept Obsidian's own. The escape hatch above is for that case.
- The plugin no longer looks like a feed reader to hosts that allowlist known
  readers such as `Feedbro`. The Chrome 91 string it sent was not a real feed
  reader either, and hosts that allowlisted it did so by string match.
- The failure of a blocked feed now surfaces as an ordinary fetch failure rather
  than as a "restricted" classification. That is the correct classification, but
  it is a visible change in what the user is told.

### Existing users and data

No stored data, setting, or stored-feed format is affected; this is a request
header change only. A feed that was previously unaddable may start working, and
nothing that worked by design stops working.

### Unverified

The mobile (Capacitor) default `User-Agent` was not measured on a device. The
decision relies on Obsidian's own header being sent, which is the same premise
that fixed #1109 on desktop; mobile is asserted by that premise rather than by
observation.

## Considered options

### Keep the Chrome `User-Agent` and add the matching client hints

Rejected. It repairs the mismatch, but it commits the plugin to maintaining a
convincing imitation of a browser — a browser version, a platform, and the
`sec-ch-ua` triple that must agree with each other — and to updating that
imitation as the mismatch is re-detected. The identity was never needed to read
a feed.

### Send one shared `Feedbro/4.0` feed-reader `User-Agent` everywhere

Rejected. It passed every probe, including the two hosts that reject the Chrome
120 string, but it passed by being allowlisted by name, not by being correct: it
carries the same missing client hints and the same 2021 Chrome version. Adopting
it would make a stranger's identity the project's public signal and put the
project's access to those hosts at the mercy of another product's standing.

### Judge each call site and keep a `User-Agent` where it might matter

Rejected. The audit found no call site that needed one, and "might matter" is not
a criterion a later reader can apply or a test can check. Two plausible-looking
cases did not survive contact with the evidence: YouTube's channel page returns
the same channel id to Obsidian's `User-Agent` as to the Chrome 91 string, and
the Mastodon profile page needs only the feed `Accept`.

### Remove the `User-Agent` header entirely

Rejected as stated. The plugin cannot remove what Obsidian sends; it can only
stop overriding it. This is a distinction with a consequence, not a wording
quibble: a request with no `User-Agent` at all is itself unusual and is refused
outright by some hosts, while a request carrying Obsidian's own is not.

## Implementation notes

- `src/utils/request-headers.ts` holds the `Accept` values and the three header
  sets. It is a leaf module: it imports nothing from `src/services/`, so both the
  feed parser and the resolvers can use it.
- The full-article fetch keeps its own `Accept` and `Accept-Language` and its own
  no-`User-Agent` policy from #1109; it was not folded into the shared module,
  because it was already correct and out of #1162's scope.
- The five feed `Accept` variants the call sites used to write collapse into
  `FEED_ACCEPT`, the superset that six of the eight feed sites already sent. Feed
  discovery, preview, the WordPress fallback and the proxy paths therefore
  advertise `application/feed+json` and `application/rdf+xml` where some
  previously did not. `*/*;q=0.8` keeps the widening harmless, and each site's
  `Accept` is pinned by its own test.
- `docs/SECURITY.md` describes what leaves the device; the YouTube entry no
  longer claims a desktop browser `User-Agent`.

## Confirmation

`test_files/unit/utils/request-headers.test.ts` asserts the header sets and walks
`main.ts` and `src/**/*.ts` for a hard-coded `User-Agent` key, failing on any.
Per-call-site header assertions live beside each module's other tests.

## Related

- [#1162 — Audit hard-coded Chrome User-Agent on feed, preview, and resolver fetches](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1162) — the audit and its fix direction
- [#1109 — Fetched content mis-flagged as restricted on bot-blocked pages that load in a browser](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1109) — the original case; fixed the article fetch
- [#950](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/950) — owns which pages count as blocked, a separate decision
- [ADR 0013 — Render Reddit posts from RSS content](0013-render-reddit-posts-from-rss-content.md) — the same refusal to spoof a crawler
