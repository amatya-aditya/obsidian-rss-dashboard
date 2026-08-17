---
status: blocked
owner: unassigned
created: 2026-08-16
issue: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/167
milestone: vNext
workstream: feed-refresh
sequence: 2
depends_on:
  - https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/166
release_requirement: required
implementation: ""
---

# Refresh Status and Progress Indicators

## Status

- **Classification:** User-visible feature.
- **Risk:** High. Shared refresh state, persisted global metadata, scope
  aggregation, desktop/mobile/popout UI, and accessibility are affected.
- **Prerequisite:** [Per-feed auto-refresh scheduling fix](../archive/plans/unreleased/166-per-feed-auto-refresh-scheduling.md)
  must be implemented, validated, committed, and archived first.
- **Next stage:** [Retry failed feeds with Shift+click](168-retry-failed-feeds.md).

Do not implement this plan against the current global-only scheduler. Begin only
after the prerequisite's per-feed completion field and orchestration contract
are stable.

## Problem

The dashboard does not show when its current feed scope was last checked or
whether matching feeds are refreshing. The legacy `lastRefreshTimestamp` is
ambiguous because single-feed, folder, subset, and global operations overwrite it.

## Product contract

### Timestamp semantics

- Consume `Feed.lastRefreshAttemptCompletedAt` from the completed scheduling fix.
- A failure advances last-checked time while `lastFetchError` reports failure separately.
- Add `RssDashboardSettings.lastGlobalRefreshCompletedAt`, defaulting to `0`.
- Advance global completion after every targeted attempt in an explicit global
  operation settles, including partial failure.
- Do not advance it for fatal orchestration failure, cancellation/unload, an
  empty or excluded-only set, or non-global operations.
- Global intent includes manual **Refresh all feeds** and any startup/automatic
  operation explicitly issued for the entire eligible set. It excludes single,
  folder, selection, due-subset, and failed-only batches.
- A global operation includes custom-interval and automatic-Off feeds and omits
  only feeds excluded from global refresh.

### Scope resolution

- All feeds and article-only views over all feeds show **Last global refresh**.
- A single feed shows its own last-completed attempt.
- Folder and multi-selection scopes show the oldest completion among selected
  non-excluded feeds, including descendant folders.
- Read, Unread, Saved, tag, search, and other article filters do not change the
  underlying refresh scope.
- Excluded feeds do not participate in aggregate coverage, failure, automatic-Off,
  never-checked, or next-due calculations; report them in a separate excluded count.
- One eligible never-checked member makes aggregate coverage **Not yet**.
- Empty and excluded-only scopes are **Not applicable**.

### Static display and activity

- Use static, locale-aware absolute time, such as `Aug 16, 2026, 2:41 PM`.
- Do not create a clock or polling timer for relative time.
- Detail popups add seconds and timezone.
- Before an attempt, show `Last checked: Not yet`.
- During work, retain the previous completion and append `In progress`; aggregate
  scopes use `Refreshing n feeds...`.
- After failure, append `Last attempt failed` for one feed or
  `Feeds currently failing: n` for aggregates.
- This feature must not advertise Shift+click retry before stage 3 exists.

### Status bar

Append to the existing article-count/filter subheader:

- All-feed scope: `| Last global refresh: <value>`
- Feed/folder/multi-selection: `| Last checked: <value>`
- Conditional failure and activity segments only when applicable.
- Preserve existing count/filter wording.
- The existing **Show status bar** setting controls visibility; add no new toggle.
- Update activity without rebuilding or scrolling the article list.

### Sidebar details

Provide one reusable accessible detail interaction for All feeds, folder rows,
and feed rows.

- Open after a short hover delay or keyboard focus and anchor beside the row.
- Keep open while row or popup remains hovered/focused.
- Close on exit, blur, Escape, rerender, or teardown.
- Use owning-document/window APIs for popouts.
- Add **Refresh details** to corresponding context menus for touch/mobile.
- Provide an equivalent accessible description for screen readers.

| Scope | Conditional content |
| --- | --- |
| Feed | Exact last checked; effective interval; exact next due; error; In progress; Automatic refresh Off; Excluded from global refresh |
| Folder/selection | Exact aggregate coverage; earliest next due; failing, refreshing, Off, excluded, and never-checked counts |
| All feeds | Exact global completion; aggregate coverage; earliest scheduled refresh; failing, refreshing, Off, excluded, and never-checked counts |

Omit zero counts. A feed's own popup still shows its history and error when excluded.
Use `Feeds currently failing: n`, `Feeds excluded from global refresh: n`,
`Automatic refresh off: n`, `Feeds not yet checked: n`, and
`Next scheduled refresh: <value>` where applicable.

## Persistence and compatibility

- Persist `lastGlobalRefreshCompletedAt` with default `0`.
- Do not seed it from legacy `lastRefreshTimestamp`; the legacy scope is ambiguous.
- Keep the legacy field readable for compatibility but stop updating or using it
  for refresh behavior or UI.
- Preserve the new global field through settings clone/load/backup paths.
- Active state and derived next-due values remain device-local and unpersisted.

## Code seams

- `src/types/types.ts`: add the unambiguous global-completion setting and default.
- `main.ts`: set global completion only for explicit completed global intent;
  expose device-local active feed IDs and notify open dashboard views as activity changes.
- New refresh-status utility: aggregate completion, applicability, counts,
  failures, active membership, automatic-Off state, and earliest next due.
- `src/utils/settings-loader.ts` and storage services: normalize and preserve global completion.
- `src/views/dashboard-view.ts`: resolve feed scope independently of article
  filters and append formatted status at the existing construction point.
- `src/components/sidebar.ts`: add row triggers and context-menu details without
  disturbing selection, refresh-icon, or error-badge behavior.
- New reusable popup and scoped styles: sanitized text, complete cleanup,
  Obsidian variables, keyboard/touch/mobile/popout support, and no `!important`.
- `docs/development/data-flow.md`: document timestamp and global-intent semantics.

## TDD sequence

Follow Red -> Green -> Refactor and keep every phase green.

1. **Global semantics and persistence:** test partial success, non-global scopes,
   empty/excluded/fatal operations, defaulting, storage preservation, and legacy isolation.
2. **Scope aggregation and formatting:** test feed, descendant folder, all,
   multi-selection, article filters, excluded-only, empty, never-checked, counts,
   next due, failure, active state, and deterministic locale/timezone output.
3. **Status bar:** jsdom tests for every scope/state, preserved counts, visibility
   toggle, activity-only updates, and absence of UI polling.
4. **Sidebar details:** jsdom tests for hover/focus delay, conditional content,
   context menus, Escape/exit/blur/rerender/teardown cleanup, existing row actions,
   second-document popouts, and accessibility.
5. **Documentation and changelog:** update data flow and add the validated feature entry.

## Acceptance criteria

1. All-feed status shows only explicit global-operation completion.
2. Feed, folder, selection, and filtered views resolve the agreed underlying scope.
3. Partial failures advance completion while errors remain separately visible.
4. Status text uses static absolute local time and accurately shows progress.
5. Excluded, Off, never-checked, failing, refreshing, and next-due details follow the contract.
6. Status-bar visibility remains controlled by the existing setting.
7. Hover, keyboard, context-menu, mobile, screen-reader, and popout paths work.
8. No retry-failed gesture or hint is implemented in this stage.
9. Required focused/full validation and manual checks pass.
10. The feature has its own commit, and this plan is archived before stage 3 begins.

## Validation and handoff gate

Run focused tests, ESLint for changed TypeScript, `npm run check:platform`, CSS
scope/important checks for CSS changes, `npm exec -- tsc --noEmit --skipLibCheck`,
the full `npm run test:unit`, and `npm run build`. Finish with
`git status --short` and verify no generated artifacts appeared.

Manually cover all scopes after success, partial failure, timeout, recovery, and
active refresh; mixed custom/Off/excluded/never-checked folders; article filters;
empty scopes; main window, popout, mobile context menu, keyboard, screen reader,
light/dark themes, narrow layouts, long errors, reload, and synchronized metadata.

After every required check passes:

1. Add one concise **Unreleased -> Features** changelog bullet.
2. Reconcile this plan with actual behavior, tests, limitations, and manual checks.
3. Move it to `docs/archive/plans/unreleased/` and update all links and the catalog.
4. Commit the complete indicator feature independently.
5. Only then begin the linked failed-feed retry plan.

## Non-goals

- Implementing or repairing per-feed scheduling; that is the prerequisite.
- Folder-specific refresh intervals.
- Relative-time display or UI polling.
- Rapid retry, exponential backoff, or distributed locking.
- Shift+click failed-only retry or its instructional hint.
- Listing every failing feed in aggregate popups.
- Removing legacy `lastRefreshTimestamp` in this migration.
