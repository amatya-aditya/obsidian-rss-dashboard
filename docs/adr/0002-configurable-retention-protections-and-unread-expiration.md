# Configurable Retention Protections and Unread Expiration

RSS Dashboard previously protected every unread article from automatic
retention. A feed that continued to publish its full history could therefore
grow local storage indefinitely, even when the user selected a short
auto-delete duration. Starred and saved articles were also implicitly
protected, while tagged articles could not be protected without separately
starring or saving them.

## Status

implemented

## Decision

Retention now evaluates a single configurable protection policy for both
time-based auto-deletion and max-item trimming. The global settings are:

- `protectStarred` — enabled by default.
- `protectSaved` — enabled by default.
- `protectTagged` — disabled by default.
- `protectUnread` — disabled by default.

An article is retained when it matches any enabled protection. Otherwise, it
is eligible for removal once it exceeds the feed's auto-delete cutoff or the
unprotected portion of the feed exceeds `maxItemsLimit`.

Changing a protection from enabled to disabled, or changing an auto-delete
duration to a shorter active duration, requires an explicit choice. Users can
apply pruning immediately, save the choice for the next refresh, or cancel.
Enabling a protection, lengthening retention, and disabling auto-deletion are
non-destructive and save immediately.

## Considered Options

- **Always retain unread articles**: Rejected because it defeats the configured
  storage bound for feeds that keep old items in their XML.
- **Always remove unread articles after the cutoff**: Rejected because users
  who use unread status as a read-later queue need an explicit way to retain
  those articles.
- **Per-feed protection policies**: Deferred. A global policy provides the
  needed control without adding a second retention configuration surface or
  inconsistent expectations between feeds.
- **Apply destructive changes without confirmation**: Rejected because pruning
  permanently removes local articles and cannot reconstruct items the remote
  feed no longer publishes.

## Consequences

- Fresh and carried-forward items use the same retention-protection predicate.
- Users can choose whether starred, saved, tagged, or unread state shields an
  article from both retention passes.
- Existing users retain the prior starred and saved protections by default.
- A tighter policy can delete existing local articles immediately only after
  the user explicitly chooses that action; deferred changes take effect during
  normal refresh processing.
