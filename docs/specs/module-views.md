---
id: module-views
type: submodule-design
status: draft
title: Package — views and media players
parent: architecture
---

# Package — views and media players

## Responsibility

Host the plugin's screens as Obsidian `ItemView`s, and run the reader's media
players.

- `RssDashboardView` — dashboard shell, sidebar host, article list, filters,
  and the inline reader.
- `ReaderView` — the dedicated reader: article content, save, tags, and the
  podcast and video players it owns.
- `DiscoverView`, `KagiSmallwebView` — feed discovery and small-web browsing.
- `PodcastPlayer`, `VideoPlayer`, `renderEpisodeDetails` — plain classes
  mounted inside the reader, torn down with `destroy()`; they are not views.

## Boundary

May import components, modals, services, utils, and types. Three views
(`dashboard-view`, `discover-view`, `kagi-smallweb-view`) are on the `main.ts`
importer ratchet, all type-only; new views must not join them. The reader takes
settings and the article saver as getters rather than holding them, so a synced
settings reload is visible without a rebuild.

## Invariants

- **The plugin never caches a view.** Each leaf gets a fresh instance from the
  `registerView` factory.
- **The one sanctioned view cycle is `dashboard-view ↔ reader-view`**; a new
  view-level cycle is an architecture exception.
- Players are owned by the reader and destroyed with it; nothing else keeps a
  player reference.
- Reader chrome that mutates article state goes through the same services the
  dashboard uses, so the two surfaces cannot disagree about read, star, or tag
  state.
- All DOM access uses `activeDocument` / `activeWindow` so popout windows keep
  working.

## Known gaps

`dashboard-view.ts` (~5,200 lines) and `reader-view.ts` (~3,300 lines) are the
largest production files. They are measured by the function-length and
complexity rules, not a file line cap.
