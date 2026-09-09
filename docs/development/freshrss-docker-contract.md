# FreshRSS pinned Docker read contract

Last updated: 2026-09-09
Related: ticket 11 of the FreshRSS portable-state-client workstream
(`docs/archive/plans/unreleased/draft-20260908-freshrss-11-pinned-docker-read-contract.md`),
architecture decision `docs/plans/226-freshrss-test-architecture-docker-contract.md`
(issue [#226](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/226)).

## Status of this harness

This harness (compose file, fixture server, contract runner, CI job) is
implemented and every part of it that can run without a Docker daemon has
been exercised in this repository's normal validation (see "What has and has
not been verified" below). **It has not yet had a successful — or any —
live run against the pinned FreshRSS container**, because the environment
that built it had no reachable Docker daemon (`docker info` failed with
`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file
specified`). Docker's CLI was present; only the daemon was unreachable.

Before this harness's results can be trusted or cited by the compatibility
matrix (ticket 13):

1. Run `npm run contract:freshrss` locally on a machine with Docker running,
   or let the `FreshRSS Docker contract` GitHub Actions workflow run, and
   confirm it actually reaches, seeds, and tears down the pinned container.
2. Fix whatever the first real run finds — compose syntax, timing/readiness
   windows, CLI seeding flags, or a genuine protocol shape mismatch. Nothing
   below should be treated as proven until that happens.
3. Only then does the `overallPassed` field in a produced contract artifact
   mean anything.

## What this proves, and its finite compatibility claim

This harness proves RSS Dashboard's FreshRSS read-path protocol assumptions
against **one exact, pinned FreshRSS build** — not an open-ended claim about
every FreshRSS version. Specifically, once it has had a successful run, it
demonstrates against that pinned image:

- The container is reachable, `ClientLogin` succeeds, an authenticated
  read-only probe succeeds, and a modification-token probe succeeds
  (readiness is more than HTTP liveness).
- Subscription and tag/label discovery return the seeded fixture data.
- Item-ID enumeration pages correctly, including a real continuation cursor.
- Content retrieval returns the expected fixture article titles.
- A read-state mutation is acknowledged with exactly the FreshRSS `OK` body
  and is observable afterward through the read-state stream.
- Restarting the FreshRSS container against the same test-owned volume
  preserves the seeded subscriptions and the mutation above.

Updating the pinned image or digest requires an explicit contract review,
fixture re-run, and compatibility-matrix update — see
`docs/plans/226-freshrss-test-architecture-docker-contract.md`.

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
- This is a **real, registry-verified digest**, not a placeholder — but it
  has not yet been exercised by an actual `docker pull` /
  `docker compose up` in this environment. Re-verify it (`docker compose
  pull` will fail loudly if it does not match) on the first real run.
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

- **Contract Feed A** (RSS 2.0) — category `Category A`, 3 articles.
- **Contract Feed B** (Atom) — category `Category B`, 2 articles.
- **Contract Feed C** (RSS 2.0) — uncategorized, 2 articles.

`docker/freshrss-contract/fixture-server.mjs` is a plain Node HTTP server
that serves those three XML files byte-for-byte on every request (read once
at startup, never regenerated) plus a `/healthz` route. It runs both as a
standalone process (used by `fixture-server.test.mjs`, which starts it on an
ephemeral loopback port — no Docker, no external network) and inside the
`fixture-server` container the compose project builds from
`fixture-server.Dockerfile`.

`docker/freshrss-contract/fixtures/seed-subscriptions.opml` is imported into
the FreshRSS container via `cli/import-for-user.php` at the start of every
contract run, referencing the fixture server by its compose service name
(`http://fixture-server:8081/...`).

**Every fixture identity — `feed-a`, `article-a1`, ... — is a stable
*logical* key chosen by this harness.** FreshRSS's own subscription IDs
(`feed/…`), stream IDs, tag IDs, and article IDs are opaque values the
contract runner discovers from FreshRSS's responses at run time (matched
back to a fixture by comparing the subscription's reported URL against the
fixture's known file name) and are never hardcoded, assumed, or parsed for
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

## Independent verification, not shared code

`docker/freshrss-contract/lib/greader-client.mjs` is a small, independent
Google-Reader-API client written only for this harness. It deliberately does
**not** import `src/services/freshrss-sync-client.ts` or
`freshrss-connection-service.ts` — reusing the plugin's own request-building
code here would let a shared bug in both agree with itself instead of being
caught. Field names in `greader-client.mjs` mirror what the plugin's
TypeScript client expects (see that file's `parse*` helpers), so any
mismatch this harness finds against the real pinned server is a genuine
reconciliation finding for the mocked corpus, not a self-confirmation.

Everything this document and the harness assert about FreshRSS's response
shapes (`subscriptions[].id/title/url/categories[].label`, `tags[].id/label`,
`itemRefs[].id`, `continuation`, `items[].id/title/content.content/summary.content/alternate[].href/published`,
and the exact `OK` edit-tag acknowledgment body) come from reading FreshRSS's
own API implementation (`p/api/greader.php`) and developer documentation —
**not from an actually-observed live response**, since no live run has
happened yet in any environment that built this harness. Treat these as
well-researched, source-verified assumptions the first real contract run
must confirm or correct, not as observed facts.

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

## What has and has not been verified in this environment

Verified here (no Docker daemon required):

- `npm run test:freshrss-fixtures` — the fixture server's own behavior
  (deterministic byte-identical responses, correct content types, 404 for
  unknown routes, the two-categorized/one-uncategorized fixture shape) and
  the pure `wait-for`/`artifact` helper logic, via Node's built-in test
  runner.
- `npm run lint`, `npm run check:compliance`, `npm run build`, and
  `npm run test:unit` all pass with this harness present, and the ordinary
  unit suite gained no new dependency on Docker or the harness (it lives
  entirely outside `test_files/unit/`, which is the only directory
  `vitest.config.mjs` discovers tests from).
- The pinned image tag and digest, resolved and cross-checked against two
  independent registry APIs without a Docker daemon.
- The FreshRSS request-path and response-shape assumptions, checked against
  FreshRSS's own API implementation source and developer documentation.

Not verified here, because no Docker daemon was reachable in this
environment:

- That `docker compose up` actually brings up both containers and they can
  reach each other (`INTERNAL_HOST_ALLOWLIST`, the compose network, the
  `fixture-server` service name).
- That `FRESHRSS_INSTALL`/`FRESHRSS_USER` actually provision the account
  non-interactively the way the upstream Docker README documents.
- That `cli/import-for-user.php` and `cli/actualize-user.php` seed and fetch
  the fixtures the way this harness assumes.
- That any of the live HTTP scenarios in `run-contract.mjs` actually pass
  against the real container — including the exact JSON field names, the
  exact `OK` acknowledgment body, and restart persistence.
- Any timing assumption (healthcheck `start_period`/`retries`, the
  readiness polling windows in `run-contract.mjs`).

A human or CI run with a working Docker daemon is required before any of the
above can be treated as proven.
