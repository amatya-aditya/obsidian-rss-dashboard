---
status: proposed
created: 2026-09-08
issue: ""
milestone: ""
owner: unassigned
workstream: freshrss-portable-state-client
sequence: null
depends_on:
  - "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/221"
  - "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/222"
  - "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/223"
  - "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/224"
  - "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/225"
  - "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/226"
release_requirement: ""
implementation: ""
---

# FreshRSS portable-state client specification

## Problem Statement

RSS Dashboard users who rely on FreshRSS do not currently have a supported way
to carry their FreshRSS subscriptions and article state into Obsidian while
continuing to use FreshRSS as the aggregation backend. They must choose between
separate, diverging read/starred/label state or an older integration branch that
does not match the current repository architecture, storage model, security
requirements, or test standards.

The integration must work offline, survive restarts and partial failures, and
avoid turning RSS Dashboard into a second subscription-management server. It
must not let remote retention or subscription removal erase local feeds,
articles, saved notes, placement, or retention choices. It also must not expose
FreshRSS credentials in ordinary plugin or vault state.

The main risk is not transport alone. A partially completed or overlapping sync
could discard a user's newer local action, replay a mutation into the wrong
FreshRSS account, clear state after an incomplete stream, or allow a normal feed
refresh to race with FreshRSS reconciliation. The feature therefore needs one
durable scope-aware state model, one serialized lifecycle, explicit failure
semantics, and a finite compatibility contract.

## Solution

Add RSS Dashboard as a FreshRSS portable-state client. A user connects one
FreshRSS connection scope, imports its subscriptions and articles, and keeps
read, starred, and mapped-label state synchronized in both directions. FreshRSS
continues to aggregate feeds; RSS Dashboard remains the user's local reading,
organization, retention, and note-saving environment.

FreshRSS is available only when RSS Dashboard uses Vault Shards v2 and Obsidian
1.11.4 or newer provides usable SecretStorage. Non-secret connection settings
remain ordinary plugin configuration, while the FreshRSS credential bundle is
resolved exclusively through a user-managed SecretStorage entry. Protocol
identity, checkpoints, and durable pending facet mutations live in a versioned
`freshrss-state.json` sidecar alongside Vault Shards v2 metadata.

Every FreshRSS sync cycle is serialized with ordinary feed-data mutation. It
flushes pending desired state before reading remote state, imports and
reconciles only complete authoritative results, persists progress safely, and
uses bounded retries and backoff. A pending facet mutation remains authoritative
until FreshRSS acknowledges its current operation with a successful response
and `OK` body.

A dedicated FreshRSS OPML profile exports subscriptions and flat category
placement as UTF-8 OPML 2.0. It is intentionally subscription-only and makes no
claim that OPML archives article bodies, read/starred state, labels, or FreshRSS
server history.

## User Stories

1. As a FreshRSS user, I want to connect RSS Dashboard to my FreshRSS account, so that I can read my aggregated subscriptions in Obsidian.
2. As an existing RSS Dashboard user, I want FreshRSS to be an optional integration, so that my current local-only workflow remains unchanged.
3. As a user on an older Obsidian version, I want FreshRSS settings to remain visible but disabled with an explanation, so that I understand why the integration is unavailable.
4. As a user on Obsidian 1.11.4 or newer, I want RSS Dashboard to verify that SecretStorage is actually usable, so that credentials are never silently downgraded to plaintext storage.
5. As a user on Legacy JSON or Vault Shards v1, I want an explicit Vault Shards v2 migration choice, so that enabling FreshRSS never silently changes my storage mode.
6. As a user who declines migration, I want FreshRSS to remain disabled without changing my data, so that my storage decision is respected.
7. As a security-conscious user, I want my FreshRSS username and API password or token kept in SecretStorage, so that vault and plugin state do not expose them.
8. As a user with multiple SecretStorage entries, I want to select the entry RSS Dashboard should use, so that the plugin does not manage or overwrite unrelated secrets.
9. As a user changing the selected secret, I want the previous SecretStorage entry preserved, so that RSS Dashboard does not delete user-managed credentials.
10. As a user configuring an endpoint, I want invalid or credential-bearing URLs rejected before connection, so that the connection scope is unambiguous and secrets are not embedded in configuration.
11. As a user, I want a non-mutating connection test, so that I can verify login, authenticated reads, and write-authentication readiness without changing subscriptions or article state.
12. As a user, I want connection results to distinguish unsupported capability, missing credentials, rejected credentials, server failure, and success, so that I know what action to take.
13. As a user who changes endpoint or account, I want the old remote namespace quarantined, so that pending actions are never sent to a different server or user.
14. As a user with an untested replacement endpoint or account, I want synchronization to remain paused until the new scope passes a connection test, so that RSS Dashboard does not guess remote identity.
15. As a FreshRSS user, I want my subscriptions imported as FreshRSS-linked feeds, so that I do not have to recreate them locally.
16. As a user with a matching local feed, I want RSS Dashboard to link it without creating an obvious duplicate, so that my dashboard stays tidy.
17. As a user with ambiguous duplicate local feed URLs, I want RSS Dashboard to report the ambiguity instead of guessing, so that it does not attach the wrong local feed to a remote subscription.
18. As a user importing a FreshRSS subscription for the first time, I want its title and category placement used for the initial local feed, so that the imported dashboard starts organized.
19. As a user who later reorganizes a FreshRSS-linked feed, I want its local folder placement preserved, so that remote categories do not undo my dashboard organization.
20. As a user with local-only feeds, I want them excluded from FreshRSS article-state synchronization, so that connecting FreshRSS does not change unrelated data.
21. As a user whose FreshRSS subscription is removed remotely, I want the local feed and its configuration retained, so that remote subscription lifecycle does not delete local work.
22. As a user whose FreshRSS server no longer retains an article, I want the local copy governed only by RSS Dashboard retention, so that remote absence is never interpreted as local deletion.
23. As a user, I want saved status, saved-note paths, playback progress, and other local-only article state to remain independent, so that FreshRSS sync cannot damage my local reading workflow.
24. As a user, I want FreshRSS articles to retain their opaque remote identity, so that synchronization does not depend on parsing GUIDs, URLs, titles, or server-specific identifier shapes.
25. As a user, I want read and unread changes made in FreshRSS or another FreshRSS client reflected locally, so that article state stays portable.
26. As a user, I want starred and unstarred changes made in FreshRSS or another FreshRSS client reflected locally, so that favorites stay portable.
27. As a user, I want FreshRSS article labels represented by dashboard tags with matching normalized names, so that label membership stays portable.
28. As a user, I want dashboard tag colors to remain local, so that remote labels do not overwrite presentation choices.
29. As a user with local-only or automatic dashboard tags, I want only known FreshRSS label mappings synchronized, so that the integration does not create or mutate unrelated remote labels.
30. As an offline user, I want read, starred, and mapped-label actions recorded durably, so that my intent survives reloads until FreshRSS can accept it.
31. As a user who changes the same article facet repeatedly while offline, I want only my latest absolute choice sent, so that stale toggles cannot undo the final state.
32. As a user, I want a pending local choice to override older pulled state, so that another client's stale value does not erase my unacknowledged intent.
33. As a user, I want a pending action removed only after FreshRSS acknowledges the current operation, so that delayed acknowledgments cannot discard a newer choice.
34. As a user whose local retention removes an article, I want its pending remote action retained, so that the requested FreshRSS state change is still delivered.
35. As a user, I want pending mutations sent before remote state is pulled, so that synchronization begins by honoring my outstanding local intent.
36. As a user, I want manual, startup, and scheduled FreshRSS syncs to share one serialized lifecycle, so that they cannot race each other.
37. As a user, I want FreshRSS synchronization serialized with ordinary feed refreshes and imports that mutate feed data, so that concurrent writers cannot corrupt article state.
38. As a user who triggers sync while one is running, I want requests coalesced into at most one trailing cycle, so that repeated actions do not create an unbounded queue.
39. As a user on an unreliable connection, I want bounded retries and backoff, so that transient failures recover without request storms.
40. As a user with rejected credentials, I want only one fresh authentication attempt before automatic sync pauses, so that the plugin does not loop on invalid credentials.
41. As a user, I want malformed responses and repeated continuation cursors treated as incomplete, so that partial server output is never mistaken for complete state.
42. As a user, I want capped or interrupted streams to preserve prior checkpoints and avoid clearing absent state, so that partial enumeration cannot cause data loss.
43. As a user, I want successful pages to be safely repeatable after a later failure, so that resuming from an old checkpoint does not duplicate articles or lose state.
44. As a user, I want one concise result for a manual sync and quiet automatic success, so that sync is understandable without becoming noisy.
45. As a user facing a terminal mutation error, I want the desired state and actionable repair information retained, so that the failure is visible and recoverable.
46. As a user, I want to export a FreshRSS-specific OPML file, so that I can recreate my subscription set in FreshRSS.
47. As a user with nested local folders, I want the export to project them deterministically into FreshRSS's flat categories, so that placement is as portable as FreshRSS permits.
48. As a user with duplicate feed URLs, I want deterministic deduplication and a warning, so that the export is accepted without silently hiding what changed.
49. As a user importing the OPML into FreshRSS, I want existing baseline subscriptions preserved, so that the portability workflow does not replace unrelated server subscriptions.
50. As a user, I want the OPML UI and documentation to state that it contains subscriptions only, so that I do not mistake it for an article-state backup.
51. As a maintainer, I want deterministic mocked protocol failures, so that retry, cursor, acknowledgment, and reconciliation behavior can be developed test-first.
52. As a maintainer, I want Docker contract tests separate from the ordinary unit suite, so that routine development remains fast and deterministic.
53. As a maintainer, I want the required FreshRSS image pinned by digest, so that compatibility failures correspond to an explicit server build.
54. As a maintainer, I want contract artifacts to record the FreshRSS build and exercised API paths, so that compatibility claims are finite and auditable.
55. As a maintainer, I want fixture identities separate from opaque FreshRSS identifiers, so that tests never encode accidental server ID formats.
56. As a maintainer, I want credential, session, and token persistence assertions at every layer, so that future refactors cannot leak secrets into `data.json`, `freshrss-state.json`, or `user-state.json`.

## Implementation Decisions

### Product and compatibility boundary

- RSS Dashboard is a FreshRSS portable-state client. FreshRSS remains the
  aggregation backend.
- Version 1 imports subscriptions, articles, read state, starred state, and
  mapped label membership. It writes read, starred, and mapped-label article
  mutations back to FreshRSS.
- FreshRSS functionality requires both Vault Shards v2 and the FreshRSS
  capability gate. Neither requirement changes the plugin-wide Obsidian
  baseline for users who do not use FreshRSS.
- The FreshRSS capability gate passes only on Obsidian 1.11.4 or newer when the
  expected SecretStorage API exists and is usable. A version string alone is
  insufficient.
- FreshRSS remains visible in settings when unavailable. Controls are disabled
  and the UI explains whether the user must update Obsidian or migrate to Vault
  Shards v2.
- Migration from Legacy JSON or Vault Shards v1 uses the existing explicit
  Vault Shards v2 migration workflow. Declining or failing migration leaves
  FreshRSS disabled and does not partially initialize FreshRSS state.
- Automatic FreshRSS sync is opt-in. Its dedicated interval defaults to 15
  minutes and is independent of ordinary per-feed refresh intervals. Manual
  sync remains available while automatic sync is off if the connection is
  ready.

### Connection configuration, credentials, and scope

- Non-secret configuration contains the enabled flag, user-entered FreshRSS
  base endpoint, selected SecretStorage entry reference, automatic-sync flag,
  dedicated interval, and compact durable status. It never contains credential,
  auth, session, or modification-token values.
- The endpoint is an absolute HTTP or HTTPS FreshRSS base URL. Canonicalization
  lowercases scheme and host, removes default ports, query, fragment, and a
  trailing slash, and preserves the deployment path. URLs containing embedded
  credentials are rejected. Protocol paths are appended to this canonical base.
- The authenticated FreshRSS user identity comes from a successful
  authenticated probe and is stored as an opaque value. A FreshRSS connection
  scope is the canonical endpoint plus that authenticated user identity, not
  the entered username alone.
- One user-managed SecretStorage entry contains the FreshRSS API username and
  API password or token. RSS Dashboard persists only the selected entry
  reference and does not delete an old entry when the selection changes.
- `data.json`, `freshrss-state.json`, and `user-state.json` must never contain
  credential values, auth values, session material, modification tokens, or
  test credentials. Logs, notices, errors, fixtures, and CI artifacts must also
  redact them.
- Auth values, sessions, and modification tokens are memory-only and scoped to
  the active endpoint and authenticated user. Endpoint, user, or secret-reference
  changes invalidate the in-memory session immediately.
- A changed connection remains a candidate configuration until a successful
  connection test proves its scope. Automatic and manual sync do not run against
  an untested candidate scope.
- When a successful connection test identifies a scope different from the
  active sidecar scope, the previous namespace is quarantined before the new
  empty namespace becomes active. No remote binding, checkpoint, or pending
  facet mutation crosses scopes.
- The non-mutating FreshRSS connection test performs ClientLogin, an
  authenticated read-only identity/capability probe, and a modification-token
  probe. It does not call article mutation endpoints or change subscriptions,
  categories, labels, read state, or starred state.
- Connection state distinguishes capability-unavailable,
  storage-migration-required, credentials-unconfigured, test-required,
  credentials-rejected, server-unavailable, connected, authentication-paused,
  persistence-blocked, partial, and connected-with-terminal-actions.
- Missing capability or credentials causes sync to skip without network access
  or local data mutation. Pending facet mutations remain durable.

### Versioned FreshRSS sidecar

- Vault Shards v2 owns a versioned `freshrss-state.json` sidecar in the same
  vault-metadata folder as `user-state.json`. The sidecar is separate from
  retention-pruned article user state and feed-content shards.
- The first schema version contains the active FreshRSS connection scope,
  quarantined namespaces, remote bindings, normalized label mappings, pending
  facet mutations, enumerated-stream checkpoints, optional tested content
  watermarks, and the last durable sync outcome.
- Each namespace is meaningful only inside its stored connection scope.
  Quarantined namespaces are preserved for diagnosis or explicit user-directed
  cleanup but are excluded from normal reads, writes, and replay.
- Known older schema versions are migrated explicitly and losslessly before a
  cycle can run. Unsupported, malformed, or incomplete sidecar data is
  preserved and quarantined; it blocks FreshRSS sync instead of being replaced
  with an empty file.
- A new Vault Shards v2 FreshRSS connection starts with an empty version-1
  sidecar. Existing local article state is not reverse-engineered into remote
  bindings or pending mutations.
- A feed binding maps a local stable feed ID to the complete opaque remote
  subscription stream reference returned by FreshRSS.
- An article binding maps a local `(feed ID, local GUID)` identity to the exact
  opaque remote article ID returned by FreshRSS.
- A label mapping is keyed by a normalized label name and stores the exact
  remote tag reference plus its returned kind. Read and starred system streams
  remain dedicated facets and do not become dashboard tags.
- Label-name normalization is shared by pull, mutation capture, and lookup: trim
  surrounding whitespace and compare case-insensitively using a locale-independent
  lower-case key. The chosen display spelling and dashboard color remain local.
- Remote references are stored and compared as-is. They are never generated,
  shortened, parsed, or inferred from URLs, titles, GUIDs, fixture order, label
  text, or OPML structure.
- Sidecar writes use the repository's watcher-suppression and vault-adapter
  conventions. A completed write must be observable before its associated
  checkpoint or acknowledgment is considered durable.

### Pending facet mutations

- Only FreshRSS articles with a valid active-scope remote article binding can
  create pending facet mutations.
- Synchronizable facets are `read`, `starred`, and one
  `label:<normalized name>` facet for each known FreshRSS label mapping. Local
  tags without a known mapping remain local and do not create remote labels.
- A pending facet mutation records one opaque operation ID, the scoped opaque
  remote article ID, facet, absolute desired boolean state, creation time,
  attempt count, last-attempt time, and structured error state.
- The sidecar contains at most one current pending record for each remote
  article ID and facet. A newer local decision replaces the prior record with a
  new operation ID and absolute desired value.
- Capturing a FreshRSS-linked local state change occurs under the shared
  data-sync lease. The sidecar mutation is durably written before the matching
  local facet is committed. If sidecar persistence fails, the synchronized
  facet change is not reported as committed and the user receives an actionable
  local persistence error. Local-only articles and local-only facets continue
  through their existing behavior.
- Pending desired state overlays pulled remote state and remains authoritative
  in memory and on reload until FreshRSS acknowledges the current operation.
- A mutation is acknowledged only by a successful HTTP response whose body is
  exactly the FreshRSS success result `OK`. Transport success alone is not an
  acknowledgment.
- An acknowledgment removes a record only when its operation ID still matches
  the current record. A delayed response for an older operation cannot remove a
  newer desired state.
- An acknowledged mutation batch is removed and persisted before the cycle
  advances to remote pulls. A crash after remote acknowledgment but before
  local persistence may safely resend the idempotent absolute desired state.
- Local retention may remove the article and `user-state.json` entry but never
  removes its unacknowledged pending facet mutation, because the record contains
  the direct opaque remote article ID.
- Non-retryable mutation errors keep the desired state with a terminal error.
  They are not automatically replayed. Explicit repair can retry after fixing
  the binding or mapping, or cancel the pending intent only after an explicit
  user action.

### Subscription and article import

- Each successful cycle reads FreshRSS subscription and tag lists before item
  reconciliation.
- An unbound remote subscription first attempts deterministic matching against
  one local feed with the same canonical feed URL. Exactly one match is linked;
  no match creates a new FreshRSS-linked feed; multiple matches produce an
  ambiguity warning and remain unbound until repaired.
- Initial creation uses FreshRSS's title and flat category as the starting local
  title and folder placement. Subsequent synchronization may update the remote
  supplied title but never moves the local feed after its initial placement.
- A newly needed folder is created through the existing folder model. FreshRSS
  categories are treated as one flat placement value, not reconstructed as a
  remote hierarchy.
- A complete subscription list that omits a formerly linked subscription marks
  the binding inactive but does not delete the local feed, local configuration,
  articles, placement, retention settings, or sidecar history.
- Article contents are merged by the exact opaque article and subscription
  references. Local GUIDs are normal RSS Dashboard identities; their mapping to
  FreshRSS IDs is stored explicitly.
- Imported remote content participates in the existing content-shard,
  deduplication, rendering, and retention behavior. FreshRSS does not create a
  separate remote-only article store.
- Read, starred, and mapped-label state is applied through Vault Shards v2 user
  state while preserving saved status, saved-file path, playback progress,
  dashboard tag color, local-only tags, and other local-only fields.
- Remote article or subscription absence is never treated as article deletion.
  RSS Dashboard retention and capacity limits remain the only automatic local
  article-lifecycle authority.
- Saving or deleting a note does not create FreshRSS mutations. FreshRSS state
  never deletes or rewrites an existing saved note.

### Serialized FreshRSS sync lifecycle

- One FreshRSS sync coordinator owns manual, startup, timer, and explicit retry
  triggers. A cycle also takes a shared data-sync lease used by ordinary feed
  refresh and background ingestion, so feed or article state has one writer at
  a time.
- The coordinator permits one active FreshRSS cycle. Triggers received while it
  runs coalesce into at most one trailing cycle. Unload cancels timers and
  prevents a late result from committing after ownership has ended.
- Startup sync is scheduled only after settings, content shards,
  `user-state.json`, and `freshrss-state.json` are hydrated and only when
  automatic FreshRSS sync is enabled and ready.
- A successful automatic cycle rearms the dedicated interval from completion.
  Transient failures rearm from their backoff deadline. Authentication, scope,
  capability, and persistence blocks do not spin a timer; they wait for repair,
  configuration change, successful connection test, or explicit retry.
- A cycle snapshots the active sidecar namespace before network work and then
  performs the following ordered phases:
  1. Validate capability, Vault Shards v2, tested active scope, credentials, and
     persistence readiness.
  2. Authenticate or reuse a valid in-memory session.
  3. If pending records exist, obtain a fresh modification token immediately
     before dispatch and flush pending facet mutations.
  4. Read subscription and tag lists and reconcile bindings and mappings.
  5. Enumerate bounded item-ID streams for all content, unread, starred, and
     each known normalized label.
  6. Fetch missing article contents, merge bindings and state, and overlay
     still-pending desired facets.
  7. Persist content shards, `user-state.json`, bindings, sidecar state, and
     eligible checkpoints under the shared lease.
  8. Record the durable outcome, release the lease, refresh relevant views once,
     notify as appropriate, and rearm scheduling.
- Pending mutation dispatch uses deterministic batches of at most 50 facet
  changes, one request in flight. The sidecar is persisted after every
  acknowledged batch.
- Item-ID streams use page sizes of 1,000 and a cycle-local continuation cursor.
  Missing contents are fetched in batches of at most 100.
- The default history bootstrap budget is 25,000 IDs per relevant stream. A
  budget-capped stream is partial, not complete, and cannot authoritatively
  clear state based on absence.
- Remote absence may clear read, starred, or mapped-label state only when the
  relevant stream was fully enumerated, all required content and local writes
  succeeded, and no pending local mutation protects that facet.
- A malformed, missing-when-required, or repeated continuation cursor stops the
  affected phase. The cycle records a partial result and does not advance the
  stream checkpoint or clear absent facets.
- Earlier successfully persisted pages may remain after a later failure. The
  next eligible cycle restarts from the last complete checkpoint and may safely
  reread those pages without duplicating local articles.
- Enumerated-stream checkpoints advance only after every page, content fetch,
  merge, and required local write for that stream succeeds. An optional
  modified-content watermark follows the same completion rule.
- A tested FreshRSS `ot` content query may later optimize content transfer. It
  is capability-gated and never replaces IDs-first stream enumeration as the
  correctness path.

### Failure, retry, and outcome behavior

- Network failures, timeouts, HTTP 408, HTTP 429, and HTTP 5xx keep pending
  state and old checkpoints. Each request receives at most three in-cycle
  attempts with delays of 1, 2, and 4 seconds plus bounded jitter.
- After in-cycle transient retries are exhausted, automatic cycles use
  exponential backoff beginning at 5 minutes and capped at 6 hours. A successful
  cycle resets backoff.
- On HTTP 401, HTTP 403, or rejected session/token state, the coordinator
  discards its session and performs one fresh login from the current
  SecretStorage value. A second rejection stops the cycle and enters FreshRSS
  authentication pause.
- Authentication pause performs no automatic retry. A credential-reference or
  scope change, a successful connection test, or an explicit retry after user
  action is required to resume.
- HTTP 400, HTTP 404, HTTP 422, unknown item/binding, and invalid label
  operations are terminal for the affected pending record. The cycle retains
  that desired state for repair and continues only where correctness is not
  compromised.
- Malformed responses, repeated cursors, incomplete streams, and local write
  failures stop the affected phase. They never claim mutation success, stream
  completion, or checkpoint advancement.
- FreshRSS supplies no portable rate-limit guarantee. The client therefore uses
  one in-flight request, bounded batches, bounded retries, and the defined cycle
  backoff rather than adaptive concurrency.
- Durable outcomes include success, partial-transient, authentication-blocked,
  capability-blocked, scope-test-required, persistence-blocked, and
  success-with-terminal-actions. They include safe timestamps and counts but no
  secret, session, token, or full response-body material.
- Manual sync shows one summary notice after the durable outcome is recorded.
  Automatic success is quiet. Automatic cycles notify only when the outcome
  changes or user action becomes required.

### Settings and operational controls

- The FreshRSS settings section contains the endpoint, SecretStorage reference,
  storage/capability explanation, connection test, enablement, automatic-sync
  toggle, dedicated interval, Sync now action, compact last outcome, and the
  next actionable blocked reason.
- The enablement action cannot complete until Vault Shards v2 is active and the
  candidate connection has passed the non-mutating connection test.
- Sync now uses the same coordinator path as startup and scheduled sync. It does
  not bypass serialization, capability, persistence, scope, retry, or
  authentication rules.
- Terminal pending records expose their article when still local, facet,
  desired state, safe error category, attempt time, and explicit retry/cancel
  actions. The first release does not require a historical sync ledger.
- A separate Fetch more history action extends bootstrap beyond the default
  25,000-ID budget for a selected FreshRSS-linked feed. It remains bounded per
  invocation, uses the same coordinator and checkpoints, and never changes the
  correctness meaning of a capped stream.
- Status UI uses the repository glossary terms, especially FreshRSS connection
  scope, pending facet mutation, quarantined FreshRSS namespace, FreshRSS
  authentication pause, Docker contract, and compatibility matrix.

### FreshRSS OPML export profile

- FreshRSS export is a dedicated profile. The existing generic RSS Dashboard
  OPML exporter remains behaviorally unchanged.
- The profile emits valid UTF-8 OPML 2.0. Every feed outline contains `text`,
  `title`, `type="rss"`, and the exact feed `xmlUrl`. It includes `htmlUrl` or
  description only when RSS Dashboard already has a reliable value.
- Uncategorized feeds are direct children of the OPML body.
- A nested local folder path is projected into one flat FreshRSS category.
  Within each folder segment, `%` becomes `%25` and `/` becomes `%2F`; escaped
  segments are joined with `/`. This is a presentation projection, not a
  promise to reconstruct a remote hierarchy.
- Identical feed URLs are deduplicated deterministically. The first feed in
  stable dashboard order supplies the exported metadata, and the export result
  reports every collapse as a warning.
- The profile contains no credentials, tokens, sessions, FreshRSS sidecar data,
  RSS Dashboard settings, article content, read/starred state, dashboard tags,
  FreshRSS labels, saved-note state, or `frss:*` extension fields.
- Category projection is export-only. Normal synchronization never manages
  FreshRSS subscription or category lifecycle.
- The UI and generated artifact description call this a subscription export,
  not a backup or article-state archive.

### Compatibility contract

- The supported FreshRSS boundary is the Docker contract, not an unbounded
  claim about every FreshRSS release.
- The required Linux CI contract pins one official stable FreshRSS image by
  exact version and digest. The implementation starts from the then-reviewed
  stable image; `latest` and `edge` are never the required job.
- One previous stable image may run as a scheduled or manual non-blocking
  compatibility job after its digest is recorded.
- Updating a required image or digest requires an explicit contract review,
  fixture run, and compatibility-matrix update.
- Contract readiness requires container reachability, successful ClientLogin,
  an authenticated read-only probe, a modification-token probe, and observable
  seeded fixtures. HTTP liveness alone is insufficient.
- The harness uses isolated test-owned data, deterministic runtime credentials,
  and a local deterministic RSS/Atom fixture server. It tears down only its own
  compose project and volume on success or failure.
- Contract artifacts record the image tag and digest, reported FreshRSS
  version/build, exercised API paths, scenario results, and no secret values.

## Testing Decisions

### Test philosophy and confirmed primary seam

- Tests assert externally observable behavior: network request transcripts,
  persisted vault state, public coordinator outcomes, visible settings state,
  notices, and scheduling. They do not assert private helper calls or mirror an
  internal implementation sequence more narrowly than the product contract
  requires.
- The confirmed highest practical seam is the public FreshRSS sync coordinator
  cycle with injected protocol, sidecar, Vault Shards v2 persistence,
  credential/session, clock/backoff, and notification dependencies.
- Mocked-protocol scenarios enter through that coordinator seam and observe the
  whole cycle. This is high enough to cover flush-before-pull ordering, pending
  authority, scope quarantine, serialization, stream completeness, checkpoint
  rules, local persistence, and user-visible outcomes together.
- Testing only the lower-level protocol client is insufficient because it
  cannot prove cycle-wide ordering and persistence guarantees. Driving every
  scenario through the plugin class is unnecessarily coupled to Obsidian UI and
  timers. The coordinator is the narrowest boundary that still expresses the
  full FreshRSS behavior.
- Prior art is the dependency-injected service boundary used by
  BackgroundImportService, its focused plugin-orchestration coverage, the
  vault-backed FeedStorageRepository tests, the rearmable FeedRefreshScheduler
  tests, and OpmlManager's XML behavior tests.
- A small plugin-level suite verifies only wiring that exists above the
  coordinator: settings actions, startup/manual/timer triggers, unload, one
  trailing cycle, one final view refresh, and the shared data-sync lease with
  ordinary refresh/background ingestion.

### Pure unit layer

- Pure unit tests cover endpoint canonicalization, capability evaluation,
  SecretStorage surface detection, connection-state transitions, session
  invalidation, label normalization, error classification, retry/backoff
  calculation, operation coalescing, stale acknowledgment rejection, scope
  transitions, sidecar validation/migration/quarantine, and stream-completeness
  decisions.
- Vault-stub repository tests prove creation and hydration of an empty version-1
  sidecar, known-version migration, malformed/unsupported preservation,
  namespace quarantine, watcher-suppressed writes, pending-record retention
  beyond article retention, and absence of secret material.
- OPML unit tests prove XML validity, UTF-8 declaration, required attributes,
  reliable optional fields, uncategorized placement, flat category projection,
  `%` and `/` escaping, deterministic duplicate handling, stable warnings, and
  exclusion of all article-state and secret data.
- Settings DOM tests use jsdom and the Obsidian stubs, clean DOM and mocks after
  each test, and assert visible/disabled/actionable behavior at capability,
  storage, credential, connection, pause, partial, and terminal states.
- Local mutation tests enter through observable article actions and prove that
  FreshRSS-linked synchronized facets durably queue before commit, while
  local-only articles, saved-note state, playback progress, and local-only tags
  retain existing behavior.

### Mocked protocol layer

- The fake protocol records method, endpoint, safe headers, parameters, body,
  ordering, and concurrency while never recording raw secrets. It returns a
  sanitized golden response corpus.
- Happy-path coverage includes ClientLogin, authenticated identity/read probe,
  modification token, subscription list, tag list, content/unread/starred/label
  item-ID streams, content batches, edit-tag acknowledgment, persistence, and
  one final outcome/view refresh.
- Fault fixtures cover missing and rejected credentials, one 401
  reauthentication, repeated rejection, timeouts, HTTP 408/429/5xx, HTTP
  400/404/422, malformed JSON or text, missing fields, malformed continuation,
  repeated continuation, abruptly incomplete streams, local write failure,
  delayed acknowledgment, and stale acknowledgment ordering.
- Paging tests prove 1,000-ID pages, 100-item content batches, the 25,000-ID
  bootstrap cap, no false completion at the cap, and no absent-state clearing
  after partial enumeration.
- Mutation tests prove deterministic batches of at most 50, one request in
  flight, a fresh modification token immediately before mutation dispatch,
  sidecar persistence after each acknowledged batch, and pending-first ordering.
- Reconciliation tests prove exact opaque-reference matching, deterministic
  URL bootstrap linking, ambiguous-match refusal, initial category placement,
  later local-placement preservation, remote-title handling, local-only feed
  isolation, inactive remote subscription preservation, and remote absence not
  causing deletion.
- State tests prove that read, starred, and each mapped label reconcile in both
  directions while dashboard tag color, unmapped tags, saved-note fields,
  playback progress, and retention behavior remain local.
- Recovery tests prove that a crash or failure after page N restarts from the
  old complete checkpoint, safely rereads persisted pages, avoids duplicate
  articles, and cannot remove a current pending operation through an old
  acknowledgment.
- Serialization tests prove that all FreshRSS triggers coalesce to one active
  and at most one trailing cycle, and that the shared data-sync lease prevents
  overlap with ordinary feed refresh and background ingestion.
- Persistence-security tests inspect every serialized artifact after successful,
  partial, rejected-authentication, and malformed-sidecar scenarios and prove
  that credential, auth, session, modification-token, and test-secret values are
  absent.

### Docker contract layer

- Docker contract tests are a separate command and CI job; they are never part
  of the ordinary unit-test suite or required for local unit-test execution.
- Stable logical fixture keys identify two categorized feeds, one uncategorized
  feed, and enough deterministic articles to exercise paging. The harness
  discovers all remote subscription, stream, tag, and article IDs from
  FreshRSS responses.
- The required contract verifies authentication and readiness, subscription and
  tag discovery, item-ID and content behavior, read/starred/mapped-label
  mutations, modification tokens, server acknowledgment format, restart
  persistence, opaque ID handling, and the protocol assumptions used by the
  mocked corpus.
- The OPML acceptance scenario is: RSS Dashboard FreshRSS subscription export,
  FreshRSS import, FreshRSS feed-list export, then comparison of URLs, titles,
  flat categories, duplicate-collapse expectations, and preservation of a
  pre-existing baseline subscription.
- The OPML scenario explicitly does not assert credentials, article bodies,
  read/starred state, labels, sidecar data, or FreshRSS archival state.
- The Obsidian 1.11.4 and SecretStorage matrix is tested outside Docker because
  it is an Obsidian capability contract, not FreshRSS server behavior.
- Initial contract completion publishes only the tested image/version/digest
  and exercised capabilities. A failure on an untested FreshRSS version does
  not retroactively broaden or narrow the documented matrix.

### Acceptance gate

- All pure-unit and mocked-protocol scenarios pass without Docker.
- The pinned required Docker contract passes on Linux and emits the sanitized
  compatibility artifact.
- Ordinary feed refresh, local-only feeds, retention, saved-note behavior,
  playback progress, generic OPML export, and plugin-wide Obsidian compatibility
  retain their regression coverage.
- Every changed TypeScript file passes ESLint and type checking; source changes
  pass the platform check; the complete repository build passes; and final git
  status contains no unexpected generated artifacts.
- Manual verification covers capability-disabled settings, explicit Vault
  Shards v2 migration, connection testing, initial import, local placement,
  offline pending mutations, manual and scheduled sync, authentication pause,
  terminal repair, Fetch more history, FreshRSS OPML import, and restart
  recovery.

## Out of Scope

- Reusing, merging, or reviving PR #73 or its implementation architecture.
- Running a FreshRSS server inside RSS Dashboard or replacing FreshRSS as the
  aggregation backend.
- FreshRSS account administration, user creation, API-password management,
  rules, extensions, server configuration, or feed-specific server settings.
- Creating, renaming, moving, or deleting FreshRSS subscriptions, categories,
  or labels through normal synchronization.
- Treating remote subscription removal or remote article absence as authority
  to delete local feeds or articles.
- Synchronizing local feed folder placement after initial import.
- Synchronizing dashboard tag colors, unmapped/local-only tags, saved state,
  saved-note files or paths, playback progress, highlights, local templates,
  reader settings, or retention configuration.
- Remote article deletion, local article deletion propagation, or shared
  retention policy.
- Reverse-engineering existing local articles into FreshRSS bindings or
  uploading pre-existing local state without a learned opaque remote identity.
- Creating remote FreshRSS labels from unmapped dashboard tags.
- Claiming that the FreshRSS OPML profile archives article bodies, read/starred
  state, labels, sidecar state, credentials, or server history.
- Making the generic RSS Dashboard OPML exporter use FreshRSS's flat-category
  projection.
- Unbounded history enumeration in one cycle or treating the optional `ot`
  optimization as a correctness dependency.
- A detailed historical sync ledger, cross-scope merge UI, automatic replay of
  terminal mutations, required `edge` testing, or an unbounded FreshRSS version
  support promise.
- Raising the plugin-wide minimum Obsidian version.

## Further Notes

### Settled decision sources

- Issue #221 defines the FreshRSS portable-state-client destination and is
  closed as a completed Wayfinder map.
- Issue #222 settles Vault Shards v2 ownership, the versioned sidecar, opaque
  scoped identity, quarantine, and pending facet mutation authority.
- Issue #223 settles the dedicated subscription-only FreshRSS OPML profile and
  its round-trip acceptance contract.
- Issue #224 settles the Obsidian 1.11.4 SecretStorage capability gate,
  credential boundary, connection test, connection states, and authentication
  pause.
- Issue #225 settles serialization, pending-first cycle order, paging and batch
  bounds, checkpoint completeness, retries/backoff, and failure behavior.
- Issue #226 settles the pure-unit, mocked-protocol, and pinned-Docker-contract
  layers and fixture vocabulary.
- These decisions are inputs to implementation and are not reopened by this
  specification.

### Documentation reconciliation

- The accepted #226 local plan contains a stale statement that issue #224 was
  open at planning time. Issue #224 is now closed; implementation documentation
  should correct the statement without changing its decision.
- The glossary currently contains an older duplicate FreshRSS connection-scope
  entry and an older pending-mutation description that mentions only read and
  starred state. The leading glossary definitions and the settled decisions
  include normalized-label facets. Documentation cleanup should consolidate the
  duplicates while preserving the terms FreshRSS connection scope and pending
  facet mutation.
- The exact required FreshRSS image digest and compatibility matrix remain
  data-dependent until the first contract harness run. They must be recorded,
  not guessed in this draft.

### Proposed implementation tickets

The following are implementation tickets to create after this local draft is
accepted. The identifiers are local dependency labels, not GitHub issue
numbers.

| Ticket | Deliverable                                                                                                                                                                             | Blocked by                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| F1     | FreshRSS domain contracts and versioned sidecar repository, including validation, migration, quarantine, bindings, mappings, checkpoints, durable outcomes, and pending facet mutations | Settled decisions #221–#226 only                    |
| F2     | Capability gate, SecretStorage adapter, endpoint canonicalization, connection test, candidate/active scope transition, and connection-state model                                       | F1                                                  |
| F3     | FreshRSS protocol client, memory-only session/token handling, response validation, error classification, retry policy, and sanitized mocked response corpus                             | F1                                                  |
| F4     | Shared data-sync lease, FreshRSS sync coordinator, trigger coalescing, startup/manual/timer wiring, bounded scheduling, and compact durable outcomes                                    | F2, F3                                              |
| F5     | Subscription, tag, article, and article-state import/reconciliation with opaque bindings, paging, content batching, checkpoint safety, and local lifecycle boundaries                   | F4                                                  |
| F6     | Local read/starred/mapped-label mutation capture, durable coalescing, pending-first edit-tag dispatch, stale-acknowledgment safety, and terminal repair state                           | F5                                                  |
| F7     | Dedicated FreshRSS OPML export profile, deterministic warnings, UI entry point, and subscription-only documentation                                                                     | No FreshRSS runtime ticket; may proceed in parallel |
| F8     | Operational settings and status UX for enablement, automatic interval, Sync now, authentication pause, terminal retry/cancel, and bounded Fetch more history                            | F4, F5, F6                                          |
| F9     | Pinned FreshRSS Docker contract harness, deterministic fixture server, Linux CI job, OPML round-trip, restart persistence, and compatibility artifact                                   | F2, F3, F5, F6, F7                                  |
| F10    | Final integration hardening, complete regression/manual validation, glossary and stale-plan cleanup, security/user documentation, and compatibility matrix publication                  | F8, F9                                              |

### Blocking edges

- F1 blocks F2 and F3 because scope, identity, and persistence contracts must be
  stable before credentials or protocol responses can activate a namespace.
- F2 and F3 jointly block F4 because the coordinator requires a proven active
  scope and a complete protocol/session boundary.
- F4 blocks F5 because reconciliation must run inside the serialized lifecycle
  and shared data-sync lease.
- F5 blocks F6 because outbound mutations require learned active-scope article
  and label bindings, even though F6's pure coalescing tests may begin earlier.
- F4, F5, and F6 jointly block F8 because operational controls must report and
  repair real coordinator, reconciliation, and mutation outcomes.
- F7 has no runtime dependency and may be implemented in parallel after ticket
  intake; it does not alter the generic OPML exporter.
- F2, F3, F5, F6, and F7 jointly block F9 because the Docker contract must
  exercise the actual security, protocol, inbound state, outbound state, and
  OPML contracts rather than a partial harness.
- F8 and F9 block F10 and the feature's release gate. No compatibility matrix is
  published before F9 records an exact image digest and successful results.

The critical implementation path is F1 → F2/F3 → F4 → F5 → F6 → F8 → F10.
F7 proceeds in parallel and joins the path at F9; F9 also joins F10.
