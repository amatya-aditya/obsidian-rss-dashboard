# Workflow boundaries

Use only the stages that add value. A small task can use one artifact carrying decisions, criteria, seams, and evidence. A large effort can stay at spec level until a bounded implementation horizon is near.

| Transition                | Information that must survive                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| Requirements -> decisions | Original source, settled statements, consequential unknowns                                  |
| Decisions -> spec         | Status and rationale, constraints, assumptions, exclusions                                   |
| Spec -> tickets           | Revision, AC/DEC/TEST IDs and applicable definitions, dependencies, complete coverage ledger |
| Tickets -> implementation | Source identity, current scope, verification boundaries                                      |
| Implementation -> review  | Actual diff identity, original intent, per-AC evidence and limitations                       |

Routing can occur at any transition. Recommendation does not authorize a model switch, delegation, external publication, deployment, or wider scope. Use capabilities the host actually exposes.

## Issue and pull request links

A supplied issue URL identifies the user's task. Retrieve its body, state, relevant comments, linked parent/specification, and repository with available tracker tools. For a PR URL, retrieve metadata and diff and establish base/head. Use browser retrieval as a fallback. Preserve source revision in local artifacts. A URL provides read context; it does not itself authorize tracker writes. Apply the draft and `nodraft` rules in `to-spec` and `to-issue` when the user requests GitHub issue creation. Do not post PR reviews, create branches, commit, merge, or deploy unless requested. If the host cannot retrieve the URL, say which source is missing rather than asking the user to paste accessible content.

## External trackers and large artifacts

Draft locally by default. Publish or modify tracker records only when the user has authorized that action. Existing authorization remains valid; do not reconfirm it mechanically. Before publication, make the complete ticket set and dependencies reviewable.

Keep a canonical spec at an immutable revision. For large specs, preserve full applicable contract excerpts in each ticket and point to the complete source; split attachments or use versioned repository files rather than truncate. After an authorized issue write, read it back and compare IDs, definitions, seams, constraints, dependencies, and source revision. Report any loss; do not call publication successful on a truncated round trip.

## Delegation and integration

Delegate only if the host and task authorization allow it and the subtask has independent value. No fixed agent count or model-specific agent team is required. A delegation packet includes scope, source revision, applicable contracts, writable area, expected evidence, and integration owner. Keep overlapping edits coordinated. The parent owns reconciliation and whole-task verification; a child saying done is not evidence.

When a new requirement invalidates active work, identify affected packets and reconcile or stop them. Preserve unaffected work. Serial execution is valid when dependencies dominate.

Use the [context handoff](context-management.md) when changing sessions or models.
