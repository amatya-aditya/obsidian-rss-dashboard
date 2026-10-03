# ADR 0002: Configurable retention protections and unread expiration

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-09-08

## Context and problem

RSS Dashboard previously protected every unread article from automatic retention. A feed that continued to publish its full history could therefore grow local storage indefinitely, even when the user selected a short auto-delete duration.

Starred and saved articles were also implicitly protected, while tagged articles could not be protected without separately starring or saving them.

We needed to decide which article states should shield an article from automatic cleanup, who controls that choice, and how to handle setting changes that would permanently remove articles already stored locally.

## User stories

The decision is intended to preserve these core user expectations:

1. As an RSS reader with limited vault storage, I want unread articles to automatically delete after my configured auto-delete duration, so that my Obsidian vault does not hoard thousands of unread articles I will never read.
2. As a user who marks important items with stars, I want starred articles protected from auto-deletion and count limits by default, so that my starred reading list is never accidentally erased.
3. As a user with unmetered storage who prefers an inbox-zero workflow, I want to toggle ON "Protect unread articles", so that articles are only deleted after I have explicitly marked them as read.
4. As a user who accidentally clicks to turn off a protection toggle, I want to see a confirmation prompt before articles are permanently pruned, so that I don't lose data by mistake.

For a complete list of all 14 user stories that were identified, visit [GitHub Issue #213](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/213).

## Decision

Retention evaluates a single configurable protection policy for both time-based auto-deletion and max-item trimming. Users choose, globally, whether starred, saved, tagged, and unread articles are protected:

| Protection | Default  |
| ---------- | -------- |
| Starred    | enabled  |
| Saved      | enabled  |
| Tagged     | disabled |
| Unread     | disabled |

An article is retained when it matches any enabled protection. Otherwise, it is eligible for removal once it exceeds the feed's auto-delete cutoff or the unprotected portion of the feed exceeds the feed's maximum item limit.

Changing a protection from enabled to disabled, or changing an auto-delete duration to a shorter active duration, requires an explicit choice. Users can apply pruning immediately, save the choice for the next refresh, or cancel. Enabling a protection, lengthening retention, and disabling auto-deletion are non-destructive and save immediately.

## Consequences

- Fresh and carried-forward items use the same retention-protection predicate.
- Users can choose whether starred, saved, tagged, or unread state shields an article from both retention passes.

### Existing users and data

- Existing users retain the prior starred and saved protections by default.
- A tighter policy can delete existing local articles immediately only after the user explicitly chooses that action; deferred changes take effect during normal refresh processing.

## Considered options

### Always retain unread articles

Rejected because it defeats the configured storage bound for feeds that keep old items in their XML.

### Always remove unread articles after the cutoff

Rejected because users who use unread status as a read-later queue need an explicit way to retain those articles.

### Per-feed protection policies

Deferred. A global policy provides the needed control without adding a second retention configuration surface or inconsistent expectations between feeds.

### Apply destructive changes without confirmation

Rejected because pruning permanently removes local articles and cannot reconstruct items the remote feed no longer publishes.

## Implementation notes

The global settings are `protectStarred`, `protectSaved`, `protectTagged`, and `protectUnread`. The item-count limit is `maxItemsLimit`.

## Related

- [GitHub Issue #213](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/213) — configurable retention protections and unread article expiration
- [Implementation plan for #213](../archive/plans/v2.7.0/213-configurable-retention-and-unread-expiration.md)
- [ADR 0008 — First-seen date fallback for undated items](0008-first-seen-date-fallback-for-undated-items.md) — effective date used by the retention cutoff for undated items
- [ADR 0010 — Hydration-gated user-state garbage collection](0010-hydration-gated-user-state-garbage-collection.md) — cleanup of article state after retention prunes an article
