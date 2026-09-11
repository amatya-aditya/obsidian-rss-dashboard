---
status: pending-release
created: 2026-09-07
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/213"
milestone: ""
owner: unassigned
workstream: ""
sequence: null
depends_on: []
release_requirement: ""
implementation: ""
---

# Configurable Retention Protections and Unread Article Expiration

This plan specifies making unread article expiration the default behavior after the configured auto-delete cutoff, introducing configurable retention protections (starred, saved, tagged, unread), and adding an explicit confirmation prompt when users make destructive retention changes.

## Problem Statement

Users experience unexpected storage accumulation where articles remain for weeks or months despite setting a short auto-delete duration (e.g. 3 or 7 days). This stems from an architectural discrepancy:

- Carry-forward logic in `src/services/feed-parser/feed-parser-class.ts` drops old unread articles that drop off the upstream feed XML.
- In-memory retention checks (`applyFeedRetentionLimits` in `src/services/feed-parser/feed-retention.ts`) unconditionally exempt unread articles (`if (!item.read) return true;`), keeping them indefinitely if the upstream feed retains them in its XML.

In a local-first Obsidian vault where users cannot mark every article as read, unread articles naturally accumulate and consume storage. Furthermore, users lack granular control over which article states shield articles from deletion, and changing retention settings currently lacks an explicit confirmation option to choose between immediate or deferred pruning.

## Solution Overview

1. **Unread Article Expiration**: Make unread articles subject to auto-deletion by default once their publication date crosses the auto-delete cutoff.
2. **Configurable Retention Protections**: Introduce four global toggle switches in General Settings under Data Retention:
   - `Protect starred articles` (Default: ON)
   - `Protect saved articles` (Default: ON)
   - `Protect tagged articles` (Default: OFF)
   - `Protect unread articles` (Default: OFF)
     Protected articles are immune to both the auto-delete cutoff and `maxItemsLimit` feed trimming.
3. **Destructive Action Confirmation Prompt**: When tightening retention (turning OFF any protection or shortening auto-delete duration), display a confirmation modal with three choices:
   - **Apply Now**: Prunes all feeds immediately and refreshes active views.
   - **Apply on Next Refresh**: Saves settings, deferring cache pruning until natural feed refreshes.
   - **Cancel**: Reverts the toggle or slider without saving.
     Non-destructive changes apply immediately without prompting.
4. **Clean Zero-State Experience**: When all articles in a feed are pruned by retention, rely on the existing `AllArticlesPrunedByRetention` empty state rather than retaining stale ghost articles.

---

## Phased Implementation Tasks (Tracer Bullets)

### Phase 1: Unread Article Auto-Deletion & Retention Engine Core

- [x] Add `protectStarred: boolean` (default: `true`), `protectSaved: boolean` (default: `true`), `protectTagged: boolean` (default: `false`), and `protectUnread: boolean` (default: `false`) to `RssDashboardSettings` and `DEFAULT_SETTINGS` in `src/types/types.ts`.
- [x] Normalize missing retention protection fields in `src/utils/settings-loader.ts` to their default values for backward compatibility.
- [x] Update `isProtectedItem` in `src/services/feed-parser/feed-retention.ts` to evaluate the unified retention protection configuration:
  - Starred items protected when `protectStarred` is true
  - Saved items protected when `protectSaved` is true
  - Tagged items (`item.tags && item.tags.length > 0`) protected when `protectTagged` is true
  - Unread items (`!item.read`) protected when `protectUnread` is true
- [x] Update `applyFeedRetentionLimits` in `src/services/feed-parser/feed-retention.ts` to use `isProtectedItem` with the configured protections, removing the hardcoded `if (!item.read) return true;`.
- [x] Align carry-forward and fresh item filtering in `src/services/feed-parser/feed-parser-class.ts` to evaluate the unified `isProtectedItem` predicate with current plugin settings.
- [x] Pass retention protections to `isProtectedItem` in `maxItemsLimit` pruning so protected items are preserved while excess unprotected items are trimmed by newest date.
- [x] Unit tests in `test_files/unit/services/feed-parser/feed-retention.test.ts`:
  - Unread items older than cutoff expire when `protectUnread` is false.
  - Unread items older than cutoff are retained when `protectUnread` is true.
  - Starred, saved, and tagged items obey their respective protection toggles.
  - Protected items survive `maxItemsLimit` pruning.
- [x] Regression unit tests in `test_files/unit/services/feed-parser/feed-parser-class.test.ts` verifying refresh carry-forward and fresh XML ingest with unified protections.

### Phase 2: Retention Protection Toggles in General Settings

- [x] Render a "Protected from Auto-Deletion" section in `src/settings/tabs/general-settings-tab.ts` under Data Retention.
- [x] Add 4 Obsidian toggle switches with concise labels:
  - "Protect starred articles"
  - "Protect saved articles"
  - "Protect tagged articles"
  - "Protect unread articles"
- [x] Each toggle reflects `plugin.settings` state; changing persists via `plugin.saveSettings()`.
- [x] Unit tests in `test_files/unit/settings/general-settings-tab.test.ts` verifying toggle rendering, interaction, and persistence.

### Phase 3: Destructive Retention Change Confirmation Modal

- [x] Create `RetentionChangeConfirmModal` (extending Obsidian's `Modal`):
  - Explanatory message indicating that newly unprotected or older articles will be permanently removed.
  - Action buttons: "Apply Now", "Apply on Next Refresh", and "Cancel".
- [x] In `GeneralSettingsTab`, intercept toggle transitions from `true` to `false` to open the confirmation modal.
- [x] In `GeneralSettingsTab`, intercept changes to `defaultAutoDeleteDuration` when the new value is less than the previous value to open the modal.
- [x] "Apply Now" saves settings, runs `plugin.applyFeedLimitsToAllFeeds()`, and displays a notice.
- [x] "Apply on Next Refresh" saves settings with `plugin.saveSettings()` without immediate limit application.
- [x] "Cancel" (or escape) reverts the UI element without saving.
- [x] Non-destructive updates (enabling protection, lengthening duration) save immediately without modal.
- [x] Unit tests in `test_files/unit/settings/general-settings-tab.test.ts` verifying modal triggering, execution, and rollback.

### Phase 4: Documentation, ADR-0002 & Changelog

- [x] Create `docs/adr/0002-configurable-retention-protections-and-unread-expiration.md` documenting context, decision, trade-offs, and consequences.
- [x] Update `docs/development/data-flow.md` to remove "Unread articles are never removed by this rule" and describe the configurable retention protection model.
- [x] Add entry under `## [Unreleased]` in `CHANGELOG.md`.

---

## Acceptance Criteria

1. Unread articles older than `autoDeleteDuration` are automatically purged during feed refresh and manual limit applications by default (`protectUnread: false`).
2. Users can enable `protectUnread` or `protectTagged` in General Settings to prevent those articles from being deleted.
3. Toggling off any protection or decreasing auto-delete duration triggers the confirmation modal with "Apply Now", "Apply on Next Refresh", and "Cancel" options.
4. Non-destructive adjustments save immediately with no prompt.
5. All automated unit tests and platform compliance checks pass with zero lint violations.
