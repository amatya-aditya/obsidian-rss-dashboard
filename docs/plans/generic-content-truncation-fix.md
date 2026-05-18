# Implementation Plan: Generic Content Truncation Fix

## Status: ✅ RESOLVED (May 17, 2026)

## Root Cause Analysis & Resolution

The article body text disappearance regression was caused by a **sanitizer crash**, not content selection logic as initially hypothesized. The root cause analysis revealed:

### Actual Root Cause

- In `src/utils/safe-html.ts`, the `sanitizeAndAppendNode` function was using Obsidian's `Document.createEl` helper to create elements during rich sanitization.
- On certain complex HTML structures (e.g., Ars Technica articles with nested divs, figures, figcaptions), `createEl` would throw a `HierarchyRequestError` in specific contexts.
- This error silently broke the sanitization flow, leaving the main article body element empty and unpopulated.

### Solution Implemented

1. **Sanitizer Fix** (`src/utils/safe-html.ts`):
   - Replaced `ownerDoc.createEl(tag as keyof HTMLElementTagNameMap)` with `ownerDoc.createElement(tag)`.
   - Uses standard DOM APIs instead of Obsidian's helper, avoiding context-dependent errors.
   - **Result**: Rich HTML is now safely sanitized without crashes; article bodies display correctly.

2. **Regression Test** (`test_files/unit/utils/safe-html.test.ts`):
   - Added comprehensive test case `regression: rich mode with complex nested structures does not throw HierarchyRequestError`.
   - Tests with realistic Ars Technica-style HTML: articles, headers, figures, figcaptions, nested blockquotes, lists.
   - Verifies no exceptions are thrown, output is correct, and unsafe tags are properly stripped.

3. **Secondary Fix** (`src/utils/window-instanceof.ts`):
   - Implemented `windowInstanceOf` safe fallback helper for cross-realm `instanceof` checks.
   - Deployed across all reader surfaces: `article-list.ts`, `sidebar.ts`, `discover-view.ts`, `podcast-player.ts`, `tags-dropdown-portal.ts`.
   - Prevents `activeWindow.instanceOf is not a function` errors in edge cases.

## Original Plan Context

This plan was initially designed to implement a content quality comparator to prefer rich feed content (e.g., `content:encoded`) over thin fetched content. However, runtime diagnosis revealed the actual issue was sanitization safety, not selection logic. The original planned phases (Quality Evaluator, ReaderView/ArticleRenderer integration, Cleanup Hardening) were superseded by the simpler, targeted fix.

## Goals

- ✅ Ensure rich feed content is displayed correctly without sanitization crashes.
- ✅ Maintain existing restricted/paywall behavior.
- ✅ Avoid regressions in sanitization safety.
- ✅ Add robust cross-realm error handling for UI checks.

## Files Changed

1. **src/utils/safe-html.ts**: Replaced Obsidian-specific DOM helper with standard API.
2. **test_files/unit/utils/safe-html.test.ts**: Added regression test for rich HTML sanitization.
3. **src/utils/window-instanceof.ts**: New safe fallback helper for instanceof checks.
4. **src/components/article-list.ts, sidebar.ts, discover-view.ts, podcast-player.ts, src/utils/tags-dropdown-portal.ts**: Deployed `windowInstanceOf` helper.
5. **CHANGELOG.md**: Documented fixes.

## Verification ✅

- ✅ Regression test for sanitizer passes.
- ✅ All ESLint checks on test files pass.
- ✅ No debug/instrumentation code remains.
- ✅ TypeScript compilation clean.
- ✅ Safe fallback helper deployed and used across all reader surfaces.

## Lessons Learned

1. Obsidian DOM helpers (createEl, Document methods) are not always safe in all contexts; standard DOM APIs are more reliable in utility/helper code.
2. Runtime instrumentation with gated logging is effective for isolating root causes in DOM operations.
3. Cross-realm error handling (`instanceof` checks) needs defensive programming for robust UX across edge cases.
