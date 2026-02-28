# Folder Click Bug Fix Plan (Last Folder + Subfolder Behavior)

## Problem Statement

Users report inconsistent folder-click behavior:

- Clicking most folders opens dashboard results for that folder.
- Clicking the last folder in the list may fail to switch view as expected.
- Clicking subfolders may fail similarly, while clicking the parent works.

## Confirmed Risk Areas

### 1) Folder Name Collision With Special Filters

In `handleFolderClick`, folder names are normalized to lowercase and mapped to special keys (`read`, `unread`, `starred`, `saved`, `videos`, `podcasts`).
This can misroute normal folder selections if a user folder name matches a reserved key.

### 2) Folder-Path Integrity Drift

Feeds can exist with `feed.folder` paths not present in folder hierarchy, causing unexpected sidebar behavior and selection mismatches.

### 3) Leaf-Folder UX Ambiguity

Chevron toggle appears for all folders, including empty/leaf folders. Clicking toggle on a leaf can look like a failed action rather than an expected no-op.

## Goals

- Make folder clicks deterministic for all folder positions and depths.
- Prevent collisions between user folder names and special filter identifiers.
- Keep folder hierarchy and feed folder paths consistent.
- Improve clarity for leaf folder interactions.

## Non-Goals

- Redesigning sidebar visuals beyond what is needed for correctness.
- Changing feed grouping/filter architecture outside folder selection.

## Fix Strategy

## Phase 1: Selection Model Hardening

1. Immediate fix: remove ambiguous folder-name normalization in `handleFolderClick`.
2. Keep user folders as plain folder paths (no change to user-created folder behavior).
3. Optional hardening: use explicit internal filter IDs (not folders) for built-in filters only:
   - Example internal IDs: `__special__/read`, `__special__/videos`.
4. Ensure sidebar emits:
   - Real folder path for folder clicks.
   - Internal reserved ID only for true built-in filter actions.

### Files

- `src/views/dashboard-view.ts`
  - `handleFolderClick`
  - Special-folder checks in filtering/title logic.
- `src/components/sidebar.ts`
  - Any special filter click emitters (if present).

## Phase 2: Folder Data Integrity Guardrails

1. Add a startup integrity pass:
   - Detect feeds whose `feed.folder` does not exist in folder tree.
2. Recovery behavior:
   - Preferred: auto-create missing folder path (`ensureFolderExists`) to preserve user intent.
   - Fallback option: move to root with a one-time notice.
3. Enforce path existence in write flows:
   - Add/edit/import feed paths should always pass through `ensureFolderExists`.

### Files

- `main.ts`
  - `loadSettings` post-load integrity routine.
  - `addFeed`, `editFeed`, import paths.

## Phase 3: Sidebar Interaction Cleanup

1. In `renderFolder`, determine if folder is expandable:
   - Expandable if it has subfolders or direct feeds.
2. For non-expandable folders:
   - Hide or disable chevron toggle.
   - Clicking row always selects folder.
3. For expandable folders:
   - Keep current split behavior:
     - Chevron toggles collapse.
     - Row click selects folder.

### Files

- `src/components/sidebar.ts`
  - `renderFolder`.
- `src/styles/sidebar.css`
  - Optional chevron-disabled styling.

## Phase 4: Regression Coverage

1. Add targeted tests for:
   - Clicking last folder in list.
   - Clicking nested subfolder.
   - Folder names equal to special keys (`Videos`, `Read`, etc.).
   - Orphan `feed.folder` paths recovery.
2. Add manual QA matrix (desktop + mobile navigation modal).

## Validation Matrix (Manual)

1. Top-level folders:
   - First, middle, last all open expected folder view.
2. Subfolders:
   - Direct click opens subfolder view.
   - Parent click shows parent aggregate view.
3. Reserved-name folders:
   - Folder named `Videos` behaves as normal folder (unless explicitly selecting special filter).
4. Empty/leaf folders:
   - Clear UX, no false "broken click" behavior.
5. Drag/drop and collapse:
   - Existing folder drop and collapse behavior remains intact.

## Rollout Plan

1. Ship Phase 1 + Phase 2 together (core correctness).
2. Ship Phase 3 in same PR if low-risk; otherwise immediate follow-up PR.
3. Include temporary debug logging behind a dev flag for click routing.

## Acceptance Criteria

- Clicking any folder (including last item and subfolders) reliably opens the correct folder view.
- User folder names no longer collide with special filter behavior.
- No orphan folder paths remain after load or feed edits/imports.
- Leaf-folder UI no longer presents misleading toggle behavior.
