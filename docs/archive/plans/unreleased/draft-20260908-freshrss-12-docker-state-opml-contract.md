---
status: implemented
completed: 2026-09-09
released_in: unreleased
issue: ""
milestone: ""
owner: unassigned
workstream: freshrss-portable-state-client
sequence: 12
depends_on:
  - ../archive/plans/unreleased/draft-20260908-freshrss-07-sync-recovery-scope-repair.md
  - draft-20260908-freshrss-09-subscription-opml-export.md
  - ../archive/plans/unreleased/draft-20260908-freshrss-11-pinned-docker-read-contract.md
release_requirement: ""
implementation: ""
---

# 12: Prove state mutation and OPML contracts against FreshRSS

**What to build:** Extend the pinned real-server contract so the full portable
state and subscription-export promises are verified against FreshRSS's actual
authentication, item-state, label, persistence, paging, and OPML behavior.

**Blocked by:** 07: Harden paging, recovery, scope safety, and repair; 09: Export
FreshRSS subscription OPML; 11: Prove the read contract against pinned FreshRSS.

**Status:** implemented, live-verified — see "Implementation notes and
validation caveat" below for exact scope, the two findings raised as
follow-up items, and what is still only proven by one local run rather than
CI.

- [x] Deterministic fixtures expose read/unread, starred/unstarred, and mapped
      label states plus enough items to exercise paging without public feeds.
      *(feed-d: 5 articles, read/starred/label control contrast, 3-page
      pagination at n=2.)*
- [x] The contract verifies FreshRSS modification-token and exact `OK`
      acknowledgment behavior for read, starred, and mapped-label membership
      changes. *(Live-verified 2026-09-09; each mutation also proven not to
      leak onto an untouched control article in the same feed.)*
- [x] A restart proves accepted FreshRSS state mutations persist and are read
      back through the implemented reconciliation path. *(Extended to all
      three mutated facets — read, starred, mapped label — plus the
      OPML-imported subscription; live-verified.)*
- [x] Every remote identifier is discovered from the running server; no fixture
      derives or hard-codes an ID from URL, title, label name, or ordering.
      *(The ticket-12 label scenario creates a label via edit-tag using a
      chosen name, then discovers its resulting opaque tag id from a fresh
      tag/list call matched by substring — never assumes the id FreshRSS
      echoes back.)*
- [x] Observed paging and content-batch behavior remains compatible with the
      client's conservative completeness and checkpoint rules. *(Live-verified:
      a non-null continuation on every page but the last, null only once
      every item has been returned, for both the original 2-page case and
      the new 3-page case.)*
- [x] The OPML scenario exports RSS Dashboard subscriptions, imports them into
      FreshRSS, exports the resulting FreshRSS feed list, and compares URLs,
      titles, flat categories, duplicate-collapse expectations, and a preserved
      baseline subscription. *(Live-verified: exports through the real
      production `generateFreshRssSubscriptionOpml`, not a re-implementation —
      see "Independent verification, not shared code" in
      `docs/development/freshrss-docker-contract.md`.)*
- [x] The OPML scenario explicitly makes no assertion about credentials,
      article bodies, read/starred state, labels, sidecar data, or FreshRSS
      archival state.
- [x] Contract runs record the exact image digest, FreshRSS version/build,
      exercised API paths, and scenario outcomes in sanitized artifacts.
      *(Also extended with a `findings` list for a real, observed
      discrepancy that is not itself a scenario failure — see below.)*
- [x] A previous stable image may be added only as a scheduled or manual
      non-blocking job with its own recorded digest and results.
      *(Scaffolded as a deliberately unimplemented, `if: false`-guarded stub
      job in `.github/workflows/freshrss-docker-contract.yml` with a tracking
      `TODO` — evaluating a genuine second image/digest is a materially
      separate piece of work than one ticket's Docker-contract extension; see
      the workflow file's comment.)*
- [x] Updating the required image or digest requires explicit fixture and
      contract review; `latest` and `edge` remain advisory at most. *(Not
      touched by this ticket — same pinned `1.29.1`/digest as ticket 11.)*
- [x] Normal unit and mocked-protocol suites remain deterministic and independent
      of Docker availability. *(Verified: `npm run test:unit` — 213 files,
      2007 tests — passes with no Docker/network dependency.)*
- [x] The complete mocked corpus, ordinary unit suite, pinned Docker contract,
      relevant lint/type checks, and final generated-artifact inspection pass.
      *(All pass; see "Implementation notes and validation caveat" for the
      one pre-existing, unrelated repo-wide lint backlog this ticket does not
      touch or fix.)*

## Implementation notes and validation caveat

Unlike ticket 11 (built in an environment with no reachable Docker daemon),
this ticket's environment had Docker reachable throughout, and the full
extended contract was actually run live against the pinned FreshRSS
container three times on 2026-09-09: once catching a real bug in ticket 11's
original, never-before-run "uncategorized feed reports an empty
`categories` array" assumption (FreshRSS actually always assigns every feed
to a category, including its own default one), and twice passing cleanly
end-to-end after the fix. Ticket 11's own read-only scenarios were
therefore also exercised live for the first time as part of this work.

The live run also surfaced two further findings, recorded in the contract
artifact's new `findings` field and written up in full in
`docs/development/freshrss-docker-contract.md` ("Ticket 12: first live run,
and three real findings"): FreshRSS's `subscription/list` response never has
an empty `categories` array for any feed (making the
`|| "Uncategorized"` fallback in `freshrss-sync-coordinator.ts`'s initial
local-placement logic effectively dead code in practice), and FreshRSS's
`tag/list` response has no `label` field for a user-created label entry
(making `parseTagListResponse`'s `displayName` fallback in
`freshrss-sync-client.ts` produce the full opaque tag id rather than a
human-readable name). Neither is a scenario failure — both are informational
findings for a maintainer to triage as possible follow-up tickets against
`src/services/freshrss-sync-client.ts` / `freshrss-sync-coordinator.ts`; no
`src/` runtime file was changed by this ticket.

What shipped, extending ticket 11's harness in place (not a parallel
harness):

- `docker/freshrss-contract/fixtures/manifest.mjs` — two more fixture feeds:
  `feed-d` (seeded at boot, 5 articles, for state-mutation/paging) and
  `feed-e` (exported as `OPML_ROUND_TRIP_FEED`, deliberately excluded from
  boot seeding, for the OPML scenario). `ALL_SERVED_FEEDS` is the new union
  the fixture HTTP server serves.
- `docker/freshrss-contract/run-contract.mjs` — feed-d's 3-page pagination
  and read/starred/mapped-label mutation-and-restart scenarios; the OPML
  round-trip scenario (export via the real production generator, CLI import,
  CLI export, comparison, baseline preservation); a `findings` collection
  fed into the artifact; and the corrected category-placement check.
- `docker/freshrss-contract/lib/opml-export-bridge.mjs` (new) — compiles and
  calls the real `src/services/freshrss-opml-export.ts` via esbuild, on
  purpose the opposite choice from `greader-client.mjs`'s deliberate
  independence (see that file's doc comment for why).
- `docker/freshrss-contract/lib/opml-compare.mjs` (new) — a small,
  dependency-free parser for FreshRSS's own OPML export shape, plus a
  substring-match helper, both Docker-free and unit-tested.
- `docker/freshrss-contract/lib/artifact.mjs` — additive `findings` field
  (defaults to `[]`, never affects `overallPassed`).
- `docker/freshrss-contract/docker-compose.yml` — a second, writable bind
  mount (`./tmp:/contract-tmp:rw`) for the OPML scenario's runtime-generated
  export, separate from the existing read-only `/contract-fixtures` mount.
- `.github/workflows/freshrss-docker-contract.yml` — a second,
  `if: false`-guarded stub job for the "previous stable image" advisory
  check (deliberately not implemented this ticket; see above).
- `docs/development/freshrss-docker-contract.md` — rewritten status section,
  the three findings, and an updated "what has/has not been verified"
  breakdown reflecting the live run.
- Every new/changed `.mjs` file has Node-test coverage runnable via
  `npm run test:freshrss-fixtures` (32 tests, all passing, no Docker
  required).

Validation actually run in this environment: `npm run test:freshrss-fixtures`
(32/32), `npm run test:unit` (213 files / 2007 tests), `npm run
check:compliance`, `npm run check:platform`, `npx tsc -noEmit
-skipLibCheck`, the esbuild production bundle step, and
`npx eslint docker/freshrss-contract --max-warnings=0` (zero errors/warnings)
all passed. Repository-wide `npm run lint` (and therefore the chained `npm
run build`) fails on a **pre-existing backlog of 64 errors / 31 warnings**
(mostly `obsidianmd/no-unsupported-api` findings tied to `manifest.json`'s
`minAppVersion: "1.1.0"` lagging behind APIs already used across several
unrelated `src/` files) — confirmed present on this branch *before* any
ticket-12 change by stashing this ticket's work and re-running lint against
the clean branch tip. Fixing that backlog (most plausibly by reviewing
whether `minAppVersion` should be raised, matching the intent of the recent
"RSS Dashboard now requires Obsidian 1.8.7" compatibility commit) is out of
scope for this ticket and is a pre-existing, tracked condition of the
branch, not something introduced here.
