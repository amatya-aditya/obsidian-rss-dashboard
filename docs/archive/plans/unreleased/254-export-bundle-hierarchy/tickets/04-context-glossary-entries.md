# 04: CONTEXT.md glossary entries for Feed bundle / Settings bundle

**Parent:** #254

**Status:** done

**Blocked by:** 03 — Settings-tab UI for all three JSON scopes + OPML

## What to build

Add "Feed bundle" and "Settings bundle" as glossary entries in `CONTEXT.md` (Storage section, alongside the existing "Portable data bundle" entry), now that both terms name real, shipped functionality rather than a planned split.

Per the plan doc's explicit sequencing, these terms are not added until they're real — this ticket only lands once ticket 03 has shipped the UI that exposes them to users. Update the existing "Portable data bundle" entry's cross-reference to ADR 0005 to note the split is implemented, not just planned.

## Acceptance criteria

- [x] `CONTEXT.md` has a "Feed bundle" glossary entry: feeds, folders, tags, articles, and article state; no app settings.
- [x] `CONTEXT.md` has a "Settings bundle" glossary entry: app preferences only; no feeds, folders, tags, or articles.
- [x] The existing "Portable data bundle" entry is updated to reflect that the Feed bundle + Settings bundle split is implemented (not forward-looking).
- [x] ADR 0005's status is updated from "proposed" to "accepted" (or equivalent) now that the decision is fully implemented.

## Implementation notes

- Added "Feed bundle" and "Settings bundle" entries to `CONTEXT.md`'s Storage section, immediately after "Portable data bundle", cross-linked with `[[Feed bundle]]`/`[[Settings bundle]]`/`[[Portable data bundle]]` wiki-links per the file's existing convention.
- Reworded the "Portable data bundle" entry to define it as the Feed bundle + Settings bundle combination rather than a single monolithic export, and updated its ADR 0005 cross-reference from "planned split" to "the split, now implemented."
- ADR 0005's `## Status` changed from `proposed` to `accepted`; no other ADR content changed since the Decision/Consequences sections already described the shipped design.
