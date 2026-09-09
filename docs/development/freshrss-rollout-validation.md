# FreshRSS rollout validation record

Last updated: 2026-09-09
Ticket: 13 of the FreshRSS portable-state-client workstream
(`docs/archive/plans/unreleased/draft-20260908-freshrss-13-rollout-validation-compatibility-docs.md`),
closing tickets 01-12 (`docs/archive/plans/unreleased/draft-20260908-freshrss-01-*.md`
through `-12-*.md`) and the master spec
(`docs/archive/plans/unreleased/draft-20260908-freshrss-portable-state-client.md`).

This record exists so a maintainer can see, for every path the FreshRSS
portable-state client is supposed to support, whether it is already proven by
an automated suite, or still needs a human with a real Obsidian instance to
check it off before shipping. It does not reopen any settled decision
(#221-#226) and does not add new runtime behavior -- see the compatibility
matrix in `docs/development/freshrss-docker-contract.md` for the tested
server/Obsidian boundary this record assumes.

**This sandbox has no running Obsidian instance.** Every item below is either
backed by a cited automated test/run, or is listed in the "Manual
verification checklist" as still outstanding. No manual UI verification is
claimed anywhere in this document.

## How to read this record

- **Automated-verified**: an existing, passing automated test or live Docker
  run already exercises this behavior. The citation names the exact
  file/describe block or contract artifact.
- **Manual verification required**: this needs a human driving real Obsidian
  (desktop and/or mobile) against a real FreshRSS instance. It is listed in
  the checklist at the end of this document, grouped to match.

## Connection lifecycle

| Behavior | Status | Evidence |
| --- | --- | --- |
| Capability-disabled settings (below 1.11.4, or SecretStorage unusable): visible but disabled, no network/SecretStorage access | Automated-verified | `test_files/unit/settings/freshrss-settings-tab.test.ts` ("stays visible but disabled without reading SecretStorage when the capability is unavailable") |
| Explicit Vault Shards v2 migration choice (Legacy JSON / v1 -> v2) required before FreshRSS activates | Automated-verified | `test_files/unit/settings/freshrss-settings-tab.test.ts` ("offers the existing storage migration choice without enumerating SecretStorage entries"); storage-migration acceptance covered by the existing Vault Shards migration suite (`docs/storage-vault-shards-guide.md`'s tested migration path) | Manual verification required (see checklist) for the end-to-end human click-through |
| SecretStorage entry selection persists only a reference, never a credential value | Automated-verified | `test_files/unit/settings/freshrss-settings-tab.test.ts` ("persists only the canonical endpoint and selected SecretStorage reference") |
| Connection testing (ClientLogin, read probe, modification-token probe) is non-mutating | Automated-verified | `test_files/unit/services/freshrss-connection-service.test.ts` ("proves login, identity, and modification-token readiness without persisting authentication values", "reports rejected credentials without attempting authenticated probes"); endpoint canonicalization/credential-rejection in the same file ("canonicalizes a deployment endpoint without retaining URL credentials or transport-only parts") |
| Initial import (Sync now: link-or-create feeds, bounded article import) | Automated-verified | `test_files/unit/services/freshrss-sync-coordinator.test.ts` (top-level `describe("FreshRssSyncCoordinator")` block) |
| Manual sync (Sync now button) | Automated-verified | Same coordinator suite plus `test_files/unit/settings/freshrss-settings-tab.test.ts` wiring assertions |
| Automatic sync (opt-in, dedicated interval, startup/timer triggers, coalescing) | Automated-verified | `test_files/unit/services/freshrss-auto-sync-scheduler.test.ts`, `test_files/unit/services/freshrss-sync-trigger-coordinator.test.ts` |
| Unload cancels FreshRSS timers and blocks a late result from committing | Automated-verified | `test_files/unit/services/freshrss-auto-sync-scheduler.test.ts` (scheduler stop/unload coverage); plugin-level unload/lease coverage inherited from ticket 01's `DataSyncLease` tests |
| End-to-end human click-through of the whole connection lifecycle in real Obsidian | Manual verification required | See checklist item 1 |

## Local data ownership

| Behavior | Status | Evidence |
| --- | --- | --- |
| Local folder placement changes after initial import are never overwritten by remote category | Automated-verified | `test_files/unit/services/freshrss-sync-coordinator.test.ts` reconciliation cases (initial placement vs. later local-placement preservation) |
| Remote subscription removal never deletes the local feed/config | Automated-verified | Same coordinator suite ("a complete subscription list that omits a formerly linked subscription marks the binding inactive but does not delete...") |
| Local retention/capacity rules remain the only automatic local article-lifecycle authority; remote article absence never deletes locally | Automated-verified | Coordinator suite reconciliation cases; retention behavior itself covered by the pre-existing (non-FreshRSS) retention test suite, unchanged by this workstream |
| Saved-note state, playback progress, dashboard tag color, and other local-only fields are independent of FreshRSS sync | Automated-verified | Coordinator suite state-reconciliation cases; `docs/SECURITY.md`'s playback-progress section for the unrelated local-only field |
| Local-only feeds/articles are excluded from FreshRSS sync entirely | Automated-verified | Coordinator suite ("local-only feed isolation") |
| Restart recovery (checkpoints resume correctly, no duplicate articles) | Automated-verified | `test_files/unit/services/freshrss-sync-coordinator.test.ts` "ticket 07" describe block (paging budget, checkpoint-safe recovery); live-verified for the Docker contract's own restart scenario (see compatibility matrix) |
| Human confirmation of local placement/retention/restart behavior against a real vault | Manual verification required | See checklist item 2 |

## Offline-first facet state (read, starred, mapped label)

| Behavior | Status | Evidence |
| --- | --- | --- |
| Read/starred/label actions durably queue before local commit | Automated-verified | `test_files/unit/services/freshrss-facet-mutations.test.ts` (`captureFacetMutation`, mapped-label capture/coalescing); coordinator suite's pending-read/pending-starred/combined/mapped-label describe blocks |
| Pending state survives reload and overrides pulled remote state until acknowledgment | Automated-verified | `freshrss-facet-mutations.test.ts` (`findPendingFacetMutation`); coordinator suite reload/pending-precedence cases within each facet's describe block |
| A pending mutation is flushed (sent) before the next remote pull ("flush-first") | Automated-verified | Coordinator suite: each facet describe block's "obtains a fresh modification token and flushes a pending ... mutation ... before reading subscriptions/reading the starred stream" cases |
| A pending mutation clears only after an exact `OK` acknowledgment tied to its operation ID ("clear-only-after-ack"); a delayed/stale ack cannot remove a newer choice | Automated-verified | `freshrss-facet-mutations.test.ts` (`removeAcknowledgedMutation`); coordinator suite's stale-acknowledgment-ordering cases |
| Conflicts: a still-pending local choice is never overridden by a conflicting pulled value | Automated-verified | Coordinator suite, all three facet describe blocks |
| Human confirmation of offline queuing/reload/conflict behavior against a real vault and real FreshRSS | Manual verification required | See checklist item 3 |

## Failure handling and repair

| Behavior | Status | Evidence |
| --- | --- | --- |
| Transient backoff (network/timeout/408/429/5xx: 3 in-cycle attempts, then 5min-6hr cycle backoff) | Automated-verified | `test_files/unit/services/freshrss-retry.test.ts`, `test_files/unit/services/freshrss-backoff.test.ts`; coordinator suite "ticket 07" block |
| Authentication pause (one fresh reauth, then pause with no auto-retry) | Automated-verified | Coordinator suite ("performs exactly one fresh login retry before reporting credentials-rejected when authentication itself fails") |
| Malformed/incomplete streams never advance a checkpoint or clear absent state | Automated-verified | Coordinator suite "ticket 07" block; Docker contract's independent `greader-client.mjs` response-shape assertions |
| Terminal mutation state is retained with a safe error category and is not auto-replayed | Automated-verified | `freshrss-facet-mutations.test.ts` "terminal mutation repair" describe block (`isTerminalMutation`, `rearmTerminalMutation`); coordinator suite terminal-repair cases |
| **Terminal mutation retry/cancel UI** | **Gap found, not automated, not yet shippable as documented** | See "Known gap" below |
| Scope quarantine (endpoint/user change quarantines the old namespace, no cross-scope replay) | Automated-verified | `test_files/unit/services/freshrss-sidecar-repository.test.ts` ("quarantines a prior valid scope before activating a clean namespace", "quarantines a v1 sidecar...", "quarantines a malformed label mapping...") |
| Bounded Fetch more history (per-feed, bounded budget, same coordinator/checkpoint machinery) | Automated-verified | `test_files/unit/services/freshrss-fetch-more-history.test.ts` (`FreshRssSyncCoordinator.runFetchMoreHistory`, `selectFreshRssHistoryEligibleFeeds`) |
| Human confirmation of backoff/pause/malformed-stream/scope-quarantine/Fetch-more-history behavior against a real vault and real FreshRSS, including UI-visible outcomes | Manual verification required | See checklist item 4 |

### Known gap: terminal mutation retry/cancel UI

The sync-outcome notice text in `main.ts` (`reportFreshRssSyncOutcome`,
`reportFreshRssAutomaticOutcome`) tells the user that a rejected change can be
retried or cancelled "from FreshRSS settings." The data-layer capability
exists (`rearmTerminalMutation` in `src/services/freshrss-facet-mutations.ts`,
and `retryFreshRssSync()` in `main.ts`, which restarts a whole sync cycle),
but **no per-mutation retry or cancel control exists anywhere in
`src/settings/tabs/freshrss-settings-tab.ts` or any other rendered UI** as of
this ticket. This is a real discrepancy between shipped notice copy and
shipped UI, not a documentation-only issue, and ticket 13's scope is
documentation, not new runtime behavior -- it is deliberately **not** fixed
here. See the follow-up task flagged alongside this ticket's final report.
Until it is resolved (either by adding the UI or by softening the notice
copy), do not tell users the retry/cancel UI exists; the "Manual
verification checklist" below reflects this by asking a human to confirm
the actual current behavior rather than assuming the notice text is
accurate.

## FreshRSS OPML

| Behavior | Status | Evidence |
| --- | --- | --- |
| FreshRSS OPML export is subscription-only (no credentials, article bodies, read/starred state, labels, sidecar data) | Automated-verified | `test_files/unit/services/freshrss-opml-export.test.ts` |
| FreshRSS OPML imports into the pinned server correctly, round-trips through FreshRSS's own re-export, and preserves a pre-existing baseline subscription | Automated-verified (live) | `npm run contract:freshrss` OPML round-trip scenarios in both the ticket-12 and ticket-13 artifacts (see compatibility matrix in `docs/development/freshrss-docker-contract.md`) |
| Human import of the exported OPML into FreshRSS through the actual FreshRSS web UI (not just the CLI path the Docker contract uses) | Manual verification required | See checklist item 5 |

## Security: no credential/auth/session/token material in persisted or emitted artifacts

| Artifact | Status | Evidence |
| --- | --- | --- |
| `data.json` / plugin settings | Automated-verified | `test_files/unit/settings/freshrss-settings-tab.test.ts` ("persists only the canonical endpoint and selected SecretStorage reference") -- the settings schema has no credential field to leak |
| `freshrss-state.json` sidecar | Automated-verified | `test_files/unit/services/freshrss-sidecar-repository.test.ts` -- the sidecar schema (scope, bindings, mappings, pending facet mutations, checkpoints, durable outcome) has no credential/auth/session/token field; malformed/quarantined data is preserved and never activated, never logged with content |
| `user-state.json` | Automated-verified | Article-state fields written through the existing Vault Shards v2 user-state path carry no FreshRSS credential material; FreshRSS sync writes only read/starred/label facets there, per the coordinator suite |
| In-memory auth/session/modification-token values | Automated-verified | `test_files/unit/services/freshrss-connection-service.test.ts` ("proves login, identity, and modification-token readiness without persisting authentication values") |
| Logs, notices, errors | Automated-verified | Coordinator/connection-service suites assert notice/outcome text contains only safe counts and categories, never response bodies or secret values (see each suite's outcome-shape assertions) |
| Docker contract fixtures and CI artifacts | Automated-verified | `docker/freshrss-contract/lib/artifact.mjs` structurally throws if any string value under a password/token/secret/auth/session/cookie-shaped key would be written, covered by `artifact.test.mjs` (`npm run test:freshrss-fixtures`); this repo's `.gitignore` excludes `docker/freshrss-contract/artifacts/` so no run output is ever committed |

No manual verification is needed for this section -- it is fully provable by
static test coverage of the persisted schemas plus the artifact-writer's
structural redaction guarantee.

## Manual verification checklist

Walk through these in a real Obsidian install (desktop, and mobile where
noted) against a real FreshRSS account before shipping this feature widely.
Nothing in this checklist has been performed by this sandbox.

1. **Connection lifecycle**: On Obsidian < 1.11.4 (or with SecretStorage
   unavailable), confirm FreshRSS settings show disabled controls and an
   explanatory notice, with no network activity (check the developer
   console's network tab). On Obsidian >= 1.11.4, start from Legacy JSON or
   Vault Shards v1, trigger the explicit Vault Shards v2 migration choice,
   decline it once and confirm FreshRSS stays disabled with no partial
   state, then accept it. Create a SecretStorage entry with real FreshRSS
   credentials, select it, run **Test connection**, confirm a `connected`
   status. Run **Sync now**, confirm feeds/articles import. Enable
   **Automatic sync**, confirm a quiet startup sync after reload. Disable
   the plugin (unload) mid-cycle if possible and confirm no crash/partial
   write.
2. **Local data ownership**: After initial import, move a FreshRSS-linked
   feed to a different local folder, run another sync, and confirm the
   folder does not revert. Remove a subscription from FreshRSS directly (via
   the FreshRSS web UI) and confirm the next sync keeps the local feed and
   its articles. Save an article to the vault, then let local retention
   settings expire the source article, and confirm the saved note is
   unaffected. Add a local-only (non-FreshRSS) feed and confirm it is never
   touched by FreshRSS sync. Restart Obsidian and confirm sync resumes
   without duplicating articles.
3. **Offline-first facet state**: Disconnect network, mark several FreshRSS
   articles read/unread/starred/labeled, reload Obsidian while still
   offline, and confirm the choices persist and display correctly.
   Reconnect and sync; confirm the changes reach FreshRSS (check via the
   FreshRSS web UI or another Reader-API client) and that a value pulled
   from FreshRSS during the same cycle never reverts a still-pending local
   choice made after it.
4. **Failure handling and repair**: Simulate a transient failure (e.g. block
   the FreshRSS host briefly) and confirm sync recovers with backoff rather
   than failing permanently. Enter invalid credentials and confirm
   authentication pause with no retry loop (watch for repeated notices).
   Trigger a terminal mutation failure if practical (e.g. by racing a label
   deletion in FreshRSS against a pending label mutation) and confirm the
   actual current behavior -- **do not assume the "retry or cancel them from
   FreshRSS settings" notice text is accurate; confirm what UI, if any, is
   actually reachable, and report back if it still does not exist** (see
   "Known gap" above). Change the connection to a different FreshRSS account
   and confirm the old namespace is quarantined (no state leaks across
   scopes) and sync remains paused until a fresh connection test passes. Use
   **Fetch more history** on an eligible feed and confirm it extends history
   without duplicating articles or clearing existing state.
5. **FreshRSS OPML**: Export the FreshRSS subscription OPML from RSS
   Dashboard, import it into a real FreshRSS instance through FreshRSS's own
   web UI (Subscription management > Import), and confirm the subscriptions
   and flat categories appear as expected, with no article-state or
   credential data anywhere in the file (open it in a text editor to
   confirm).
6. **Mobile**: Repeat the connection-lifecycle and offline-first checks (1
   and 3) on Obsidian mobile, since SecretStorage and background sync timing
   can differ from desktop.

Record results of this checklist (pass/fail per item, Obsidian version,
FreshRSS version used) before treating the feature as fully validated for a
public release, and update this document if any item exposes a behavior
different from what this record claims.
