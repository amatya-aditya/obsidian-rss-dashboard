---
id: module-composition-root
type: module-design
status: draft
title: Composition root — main.ts
parent: architecture
---

# Composition root — main.ts

## Responsibility

`main.ts` is the only place modules are constructed and wired, and the only
place that talks to Obsidian's plugin lifecycle. It owns the settings object,
builds every service from it, registers views, commands, the ribbon, the
settings tab, and the `obsidian://` protocol handler, and orchestrates startup
and shutdown. Feature logic belongs behind those services
([ADR 0015](../../docs/adr/0015-main-ts-decomposition.md)).

What stays here deliberately: `onload`/`onunload`, view access and activation,
settings-backed service rebuild, startup prompts, saved-article checks,
article-state sync and rollback, playback progress, the storage-migration
facade, and import/export notices. Roughly 45 of its 137 methods are
single-statement delegates over services; that is the facade the public plugin
methods keep.

## Boundary

It may import anything. Nothing may import it: the importer ratchet in
`scripts/check-architecture.mjs` allows 23 existing files (7 runtime value
imports from settings, 16 type-only) and may only shrink. New code takes a
narrow structural interface instead — `registerPaletteCommands` over
`PaletteCommandPlugin` is the model.

## Invariants

- Views are created fresh per leaf by the `registerView` factory and never
  cached on the plugin; the reader receives settings and the article saver as
  getters so a synced settings reload cannot leave it stale.
- Two timer semantics must not drift: sidebar status redraws coalesce on a
  trailing 250 ms window (only the first request starts the timer); batch
  progress redraws throttle on the leading edge with no trailing redraw. The
  soft refresh timeout is never cleared.
- An allowed runtime cycle is a closed set: `dashboard-view ↔ reader-view` and
  `main ↔ settings-tab ↔ the settings tabs`. Everything else fails the gate.
- Cancelling the pending startup refresh delay must not leave automatic
  refresh off for the session: the scheduler is re-armed from the cancel path.
  #450 shipped the opposite bug and this is its regression guard.

## Known gaps

The facade is still ~2,700 lines with ~137 methods; decomposition landed as a
sequence of extractions (ADR 0015), so the remaining size is ratchet pressure,
not unfinished work.
