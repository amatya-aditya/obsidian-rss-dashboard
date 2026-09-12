# 04: CONTEXT.md glossary entries for Feed bundle / Settings bundle

**Parent:** #254

**Status:** ready-for-agent

**Blocked by:** 03 — Settings-tab UI for all three JSON scopes + OPML

## What to build

Add "Feed bundle" and "Settings bundle" as glossary entries in `CONTEXT.md` (Storage section, alongside the existing "Portable data bundle" entry), now that both terms name real, shipped functionality rather than a planned split.

Per the plan doc's explicit sequencing, these terms are not added until they're real — this ticket only lands once ticket 03 has shipped the UI that exposes them to users. Update the existing "Portable data bundle" entry's cross-reference to ADR 0005 to note the split is implemented, not just planned.

## Acceptance criteria

- [ ] `CONTEXT.md` has a "Feed bundle" glossary entry: feeds, folders, tags, articles, and article state; no app settings.
- [ ] `CONTEXT.md` has a "Settings bundle" glossary entry: app preferences only; no feeds, folders, tags, or articles.
- [ ] The existing "Portable data bundle" entry is updated to reflect that the Feed bundle + Settings bundle split is implemented (not forward-looking).
- [ ] ADR 0005's status is updated from "proposed" to "accepted" (or equivalent) now that the decision is fully implemented.
