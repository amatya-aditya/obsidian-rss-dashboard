# Add `Inline` Reader Location To Open Articles Inside The Dashboard

This task will introduce a new `inline` reader location option, allowing users to view articles within the dashboard's main area instead of opening a new reader leaf.

We followed a red-green TDD approach: phase 0 tests were written first, then the implementation skeleton was built. The build is partially complete — see **Current Status** and **Remaining Work** below.

---

## Current Status

### ✅ Completed

| Area                                | Detail                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `types.ts`                          | `ViewLocation` extended with `"inline"`                                                                     |
| `general-settings-tab.ts`           | `"Inline (inside dashboard)"` option added to dropdown                                                      |
| `dashboard-view.ts`                 | `inlineArticle: FeedItem \| null` state added                                                               |
| `dashboard-view.ts`                 | `renderInlineArticle(container)` method implemented (back button + `ArticleRenderer`)                       |
| `dashboard-view.ts`                 | `render()` branches on `inlineArticle` → calls `renderInlineArticle()`                                      |
| `dashboard-view.ts`                 | Navigation callbacks (folder/feed/filter) reset `inlineArticle = null`                                      |
| `article-renderer.ts`               | `ArticleRenderer` class extracted to `src/components/article-renderer.ts`, injected into `RssDashboardView` |
| `dashboard-reader-location.test.ts` | TDD tests written; 8 of 10 pass                                                                             |
| TypeScript                          | `npx tsc --noEmit` is clean                                                                                 |

### ❌ Failing Now (2 test failures)

**1. `getConfiguredReaderLeaf()` missing `"inline"` branch**

In `dashboard-view.ts`, the `getConfiguredReaderLeaf()` switch falls through to `default` when `readerViewLocation === "inline"`, which calls `workspace.getLeaf("split")` before the inline guard is ever reached. Fix: add `case "inline": return null` so the guard at line ~2805 takes over cleanly.

```ts
// dashboard-view.ts → getConfiguredReaderLeaf()
case "inline":
  return null;
```

**2. Inline `handleOpenInReaderView` test checks `renderInlineArticle` was called directly**

The tests mock `view.render = vi.fn()`, so `renderInlineArticle` (which is only called inside `render()`) is never reached. The test assertion on line 386 must be changed to verify `view.render` was called instead.

```ts
// dashboard-reader-location.test.ts — test "uses inline mode for explicit open-in-reader actions too"
// Change:
expect((view as any).renderInlineArticle).toHaveBeenCalled();
// To:
expect(view.render).toHaveBeenCalled();
```

---

## Remaining Work

### 1. Fix `getConfiguredReaderLeaf()` — `"inline"` falls to `default`

**File**: [dashboard-view.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/dashboard-view.ts)

Add `case "inline": return null;` to the `getConfiguredReaderLeaf()` switch statement. This prevents `getLeaf("split")` from being called before the inline guard in `openArticleInConfiguredReaderLocation`.

### 2. Fix stale test assertion — `renderInlineArticle` vs `render`

**File**: [dashboard-reader-location.test.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/views/dashboard-reader-location.test.ts)

In the test `"uses inline mode for explicit open-in-reader actions too"` (line ~386), replace the `renderInlineArticle` call assertion with a `view.render` call assertion. The private method is only reachable through `render()`, which is the correct observable boundary in unit tests.

### 3. Remove stale `@ts-expect-error` comments in tests

**File**: [dashboard-reader-location.test.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/test_files/unit/views/dashboard-reader-location.test.ts)

Three test cases suppress a TS error for `settings.readerViewLocation = "inline"` with `// @ts-expect-error adding inline value`. Since `"inline"` is now part of `ViewLocation`, these suppressions are stale and should be removed.

### 4. Add CSS for inline reader layout

**File**: [styles.css](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/styles.css) (or the appropriate split style source)

The following class names are emitted by `renderInlineArticle()` but have no defined styles:

- `.inline-reader-header` — flex row containing the back button and article title
- `.rss-reader-back-button` — back-arrow icon button
- `.inline-reader-content` — scrollable article body area

Styles should mirror the basic layout of the standalone `rss-reader-*` layout but scoped inside the dashboard container, without the fixed-position chrome.

### 5. Migrate `reader-view.ts` to use `ArticleRenderer` (optional but planned)

**File**: [reader-view.ts](file:///c:/Obsidian/Obsidian_Main/.obsidian/plugins/obsidian-rss-dashboard/src/views/reader-view.ts)

`reader-view.ts` still has its own `renderArticle()` / `displayVideo()` / `displayPodcast()` logic that duplicates what `ArticleRenderer` now provides. The original plan called for `ArticleRenderer` to be the single shared rendering layer for both the standalone reader and the inline dashboard view. This migration is the larger follow-on refactor and can be tracked separately if needed.

---

## Original Proposed Changes (for reference)

### 1. Types ✅

`ViewLocation` extended with `"inline"` in `types.ts`.

### 2. Settings Tab ✅

`"Inline (inside dashboard)"` option added to the `Reader view location` dropdown.

### 3. Tests (Phase 0 — TDD) ✅ partial

Tests written in `dashboard-reader-location.test.ts`. 8 pass; 2 fail (see Remaining Work above).

### 4. Dashboard View ✅ partial

`inlineArticle` state, `renderInlineArticle()`, `render()` branching, and navigation resets are all implemented. The `getConfiguredReaderLeaf()` fix (item 1 of Remaining Work) is the only outstanding implementation gap.

### 5. `ArticleRenderer` component ✅

`src/components/article-renderer.ts` created, wired into `RssDashboardView`. The decision to keep the filename as-is was confirmed.

---

## Verification Plan

### Automated Tests

- Fix items 1–3 above, then run `npm run test` to confirm all 10 tests pass (TDD Green).
- Ensure no regressions in the wider test suite.
- Run `npm run build` to confirm a clean production build.

### Manual Verification

- Confirm "Inline" option appears and saves in **Settings → General**.
- Click an article in the dashboard — it should open inline, no split pane.
- Click the back arrow or any sidebar navigation item — the article list should be restored.
- Confirm podcast and video articles render correctly in inline mode.
