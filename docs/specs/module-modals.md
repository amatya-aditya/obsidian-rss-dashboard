---
id: module-modals
type: submodule-design
status: draft
title: Package — modals
parent: architecture
---

# Package — modals

## Responsibility

Collect the plugin's dialogs: feed management, OPML and starred import,
storage migration and repair, tags, keyboard-shortcut help, release notes, and
the mobile navigation and filter sheets.

Entry points: `AccessibleModal` (the base every dialog extends), `ImporterShell`
(the shared import skeleton), the `feed-manager` cluster (add, edit, manage,
plus `edit-feed-load` / `edit-feed-save` / `edit-feed-plugin`), the mobile
navigation and discover-filter dialogs, and `storage-migration-modal`.

## Boundary

A modal orchestrates a flow over services and renders its own fields; the
decision logic it applies lives in a preview or confirmation model under
`src/services/`, so the flow is testable without a dialog. Nine modals are on
the `main.ts` importer ratchet — the four feed-manager dialogs, the two import
dialogs, the two mobile dialogs, and the storage-migration dialog, all
type-only. That list may only shrink.

## Invariants

- **Every dialog extends `AccessibleModal`, never Obsidian's `Modal`** — it
  adds the dialog role, the accessible name, Tab containment, and focus
  return.
- **Both import flows share `ImporterShell`**, so file picking, validation, and
  confirmation cannot diverge between OPML and starred import.
- **Obsidian conventions**: sentence case, section headings via `setHeading`,
  no `title` attributes, no native close button where a header one exists.
- **No modal mutates the settings object directly**; it calls the plugin
  facade or a service, which owns the save.

## Known gaps

Modal titles built with static `createEl("h1"–"h4")` are an accepted deviation
from Obsidian's `setHeading` guidance, recorded as a Note (U4) in
[the upstream audit](../../docs/development/obsidian-alignment-audit.md).
