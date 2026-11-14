---
id: module-hotkeys-commands
type: submodule-design
status: draft
title: Package — hotkeys and palette commands
parent: architecture
---

# Package — hotkeys and palette commands

## Responsibility

Own the keyboard map and the command-palette surface: `keymap.ts` holds the
single keymap data, `dashboard-hotkeys.ts` and `reader-hotkeys.ts` bind it per
surface. `registerPaletteCommands` registers the commands that need only the
structural `PaletteCommandPlugin`; the rest are registered in `main.ts`.

## Boundary

No `main.ts` import. Commands take a structural `PaletteCommandPlugin`
interface, which is the pattern the rest of the UI should follow. The keymap is
data: it feeds both the handlers and the shortcut-help modal, so it has no DOM
or Obsidian dependency.

## Invariants

- **One keymap entry plus one help row.** A new shortcut is an entry in
  `keymap.ts` and a row in `SHORTCUT_SECTIONS`
  (`src/modals/shortcut-help-modal.ts`), which keeps its own hand-written table;
  a keymap test fails when the two drift.
- **No default hotkey on a command.** Commands register without `hotkeys:` and
  let the user bind them (Obsidian guideline C1).
- **Surface-scoped binding.** Dashboard and reader handlers bind only on their
  own surface, so a reader shortcut cannot fire while the dashboard has focus.
- Commands are sentence case and name the action, not the feature area.
