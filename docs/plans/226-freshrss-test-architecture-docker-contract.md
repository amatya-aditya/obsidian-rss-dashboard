---
status: accepted
created: 2026-09-08
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/226"
milestone: ""
owner: unassigned
workstream: "freshrss-wayfinder"
sequence: 226
depends_on:
  - "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/221"
  - "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/222"
  - "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/223"
  - "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/224"
  - "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/225"
release_requirement: ""
implementation: ""
---

# FreshRSS test architecture and Docker contract

## Decision status

This is an accepted architecture plan for issue #226. It defines the test
seams and external compatibility contract for the FreshRSS portable-state
client. It does not implement the client or the Docker harness.

The plan inherits the settled contracts from issues #222, #223, and #225 and
the supplied #224 capability and credential decisions. GitHub issue #224 is
still visibly open at planning time; this plan does not change that issue or
claim that it has been closed.

## Decision

FreshRSS verification uses three complementary layers:

1. Pure unit tests for capability gating, credential/session state, error
   classification, scope transitions, sidecar decisions, and durable pending
   mutation rules.
2. Mocked protocol tests for request construction, ClientLogin and
   authenticated headers, modification-token handling, paging, bounded retry,
   cursor safety, response classification, and reconciliation.
3. Docker contract tests for the actual FreshRSS API, fixture seeding,
   persistence across restart, the #223 OPML round-trip, and the pinned
   version assumptions.

Docker tests are external compatibility tests. They are not a replacement for
deterministic unit or mocked protocol tests and are not part of the ordinary
unit-test suite.

## Docker contract

- Required contract image: the official stable FreshRSS image at the exact
  version accepted when implementation begins, initially recommended as
  `ghcr.io/freshrss/freshrss:1.29.1`, pinned by digest in CI.
- Do not use `latest` or `edge` for the required contract job.
- Add the previous stable line as a scheduled or manually triggered,
  non-blocking compatibility job when its digest is recorded.
- Do not make an unbounded FreshRSS compatibility promise. Updating the pinned
  image requires an explicit contract review and fixture re-run.
- Run Docker jobs on a Linux runner. Keep normal unit and mocked protocol
  checks independent of Docker availability.

## Harness lifecycle

The future harness will:

1. Start a compose-scoped FreshRSS container with an isolated data volume and
   deterministic credentials supplied only through the test environment.
2. Wait for container liveness, then verify ClientLogin, an authenticated
   read-only probe, the modification-token probe, and fixture readiness.
3. Seed the test account and subscriptions/categories through documented
   FreshRSS-supported mechanisms. Feed content comes from a local deterministic
   RSS/Atom fixture server rather than public feeds.
4. Execute the contract scenarios and record the image tag/digest, reported
   FreshRSS version/build, exercised API paths, and scenario result as a CI
   artifact.
5. Tear down only the compose project and test-owned volume, including on
   failure.

Readiness means more than an HTTP success response: the container must be
reachable, authentication must succeed, the read-only probe must succeed, the
modification-token probe must succeed, and the seeded fixture must be
observable.

## Fixture model

Fixtures use stable logical keys such as `article-alpha`; FreshRSS subscription
IDs, tag IDs, stream IDs, and article IDs remain opaque values returned by the
server. Tests must not derive or hard-code remote IDs from URLs, titles, or
fixture ordering.

The minimum deterministic fixture contains:

- one API user and API password provided only at runtime;
- two feeds with nested category placement and one uncategorized feed;
- stable article content served by the local fixture server;
- read/unread and starred/unstarred states;
- normalized labels/tags;
- pending local read, starred, and label mutations;
- enough items to exercise paging without relying on public feed timing.

Committed fixtures must contain no credential, session, modification token, or
other secret value.

## Protocol and failure coverage

Mocked protocol tests cover the correctness path for ClientLogin, user/read
probes, subscription/list, tag/list, stream item IDs and contents, unread and
starred state, edit-tag, modification tokens, paging, and cursor handling.

Fault injection must deterministically cover invalid credentials, unavailable
API, one 401 reauthentication, timeout, 5xx, malformed cursor, repeated
cursor, incomplete stream, scope mismatch, pending mutation acknowledgment,
and stale acknowledgment ordering.

The tests assert the #225 behavior: one in-flight request, bounded retries,
preserved checkpoints on partial streams, no false completion for malformed or
repeated cursors, pending local state winning until an acknowledged `OK`, and
terminal repair for non-retryable mutation failures.

Maintain a sanitized golden response corpus for malformed/repeated cursors,
incomplete streams, authentication rejection, transient failures, and delayed
acknowledgments. These fixtures make fault behavior reproducible without
requiring Docker.

## OPML acceptance contract

The Docker-backed acceptance scenario consumes #223 exactly:

RSS Dashboard subscription export → FreshRSS import → FreshRSS feed-list
export → compare feed URLs, titles, categories, duplicate-collapse warnings,
and baseline-feed preservation.

The scenario does not claim that OPML preserves credentials, article bodies,
read/starred state, labels, sidecar data, or FreshRSS archival state.

## Obsidian capability matrix

Capability behavior is tested outside Docker with mocked Obsidian versions:

- below 1.11.4: FreshRSS remains visible, but controls are disabled with an
  explanatory notice and no network or local-state mutation occurs;
- 1.11.4 and later: SecretStorage-backed FreshRSS controls may operate;
- credential values, auth values, sessions, and modification tokens never enter
  `data.json`, `freshrss-state.json`, or `user-state.json`.

The plugin-wide minimum remains unchanged.

## Acceptance criteria

- The three test layers and their ownership boundaries are documented.
- The required Docker image/version and update procedure are explicit.
- Harness readiness, fixture seeding, teardown, and artifact reporting are
  deterministic.
- Mocked tests cover all agreed protocol and failure cases.
- Docker tests cover actual FreshRSS behavior, persistence, version
  assumptions, and the #223 OPML round-trip.
- The Obsidian 1.11.4 capability boundary is tested independently of Docker.
- No secret or token is committed or persisted by the test contract.
- #226 can close as an architecture decision; implementation/test-harness
  work remains a separate follow-up horizon.

## Follow-up horizons

- Current scope: architecture, glossary terms, fixture contract, Docker
  lifecycle, version pinning, and copy-ready issue comment.
- Near-term: implement the mocked protocol seam and deterministic fixture
  corpus.
- Data-dependent: publish the tested FreshRSS version/capability matrix after
  the first pinned Docker contract run.
- Later exploration: optional `edge` advisory testing, richer sync-ledger
  assertions, and broader historical bootstrap coverage.

## Manual verification for implementation follow-up

Run the pinned Docker contract locally on a Linux host with Docker available;
verify readiness, fixture visibility, restart persistence, OPML round-trip,
scope quarantine, pending mutation acknowledgment, and cleanup after both
success and failure. Confirm the ordinary unit suite still runs without Docker.

## Sources

- FreshRSS Google Reader API: https://freshrss.github.io/FreshRSS/en/developers/06_GoogleReader_API.html
- FreshRSS Docker guidance: https://github.com/FreshRSS/FreshRSS/blob/edge/Docker/README.md
- FreshRSS test guidance: https://freshrss.github.io/FreshRSS/en/developers/03_Running_tests.html
- Obsidian Secret Storage: https://docs.obsidian.md/plugins/guides/secret-storage
- Obsidian API: https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts
- GitHub Actions service containers: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
