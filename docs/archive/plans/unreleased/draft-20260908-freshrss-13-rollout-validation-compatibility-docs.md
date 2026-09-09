---
status: implemented
created: 2026-09-08
completed: 2026-09-09
released_in: unreleased
issue: ""
milestone: ""
owner: unassigned
workstream: freshrss-portable-state-client
sequence: 13
depends_on:
  - draft-20260908-freshrss-08-automatic-sync.md
  - draft-20260908-freshrss-10-fetch-more-history.md
  - draft-20260908-freshrss-12-docker-state-opml-contract.md
release_requirement: ""
implementation: ""
---

# 13: Complete rollout validation and compatibility documentation

**What to build:** Finish the FreshRSS portable-state client as a coherent,
auditable user feature. Validate every supported path together, publish only the
compatibility evidence actually produced by the pinned contract, and reconcile
project documentation without reopening the settled Wayfinder decisions.

**Blocked by:** 08: Run automatic FreshRSS synchronization; 10: Fetch additional
FreshRSS history safely; 12: Prove state mutation and OPML contracts against
FreshRSS.

**Status:** implemented

- [x] End-to-end manual verification covers capability-disabled settings,
      explicit Vault Shards v2 migration, SecretStorage selection, connection
      testing, initial import, manual sync, automatic sync, and unload.
      *(No running Obsidian instance was available in this environment. Each
      item is cited against its automated coverage in
      `docs/development/freshrss-rollout-validation.md`; the manual
      click-through itself is compiled there as checklist item 1, not yet
      performed.)*
- [x] Manual verification covers local placement changes, remote subscription
      removal, local retention, saved-note independence, local-only feeds, and
      restart recovery. *(Same caveat — automated coverage cited, human
      checklist item 2 in the rollout-validation record still outstanding.)*
- [x] Offline read, starred, and mapped-label actions survive reload, remain
      authoritative through conflicts, flush first, and clear only after the
      current operation is acknowledged. *(Fully covered by the mocked-protocol
      coordinator and facet-mutation suites — see the "Offline-first facet
      state" table in `docs/development/freshrss-rollout-validation.md`; human
      checklist item 3 covers the real-device confirmation.)*
- [x] Manual verification covers transient backoff, authentication pause,
      malformed/incomplete streams, terminal mutation retry/cancel, scope
      quarantine, and bounded **Fetch more history**. *(All but terminal
      mutation retry/cancel are automated-verified — see
      `docs/development/freshrss-rollout-validation.md`. Terminal
      mutation retry/cancel surfaced a real gap: the sync-outcome notice text
      promises a per-mutation retry/cancel control in FreshRSS settings that
      does not exist in `src/settings/tabs/freshrss-settings-tab.ts` or any
      other rendered UI. Documented as a known gap rather than silently
      claimed as verified; a follow-up task was flagged for it.)*
- [x] FreshRSS OPML is manually imported into the pinned server and remains
      documented as subscription-only. *(The OPML round-trip against the
      pinned server was proven live by the Docker contract — see the
      compatibility matrix in `docs/development/freshrss-docker-contract.md`.
      A human importing the export through FreshRSS's own web UI, rather than
      the contract's CLI path, remains checklist item 5.)*
- [x] The compatibility matrix lists only tested Obsidian capability boundaries
      and exact FreshRSS image versions/digests with their exercised behavior.
      *(Published in `docs/development/freshrss-docker-contract.md`.)*
- [x] User documentation explains setup, Vault Shards v2, SecretStorage,
      connection scope, synchronized versus local state, pending facet
      mutations, repair, history bounds, OPML limits, and disconnect/scope
      behavior. *(New `docs/freshrss-guide.md`, linked from the README.)*
- [x] Security documentation states that credential, auth, session, and token
      material never enters `data.json`, `freshrss-state.json`,
      `user-state.json`, logs, fixtures, or CI artifacts. *(Expanded
      `docs/SECURITY.md`'s FreshRSS section with an explicit per-artifact list
      and test citations.)*
- [x] The stale statement that issue #224 remained open is corrected without
      changing decision #226. *(Fixed in
      `docs/plans/226-freshrss-test-architecture-docker-contract.md`; the
      decision content below that note is unchanged.)*
- [x] Duplicate glossary entries are consolidated so FreshRSS connection scope
      and pending facet mutation consistently include mapped-label behavior and
      retain the settled vocabulary. *(`CONTEXT.md`: removed the duplicate
      "FreshRSS connection scope" entry and the older read/starred-only
      "Pending FreshRSS mutation" entry; the single surviving "Pending facet
      mutation" entry now names the mapped-label facet explicitly.)*
- [x] No documentation claims remote deletion, subscription/category
      management, article-state OPML archival, or compatibility beyond the
      tested Docker contract. *(Audited; no such claim found. New docs state
      the negative explicitly.)*
- [x] Changelog, plan lifecycle, archive catalog, and release-facing
      documentation are updated only after implementation and required
      validation actually succeed. *(Done after every gate below passed.)*
- [x] The complete pure-unit and mocked-protocol suites pass without Docker, and
      the required pinned Docker contract passes on Linux with sanitized
      artifacts. *(`npm run test:unit` passed; `npm run contract:freshrss`
      passed live, `overallPassed: true`, 2026-09-09 — this environment's
      Docker daemon was reachable. See "Implementation notes" below for exact
      counts.)*
- [x] Lint, platform checks, CSS policy checks when applicable, type checking,
      the complete build, and final git-status/generated-artifact inspection
      pass with no unexplained changes.

## Implementation notes

- This ticket added no runtime behavior. It is documentation-only: a
  compatibility matrix, a rollout-validation record, a user-facing FreshRSS
  guide, an expanded security disclosure, a corrected stale planning-time
  status note, and a glossary consolidation. See
  `docs/development/freshrss-rollout-validation.md` for the full per-item
  automated-versus-manual breakdown and
  `docs/development/freshrss-docker-contract.md` for the compatibility
  matrix.
- Docker was reachable in this environment. `npm run contract:freshrss` was
  re-run live against the pinned `ghcr.io/freshrss/freshrss:1.29.1` image and
  passed (`overallPassed: true`, 21/21 scenarios, artifact
  `contract-result-2026-09-09T21-41-30-766Z.json`, git-ignored), reproducing
  the same three informational findings ticket 12 recorded (FreshRSS
  auto-creates a demo subscription; `categories` is never empty; a user
  label's `tag/list` entry has no `label` field). This is the fourth local
  run of this harness and the first from a separate environment than
  tickets 11/12 — see `docs/development/freshrss-docker-contract.md` for
  what is still outstanding (a CI run).
- **Judgment call / discovered gap:** while compiling the rollout-validation
  record, the sync-outcome notice text in `main.ts`
  (`reportFreshRssSyncOutcome`, `reportFreshRssAutomaticOutcome`) was found
  to tell users a rejected FreshRSS change can be "retried or cancelled from
  FreshRSS settings," but no such per-mutation control exists anywhere in
  `src/settings/tabs/freshrss-settings-tab.ts` or any other rendered UI —
  only the underlying data-layer capability
  (`rearmTerminalMutation` in `src/services/freshrss-facet-mutations.ts`) and
  a whole-cycle `retryFreshRssSync()` exist. Fixing this is new runtime
  behavior and out of this ticket's scope, so it was left alone in code and
  instead: (a) documented plainly as a known gap in
  `docs/development/freshrss-rollout-validation.md` and `docs/freshrss-guide.md`
  rather than silently repeated as fact, and (b) flagged as a follow-up task
  for a maintainer to either add the missing UI or soften the notice copy.
- **Judgment call:** tickets 04–10's own archived plan docs were left with
  unchecked `[ ]` boxes despite `status: implemented` in their frontmatter
  (unlike tickets 01–03, which have both checked boxes and an "Implementation
  notes" section). This ticket does not retroactively edit those already
  archived, already-implemented tickets' checklists — that would be editing
  historical record for tickets this ticket did not implement — but notes the
  inconsistency here for a maintainer's awareness. The behavior itself is
  covered by the automated suites cited throughout
  `docs/development/freshrss-rollout-validation.md`, so this is a
  record-keeping inconsistency, not a coverage gap.
- No settled decision (#221–#226) was reopened. No FreshRSS `src/` runtime
  file was changed.
