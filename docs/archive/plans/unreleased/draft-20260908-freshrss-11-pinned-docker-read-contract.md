---
status: implemented
completed: 2026-09-09
released_in: unreleased
issue: ""
implementation: ""
---

# 11: Prove the read contract against pinned FreshRSS

**What to build:** Establish the first real-server Docker contract for the
implemented secure connection and manual import path. A deterministic Linux
harness must prove the read assumptions against one exact official FreshRSS
build while remaining separate from normal unit tests.

**Blocked by:** 03: Import FreshRSS subscriptions and recent articles manually.

**Status:** implemented, live Docker run outstanding — see "Implementation
notes and validation caveat" below before relying on this ticket for the
ticket-13 compatibility matrix.

- [x] The required contract uses one reviewed official stable FreshRSS image
      pinned by exact version and digest; `latest` and `edge` are not used by the
      required job.
- [x] The harness runs on Linux in a separate local command and CI job, and the
      ordinary unit suite requires neither Docker nor network access.
- [x] A compose-scoped FreshRSS instance uses an isolated test-owned volume and
      runtime-only deterministic credentials.
- [x] A local deterministic RSS/Atom fixture server supplies at least two
      categorized feeds, one uncategorized feed, and stable article content.
- [ ] Readiness requires container reachability, ClientLogin, an authenticated
      read-only probe, a modification-token probe, and observable seeded fixture
      data. *(Implemented and structurally reviewed; not yet exercised against
      a live container — see caveat below.)*
- [x] Stable logical fixture identities are distinct from every opaque remote
      subscription, stream, tag, and article ID discovered from FreshRSS.
- [ ] The contract proves subscription/tag discovery, item-ID enumeration,
      content retrieval, initial local placement, opaque binding persistence,
      and local-only lifecycle boundaries. *(Raw-protocol discovery,
      enumeration, content retrieval, and mutation are implemented as live
      HTTP scenarios; "initial local placement" and "local-only lifecycle
      boundaries" as plugin reconciliation behavior are not driven through
      this harness — see scope note below.)*
- [ ] Restarting the FreshRSS container with the test-owned volume preserves the
      seeded account and contract data used by the read path. *(Scenario
      implemented; unproven without a live run.)*
- [x] Success and failure both tear down only the compose project and
      test-owned volume.
- [x] CI artifacts record image tag/digest, reported FreshRSS version/build,
      exercised API paths, readiness, and scenario results without credentials,
      auth values, sessions, or modification tokens. *(The redaction guarantee
      itself is unit-tested; the recorded values will only be real once a live
      run produces them.)*
- [ ] The mocked response corpus is reconciled with the observed pinned-server
      shapes without weakening malformed/incomplete-response validation.
      *(Reconciled against FreshRSS's own API source and developer docs, not
      an observed live response — no mocked test or fixture was changed. See
      caveat below.)*
- [x] Local contract documentation explains prerequisites, commands,
      deterministic fixtures, artifacts, cleanup, and the finite compatibility
      claim.
- [ ] Focused tests, the ordinary unit suite, lint/type checks for harness code,
      the pinned Docker read contract, and final generated-artifact inspection
      pass. *(Everything except the live pinned Docker read contract itself
      passed in this environment — no Docker daemon was reachable. See
      caveat below.)*

## Implementation notes and validation caveat

This ticket was implemented in an environment where the Docker CLI was
present but its daemon was unreachable (`docker info` failed with
`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file
specified`). Per explicit instruction for this iteration, the harness was
built completely and correctly to the best of available research, but **no
live `docker compose up` run against the pinned FreshRSS container has
happened yet, in any environment.** See
`docs/development/freshrss-docker-contract.md` ("Status of this harness" and
"What has and has not been verified in this environment") for the full,
itemized breakdown of what was and was not exercisable without Docker.

What shipped:

- `docker/freshrss-contract/` — compose file pinning
  `ghcr.io/freshrss/freshrss:1.29.1@sha256:ab6b363102ccdbc39f6a62db926f567c61a5289bf25ba460f1c34423d8cc1a4d`
  (tag and digest independently resolved and cross-checked via two registry
  APIs, without a Docker daemon); a deterministic Node fixture HTTP server
  (`fixture-server.mjs`, with real, passing tests under
  `npm run test:freshrss-fixtures`) serving 2 categorized + 1 uncategorized
  RSS/Atom feed; a contract runner (`run-contract.mjs`) that seeds
  subscriptions via the FreshRSS CLI, runs readiness/discovery/paging/
  content/mutation/restart-persistence scenarios through an independent
  minimal Google-Reader-API client (`lib/greader-client.mjs`, deliberately
  not reusing `src/services/freshrss-sync-client.ts`), and writes a
  sanitized JSON artifact; and always tears down the compose project and its
  named volume, on success or failure.
- `.github/workflows/freshrss-docker-contract.yml` — a separate Linux CI job
  (path-filtered, plus `workflow_dispatch`) that uploads the artifact
  directory regardless of outcome.
- `docs/development/freshrss-docker-contract.md` — prerequisites, exact
  commands, the fixture model, artifact contents, cleanup, and the finite
  compatibility claim.
- A new `eslint.config.mjs` scoped rule block for
  `docker/freshrss-contract/**/*.mjs`, matching the existing precedent for
  `test_files/**/*.ts`: this is standalone Node tooling, not Obsidian plugin
  runtime code, so the mobile/`requestUrl`/popout-timer rules do not apply
  to it. No rule was weakened for `src/**` or `main.ts`.

Scope boundary on "the contract proves ... initial local placement ... and
local-only lifecycle boundaries": this harness proves the **raw FreshRSS
protocol contract** (what the server actually returns, and in what shape) —
that is the part a mocked test suite structurally cannot prove and the part
that specifically needs Docker. It does not drive RSS Dashboard's own
`FreshRssSyncCoordinator` reconciliation logic (initial local folder
placement, retaining a local feed after remote subscription removal, etc.)
against the live container; that reconciliation logic is already covered by
the mocked-protocol coordinator suite in
`test_files/unit/services/freshrss-sync-coordinator.test.ts`, which assumes
the exact response shapes this harness is meant to confirm. Wiring the real
coordinator through this harness (rather than the independent
`greader-client.mjs`) is a reasonable next step but a materially larger
lift, and was not attempted in this iteration.

During research for this ticket, a same-looking discrepancy was checked
carefully and ruled out: `src/services/freshrss-connection-service.ts` and
`freshrss-sync-client.ts` build request URLs by appending paths directly
onto the stored "FreshRSS endpoint" setting (e.g.
`${endpoint}/accounts/ClientLogin`) with no `/api/greader.php` prefix. Read
in isolation this looks like a missing prefix — FreshRSS's real Google
Reader API entry point is `p/api/greader.php`, confirmed by reading that
file directly. It is not a bug: the "FreshRSS endpoint" setting is
deliberately the full API base address (placeholder
`https://reader.example.com/api/greader.php`, matching FreshRSS's own "Your
API address" UX), and the entire existing FreshRSS test suite already
encodes this convention consistently. No `src/` runtime file was changed for
this ticket; see "Why the endpoint already includes `/api/greader.php`" in
`docs/development/freshrss-docker-contract.md` for the full reasoning trail,
kept there so a future contributor does not re-derive and mis-fix the same
thing.
