# RSS Dashboard Design Spec

## Update History

- 2026-03-04: Initial draft

## Purpose

This document defines the UI design rules for the plugin so visual changes are consistent, intentional, and reviewable.

## Scope

- Dashboard sidebar and header controls
- Discover sidebar controls
- Modal/mobile navigation surfaces
- Typography and hierarchy for interactive controls
- Breakpoint behavior

## Source of Truth Files

- `src/styles/layout.css`
- `src/styles/discover.css`
- `src/styles/modals.css`
- `src/styles/controls.css`
- `src/styles/sidebar.css`

If this spec conflicts with existing CSS, update CSS to match this spec unless there is a documented exception.

## Design Principles

1. Clear hierarchy: global navigation must read as primary; section navigation must read as secondary.
2. Low visual noise: avoid unnecessary dark strips, heavy fills, and duplicate dividers.
3. Theme-native color usage: prefer Obsidian variables over hardcoded values.
4. Compact touch-safe layout: maintain tap targets without bloating vertical rhythm.
5. Accessibility first: preserve visible focus states and readable contrast in dark/light themes.

## Navigation Hierarchy

### Tier 1: Primary Tabs

Primary tabs are `Dashboard` and `Discover`.

Visual rules:

- Filled active state
- Higher emphasis than all secondary controls
- Font size is one step above secondary tabs at same breakpoint

Canonical selector:

- `.rss-dashboard-nav-button`

### Tier 2: Secondary Tabs

Secondary tabs are `Types`, `Categories`, `Tags` in Discover.

Visual rules:

- Tab semantics, not button semantics
- Inactive: text-only, no fill
- Active: accent text + underline indicator
- Hover: color emphasis only (no full fill)
- Must appear lower priority than Tier 1

Canonical selector:

- `.rss-discover-sidebar-nav button`

## Tab Component Specs

### Primary Tabs (Dashboard/Discover)

- Display: centered inline-flex
- Active treatment: filled accent background
- Typography:
  - Weight: semibold
  - Line-height: tight (around `1.1`)
- Shape:
  - Rounded rectangle (not capsule)
- Size contract:
  - Keep visibly larger than secondary tabs at each breakpoint

### Secondary Tabs (Types/Categories/Tags)

- Display: centered inline-flex
- Base surface: transparent
- Border: no box border, bottom indicator only for active state
- Typography:
  - Weight: medium inactive, semibold active
  - Line-height: compact (`1.0`)
- Size contract:
  - At least one scale step smaller than primary tabs

## Breakpoints and Behavior

- Desktop: `> 1200px`
- Tablet and below: `<= 1200px`
- Mobile: `<= 768px`

Rules:

1. Preserve the same hierarchy model at all breakpoints.
2. Modal overrides must not invert hierarchy.
3. Discover secondary tabs must keep tab semantics in both sidebar and modal.
4. Any breakpoint-specific overrides for nav controls must be declared in one place per component and referenced here.
5. Mobile sidebar modal header top spacing must be status-bar aware and may include platform-scoped overrides.

### Modal Header Inset Ownership

- Platform marker classes (`.rss-mobile-platform-ios`, `.rss-mobile-platform-android`) live on mobile modal root elements.
- Mobile sidebar header top-padding tokens and rules are defined in `src/styles/modals.css`, including `.modal.rss-mobile-navigation-modal .rss-dashboard-header` and `.modal.rss-mobile-discover-filters-modal .rss-discover-header`.

## Color and Token Usage

Preferred tokens:

- `--color-accent`
- `--interactive-accent`
- `--interactive-accent-hover`
- `--text-normal`
- `--text-muted`
- `--text-on-accent`
- `--background-primary`
- `--background-modifier-border`

Rules:

1. Use tokens before introducing hardcoded colors.
2. Hardcoded color values require a comment explaining why token usage is insufficient.
3. Keep active vs hover distinctions consistent across components.

## Spacing and Density

Rules:

1. Do not rely on dark strips to imply hierarchy.
2. Use spacing + typography + state treatment to communicate importance.
3. Avoid large top/bottom padding around tab rows unless required for touch targets.
4. Keep section dividers subtle and singular.

## Accessibility

Minimum expectations:

1. `:focus-visible` outlines on keyboard-focusable nav controls.
2. Active/inactive states remain distinguishable without hover.
3. Text remains single-line for nav labels (`white-space: nowrap`).
4. Interaction targets remain usable on touch screens.

## Implementation Constraints

1. CSS-only visual spec unless behavior changes are needed.
2. Preserve existing class names where possible.
3. Avoid duplicate competing rules across `layout.css`, `discover.css`, and `modals.css`.
4. For new nav variants, document selector ownership in this file.

## Review Checklist for UI PRs

1. Does the change preserve Tier 1 vs Tier 2 hierarchy?
2. Are all breakpoints consistent?
3. Are modal overrides aligned with non-modal behavior?
4. Are only tokenized colors used (or justified exceptions documented)?
5. Are focus-visible and contrast preserved?
6. Is the change reflected in this spec if behavior or styling conventions changed?

## Change Management

When a visual pattern changes:

1. Update this spec in the same PR.
2. Link affected selectors/files in PR notes.
3. Include before/after screenshots for desktop + mobile modal where relevant.

## Known Current Conventions (March 2026)

- Primary tabs are implemented in `layout.css` and overridden in `modals.css`.
- Discover secondary tabs are implemented in `discover.css`, including modal-specific rules.
- Discover secondary tabs use an underline active state to remain visually subordinate to primary tabs.
