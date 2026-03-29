# P1-1: OPML Manager Tests - Handoff (post P0-5)

## Status

P1-1 is complete (delivered on 2026-03-29).

- Added: `test_files/unit/services/opml-manager.test.ts`
- Verified: `npm run test:unit` is green (71 files / 525 tests)
- Next recommended phase: P1-5 Article Saving Settings Tab tests: `docs/development/p1-5-handoff.md`

## Context

This continues the test coverage improvement plan in `docs/development/test-coverage-improvement-plan.md`.

P0-5 (Keyword Filter Service tests) is complete as of 2026-03-29. The recommended next phase is P1-1 because OPML import/export is a high-leverage, mostly pure-logic surface area with minimal Obsidian runtime dependencies.

## Task (P1-1)

Add unit tests for `src/services/opml-manager.ts`.

- Create: `test_files/unit/services/opml-manager.test.ts`
- Current coverage: 0%
- Target coverage: 80%
- Risk: High (data portability + backup/restore path)

## What to Test

### parseOpmlMetadata()

- Parses a standard OPML feed outline (`type="rss"` or `xmlUrl=...`) into `FeedMetadata` objects.
- Uses folder nesting (`<outline>...</outline>`) to derive `folder` paths like `Top/Sub`.
- Handles missing `title` / `text` on feeds (falls back to `"Unnamed feed"`).
- Handles missing `title` / `text` on folders (falls back to `"Unnamed folder"`).
- Throws `Error("Invalid OPML format")` when XML parsing fails (`<parsererror>` exists).
- Sanitizes unescaped ampersands via the preprocess step (e.g., `category="A&B"` should not crash parsing).

### parseOpml()

- Same shape assertions as `parseOpmlMetadata()`, but returns `Feed` objects (with `items: []` and `lastUpdated: 0`).
- Folder tree creation:
  - Produces `folders: Folder[]` with nested `subfolders`.
  - Avoids duplicating folders when multiple feeds share the same folder path.

### importOpml()

- Merges new feeds into `existingFeeds` by unique `url` (does not duplicate existing URLs).
- Merges folder trees via `mergeFolders()`.
- Wraps parse failures as `Error("Failed to import OPML: Invalid format")`.

### mergeFolders()

- When source and target share a folder name, merges recursively into `subfolders`.
- When a folder does not exist in the target, adds it (including its nested `subfolders`).

### generateOpml()

- Generates valid top-level structure:
  - XML declaration + `<opml version="2.0">` + `<head>` + `<body>`.
  - Includes `<title>` and `<dateCreated>`.
- Outputs uncategorized feeds as top-level `<outline ... type="rss" xmlUrl="..." category="..."/>`.
- Outputs folder structure as nested `<outline>` blocks and places feeds inside the correct folder path.
- Escapes XML special chars in folder names, feed titles, URLs, and categories (`<`, `>`, `&`, `'`, `"`).

## Testing Notes

- `OpmlManager` uses `DOMParser`, so tests should run under a DOM environment (Vitest is already configured with jsdom for this repo).
- `generateOpml()` includes a timestamp via `new Date().toUTCString()`; use `vi.setSystemTime(...)` / fake timers so the output is stable.
- Prefer asserting on key substrings / structure rather than exact full-string snapshots (date + whitespace make snapshots brittle).

## Suggested Fixtures

- Minimal OPML with:
  - One top-level feed
  - One folder containing one feed
  - Nested folder (`Tech/AI`) containing one feed
- An OPML file containing an unescaped `&` in an attribute to validate preprocessing.
- A clearly invalid XML string to validate error handling.
