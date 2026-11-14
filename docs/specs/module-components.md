---
id: module-components
type: submodule-design
status: draft
title: Package — components
parent: architecture
---

# Package — components

## Responsibility

Render reusable DOM pieces for the views and modals. The package is grouped by
what it draws, not by directory:

- **Article list** — the card, list, and feed presentations plus pagination,
  grouping, cover images, and context menus.
- **Sidebar** — row rendering, folder and feed menus, focus sync, and row
  semantics for assistive technology.
- **Reader chrome** — content-version switching, feed-first view, and the
  image lightbox.
- **Tag controls** — tag selection, the colour palette, and the shape preview.
- **Media** — episode list and seek-bar chapter markers.
- **Form controls** — folder selector and suggest, themed select popup.
- **Filters** — the article filter menu and keyword rule editor.

## Boundary

Components render; they do not own plugin lifecycle and do not persist. A
component receives data and callbacks and raises an event through them. Three
components (`sidebar`, `discover-sidebar`, `folder-selector-popup`) are on the
`main.ts` importer ratchet, all type-only; new components must not join them.

## Invariants

- **Obsidian's own controls and tokens first** — no hand-built dropdown, no
  literal colours; a control that Obsidian offers is wrapped, not imitated.
- **Accessible by construction** — `aria-label` and Obsidian tooltips instead
  of `title`; icon buttons through the shared helper; keyboard paths for every
  mouse action.
- **Popout-safe** — `activeDocument` / `activeWindow` and registered listeners
  only.
- **The article action row keeps one meaning across presentations**: the
  action and its selected state are identical in card, list, feed, and reader
  layouts; only size and placement follow the view
  ([vocabulary](../../CONTEXT.md)).
