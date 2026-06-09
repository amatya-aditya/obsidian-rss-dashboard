# Folder Auto-Tags — Progress and Next Steps

Last updated: June 9, 2026

## Summary

The core feature is largely implemented and stable. Resolver semantics, modal persistence, media-service integration, and docs are in place. Targeted and full unit test suites pass; lint is clean on the touched files.

What remains is mostly polish, one integration gap in `main.ts`, optional test coverage, and release docs.

---

## Progress by Phase

### Phase 1: Stabilize Current Type/Lint State — **Done**

- [x] Fixed `AddFeedModal` callback shape in `sidebar.ts` (now passes a single `AddFeedRequest` object).
- [x] Targeted lint on `sidebar.ts`, `tag-utils.ts`, `media-service.ts`, `folder-auto-tag-modal.ts` — passes.
- [x] Full `npm run test:unit` — 1369 tests pass.

### Phase 2: Lock Feature Semantics — **Done**

- [x] Folder rules stored only on `folder.autoTags` for the configured folder (`sidebar.ts:3242–3244`).
- [x] Inherited tags resolved dynamically via `getFolderAutoTags()` in `tag-utils.ts`.
- [x] "Backfill subfolders" controls backfill scope only, not persistence (`folder-auto-tag-modal.ts`).
- [x] Product rule documented in `docs/tags-primer.md` (cascade vs backfill separated).

### Phase 3: Build Resolver Tests First — **Mostly done**

- [x] `getFolderAutoTags` ancestor accumulation test.
- [x] `resolveArticleTags` precedence test (media → folder → feed → article, case-insensitive dedupe, color override).
- [x] Media-service integration tests for folder + per-feed layering.
- [ ] Edge cases still untested:
  - Empty/missing folder path.
  - Feed in root folder with no `autoTags` on any ancestor.
  - Confirming child folder objects are never mutated by resolution (read-only guarantee).

### Phase 4: Integrate Resolver Into Media Path — **Mostly done**

- [x] `media-service.ts` uses `resolveArticleTags` in `applyMediaTags`.
- [x] `feed-parser.ts` passes `this.getFolders()` into `applyMediaTags` on parse/refresh.
- [x] No duplicate resolution logic in `feed-parser.ts`.
- [x] **`main.ts` add-feed path** — passes `this.settings.folders` to `applyMediaTags` after `ensureFolderExists`; removed redundant `applyTagsToItems` call.

### Phase 5: Sidebar/Modal Persistence and Backfill — **Mostly done**

- [x] Extracted `FolderAutoTagModal` (`src/modals/feed-manager/folder-auto-tag-modal.ts`).
- [x] `showFolderAutoTagModal` saves only `folder.autoTags`; no descendant-folder mutation.
- [x] Backfill confirmation flow with case-insensitive dedupe.
- [x] "Backfill subfolders" scopes which feeds are updated.
- [ ] Backfill logic is inline in `sidebar.ts` — consider extracting a small helper if we want isolated tests.
- [ ] No unit tests for modal or backfill helper yet.
- [x] Modal subtitle/description updated to clarify storage vs inheritance.

### Phase 6: Regression Verification — **Done**

- [x] `tag-utils` tests pass.
- [x] `media-service.detect-and-process-feed` tests pass (including folder auto-tag cases).
- [x] `tag-applier` tests pass (full suite).
- [x] Targeted lint passes.
- [x] Full `npm run test:unit` passes.

### Phase 7: Docs Cleanup — **Mostly done**

- [x] `docs/tags-primer.md` rewritten — cascade/backfill distinction clear, cascading example present, no encoding artifacts.
- [x] `CHANGELOG.md` — folder auto-tags listed under 2.4.0-beta.2 Auto Tagging.
- [x] `README.md` — Tags Guide mentions folder rules with link to primer.
- [ ] Optional UX: Edit Feed modal shows feed-source inherited tags but not folder inherited tags (`edit-feed-modal.ts`). Consider surfacing `getFolderAutoTags(feed.folder, folders)` alongside existing "Inherited auto-tags" section.

---

## Architecture (current state)

```text
Save folder rule
  -> folder.autoTags on configured folder only

Parse / refresh feed (feed-parser.ts)
  -> MediaService.applyMediaTags(feed, tags, media, folders)
    -> resolveArticleTags(item.tags, perFeedTags, feed.folder, folders, mediaDefaults)
      -> getFolderAutoTags walks ancestor path, mergeTagArrays dedupes

Backfill (sidebar, on user confirm)
  -> adds selected folder tags to existing articles (optional subfolder scope)
  -> case-insensitive dedupe; does not remove tags
```

---

## Recommended Next Steps (priority order)

1. **Optional test hardening** — add resolver edge-case tests (empty path, no ancestors) and, if backfill is extracted, a focused backfill helper test.

2. **Optional UX** — show folder-inherited tags in Edit Feed modal next to feed-source inherited tags.

3. **Manual smoke test** — add a feed to a folder with auto-tags, refresh, and confirm tags appear; run backfill on existing articles and confirm subfolder scope.

---

## Files touched in this feature

| File | Role |
|------|------|
| `src/utils/tag-utils.ts` | `getFolderAutoTags`, `resolveArticleTags`, `mergeTagArrays` |
| `src/services/media-service.ts` | Calls resolver in `applyMediaTags` |
| `src/services/feed-parser.ts` | Passes folders into `applyMediaTags` |
| `src/modals/feed-manager/folder-auto-tag-modal.ts` | New modal UI |
| `src/components/sidebar.ts` | Context menu entry, save + backfill handlers |
| `src/types/types.ts` | `Folder.autoTags` field |
| `docs/tags-primer.md` | User-facing tag precedence guide |
| `test_files/unit/utils/tag-utils.test.ts` | Resolver tests |
| `test_files/unit/services/media-service.detect-and-process-feed.test.ts` | Integration tests |

**Immediate next action:** manual smoke test in Obsidian, then optional test/UX polish if desired.
