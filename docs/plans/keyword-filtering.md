# Keyword Filtering Feature Plan

## Feature Overview and Goals

Add a keyword-based filtering system with two scopes:

1. Global filters configured in plugin settings under a new `Filters` tab.
2. Per-feed filters configured in both `Add feed` and `Edit feed` modals.

Core goals:

- Support include/exclude rules with exact/partial matching.
- Support location targeting per rule: `Title`, `Summary`, `Content`.
- Make filtering case-insensitive by default.
- Respect precedence: `Bypass All` -> `Per-feed Override` -> `Per-feed + Global`.
- Show reactive filtering stats in a new dashboard subheader.
- Persist all filter data in `data.json` via existing plugin settings save/load flow.

## Architecture Decisions and Notes

### 1) Data Model and Storage

Add new types in settings and feed config:

- `KeywordFilterType`: `"include" | "exclude"`
- `KeywordMatchMode`: `"exact" | "partial"`
- `KeywordFilterRule`: one rule row with:
  - `id: string`
  - `type: "include" | "exclude"`
  - `keyword: string`
  - `matchMode: "exact" | "partial"`
  - `applyToTitle: boolean`
  - `applyToSummary: boolean`
  - `applyToContent: boolean`
- `GlobalKeywordFilters`: `{ rules: KeywordFilterRule[] }`
- `FeedKeywordFilters`: `{ overrideGlobalFilters: boolean; rules: KeywordFilterRule[] }`

Storage location:

- Global: `settings.filters`
- Per-feed: `feed.filters`

Persistence:

- Continue using `saveSettings()`/`loadSettings()`; this writes to `data.json`.
- Add default/migration guards so older installs initialize missing filter objects safely.

### 2) Matching Behavior

- Case-insensitive by default.
- `Partial` mode: substring match.
- `Exact` mode: whole-word / boundary-safe phrase match (`book` does not match `bookshelf`).
- A rule matches an article if it matches in at least one selected location.
- Location source fields:
  - `Title` -> `item.title`
  - `Summary` -> `item.summary` (fallback to derived/cleaned summary if needed)
  - `Content` -> `item.content` (fallback to `item.description`)

### 3) Rule Combination Semantics

- Include rules: all active include rules must match (AND).
- Exclude rules: if any exclude rule matches, article is removed.
- If there are no include rules, include stage is pass-through.

### 4) Precedence and Pipeline

For each article in the current dashboard scope:

1. If `Bypass All Filters` is enabled, skip all keyword filtering.
2. Else, determine feed-level behavior:
   - If feed has `overrideGlobalFilters = true`, apply only that feed’s rules.
   - Otherwise apply global rules and then feed rules.
3. Then apply existing dashboard status/tag/age filters.

Implementation split recommendation in `dashboard-view.ts`:

- `getScopedArticles()` -> current selection (all/folder/feed/tag).
- `applyKeywordFiltersWithStats(scopedArticles)` -> returns filtered list + stats.
- Existing `matchesFilters()` remains for status/tag/age controls.

### 5) Reactive Subheader Stats

Add a dashboard subheader model with:

- `articlesRetrieved`
- `globalFiltersExcluded`
- `feedFiltersExcluded`
- `finalVisible`
- `bypassActive`

Display behavior:

- Normal active filtering:
  - `Articles retrieved: X | Global filters excluded: Y | Feed filters excluded: Z`
- Bypass state:
  - `Filters bypassed — showing all N articles`
- If no keyword filters are active:
  - hide subheader or show neutral text (final decision below in open questions).

Count logic (no double-count):

- `globalFiltersExcluded` counts removals in global stage.
- `feedFiltersExcluded` counts removals in feed stage after global stage.

### 6) Reusable UI Component Strategy

Create one reusable rule editor component for both:

- Settings `Filters` tab (global rules)
- Add/Edit feed modal collapsible section (feed rules)

This avoids duplicated CRUD logic and keeps rule UI behavior identical across surfaces.

## File Breakdown (Create/Modify) and Why

### New Files

1. `src/services/keyword-filter-service.ts`
   - Encapsulates rule evaluation, exact/partial matching, location checks, and per-article decisioning.
   - Returns filter decision metadata needed for exclusion counts.

2. `src/components/keyword-filter-editor.ts`
   - Shared UI builder for rule list + add/edit/delete interactions.
   - Used by settings and feed modals to keep parity.

### Modified Files

1. `src/types/types.ts`
   - Add filter-related types and extend `RssDashboardSettings` + `Feed`.
   - Add defaults for global filter settings in `DEFAULT_SETTINGS`.

2. `main.ts`
   - Ensure `settings.filters` and feed-level filter data are initialized during load/migration.
   - Extend feed creation/update paths as needed so new feeds can persist modal-configured per-feed filters.

3. `src/settings/settings-tab.ts`
   - Add new top-level `Filters` tab.
   - Add feature description block.
   - Mount global filter rule editor with save + reactive dashboard refresh.

4. `src/modals/feed-manager-modal.ts`
   - In `AddFeedModal`: add collapsible `Filters` section using shared editor.
   - In `EditFeedModal`: add collapsible `Filters` section + `Override Global Filters` toggle.
   - Persist per-feed filters to `feed.filters`.

5. `src/views/dashboard-view.ts`
   - Introduce keyword filtering pipeline and precedence logic.
   - Compute and render subheader stats.
   - Add runtime bypass flag and wire filter bypass behavior.

6. `src/components/article-list.ts`
   - Add `Bypass All Filters` checkbox to existing Filters dropdown.
   - Emit callback event to dashboard view when toggled.

7. `src/styles/settings.css`
   - Style global filters tab sections and rule rows.

8. `src/styles/modals.css`
   - Style collapsible per-feed filters sections and controls.

9. `src/styles/controls.css`
   - Style dashboard subheader bar and responsive behavior.

10. `src/styles/dropdown-portal.css`
   - Style/spacing for the new bypass item in the filter dropdown menu.

11. `src/styles/responsive.css` (if needed after implementation pass)
   - Mobile/tablet adjustments for subheader and modal filter editor layout.

## Ordered Implementation To-Do (Phased, Granular)

### Phase 1: Data Model and Storage

1. Add new filter enums/interfaces to `src/types/types.ts`.
2. Extend `Feed` with `filters` object.
3. Extend `RssDashboardSettings` with global `filters` object.
4. Add global filter defaults to `DEFAULT_SETTINGS`.
5. Add load-time guards/migrations in `main.ts` for `settings.filters`.
6. Add load-time guards/migrations in `main.ts` for missing `feed.filters`.
7. Update feed creation path to optionally accept/store per-feed filter config.

### Phase 2: Global Settings UI (`Filters` Tab)

1. Add `Filters` to `tabNames` in `settings-tab.ts`.
2. Add `case "Filters"` branch in `display()` switch.
3. Implement `createFiltersSettings(containerEl)` entry method.
4. Add top explanatory description text.
5. Build reusable UI integration for global rule list rendering.
6. Implement add-rule action (default starter rule).
7. Implement rule type selector (`Include`/`Exclude`).
8. Implement keyword/phrase text input with trim validation.
9. Implement match mode selector (`Exact`/`Partial`).
10. Implement multi-location toggles (`Title`, `Summary`, `Content`).
11. Implement rule delete action.
12. Save settings + refresh active dashboard view on each change.

### Phase 3: Per-Feed Filters UI (Add/Edit Modals)

1. Create collapsible section container in `AddFeedModal`.
2. Create collapsible section container in `EditFeedModal`.
3. Mount shared rule editor in both modals using feed-level rule state.
4. Add `Override Global Filters` toggle in both modals (or at minimum edit modal per final decision).
5. Ensure add modal passes per-feed filter payload into feed creation call.
6. Ensure edit modal writes changes back to `feed.filters`.
7. Persist via `plugin.saveSettings()` in both save flows.
8. Keep modal keyboard behavior and existing controls unaffected.

### Phase 4: Filter Logic Engine

1. Create `KeywordFilterService` with normalized text helpers.
2. Implement rule sanitization (ignore empty keyword rules).
3. Implement exact matcher with boundary-safe regex escaping.
4. Implement partial matcher with case-insensitive `includes`.
5. Implement location-target evaluation per rule.
6. Implement include-pass decision logic (AND across includes).
7. Implement exclude-pass decision logic (any-match excludes).
8. Implement per-article evaluation method returning:
   - `included: boolean`
   - `excludedBy: "global" | "feed" | "none"`
9. Add unit-test-like local helper checks where possible (or manual verification checklist if no test harness).

### Phase 5: Dashboard Subheader + Integration

1. Add dashboard state for bypass flag and filter stats.
2. Refactor article retrieval into explicit pipeline stages.
3. Apply keyword filtering before existing status/tag/age filters.
4. Compute stage counts: retrieved/global-excluded/feed-excluded/final.
5. Render new subheader element in dashboard content.
6. Update subheader reactively on:
   - settings rule changes
   - feed rule changes
   - folder/feed/tag view changes
   - refresh events
7. Hide or neutralize subheader when no keyword filters active (final behavior per decision).

### Phase 6: Dashboard Filters Dropdown (`Bypass All Filters`)

1. Add bypass menu item and checkbox in `article-list.ts` `showFiltersMenu()`.
2. Add callback payload type for bypass toggles.
3. Handle bypass toggle in `dashboard-view.ts`.
4. Ensure bypass state triggers rerender/refilter immediately.
5. Ensure subheader reflects bypass state message and counts.
6. Ensure bypass does not mutate stored global/per-feed rules.

### Phase 7: Styling and UX Polish

1. Add settings tab styles for rule rows, multi-location controls, and empty state.
2. Add modal styles for collapsible filter sections and override toggle spacing.
3. Add subheader visual styles and spacing with sticky header behavior.
4. Add filter dropdown style tweaks for bypass checkbox row.
5. Add responsive adjustments for modal + subheader on <=1200 and <=768 breakpoints.

### Phase 8: Validation and Regression Checks

1. Validate exact vs partial matching examples from requirements.
2. Validate multiple rule stacking (`include python` + `exclude job posting`).
3. Validate per-feed override behavior against global rules.
4. Validate bypass behavior supersedes all keyword filters.
5. Validate counts in subheader across all view scopes.
6. Validate filter changes persist across Obsidian restart (`data.json`).
7. Run `npm run lint`.
8. Run `npm run build`.

## Open Questions / Confirmations Needed Before Implementation

1. Include-rule logic confirmation: should multiple include rules be strict `AND` (all must match), or should there be an optional `OR` mode?
2. Exact match semantics for multi-word phrases: should `"data science"` require full phrase boundaries on both ends (current plan: yes)?
3. Subheader no-active-filter behavior: prefer hidden entirely, or show neutral text (e.g., `No keyword filters active`)?
4. `Bypass All Filters` persistence: should it be session-only (current plan) or saved to settings?
5. Add-feed override toggle: requirement mentions override option under per-feed filters; confirm this should appear in both add and edit modals (current plan: both for consistency).
6. Should invalid/empty rules be auto-removed on save, or retained but ignored at runtime?
