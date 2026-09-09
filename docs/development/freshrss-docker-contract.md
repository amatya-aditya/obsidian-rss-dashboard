# FreshRSS pinned Docker read/state/OPML contract

Last updated: 2026-09-09
Related: ticket 11 (read contract), ticket 12 (state mutation + OPML
round-trip), and ticket 13 (rollout validation and compatibility docs) of the
FreshRSS portable-state-client workstream
(`docs/archive/plans/unreleased/draft-20260908-freshrss-11-pinned-docker-read-contract.md`,
`docs/archive/plans/unreleased/draft-20260908-freshrss-12-docker-state-opml-contract.md`,
`docs/archive/plans/unreleased/draft-20260908-freshrss-13-rollout-validation-compatibility-docs.md`),
architecture decision `docs/plans/226-freshrss-test-architecture-docker-contract.md`
(issue [#226](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/226)).

## Status of this harness

This harness (compose file, fixture server, contract runner, CI job) has now
had **three successful local live runs against the pinned FreshRSS
container**: two on 2026-09-09 in the environment that implemented ticket 12
(one catching a real bug — see "Ticket 12: first live run" below for exact
results — and one clean pass after the fix), and a third, independent
clean pass on 2026-09-09 in the environment that implemented ticket 13
(`overallPassed: true`, all 21 scenarios passed, artifact
`contract-result-2026-09-09T21-41-30-766Z.json`, git-ignored). Ticket 11
originally shipped this harness with no live run at all (its build
environment had no reachable Docker daemon); ticket 12 was the first time any
part of this harness actually executed against a real FreshRSS container,
and ticket 13's run is the first repeat run in a separate environment, giving
some evidence against a one-machine coincidence.

That said, **local runs are not the same as a CI run.** Before this harness's
results can be treated as fully settled:

1. Let the `FreshRSS Docker contract` GitHub Actions workflow actually run
   (its first-ever CI execution is still outstanding as of the ticket-13 run)
   and confirm it reaches, seeds, mutates, restarts, and tears down the
   pinned container the same way the local runs did — runner-specific
   timing, network, or Docker-in-Docker differences could still surface
   something the local runs did not.
2. Continue building confidence beyond four total local runs (three in one
   environment, one in a second); all four passed after the ticket-12 fix,
   with no new failures or findings surfaced by the ticket-13 run.
3. Treat the three `findings` entries below as open items, not settled
   facts, until a maintainer decides what (if anything) to change in
   `src/services/freshrss-sync-client.ts` / `freshrss-sync-coordinator.ts`
   in response to them. The ticket-13 run reproduced the same three
   findings verbatim, which is further evidence they are a real,
   reproducible server behavior rather than a one-off artifact.

## What this proves, and its finite compatibility claim

This harness proves RSS Dashboard's FreshRSS protocol assumptions against
**one exact, pinned FreshRSS build** — not an open-ended claim about every
FreshRSS version. As of the 2026-09-09 live run, it demonstrates against
that pinned image:

- The container is reachable, `ClientLogin` succeeds, an authenticated
  read-only probe succeeds, and a modification-token probe succeeds
  (readiness is more than HTTP liveness).
- Subscription and tag/label discovery return the seeded fixture data, and
  every fixture feed is placed under the expected category (see the
  "categories are never empty" finding below for what this actually means
  for an "uncategorized" feed).
- Item-ID enumeration pages correctly across multiple pages (2 pages for
  feed-a, 3 for feed-d), including real continuation cursors and a final
  page reporting no further continuation.
- Content retrieval returns the expected fixture article titles.
- Read-state, starred-state, and mapped-label-membership mutations are each
  acknowledged with exactly the FreshRSS `OK` body, are each observable
  afterward through the relevant stream, and do not leak onto an untouched
  control article in the same feed.
- Restarting the FreshRSS container against the same test-owned volume
  preserves the seeded and OPML-imported subscriptions, and all three state
  mutations above.
- RSS Dashboard's real, production `generateFreshRssSubscriptionOpml`
  (ticket 09) export -- including its duplicate-feed-URL collapse -- imports
  into FreshRSS correctly and survives FreshRSS's own OPML re-export with
  the same URL, title, and flat category, while a pre-existing baseline
  subscription is untouched by the import.

Updating the pinned image or digest requires an explicit contract review,
fixture re-run, and compatibility-matrix update — see
`docs/plans/226-freshrss-test-architecture-docker-contract.md`.

## Ticket 12: first live run, and three real findings

The 2026-09-09 live run needed exactly one fix before it passed: the
original ticket-11 "uncategorized feed reports an empty `categories` array"
assumption was wrong the very first time it ran against a real server (see
finding 2 below), which the harness itself caught and this ticket corrected
in `run-contract.mjs`. After that fix, a full run -- readiness, discovery,
paging, all three state mutations, the OPML round trip, and restart
persistence -- passed end to end. The run also surfaced three findings that
are not scenario failures (they do not affect `overallPassed`) but are
genuine, source-verified discrepancies worth a maintainer's attention:

1. **FreshRSS auto-creates a demo subscription for a new account.** The
   pinned image's `FRESHRSS_INSTALL`/`FRESHRSS_USER` first-boot provisioning
   subscribes the new account to `https://github.com/FreshRSS/FreshRSS/releases.atom`
   by default, unrelated to anything this harness seeds. It never broke a
   check here (every check matches fixtures by URL fragment, never an exact
   subscription count), but a future contributor adding a strict count
   assertion should know about it.
2. **FreshRSS's `subscription/list` response never has an empty
   `categories` array**, for any feed, including ones a user never
   explicitly categorized. Every feed always belongs to some category,
   including FreshRSS's own built-in default one -- observed here (English
   locale) as the literal label `"Uncategorized"`. This means
   `subscription.categoryLabel` in `src/services/freshrss-sync-client.ts`
   is, in practice, never `null` for a real account, so the
   `folder: subscription.categoryLabel || "Uncategorized"` fallback in
   `src/services/freshrss-sync-coordinator.ts` (initial local-placement
   logic) is effectively dead code -- the local folder name for a
   FreshRSS-side "uncategorized" feed is actually FreshRSS's own
   configured default-category display name (locale/account-dependent), not
   a guaranteed literal `"Uncategorized"`. It only reads that way in this
   run because the pinned image's default locale's default category happens
   to be named exactly that string. Worth a follow-up ticket to confirm this
   is the intended behavior across locales/accounts, or to make the
   coordinator's fallback intent explicit either way.
3. **FreshRSS's `tag/list` response has no `label` field for a user-created
   label** -- confirmed by reading FreshRSS's own `p/api/greader.php`
   `tagList()` handler, which builds a label entry as
   `{ id, type: 'tag', unread_count }`, never `label`. `parseTagListResponse`
   in `src/services/freshrss-sync-client.ts` falls back to `entry.id` as
   `displayName` whenever `entry.label` is absent -- but `entry.id` for a
   label is the *full opaque tag id* (e.g. `"user/-/label/Contract Label"`,
   not `"Contract Label"`). That flows into `buildLabelMappings`'
   `normalizeFreshRssLabelName` in `src/services/freshrss-facet-mutations.ts`,
   which would key a label mapping by the lowercased opaque id string
   instead of the label name. Worth a follow-up ticket against
   `parseTagListResponse`'s `displayName` fallback -- likely stripping a
   known `user/-/label/` (or per-user `user/<name>/label/`) prefix from
   `entry.id` rather than using it verbatim.

The full sanitized artifact from that run (`contract-result-2026-09-09T20-00-22-224Z.json`,
git-ignored, not committed) is the source for the exact scenario list and
finding text above; a fresh run produces a fresh timestamped artifact with
the same shape.

## Pinned image

```
ghcr.io/freshrss/freshrss:1.29.1@sha256:ab6b363102ccdbc39f6a62db926f567c61a5289bf25ba460f1c34423d8cc1a4d
```

- `1.29.1` was FreshRSS's current stable release as of 2026-09-09 (confirmed
  via `gh api repos/FreshRSS/FreshRSS/releases`; FreshRSS 1.30.0 had been
  tagged in the source repository the same day but had not yet had a
  published Docker image at the time this was pinned — `docker pull
  freshrss/freshrss:1.30.0` 404s as of this writing). This also matches the
  `1.29.1` version named as the initial recommendation in the settled
  architecture decision (`docs/plans/226-freshrss-test-architecture-docker-contract.md`).
- The digest was resolved two independent ways, without a running Docker
  daemon, and both agreed:
  1. The Docker Hub v2 API (`hub.docker.com/v2/repositories/freshrss/freshrss/tags/1.29.1`).
  2. A direct Docker Registry HTTP API v2 manifest `HEAD` request against
     `ghcr.io/v2/freshrss/freshrss/manifests/1.29.1` (and, separately,
     `registry-1.docker.io`) with a bearer token from the registry's own
     anonymous-pull token endpoint.
- This is a **real, registry-verified digest**. It has since also been
  confirmed by an actual `docker pull`/`docker compose up` in the ticket-12
  live run on 2026-09-09 -- `docker compose pull` and `docker compose up
  --wait` both succeeded against this exact reference with no digest
  mismatch.
- `latest` and `edge` are never used by this required contract, per the
  ticket.

## Prerequisites

- Docker with the `compose` CLI plugin (`docker compose version`). GitHub's
  `ubuntu-latest` runners have both preinstalled; for local use, Docker
  Desktop or a Linux Docker Engine install both work.
- Node.js (the version already required by this repository, `>=20.19.0`).
  No extra npm dependencies are needed — the harness is plain Node using
  only built-in modules (`node:http`, `node:child_process`, the global
  `fetch`, and Node's built-in test runner).
- Network access to pull `ghcr.io/freshrss/freshrss` and `node:22-alpine`
  the first time (both are then cached locally).

## Commands

All commands run from the repository root.

```bash
# The full pinned Docker read contract: brings up the compose project, waits
# for real readiness (not just HTTP liveness), seeds fixtures, runs every
# scenario, writes a sanitized artifact, and always tears down afterward —
# on success or failure.
npm run contract:freshrss

# Just the deterministic fixture HTTP server's own tests. These need no
# Docker and no network beyond the loopback interface, so they run as part
# of this repository's ordinary (non-Docker) validation.
npm run test:freshrss-fixtures

# Manual/local-debugging equivalents:
docker compose -f docker/freshrss-contract/docker-compose.yml \
  --env-file docker/freshrss-contract/.env up -d --build --wait
docker compose -f docker/freshrss-contract/docker-compose.yml \
  --env-file docker/freshrss-contract/.env down --volumes --remove-orphans
```

`npm run contract:freshrss` accepts one flag: `--keep`, which skips teardown
*only* on a fully passing run (a failing run always tears down), so you can
open `http://localhost:8090` in a browser and poke at the seeded instance
before cleaning up by hand with the `docker compose down` command above.

`npm run test:unit`, `npm run lint`, `npm run check:compliance`, and
`npm run build` never invoke Docker or this harness — that separation is a
hard requirement of the ticket, not just a convention.

## Deterministic fixtures

`docker/freshrss-contract/fixtures/manifest.mjs` is the single source of
truth for the fixture data; the RSS/Atom XML files in the same directory and
the contract runner's own expectations both derive from it, so they cannot
drift apart silently. It declares:

- **Contract Feed A** (RSS 2.0) — category `Category A`, 3 articles. Used
  for readiness/discovery/2-page pagination/content-retrieval and the
  original ticket-11 read-state mutation.
- **Contract Feed B** (Atom) — category `Category B`, 2 articles.
- **Contract Feed C** (RSS 2.0) — uncategorized, 2 articles. Ticket 12 also
  uses this feed as the OPML scenario's pre-existing baseline subscription
  (seeded before the mid-run OPML import, then checked afterward for an
  unchanged URL/title/category).
- **Contract Feed D** (RSS 2.0, ticket 12) — uncategorized, 5 articles.
  Seeded at boot like A/B/C. Exercises a deeper 3-page item-ID enumeration
  (n=2 over 5 articles: pages of 2, 2, 1, with a null continuation only on
  the last) and the read/starred/mapped-label state-mutation scenarios,
  each against its own control article so a mutation's absence on an
  untouched article is provable, not just its presence on the mutated one.
- **Contract Feed E** (RSS 2.0, ticket 12, exported as `OPML_ROUND_TRIP_FEED`)
  — categorized under `Category E`, 1 article. Deliberately **not** part of
  `FIXTURE_FEEDS`/`seed-subscriptions.opml` -- FreshRSS has never heard of it
  until the OPML round-trip scenario imports it mid-run through RSS
  Dashboard's real `generateFreshRssSubscriptionOpml` export. Still served by
  the fixture HTTP server (see `ALL_SERVED_FEEDS`, the union of the two
  fixture lists) so it is fetchable the moment it is needed.

`docker/freshrss-contract/fixture-server.mjs` serves every feed in
`ALL_SERVED_FEEDS` byte-for-byte on every request (read once at startup,
never regenerated) plus a `/healthz` route. It runs both as a standalone
process (used by `fixture-server.test.mjs`, which starts it on an ephemeral
loopback port — no Docker, no external network) and inside the
`fixture-server` container the compose project builds from
`fixture-server.Dockerfile`.

`docker/freshrss-contract/fixtures/seed-subscriptions.opml` (feed-a through
feed-d only) is imported into the FreshRSS container via
`cli/import-for-user.php` at the start of every contract run, referencing
the fixture server by its compose service name (`http://fixture-server:8081/...`).
Ticket 12's OPML round-trip scenario separately writes a second,
runtime-generated OPML file (RSS Dashboard's own export for feed-e, plus a
deliberate duplicate-URL entry to exercise duplicate-collapse) to
`docker/freshrss-contract/tmp/` -- a git-ignored, writable bind mount
(`/contract-tmp` in the container; see `docker-compose.yml`) distinct from
the read-only `/contract-fixtures` mount -- and imports that mid-run through
the same CLI command.

**Every fixture identity — `feed-a`, `article-a1`, ... — is a stable
*logical* key chosen by this harness.** FreshRSS's own subscription IDs
(`feed/…`), stream IDs, tag IDs, and article IDs are opaque values the
contract runner discovers from FreshRSS's responses at run time (matched
back to a fixture by comparing the subscription's reported URL against the
fixture's known file name, or -- for the label ticket 12 creates at runtime
-- by comparing a discovered tag/list entry's `id` against the label name
the harness itself chose) and are never hardcoded, assumed, or parsed for
structure.

## Why the endpoint already includes `/api/greader.php`

FreshRSS serves its Google-Reader-compatible API from the fixed PHP entry
point `p/api/greader.php` (confirmed by reading that file directly:
`github.com/FreshRSS/FreshRSS/blob/edge/p/api/greader.php`, and by FreshRSS's
own developer docs, which show every example request against
`https://freshrss.example.net/api/greader.php/...`). RSS Dashboard's
"FreshRSS endpoint" setting is deliberately the **full API base address**
(placeholder text: `https://reader.example.com/api/greader.php`) — the exact
string FreshRSS's own settings page labels "Your API address" and expects
users to copy verbatim — not the bare site root. `src/services/freshrss-connection-service.ts`
and `src/services/freshrss-sync-client.ts` build every request URL by
appending a path directly onto that stored endpoint (e.g.
`${endpoint}/accounts/ClientLogin`), and the entire existing FreshRSS test
suite already encodes this convention consistently. This harness's
`greader-client.mjs` follows the same convention (`baseUrl` already includes
`/api/greader.php`) so it independently exercises the exact same request
shapes.

This was checked carefully during this ticket specifically because a
same-looking bug (missing `/api/greader.php` prefix) looked plausible at
first read of the two `src/services/freshrss-*.ts` files in isolation; it
turned out to be correct once the settings UI and the rest of the FreshRSS
test suite were checked. No `src/` runtime code needed to change for this
ticket.

## Independent verification, not shared code -- except where the point is the opposite

`docker/freshrss-contract/lib/greader-client.mjs` is a small, independent
Google-Reader-API client written only for this harness. It deliberately does
**not** import `src/services/freshrss-sync-client.ts` or
`freshrss-connection-service.ts` — reusing the plugin's own request-building
code here would let a shared bug in both agree with itself instead of being
caught. Field names in `greader-client.mjs` mirror what the plugin's
TypeScript client expects (see that file's `parse*` helpers), so any
mismatch this harness finds against the real pinned server is a genuine
reconciliation finding for the mocked corpus, not a self-confirmation. The
three findings recorded above came from exactly this kind of independent
re-implementation disagreeing with `src/services/freshrss-sync-client.ts`'s
assumptions.

Ticket 12's OPML round-trip scenario makes the **opposite** choice on
purpose, for a different reason. `docker/freshrss-contract/lib/opml-export-bridge.mjs`
compiles and calls the real, production
`generateFreshRssSubscriptionOpml` from `src/services/freshrss-opml-export.ts`
(via esbuild, since that module has no Obsidian runtime dependency) rather
than re-implementing an OPML generator for the harness. The OPML scenario's
entire purpose is to prove that *RSS Dashboard's actual export* imports
correctly into a real FreshRSS instance -- re-implementing the generator
here would test a second, hand-written generator against FreshRSS, not RSS
Dashboard's own. See that file's own doc comment for the fuller reasoning.

Everything this document and the harness assert about FreshRSS's response
shapes (`subscriptions[].id/title/url/categories[].label`, `tags[].id/type`,
`itemRefs[].id`, `continuation`, `items[].id/title/content.content/summary.content/alternate[].href/published`,
the exact `OK` edit-tag acknowledgment body, and the OPML export shape) was
originally derived from reading FreshRSS's own API implementation
(`p/api/greader.php`) and developer documentation, and has since been
**confirmed against an actual live response** by the 2026-09-09 ticket-12
run (with one correction along the way -- see finding 2 above, about
`categories` never being empty). Any future contract run against a
different FreshRSS version should be treated as re-verifying these shapes,
not assuming they still hold.

## Artifacts

A successful or failed run writes a sanitized JSON artifact to
`docker/freshrss-contract/artifacts/contract-result-<timestamp>.json`
(git-ignored — do not commit run output). It records:

- the pinned image reference, tag, and digest;
- the FreshRSS version reported by the running container (via
  `FRESHRSS_VERSION`, read through `cli`, never the API);
- readiness (`reachable`, `clientLogin`, `readProbe`, `modificationTokenProbe`,
  `fixtureDataObserved`);
- every relative API path actually exercised during the run;
- one pass/fail result per scenario, with an optional safe `detail` string;
- `findings` (ticket 12): a list of sanitized, human-readable strings for a
  real, observed discrepancy between this run and a mocked-corpus or
  production-code assumption. A finding is informational -- it never affects
  `overallPassed` -- and always defaults to `[]` when a run has none.
- `overallPassed`.

It never records a credential, auth header value, session token, or
modification token — `docker/freshrss-contract/lib/artifact.mjs` asserts
this structurally (any string value under a password/token/secret/auth/
session/cookie-shaped key throws instead of being silently written), and
`artifact.test.mjs` covers that guarantee directly.

In CI (`.github/workflows/freshrss-docker-contract.yml`), the same directory
is uploaded as the `freshrss-docker-contract-result` workflow artifact on
every run, pass or fail.

## Cleanup

`run-contract.mjs` runs `docker compose down --volumes --remove-orphans`
in a `finally` block on both success and failure, so the compose project's
containers, network, and named volume (`rss-dashboard-freshrss-contract`,
`rss-dashboard-freshrss-contract-network`,
`rss-dashboard-freshrss-contract-data`) are always removed unless you pass
`--keep` to a run that fully passed. Nothing this harness creates is shared
with, or can affect, any other Docker resource on the machine — every name
it creates is prefixed accordingly.

If a run is interrupted in a way `run-contract.mjs` cannot catch (e.g. the
process is killed with `SIGKILL`), clean up by hand with the
`docker compose down` command shown above.

## What has and has not been verified

Verified without Docker (part of this repository's ordinary, deterministic
validation):

- `npm run test:freshrss-fixtures` — the fixture server's own behavior
  (deterministic byte-identical responses, correct content types, 404 for
  unknown routes, the fixture-set shape including ticket 12's feed-d/feed-e
  additions), the pure `wait-for`/`artifact` helper logic, the
  `opml-compare.mjs` OPML parser against a hand-built sample modeled on
  FreshRSS's real export shape, and `opml-export-bridge.mjs` actually
  compiling and calling the real production
  `generateFreshRssSubscriptionOpml` — all via Node's built-in test runner,
  no Docker and no network beyond compiling a local file.
- `npm run test:unit` (full suite), `npm run check:compliance`,
  `npm run check:platform`, `npx tsc -noEmit -skipLibCheck`, and the esbuild
  production bundle step all pass with this harness present, and the
  ordinary unit suite has no dependency on Docker or this harness (it lives
  entirely outside `test_files/unit/`, the only directory
  `vitest.config.mjs` discovers tests from).
- Every file this harness added or changed passes
  `npx eslint docker/freshrss-contract --max-warnings=0` with zero errors
  and zero warnings, and `npm run lint` run repository-wide is clean (zero
  errors, zero warnings). Ticket 12 originally hit a pre-existing,
  unrelated repo-wide `obsidianmd/no-unsupported-api` backlog here (stale
  `manifest.json` `minAppVersion` vs. APIs already used elsewhere in
  `src/`); it was resolved by merging `origin/dev`'s compatibility work and
  raising `minAppVersion` to `1.11.4` (see commit `7db727b` and the
  "Compatibility matrix" section below) -- not something ticket 12 or 13
  needed to fix from scratch.

**Verified live, against the real pinned container, on 2026-09-09** (see
"Ticket 12: first live run" above for the full finding list):

- `docker compose up`/`docker compose pull` against the exact pinned
  reference, with both containers reaching each other over the compose
  network (`INTERNAL_HOST_ALLOWLIST`, the `fixture-server` service name).
- `FRESHRSS_INSTALL`/`FRESHRSS_USER` non-interactive first-boot provisioning.
- `cli/import-for-user.php`, `cli/actualize-user.php`, and
  `cli/export-opml-for-user.php` all behaving as this harness assumes.
- Every live HTTP scenario in `run-contract.mjs`: readiness, subscription/tag
  discovery, category placement (after the finding-2 fix), multi-page item-ID
  enumeration with real continuation cursors, content retrieval, the exact
  `OK` edit-tag acknowledgment for read/starred/label mutations, the OPML
  round trip (export → import → FreshRSS re-export → compare, including
  duplicate-collapse and baseline preservation), and restart persistence of
  every seeded/imported subscription and every state mutation.
- The healthcheck and readiness-polling timing in `docker-compose.yml` and
  `run-contract.mjs` (no timeout was hit across three full runs).

**Still not verified anywhere:**

- A CI run of `.github/workflows/freshrss-docker-contract.yml` itself --
  only local runs have happened so far. GitHub-hosted-runner-specific
  timing, network, or Docker-in-Docker differences could still surface
  something the local runs did not.
- Repeated/flake-resistance confidence beyond four local runs total: three on
  the machine that implemented ticket 12 (one caught the finding-2 bug, two
  clean passes after the fix) and one independent clean pass, with no new
  findings, on the machine that implemented ticket 13.
- The scheduled/manual "previous stable image" advisory job -- deliberately
  left a stub in this ticket; see the workflow file's `TODO` comment.
- Anything about a FreshRSS version other than the exact pinned
  `1.29.1`/digest above.

A CI run is still warranted before treating this harness's results as fully
settled beyond the finite compatibility matrix below.

## Compatibility matrix (ticket 13)

This is the complete, tested compatibility boundary. It lists only what has
actually been exercised by an automated suite or a live Docker run described
above -- nothing broader.

| Boundary | Exact tested value | What was exercised | Evidence |
| --- | --- | --- | --- |
| Obsidian FreshRSS capability gate | Obsidian 1.11.4+ with a usable `App.secretStorage` surface; below 1.11.4, or 1.11.4+ with an unusable SecretStorage surface, is treated as capability-unavailable | Below-gate: FreshRSS stays visible but disabled, no SecretStorage read, no network call, no local-state mutation. At/above gate: SecretStorage-backed controls operate. | Mocked-Obsidian-version pure-unit and settings-DOM tests (e.g. `test_files/unit/settings/freshrss-settings-tab.test.ts`, capability-evaluator unit tests); this is an Obsidian capability contract tested outside Docker, per the settled #226 architecture decision. |
| FreshRSS server | `ghcr.io/freshrss/freshrss:1.29.1@sha256:ab6b363102ccdbc39f6a62db926f567c61a5289bf25ba460f1c34423d8cc1a4d` (reported `FRESHRSS_VERSION`: `1.29.1`) | Readiness (reachability, `ClientLogin`, authenticated read probe, modification-token probe, seeded-fixture visibility); subscription/tag discovery and category placement; multi-page item-ID enumeration with real continuation cursors; content retrieval; read, starred, and mapped-label-membership mutations with the exact `OK` acknowledgment, each proven not to leak onto an untouched control article; restart persistence of every seeded/imported subscription and all three mutated facets; RSS Dashboard's real `generateFreshRssSubscriptionOpml` export imported into FreshRSS and round-tripped through FreshRSS's own OPML re-export, including duplicate-URL collapse and preservation of a pre-existing baseline subscription. | `npm run contract:freshrss` sanitized artifacts: `contract-result-2026-09-09T20-00-22-224Z.json` (ticket 12) and `contract-result-2026-09-09T21-41-30-766Z.json` (ticket 13), both `overallPassed: true`, 21 scenarios each, both git-ignored/not committed. |
| Exercised FreshRSS API paths | `accounts/ClientLogin`, `reader/api/0/user-info`, `reader/api/0/token`, `reader/api/0/subscription/list`, `reader/api/0/tag/list`, `reader/api/0/stream/items/ids`, `reader/api/0/stream/items/contents`, `reader/api/0/edit-tag` | Exactly these paths, recorded per-run in each artifact's `exercisedApiPaths`. No other Google-Reader-API endpoint (e.g. subscription/edit, rename, delete) is exercised or claimed. | Same two contract artifacts. |
| FreshRSS versions NOT tested | Everything except the exact pinned `1.29.1` image/digest above -- including `1.30.0`, `latest`, `edge`, and any older stable release | Not exercised; no claim is made about them | N/A -- absence of evidence, stated explicitly per the settled #226 decision that an untested version never broadens or narrows this matrix |
| CI execution of this contract | Not yet run | The `FreshRSS Docker contract` GitHub Actions workflow has not had its first execution as of this matrix's publication (2026-09-09); all runs so far are local | See "What has and has not been verified" above |

This matrix supersedes any looser claim elsewhere in project documentation.
If a document states FreshRSS compatibility more broadly than this table
(for example, an unbounded "supports FreshRSS" statement, a claim about
remote subscription/category/label management, or a claim about a FreshRSS
version other than `1.29.1`), that document is wrong and should be corrected
to match this matrix.
