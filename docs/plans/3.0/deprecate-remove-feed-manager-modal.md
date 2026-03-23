# 3.0 Plan: Deprecate + Remove `src/modals/feed-manager-modal.ts`

## Goal (3.0)
Remove `src/modals/feed-manager-modal.ts` entirely and migrate all code, tests, and docs to import directly from `src/modals/feed-manager/*`.

This is a breaking change for any downstream consumers or forks that still import `../modals/feed-manager-modal`.

## Historical Context (Why this exists / why remove it)
- **Pre-2.2 refactor reality:** `src/modals/feed-manager-modal.ts` began as a large “do-everything” modal file that bundled three distinct UI surfaces:
  - `AddFeedModal` (URL resolution + preview + per-feed settings)
  - `EditFeedModal` (similar preview + settings editing)
  - `FeedManagerModal` (list/search/manage feeds/folders)
- **Why we introduced a barrel shim:** during the TDD refactor work, we split the monolith into smaller modules under `src/modals/feed-manager/`, but kept `src/modals/feed-manager-modal.ts` as a **stability shim** (barrel re-export) so we could:
  - avoid churn in internal callers (notably the sidebar “Add Feed” icon and dashboard “Manage Feeds” entry points)
  - keep existing tests that `vi.mock("../../src/modals/feed-manager-modal", ...)` working while behavior was being stabilized
- **What changed since:** the refactor is now complete and verified (unit tests + `npm run build`), and the modal logic is already living in the dedicated files:
  - `src/modals/feed-manager/add-feed-modal.ts`
  - `src/modals/feed-manager/edit-feed-modal.ts`
  - `src/modals/feed-manager/feed-manager-modal.ts`
  - plus extracted helpers (badges, preview loader, folder utilities)
- **Why removal is desirable:** the barrel file is now pure indirection:
  - it obscures real dependencies (callers look like they depend on the old monolith)
  - it makes future refactors harder (mocks/imports can accidentally target the barrel instead of the real module)
  - it can re-enable “monolith thinking” by keeping the old name/path alive even though the architecture moved on
- **Why schedule for 3.0:** removing the file is a **breaking API change** (even if only for internal usage today). A major release is the right boundary to avoid surprise breakage for forks/users.

Related docs:
- `docs/plans/feed-manager-modal-refactor-tdd.md`
- `docs/plans/Icon Replacement Plan for feed-manager.md`
- `docs/design/design-spec.md` (icon rendering standards)

## Current State (2.x)
- `src/modals/feed-manager-modal.ts` is a barrel re-export used by:
  - `src/components/sidebar.ts`
  - `src/views/dashboard-view.ts`
  - tests that `vi.mock("../../src/modals/feed-manager-modal", ...)`
- Some docs/plans still reference the old path.

## Implementation Tasks (3.0)

### Phase 1 — Internal import migration
- Update `src/components/sidebar.ts`
  - Replace:
    - `import { AddFeedModal, EditFeedModal } from "../modals/feed-manager-modal";`
  - With:
    - `import { AddFeedModal } from "../modals/feed-manager/add-feed-modal";`
    - `import { EditFeedModal } from "../modals/feed-manager/edit-feed-modal";`
- Update `src/views/dashboard-view.ts`
  - Replace:
    - `import { FeedManagerModal } from "../modals/feed-manager-modal";`
  - With:
    - `import { FeedManagerModal } from "../modals/feed-manager/feed-manager-modal";`

### Phase 2 — Test migration
- Update `test_files/unit/dashboard-filter-persistence.test.ts`
  - Replace mocking of `../../src/modals/feed-manager-modal` with mocking:
    - `../../src/modals/feed-manager/feed-manager-modal`
- Update `test_files/unit/sidebar-addfeed-opens-modal.test.ts`
  - Replace mocking of `../../src/modals/feed-manager-modal` with mocking:
    - `../../src/modals/feed-manager/add-feed-modal`
  - Keep the same assertion: sidebar action results in `.open()` being called.
- Replace/remove `test_files/unit/feed-manager-modal-barrel-exports.test.ts`
  - Delete it, or replace with a smoke test that imports the direct modules:
    - `../../src/modals/feed-manager/add-feed-modal`
    - `../../src/modals/feed-manager/edit-feed-modal`
    - `../../src/modals/feed-manager/feed-manager-modal`

### Phase 3 — Documentation updates
- Update `docs/development/feed-validation.md`
  - Replace references to `src/modals/feed-manager-modal.ts` with:
    - `src/modals/feed-manager/add-feed-modal.ts`
    - `src/modals/feed-manager/edit-feed-modal.ts`
- Update plan docs that still reference the old path:
  - `docs/plans/feed-manager-modal-refactor-tdd.md`
  - `docs/plans/Icon Replacement Plan for feed-manager.md`
- Add a brief 3.0 note in docs (optional but recommended):
  - “`src/modals/feed-manager-modal.ts` removed in 3.0; import direct modules under `src/modals/feed-manager/`.”

### Phase 4 — Removal
- Delete `src/modals/feed-manager-modal.ts`.

### Phase 5 — Verification (required)
- `npm run test:unit`
- `npm run build`

## Acceptance Criteria
- `rg "modals/feed-manager-modal" src test_files` returns no results.
- Unit tests pass.
- `npm run build` passes.
- Docs no longer reference the removed file.

## Rollout Notes
- Do this only in 3.0 (breaking change).
- Add a CHANGELOG entry under 3.0: “Removed `feed-manager-modal` barrel; update imports to direct modal modules.”

