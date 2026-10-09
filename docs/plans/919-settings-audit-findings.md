---
status: in-progress
created: 2026-10-09
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/919"
milestone: "vNext"
owner: unassigned
workstream: "settings"
sequence: null
depends_on: []
release_requirement: ""
implementation: ""
---

# Settings and Docs Audit Findings Implementation Plan

This plan tracks the implementation of remaining findings identified in [issue #919](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/919) ("Umbrella: settings copy, docs and behavior mismatches found by the wiki audit").

> [!NOTE]
> **Status: Work in Progress (Stalled)**
> This branch (`feat/919-settings-audit-findings`) captures in-flight tracking, scoping, and implementation notes for the unaddressed behavior and cleanup items from #919 before code extraction and PR creation.

## Scope & Workstreams

### 1. Smaller Behavior Issues & Cleanup (In Scope for this workstream)

- [ ] **Dead field cleanup (`customProxyUrls`)**:
  - `customProxyUrls` in settings is never read or referenced in the network/proxy layer.
  - Determine whether to remove from schema with backwards-compatible migration or wire into proxy fallback list.
- [ ] **Hidden settings cleanup**:
  - Settings fields with no UI or active consumers: `openInSplitView`, `useDomainIconsYouTube`, `enableApplePodcastsOpen`, and legacy `autoTagVideos`.
  - Deprecate or remove dead fields cleanly or expose UI controls if still intended.
- [ ] **Delete / Destructive Action Confirmations**:
  - Add accessible confirmation dialogs for:
    - **Reset to default**
    - **Delete this template**
    - **Clear saved playback progress**
    - Tag deletion (ensure tags removed from articles are also cleaned up from folder rules to avoid resurrecting on refresh).
- [ ] **Template assignment cleanup on delete**:
  - Ensure deleting a saved template cleans up or gracefully notifies feeds assigned to it rather than falling back silently.
- [ ] **Add tag validation**:
  - Add input validation to prevent duplicate tag creation or empty/whitespace-only tag names.

### 2. Previously Resolved in #919 / Spun-off Issues (Completed / Out of Scope)

- [x] Settings copy & security disclosure updates (#934)
- [x] Mobile refresh floor & item cap copy in settings UI (#934)
- [x] #927 Full-article auto proxy prefix resolution (#937)
- [x] #928 Fetch timeout setting applied to full article fetches (#939)
- [x] #929 External browser reader location setting removed (#938)
- [x] #930 Empty default tag list treated as no default tag (#936)
- [x] #931 Auto-mark read respect when opening in reader view (#935)
- [x] #932 Web viewer template placeholder fulfillment (#940)
- [x] User-facing documentation page fixes migrated to wiki workstream (#924)

## Architecture & TDD Seams

- **Settings migration and normalization**: Ensure removed fields are cleaned during `loadAndNormalizeSettings` and `migrateSettings` without breaking import bundles.
- **Modals / Confirmation flows**: Use Obsidian's standard modal confirmation pattern with keyboard navigation support (`Enter` to confirm, `Escape` to cancel).
- **Tag management**: Add validation rules in `TagService` / settings tab with focused unit tests in `test_files/unit/`.
