---
status: implemented
completed: 2026-08-24
released_in: unreleased
issue: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/185
implementation: ""
---

# Make Mark all read/unread controls update article state

## Problem

Issue #185 reports that choosing **Mark all: Read** from the article-header
controls only refreshes the dashboard: unread cards remain visible. The same
action is exposed from the responsive hamburger menu and the desktop header,
so their behavior must remain equivalent.

## Scope and intended behavior

Both the hamburger-menu controls in `ArticleHeaderMenu` and the desktop
controls in `ArticleHeader` must apply their requested read state to every
article in the current filtered dashboard view. The filter boundary includes
the active feed/folder/tag selection, search query, status filters, age filter,
and other existing dashboard filters.

- **Read** marks each currently visible-in-scope unread article as read.
- **Unread** marks each currently visible-in-scope read article as unread.
- The UI updates to reflect the new state, including status-filtered results,
  badges, and empty-state messaging where relevant.
- The mutation persists through the plugin's established settings/storage path,
  so reopening the dashboard does not restore the previous state.
- A no-op action retains the existing user-facing feedback when no matching
  articles are available.

## Implementation direction

1. Reproduce the state transition through each header control and trace the
   callbacks through `src/components/article-header-menu.ts`,
   `src/components/article-header.ts`, `src/components/article-list.ts`, and
   `src/views/dashboard-view.ts`.
2. Repair the shared dashboard action/state-render boundary rather than adding
   divergent mutations to individual controls.
3. Keep the existing action boundary (`getFilteredArticles()`); this work does
   not change all stored articles outside the active dashboard view.
4. Preserve responsive and popout-safe DOM ownership conventions.

## Implemented approach

`getFilteredArticles()` deliberately creates display copies so it can attach
feed context without mutating stored feed items. The original bulk actions
mutated those copies, then saved and rendered the unchanged stored state.

The shared read-state action now resolves every filtered display item through
the existing `findBackingArticleForDisplayItem()` helper before changing its
`read` value. Both Read and Unread call that shared action and retain their
existing notices, persistence, and render scheduling.

## Validation

- Added jsdom regression coverage for read and unread transitions against the
  stored backing items, including unread-filter scoping. Existing header tests
  cover forwarding from both hamburger and desktop controls.
- Passed `npm.cmd run test:unit -- test_files/unit/views/dashboard-filter-persistence.test.ts`.
- Passed changed-file ESLint with zero warnings and `npm.cmd run check:platform`.
- Passed `npm.cmd run build`, including compliance checks, full lint,
  TypeScript checking, and production bundling.
- Manual desktop, narrow/mobile, and reopen checks remain recommended before
  release because this environment does not run an Obsidian client.

## Non-goals and risks

- Do not redefine **Mark all** to affect articles outside the current filtered
  dashboard view.
- Do not add a new persistence mechanism or alter article storage formats.
- Main risk: a render may recreate controls while a state mutation is pending;
  tests must assert observable article state and post-render results rather
  than only callback invocation.
- Risk classification: **medium**. This changes dashboard UI state and its
  persisted backing items, but reuses an existing backing-item lookup and
  introduces no storage-format or lifecycle changes.

## Triage

This is an open bug with no milestone. Recommend evaluating it for `vNext` as
release-required because it repairs a visible, core article-state control;
leave the milestone and release requirement blank until maintainers confirm
release scope.
