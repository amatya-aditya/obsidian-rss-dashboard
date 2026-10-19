# ADR 0034: Treat a Bot Challenge as a Blocked Fetch, Not a Paywall

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-10-19

## Context and problem

Some sites refuse a request they read as automated by answering a WAF or bot
challenge: an HTTP 403 whose body is a challenge page ("Just a moment...", a
Cloudflare `challenge-platform` script, a DDoS-Guard interstitial). The same URL
serves a browser without complaint. The refusal is about the _client_, not about
the _content_.

The full-article fetch classified a refusal from its HTTP status alone.
`isRestrictedStatus()` treated 401 and 403 as restricted, and Obsidian's
`requestUrl` **throws** for any status of 400 or above, so nothing else could be
consulted: on Obsidian 1.14.4 the thrown `Error` carries exactly its `status`
and `headers`, never the body. The challenge detectors that already existed
(`isBlockedResponse()`) only ran on a resolved response body, so a 403 challenge
never reached them. The user was told "Fetched content is restricted. Showing
available RSS content." - a paywall - for a page that opens fine in a browser.

[ADR 0025](0025-identify-outbound-requests-as-obsidian.md) records the same
misread for its _User-Agent_ cause, and its Consequences note that a blocked
_feed_ now surfaces as an ordinary fetch failure rather than as a restricted
one. The article path never got the same treatment.

Two facts made the fix cheap. First, Cloudflare labels its own challenge with a
response header, `Cf-Mitigated: challenge`, and the thrown error already carries
the response headers - so the signal is in hand without touching the fetch.
Second, the same challenge served with status **200** was already classified
`network`, because the body markers caught it and the status did not say
`restricted`. Only the thrown-403 path disagreed; this decision makes them
agree.

## Decision

**Classify a refusal in a fixed order, not from its status alone.** A challenge
signal beats a status code and beats paywall wording:

1. A **challenge signal** is present -> **blocked**. The signal is the response
   header `cf-mitigated: challenge` (matched case-insensitively), or a resolved
   body naming a challenge vendor (`just a moment`, `cf-challenge`,
   `cf-browser-verification`, `challenge-platform`, `ddos-guard`, `enable
javascript and cookies`).
2. Otherwise a status of **401 or 403** -> **restricted**. A real content or
   auth gate.
3. Otherwise reader-visible **paywall wording** -> **restricted**.
4. Otherwise -> **network**.

**A block is a network failure with its own reason, not a third failure type.**
It stays `failureType: "network"` and carries `failureReason: "blocked"`, which
is persisted as the remembered fetch failure's `reason` and selects its own
banner. So a blocked fetch is remembered for 24 hours like any other network
failure, offers **Try again** and **Open in browser**, and sets no
`restrictedReason` and no paywall banner.

**The bare status words stop meaning "restricted".** `403`, `forbidden` and
`access denied` were removed from the restricted marker list, because Obsidian's
own thrown-error message is "Request failed, status 403" and would otherwise
re-derive `restricted` before the challenge signal was read.

**The rule covers every surface that fetches an article page.** The Reader's
full-article fetch and the card's [[Cover image fetch]] share one seam, so both
stop calling a challenge a paywall. The SagePub abstract fallback is skipped
after a block: the abstract is on the same host, so the host's refusal answers
for both. Feed refresh, preview and Discover are deliberately untouched - per
ADR 0025 a blocked feed is already an ordinary fetch failure.

**Copy names the refusal.** A block reads "The site refused the request...",
never paywall wording.

## Consequences

### Benefits

- A page behind a managed challenge is described as a blocked fetch: the Reader
  keeps the feed's own content, the banner names the refusal, and the escape
  hatch (**Open in browser**) is exactly the thing that works.
- Paywall wording means what it says again. A real 401/403 gate keeps the
  restriction notice, so "restricted" is a claim about content rather than a
  synonym for "the request failed".
- One weak classification was replaced by one ordered rule, unit-testable
  without Obsidian or the network (`classifyFetchRefusal`).

### Trade-offs

- Detection of the header path is Cloudflare-specific. A challenge vendor that
  answers 403 without `cf-mitigated` and without a readable body (DDoS-Guard,
  for one) still lands on "restricted". Widening that needs the body, which the
  thrown error does not carry; see the rejected option below.
- A blocked fetch now consumes the 24-hour failure memory, so a challenged
  article is not re-fetched on every open. That is deliberate - a managed
  challenge does not clear for a non-browser client - but it means the retry is
  manual through **Try again**.
- Adding `blocked` to the persisted `fullContentFetchFailure.reason` extends a
  stored shape. Older values (`timeout`, `network`) keep their meaning, and a
  reason this build does not know falls back to the network copy.

### Existing users and data

Nothing is migrated. An article stored by an earlier version with
`restrictedReason` keeps it; the Reader's remembered-failure banner takes the
paywall banner's place while a failure is active, and a fetch that later
succeeds clears the flag exactly as before. Feeds, settings, saved notes and
storage modes are unaffected.

### Unverified

The `Cf-Mitigated: challenge` header was measured only against Cloudflare
(science.org / sciencemag.org, 2026-10-19). Whether other managed-challenge
deployments set it, and how a mobile (Capacitor) `requestUrl` failure surfaces
its headers, were not measured.

## Considered options

### Read the 4xx body by fetching with `throw: false`

Rejected for now. Obsidian supports `requestUrl({ throw: false })`, which
returns the 403 _and_ its body, so the existing body markers could classify
every vendor. It rewrites the shared fetch seam instead: every article and cover
fetch would start resolving 4xx responses rather than throwing, so the proxy
retry, the metadata-from-unparsed-response path and their tests all move. The
header signal already answers the reported case, so the wider rewrite is
deferred until a second vendor is actually reported.

### Treat every 401 and 403 as a block

Rejected. It is one line and it fixes the symptom, but it discards the real
content gate: paywall wording would then be unreachable, and a genuine 401/403
gate would be described as a bot block - the #1109 / #1345 misread in the
opposite direction.

### Add a third `failureType: "blocked"`

Rejected. A block behaves like a network failure on every surface that matters
(it is remembered, retried manually, and has no content): the Reader banner,
save fallback, cover-image action and content-version toggle all already have a
network branch. A new type would add a branch to each of them - and to the
persisted item shape - for no behavior the reason cannot carry.

### Keep `restricted` and reword its copy

Rejected. It would make "Fetched content is restricted" describe a page that is
not restricted at all, and the persisted `restrictedReason` ("paywall or
restricted") would keep lying on disk. The distinction belongs in the
classification, not the wording.

## Implementation notes

- `classifyFetchRefusal({ status, headers, body, message })` is the one rule.
  `describeFetchError()` reads the thrown error's `headers` alongside its
  status and message and delegates to it; the direct and proxy attempts call it
  with whatever a response carried.
- `refusalResult()` turns a refusal into the result shape: `restricted` keeps
  its failure type, `blocked` is a `network` failure with
  `failureReason: "blocked"`.
- A block observed by any attempt is not overwritten by a later proxy timeout: a
  deadline ended a retry, while the refusal is the page's own answer. A
  `restricted` result keeps the existing behavior (its type survives, the
  timeout reason is recorded).
- The direct and proxy attempts live in small helpers so the orchestrator stays
  within the repository's complexity limit without a suppression.
- `PageCoverImageStatus` gained no status: a block arrives as `"failed"` with
  `reason: "blocked"` and its own notice text.

## Confirmation

`test_files/unit/services/fetch-helpers.test.ts` units the rule (challenge
header case-insensitivity, body markers, the 401/403 and paywall-wording cases,
and the bare-403 message) and drives the real Obsidian stub to prove a
challenged 403 is a blocked fetch that is retried through the proxy.
`test_files/unit/utils/fetch-helpers-timeout.test.ts` pins a block's survival
across a later proxy timeout, `test_files/unit/utils/full-article-fetch.test.ts`
pins the SagePub behaviour, and the cover-image notice, Reader banner and
content-version status tests pin the copy.

## Related

- [#1347](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1347) -
  WAF/bot-challenge 403 surfaced as restricted (Science)
- [#1345](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1345) -
  the false positive from matching paywall markers against raw markup
- [#1109](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1109) -
  the original bot-block misread, fixed for its User-Agent cause
- [ADR 0025](0025-identify-outbound-requests-as-obsidian.md) - identify
  outbound requests as Obsidian, not as a browser
- [#950](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/950) -
  owns which pages count as blocked
