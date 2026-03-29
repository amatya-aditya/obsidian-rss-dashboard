# P0-2: Article Saver Service Tests - Handoff (post P0-1 + Vitest v4 upgrade)

## Context

This continues the test coverage improvement plan in `docs/development/test-coverage-improvement-plan.md`.

Recent groundwork that landed during P0-1 / infra:

- Vitest upgraded to `4.1.2` (and `@vitest/coverage-v8` to `4.1.2`); `npm run test:unit` is green.
- Obsidian stubs were expanded so `main.ts` lifecycle tests can run without a full Obsidian runtime:
  - `test_files/stubs/obsidian.ts` now provides `Plugin`, `PluginSettingTab`, a richer `Platform`, and a usable `vault.adapter` surface.
- `test_files/unit/main/plugin-lifecycle.test.ts` was updated to use constructable class mocks for modules instantiated via `new` (not plain objects), preventing `onload()` from bailing out early.

## Task (P0-2)

Add unit tests for `src/services/article-saver.ts`.

- Create: `test_files/unit/services/article-saver.test.ts`
- Current coverage: 0%
- Target coverage: 90%
- Risk: Critical - article saving is a core workflow (data loss potential).

## What to Test (from the plan)

### saveArticle()

- Generates markdown with template variables
- Handles missing optional fields gracefully
- Writes to the correct vault path (folder + sanitized filename)
- Returns `TFile` on success
- Returns `null` (and shows Notice) on write failure

### saveArticleWithFullContent()

- Fetches full article content (happy path)
- Falls back to `saveArticle()` when content is empty/unavailable
- Applies a custom template when provided
- Handles invalid HTML gracefully

### verify / repair helpers

- `verifySavedArticle()` unmarks saved articles when files are missing
- `fixSavedFilePaths()` normalizes paths and clears invalid saved state

## Testing Notes (important)

### Prefer the existing Vitest alias-based stubs

Vitest config aliases `obsidian` to `test_files/stubs/obsidian.ts` (see `vitest.config.mjs`). In tests, import Obsidian primitives from `"obsidian"` (not via relative stub paths).

### Mock network/content fetching at the boundary

`ArticleSaver.fetchFullArticleContent()` calls `fetchWithProxyFallback()` which ultimately uses the `requestUrl` stub. For deterministic unit tests, mock `src/utils/fetch-helpers` (or spy on `fetchWithProxyFallback`) rather than relying on `requestUrl`.

### Stub gaps you'll likely need to extend for P0-2

`ArticleSaver` uses APIs that are not fully covered by the current stubs:

- `app.fileManager.trashFile(...)` and `app.fileManager.renameFile(...)`
- `vault.createFolder(...)` (used by `ensureFolderExists()`)

If tests hit these, add minimal implementations to `test_files/stubs/obsidian.ts` rather than mocking ad-hoc per test.

## Suggested Test Skeleton

Create `test_files/unit/services/article-saver.test.ts`:

- Use `const app = App.createMock()` from `"obsidian"`
- Build a minimal `FeedItem` fixture (title/link/feedTitle/guid/pubDate/tags)
- Mock `fetchWithProxyFallback()` for `saveArticleWithFullContent()` cases
- Assert on:
  - created file path (`savedFilePath` and vault create call)
  - generated content includes expected template substitutions / frontmatter behaviors
  - mutation of `item.saved` and saved tag behavior

## Next Steps After P0-2 (per the plan)

- P0-3: Feed Fetch -> Parse -> Render pipeline integration tests
- P0-4: Folder selector popup tests
- Add CI coverage gate (Phase A / Week 2: "T-1.4")
