# ADR 0019: Saved-note association authority

See the [ADR index](README.md) for the purpose and history of project decisions.

## Status

accepted

## Date

2026-10-06

## Context and problem

Users can deliberately delete a note they previously saved from a feed article. A missing note alone cannot tell the plugin whether that deletion was intentional or content was lost. Existing saved-note checks also reconstruct filenames and can adopt another note at the expected name, even when the recorded association no longer resolves.

The joint design for #818, #819, and #820 must keep Saved indicators accurate without undoing a user's deletion or claiming an unrelated note belongs to an article.

## Decision

Use the recorded saved-note association as the authority for event handling, metadata validation, and explicit Open saved note. An observed rename or move preserves the association. A matching filename alone is insufficient to establish a replacement association in those flows.

During design, `dev` advanced to `bc639d6` with accepted ADR 0018 and saved-template support. Retain that ADR's legacy title-based note reuse during explicit Save. The no-filename-recovery rule applies to reconciliation and Open saved note; explicit Save is the deliberate downstream-action exception. This ADR does not amend the accepted save contract.

Observed note-deletion events silently clear the article's Saved state, recorded path, and Saved tag, persist the change, and update open views. A Saved record with no usable recorded path also loses that state and tag: its association is already broken. Do not warn or recreate a note based solely on its absence.

The design excludes proactive file-existence checks, vault traversal, filename discovery, and recurring reconciliation timers. An explicit Open saved note action may resolve the exact recorded path: a confirmed missing file clears the association, while an operational error preserves it. Opening the feed article does not check its saved note. Normal persistence is attempted without a pending-write queue or scheduled retry; failures must not be reported as durable success.

## Consequences

Intentional deletion is respected. A missing note does not produce a data-loss claim, and another note cannot be silently adopted because its title matches.

An unobserved move or deletion can leave a stale association because this design does not discover vault changes independently. The association is cleared if an explicit saved-note open later establishes that its recorded path is missing. Filename reconstruction previously offered convenient recovery, but cannot safely distinguish an unobserved move from deliberate deletion followed by creation of an unrelated note.

Existing users' Saved metadata is cleared after an observed deletion or when a saved record has no usable path. Older records without a path are not grandfathered or reconnected through filename reconstruction. Records with a path are not independently checked against file existence. Manually assigned variants of the Saved tag are also removed because existing data does not distinguish their provenance from automatic assignments; unrelated tags and read/starred state remain unchanged.

After a persistence failure, an in-memory update can be lost on restart unless a later ordinary save persists it. The design does not promise eventual durability through retries.

This decision does not delete or rewrite vault notes or itself remove feed articles. Clearing Saved state may remove retention protection under the user's existing policy, so later normal cleanup may remove an otherwise unprotected article. See [ADR 0002](0002-configurable-retention-protections-and-unread-expiration.md). No migration is implemented by this documentation.

## Considered options

- **Reconstruct the default filename during verification or Open saved note:** Convenient for older records and some unobserved moves, but risks adopting an unrelated note or reversing a deliberate deletion. Explicit Save legacy reuse is separately governed by accepted ADR 0018.
- **Warn about every missing note:** Makes ambiguity visible, but treats ordinary user deletion as an exceptional event without evidence of data loss.
- **Preserve every stale indicator indefinitely:** Avoids metadata changes, but leaves Saved indicators and note-opening behavior inaccurate.
- **Proactively reconcile recorded paths:** Provides recovery after missed events, but rejected under the user's chosen boundary against proactive saved-note file checks.
- **Update recorded associations from observed events, metadata, and explicit saved-note opens:** Chosen to respect deletion and limit saved-note access. Automatic recovery after missed events is deliberately excluded.

## Related

- [#818: Reader updates after note deletion](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/818)
- [#819: Saved-note rename or move](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/819)
- [#820: Missing-note verification](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/820)
