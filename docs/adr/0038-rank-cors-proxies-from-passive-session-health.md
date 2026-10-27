# ADR 0038: Rank CORS Proxies from Passive, Session-Only Health

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-10-26

## Context and problem

With **CORS proxy** set to `auto`, a full-article fetch tries the direct request
and then each built-in proxy in turn, inside one shared **Fetch timeout** budget
([ADR 0022](0022-rss-first-reader-content-selection.md)). A proxy that hangs
uses that whole budget, and the deadline ends the fetch, so the proxies after it
are never tried. Measured on 2026-10-09: AllOrigins hung for about 12 s,
CodeTabs about 20 s, ThingProxy failed on DNS every time. Every article paid for
the same dead proxy in the same order ([#952](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/952),
[#955](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/955)).

The article URL is sent to every proxy that is tried, so any way of learning
which proxies work must not send URLs, or probe traffic, to more proxies than
the fetch would have contacted anyway ([ADR 0022](0022-rss-first-reader-content-selection.md)
rejects racing for the same reason).

## Decision

We will rank the `auto` proxies from the outcomes of the fetches the user
already makes, and keep that record in memory for the session only.

- **Passive.** Each real proxy attempt records worked, failed, or neutral. No
  scheduled, speculative, or test request is ever sent for this.
- **Only the proxy's own failures count.** A thrown error with no status (DNS,
  connection), a 5xx, or a deadline that the attempt itself used at least half
  of counts against a proxy. A 401/403, a bot challenge, a paywall, or another
  4xx is the site's answer and counts for nothing, for or against.
- **Order.** Healthy proxies are tried by recent success rate, then speed; a
  proxy with no record keeps its preset position between good and failing ones.
- **Cooldown.** Three failures in a row bench a proxy for 5 minutes, doubling on
  each further failure up to 1 hour. When the cooldown ends it gets one trial,
  placed after the healthy proxies so a probably-dead proxy cannot spend the
  budget ahead of a working one.
- **Never empty.** If every proxy is benched, all are tried, least recently
  failed first, inside the same shared deadline.
- **Scope.** Only `auto` is tracked. A single configured proxy is used as given
  and never benched.

## Consequences

### Benefits

- After a proxy hangs once, the next article starts with a different proxy, and
  after repeated failures the dead proxy is skipped for minutes.
- No new traffic: the same URLs go to the same set of proxies as before, in a
  better order.

### Trade-offs

- A benched proxy that has recovered is only retried when the proxies ahead of
  it fail, so it can stay unused while others keep working. That is acceptable
  because nothing is lost while another proxy works.
- Health lives in memory, so every restart relearns it. Persisting it per device
  is a later phase of #955.

### Existing users and data

- Nothing is written to `data.json` or any other file, so nothing syncs between
  devices and nothing needs migrating.

## Considered options

### Option A — Race the proxies

Lowest latency, but the URL goes to every proxy at once. Rejected for privacy
([ADR 0022](0022-rss-first-reader-content-selection.md)).

### Option B — Probe proxies on a schedule

Would keep the ranking fresh without waiting for a real fetch, but sends traffic
to third parties nobody asked for. Rejected. The **Proxy check** stays an
on-demand diagnostic.

### Option C — Passive session-only tracker (chosen)

Learns from real attempts, adds no requests, and stores nothing.

## Implementation notes

- `src/utils/proxy-health.ts` holds the tracker; `fetchWithProxyFallbackDetailed`
  in `src/utils/fetch-helpers.ts` consults it.
- Feed refresh and the Pocket Casts resolver build their own proxy chains and do
  not use the tracker yet. Feed refresh needs a behaviour-preserving move onto
  the shared proxy list first.

## Related

- [ADR 0022 — RSS-first reader content selection](0022-rss-first-reader-content-selection.md)
- [ADR 0034 — Treat a bot challenge as a blocked fetch](0034-treat-a-bot-challenge-as-a-blocked-fetch.md)
- [GitHub Issue #952](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/952)
- [GitHub Issue #955](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/955)
