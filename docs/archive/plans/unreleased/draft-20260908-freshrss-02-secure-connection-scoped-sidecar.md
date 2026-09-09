---
status: implemented
completed: 2026-09-08
released_in: unreleased
issue: ""
implementation: ""
---

# 02: Connect FreshRSS securely and establish a scoped sidecar

**What to build:** Give a user a complete, non-mutating path from the FreshRSS
settings surface to a proven FreshRSS connection scope. The path must enforce
Obsidian and storage capabilities, resolve a user-managed credential bundle
through SecretStorage, prove authentication without changing remote state, and
activate a versioned scope-aware sidecar without exposing secrets.

**Blocked by:** 01: Introduce a shared data-sync lease.

**Status:** implemented

- [x] FreshRSS remains visible but disabled below Obsidian 1.11.4 or when the
      expected SecretStorage surface is missing or unusable.
- [x] The disabled state explains that FreshRSS requires Obsidian 1.11.4 or
      newer and makes no credential, network, or FreshRSS-state access.
- [x] Legacy JSON and Vault Shards v1 users receive the existing explicit Vault
      Shards v2 migration choice; declining or failing it leaves FreshRSS
      disabled without partial initialization.
- [x] The settings surface accepts a FreshRSS base endpoint and a selected
      SecretStorage entry reference while persisting no credential value.
- [x] Endpoint canonicalization rejects embedded credentials and invalid URLs,
      removes query/fragment/default ports and a trailing slash, lowercases
      scheme and host, and preserves a FreshRSS deployment path.
- [x] Connection testing performs ClientLogin, an authenticated read-only
      identity/capability probe, and a modification-token probe without changing
      subscriptions, categories, labels, read state, or starred state.
- [x] The authenticated remote user identity is treated as opaque, and the
      canonical endpoint plus that identity establishes the FreshRSS connection
      scope.
- [x] A successful first connection creates an empty versioned
      `freshrss-state.json` namespace alongside Vault Shards v2 metadata under
      the shared data-sync lease.
- [x] A successful test for a different scope quarantines the prior namespace
      before activating a new empty namespace; no binding, checkpoint, or
      pending facet mutation crosses scopes.
- [x] Unsupported, malformed, or incomplete sidecar data is preserved and
      quarantined and blocks connection activation rather than being replaced.
- [x] Settings distinguish capability-unavailable, storage-migration-required,
      credentials-unconfigured, test-required, credentials-rejected,
      server-unavailable, and connected outcomes.
- [x] Credential values, auth values, sessions, modification tokens, and test
      secrets are absent from `data.json`, `freshrss-state.json`,
      `user-state.json`, logs, notices, and test fixtures.
- [x] Pure unit, vault-stub, mocked connection, and settings DOM tests cover the
      complete behavior and clean up mocks and DOM state between cases.
- [x] Focused tests, lint, platform checks, type checking, the complete build,
      and final generated-artifact inspection pass.

## Implementation record

- Risk: high — this change adds a security-gated settings surface, external
  authentication, vault persistence, and shared lifecycle ownership.
- Added a FreshRSS settings tab that exposes capability, storage-migration,
  credential-selection, connection-test, and connected states without storing
  secret values.
- Added non-mutating Google Reader API checks for ClientLogin, `user-info`, and
  the modification token over the user-selected HTTPS endpoint, plus a
  versioned scope-aware sidecar that quarantines mismatched or invalid data.
- Automated verification: focused FreshRSS tests (4 files, 14 tests), the full
  unit suite, changed-file ESLint, platform checks, TypeScript, and `npm run
  build` all passed.
- Scheme decision: endpoint canonicalization rejects plain HTTP and accepts
  only HTTPS. This goes beyond the acceptance criterion above, which constrains
  canonicalization but not the scheme. The reason is that Google Reader
  `ClientLogin` carries the FreshRSS username and API password in the request,
  so plain HTTP would put a credential on the wire in cleartext. The rest of the
  plugin still accepts `http://` for ordinary feed URLs, which carry no
  credential. The rejection message explains the reason so a LAN user pasting an
  `http://` endpoint is not left guessing.
- Known trade-off: this blocks self-hosted FreshRSS instances that are reachable
  only over plain HTTP on a LAN, which is a real deployment pattern. Accepted for
  the first release because relaxing the rule later is a non-breaking patch while
  tightening it later would break already-configured users. If demand appears,
  the preferred response is an explicit opt-in setting that acknowledges the
  insecure connection, not a private-address-range carve-out, because address
  heuristics do not cover mDNS or custom LAN hostnames.
- Manual follow-up: on Obsidian 1.11.4 or newer, create a SecretStorage entry
  containing a FreshRSS credential bundle, select it, test a valid endpoint,
  then verify the connected status. Repeat with a different FreshRSS account to
  verify that the prior sidecar is quarantined; test legacy storage and an
  unavailable SecretStorage build to verify that no credential or network
  access occurs.
