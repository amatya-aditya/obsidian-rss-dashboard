# P1-2: Sidebar Ordering Controller Tests - Handoff (post P1-1)

## Status

P1-2 is complete (delivered on 2026-03-29).

- Added: `test_files/unit/services/sidebar-ordering-controller.test.ts`
- Verified: `npm run test:unit` is green (71 files / 525 tests)
- Next recommended phase: P1-5 Article Saving Settings Tab tests: `docs/development/p1-5-handoff.md`

## Context

This continues the test coverage improvement plan in `docs/development/test-coverage-improvement-plan.md`.

P1-1 (OPML Manager tests) is complete as of 2026-03-29. The next recommended phase is P1-2 because `src/services/sidebar-ordering-controller.ts` is pure logic with high user impact (drag/drop ordering + persistence), and it touches settings mutations that are easy to regress.

## Task (P1-2)

Add unit tests for `src/services/sidebar-ordering-controller.ts`.

- Create: `test_files/unit/services/sidebar-ordering-controller.test.ts`
- Current coverage: 0%
- Target coverage: 80%
- Risk: High (silent ordering/persistence regressions)

## What to Test

### moveFeedAndInsert()

- Rejects invalid inputs:
  - missing `draggedUrl` / `targetUrl`
  - no-op drop (`draggedUrl === targetUrl`)
  - dragged/target feed not found
- Moves the dragged feed into the target feed's folder (folder is normalized to `""` when null/undefined).
- Inserts before/after the target and updates `settings.feeds` ordering correctly.
- Sets folder-level feed sort to custom for the destination folder:
  - creates `settings.folderFeedSortOrders` if missing
  - writes key for destination folder path (including `""` for root)

### moveFeedToFolderAppend()

- Rejects missing dragged URL / missing dragged feed.
- Updates `dragged.folder` to destination folder and inserts after the last feed already in that destination.
- Sets folder-level feed sort to custom for the destination folder.

### setFolderFeedSortCustom() / setFolderSortCustom()

- `setFolderFeedSortCustom`:
  - creates `settings.folderFeedSortOrders` when absent
  - normalizes folder path keys (`null/undefined -> ""`)
  - sets `{ by: "custom", ascending: true }`
- `setFolderSortCustom`:
  - sets `{ by: "custom", ascending: prevAscendingOrTrue }`

### moveFolder()

Core constraints:
- Rejects missing `draggedPath`.
- Rejects missing `targetPath` unless `placement === "rootAppend"`.
- Rejects moving a folder into itself or a descendant (`nest` into self subtree).
- Rejects when dragged/target folder cannot be found.
- Rejects duplicate sibling name at destination level.

Placements:
- `before` / `after`: reorders at the target's parent level.
- `nest`: appends into target's `subfolders`.
- `rootAppend`: appends to root.

Path remapping (only when base path changes):
- Remaps `feed.folder` for feeds in the moved subtree (`Dragged` and `Dragged/...`).
- Remaps `settings.collapsedFolders` entries under the subtree.
- Remaps `settings.folderFeedSortOrders` keys under the subtree.
- Returns `newPath` with the new base path.

Always:
- Calls `setFolderSortCustom` (folder sort becomes custom after any successful move).

## Suggested Fixtures

Build a minimal `RssDashboardSettings` object with:
- `feeds`: a few feeds spread across folders (`""`, `Tech`, `Tech/AI`, etc.)
- `folders`: a small tree (`Tech` -> `AI`, plus another root folder)
- `collapsedFolders`: include moved subtree path(s)
- `folderFeedSortOrders`: include keys under the moved subtree

Prefer asserting on:
- feed ordering (`settings.feeds.map(f => f.url)`)
- folder tree order and nesting
- returned `{ ok, error?, newPath? }`
- remapped paths in `feeds`, `collapsedFolders`, and `folderFeedSortOrders`
