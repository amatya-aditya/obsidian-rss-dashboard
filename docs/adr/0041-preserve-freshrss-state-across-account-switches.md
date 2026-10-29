# ADR 0041: Preserve FreshRSS State Across Account Switches

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-10-29

## Context and problem

FreshRSS keeps local bindings, checkpoints, and pending article-state changes in
a sidecar scoped to a canonical server endpoint and authenticated user. When a
user tests a different account, the active sidecar is quarantined and a fresh
scope is created. Returning to the first account currently creates another
fresh scope instead of restoring its saved state. A pending local change can
then disappear from the active sync state and the article can revert to the
server value.

The existing sync lifecycle already requires account isolation and preserving
local actions. Account switching needs to preserve both guarantees while still
allowing each account to have independent sync history.

## User stories

1. As a user with multiple FreshRSS accounts, I want each account's local sync
   state to return when I switch back, so pending changes are not lost.
2. As a user, I want connection testing to remain separate from sync, so
   testing another account never sends queued changes to it.

For the complete acceptance criteria, see
[GitHub Issue #1712](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1712).

## Decision

We will preserve complete FreshRSS sync state independently for each exact
account scope, defined by the canonical endpoint and authenticated user. When
that scope returns, connection testing restores its newest valid saved state;
a scope with no saved state starts empty. Restoring state does not send remote
mutations. Pending changes wait for an explicit sync.

Switching away is allowed without confirmation after the current state has
been saved. If pending changes remain, show a generic, non-blocking notice. Keep
a recovery copy until the account completes a full sync cycle. Do not expire
saved account state automatically; a user-facing action to forget saved state
is separate work.

If saving or restoring state fails, keep the current scope active and stop the
switch. If the newest matching saved copy is malformed or unsupported, preserve
all copies and stop; do not fall back to an older copy or replace the state
with an empty sidecar.

## Consequences

### Benefits

- Pending local changes remain attached to their originating account and can
  be delivered after the user returns.
- Connection testing cannot dispatch a change to a different account.
- A failed or ambiguous restore does not silently discard saved state.

### Trade-offs

- Saved state for accounts that are never used again remains stored until an
  explicit removal mechanism is provided or used.
- A corrupt newest copy blocks activation for that scope and requires repair;
  silently choosing an older copy could lose newer pending changes.

### Existing users and data

- Existing quarantined sidecars remain eligible for restoration when their
  exact scope returns.
- No existing sidecar is migrated or merged across account scopes.
- Recovery copies are retained until a complete successful sync cycle.

## Considered options

### Warn before setting aside pending changes

A warning makes the switch visible but still asks the user to decide whether
to risk losing pending work. It also leaves the saved account state unavailable
when the user later returns.

### Start a fresh scope on every account switch

This preserves account isolation but can strand pending local changes and
restore remote values over the user's local state.

### Restore the complete state for the exact returning scope (chosen)

This preserves account isolation and local actions while allowing the user to
switch accounts without a confirmation step. Fail-closed handling protects
state when the saved copy cannot be trusted.

## Related

- [GitHub Issue #1712 — FreshRSS account switch loses a pending local change](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1712)
- [GitHub Issue #225 — FreshRSS sync lifecycle and failure behavior](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/225)
