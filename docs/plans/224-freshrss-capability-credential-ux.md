---
status: accepted
created: 2026-09-08
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/224"
milestone: ""
owner: unassigned
workstream: "FreshRSS Wayfinder"
sequence: null
depends_on:
  - "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/222"
  - "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/225"
release_requirement: ""
implementation: ""
---

# FreshRSS capability gate and credential UX

## Decision status

Issue #224 is a completed design decision. The FreshRSS feature remains
runtime-gated and the implementation is a later follow-up. This plan stays in
`docs/plans/` until the behavior is implemented and validated.

## Resolved contract

### Capability boundary

- Keep RSS Dashboard's existing global Obsidian baseline.
- Require Obsidian 1.11.4 or newer for FreshRSS because `App.secretStorage`
  was introduced there.
- Treat the runtime capability as unavailable when the version is below
  1.11.4 or when the expected SecretStorage surface is missing or unusable.
- Do not access credentials, issue network requests, load FreshRSS session
  material, or mutate FreshRSS state while the gate is unavailable.

### Settings experience

Keep FreshRSS discoverable in settings. Below the gate, show disabled
FreshRSS controls and an explanatory notice:

> FreshRSS requires Obsidian 1.11.4 or newer because it uses Obsidian
> SecretStorage. Update Obsidian to enable FreshRSS.

The notice is explanatory and actionable in wording, but RSS Dashboard does
not attempt to update Obsidian. Existing non-secret FreshRSS configuration is
preserved. Credential controls and the connection test remain disabled until
the gate passes.

### Credential model

- Use one user-managed SecretStorage entry for the FreshRSS credential bundle.
- Persist only the SecretStorage entry name/reference in plugin settings.
- The bundle contains the FreshRSS API login material, including the username
  and API password/token required by the FreshRSS Google Reader API.
- Never write credential values, auth values, or modification tokens to
  `data.json`, `freshrss-state.json`, or `user-state.json`.
- Do not delete or overwrite a previously selected SecretStorage entry merely
  because the user selects another one.

### Connection-test behavior

The connection test is non-mutating. It performs FreshRSS `ClientLogin`, one
authenticated read-only probe, and a modification-token probe. It does not
change subscriptions, labels, read state, or starred state.

The settings surface distinguishes these outcomes:

| Outcome | Meaning | Local state effect |
| --- | --- | --- |
| Unavailable on this Obsidian version | Capability gate failed | No network request; no state mutation |
| Credentials not configured | No selected SecretStorage entry or the selected entry is missing | No network request; preserve configuration |
| Credentials rejected | FreshRSS rejected login or authenticated access | Preserve the credential entry; enter authentication pause |
| FreshRSS unavailable | Network, endpoint, TLS, timeout, or server failure | Preserve credentials and retry only under the bounded lifecycle rules |
| Connected | Read and write authentication prerequisites passed | Replace the in-memory session and allow normal sync |

FreshRSS auth values and modification tokens are memory-only. A successful
test replaces the active in-memory session. If a sync request is rejected for
authentication, discard the session, perform one fresh login using the current
SecretStorage value, and retry only within the serialized and bounded #225
cycle. A second authentication failure enters authentication pause.

### Scope changes and automatic sync

- A connection scope is the canonical endpoint plus authenticated FreshRSS
  user identity.
- Endpoint or user changes invalidate the in-memory session and activate a
  new scope only after a successful connection test.
- The old sidecar namespace and pending mutations remain quarantined and are
  never replayed into the new scope.
- Local feeds, local article state, placement, and retention remain intact;
  remote bindings are not silently reassigned.
- Changing the selected credential replaces only the stored reference. The
  prior user-managed SecretStorage entry is preserved.
- When the gate, credentials, or authentication readiness is unavailable,
  automatic FreshRSS sync skips without network access or local state
  mutation. Pending mutations remain durable, and the UI exposes a stable
  blocked reason without retry or notification loops.
- A successful capability check and connection test re-enable normal #225
  cycles. Transient transport/server failures continue to use #225's bounded
  retries and backoff.

## Implementation seams

The later implementation should provide these observable seams without
changing the settled #222 or #225 contracts:

1. A runtime capability evaluator for the 1.11.4/SecretStorage gate.
2. A settings state model covering unavailable, unconfigured, rejected,
   unavailable-server, connected, and authentication-paused states.
3. A SecretStorage adapter that resolves the selected credential bundle
   without persisting its value in plugin data or vault sidecars.
4. A connection-test service that is read-only from FreshRSS's perspective.
5. Session invalidation and one-shot reauthentication at the #225 cycle
   boundary.
6. Scope-transition handling that quarantines old state before a new scope
   can become active.

## Observable test scenarios

- Obsidian below 1.11.4 leaves FreshRSS visible but disabled and makes no
  SecretStorage or network call.
- Obsidian 1.11.4+ with a missing SecretStorage entry reports unconfigured
  credentials and preserves all local data.
- Invalid credentials report rejection, preserve the selected secret, and
  pause automatic sync.
- Endpoint, user, or credential-reference changes invalidate the session,
  quarantine the old scope, and require a successful test before sync.
- A successful test replaces the in-memory session without writing auth
  material to any persisted file.
- An authentication failure during sync causes one bounded reauthentication;
  repeated rejection pauses sync without losing pending mutations.
- Transport/server failures preserve credentials and follow #225's bounded
  retry behavior.
- Local-only feeds and local retention are unaffected by every FreshRSS
  gating or authentication outcome.

## Non-goals

- Raising RSS Dashboard's plugin-wide minimum Obsidian version.
- SecretStorage migration tooling beyond selecting or replacing a user-managed
  credential entry.
- FreshRSS account administration, subscription/category management, or
  article deletion.
- Reopening #222 or #225, changing #223's subscription-only export contract,
  or consuming #226's Docker/test architecture decisions here.

## Follow-up horizons

1. Implement and validate this contract in a dedicated FreshRSS integration
   change.
2. Add the Docker-backed and version/capability matrix coverage under #226.
3. Revisit the contract only if Obsidian changes SecretStorage availability or
   FreshRSS changes its Google Reader API authentication behavior.
