---
status: active
owner: maintainers
last_reviewed: 2026-09-27
obsidian_reference: "1.13.7 desktop"
min_app_version: "1.8.7"
related:
  - docs/adr/0014-obsidian-test-stub-fidelity.md
  - docs/development/compliance-patterns.md
  - docs/development/test_coverage/testing-guide.md
  - docs/development/fixture-vault.md
---

# RSS Dashboard Design Spec

## Update History

- 2026-09-27: Fact-check against the code: stylesheet ownership after the CSS split, Tier 1 navigation (Home, Kagi Small Web, back to Discover), breakpoints, token snapshot, destructive tokens, and the Obsidian 1.13 modal close button. Add metadata, **Testing UI Changes**, and **Open Questions**
- 2026-05-31: Replace !important icon rendering workaround with contain/will-change pattern; add §Android WebView SVG Rendering
- 2026-04-25: Add branding guidance for logo typography and asset storage
- 2026-03-17: Standardize icon rendering using clickable-icon pattern for Android compatibility
- 2026-03-04: Update iPhone modal headroom fix and sync docs
- 2026-03-04: Fix mobile sidebar header top insets for iOS and Android
- 2026-03-04: Initial draft

## Purpose

This document defines the UI design rules for the plugin so visual changes are consistent, intentional, and reviewable.

## Scope

- Dashboard sidebar and header controls
- Discover sidebar controls
- Modal/mobile navigation surfaces
- Branding guidance for logo typography and logo asset organization
- Common CTA, neutral, destructive, and icon-button patterns
- Discover cards and filter control surfaces
- Typography and hierarchy for interactive controls
- Breakpoint behavior

## Source of Truth Files

Styles live in `src/styles/`, one file per surface, imported in order by
`src/styles/index.css`. The files this spec governs most directly:

- `src/styles/layout.css`: dashboard shell and Tier 1 navigation buttons
- `src/styles/sidebar.css`: dashboard sidebar, feed and folder rows, toolbar icons
- `src/styles/modals.css`: shared modal shell, mobile modal headers and insets, shared primary and danger buttons
- Per-modal files: `add-feed-modal.css`, `edit-feed-modal.css`, `feed-manager-modal.css`, `feed-preview-modal.css`, `import-opml-modal.css`, `import-starred-modal.css`
- `src/styles/controls.css`, `controls-dropdown.css`, `controls-filter-bar.css`: shared controls
- `src/styles/discover.css`: Discover cards
- `src/styles/discover-sidebar.css`, `discover-sidebar-nav.css`, `discover-sidebar-filters.css`: Discover sidebar, secondary tabs, and filters
- `src/styles/kagi-smallweb.css`: Kagi Small Web view
- `src/styles/reader.css`: Reader, including the format menu and status banners

Breakpoint values come from `src/utils/platform-utils.ts` (see
**Responsive Intent by Breakpoint**).

If this spec conflicts with existing CSS, update CSS to match this spec unless there is a documented exception.

## Design Principles

1. Clear hierarchy: global navigation must read as primary; section navigation must read as secondary.
2. Low visual noise: avoid unnecessary dark strips, heavy fills, and duplicate dividers.
3. Theme-native color usage: prefer Obsidian variables over hardcoded values.
4. Compact touch-safe layout: maintain tap targets without bloating vertical rhythm.
5. Accessibility first: preserve visible focus states and readable contrast in dark/light themes.

## Branding

### Brand Typography

- The logo wordmark uses `JetBrains Mono`.
- Preserve the exact capitalization and spacing used in the approved logo source files.
- Treat `JetBrains Mono` as a branding asset choice for the logo, not as the default UI typeface for the plugin interface.

### Logo Asset Storage

- Store official logo files in `assets/branding/`.
- Use this directory for source and exported logo assets such as SVG, PNG, monochrome variants, and platform-specific marks.
- Keep non-branding screenshots, mockups, and exploratory images outside `assets/branding/` so the folder stays clean and predictable for contributors.

## Component Inventory

Use this format when adding or updating governed surfaces:

- Purpose
- Canonical selector / owner
- Visual hierarchy role
- States
- Breakpoint notes

Current governed surfaces:

- Dashboard primary navigation
  - Canonical selector / owner: `.rss-dashboard-nav-button` in `src/styles/layout.css` (overridden for modals in `src/styles/modals.css`); used by `src/components/discover-sidebar.ts` and `src/views/kagi-smallweb-view.ts`
  - Purpose: switching between the Dashboard, Discover, and Kagi Small Web views
  - Visual hierarchy role: Tier 1 primary navigation
- Discover secondary navigation
  - Canonical selector / owner: `.rss-discover-sidebar-nav button` in `src/styles/discover-sidebar-nav.css` and `src/components/discover-sidebar.ts`
  - Purpose: local content-mode switching inside Discover
  - Visual hierarchy role: Tier 2 secondary navigation
- Mobile modal headers and close affordances
  - Canonical selector / owner: `.modal.rss-mobile-navigation-modal .rss-dashboard-header`, `.modal.rss-mobile-discover-filters-modal .rss-discover-header`, `.rss-dashboard-header-close-button` in `src/styles/modals.css`
  - Purpose: mobile-specific top bar layout, safe-area ownership, dismiss action
  - Visual hierarchy role: structural shell controls
- Accent CTA buttons
  - Canonical selector / owner: `.rss-dashboard-primary-button` in `src/styles/modals.css` (with import-modal variants in `import-opml-modal.css` and `import-starred-modal.css`), `.rss-discover-ok-button` in `src/styles/discover-sidebar-filters.css`
  - Purpose: confirm, save, proceed, or commit actions
  - Visual hierarchy role: primary action
- Neutral buttons
  - Canonical selector / owner: `.rss-discover-card-add-btn`, `.rss-discover-card-preview-btn` and other neutral action buttons in `src/styles/discover.css`
  - Purpose: secondary actions that should not visually outrank primary CTAs
  - Visual hierarchy role: supporting action
- Destructive buttons
  - Canonical selector / owner: `.rss-dashboard-danger-button` in `src/styles/modals.css` (plus the import modals), `.rss-clear-filter-button` in `src/styles/discover-sidebar-filters.css`, `.rss-discover-card-remove-btn` in `src/styles/discover.css`
  - Purpose: delete, clear, cancel-destructive, or unfollow/remove actions
  - Visual hierarchy role: destructive action
- Clickable-icon controls
  - Canonical selector / owner: `.clickable-icon` pattern with component scope in `src/styles/modals.css`, `src/styles/sidebar.css`, and component/view owners
  - Purpose: icon-only actions with keyboard parity
  - Visual hierarchy role: compact utility action
- Discover cards
  - Canonical selector / owner: `.rss-discover-card` family in `src/styles/discover.css`
  - Purpose: feed and Smallweb result presentation with metadata and actions
  - Visual hierarchy role: content container
- Discover filter controls
  - Canonical selector / owner: `.rss-discover-filter-header` and `.rss-discover-filter-controls` in `src/styles/discover-sidebar-filters.css`
  - Purpose: search, sort, filter, and bulk action grouping
  - Visual hierarchy role: supportive control surface
- Reader restricted banner
  - Canonical selector / owner: `.rss-reader-inline-banner.rss-reader-paywall-banner` in `src/styles/reader.css`
  - Purpose: explain restricted or paywalled article text and provide a plain source-verification link
  - Visual hierarchy role: supportive status surface

Reader restricted banner styling note:

- Keep this surface as a simple colored status banner.
- Do not use interactive accent treatments (accent stripes, accent-pill links, or accent hover states) for this banner.

## Navigation Hierarchy

### Tier 1: Primary Tabs

Tier 1 navigation moves between the plugin's views:

- In Discover's header: **Home** (back to the Dashboard) and **Kagi** (Kagi Small Web).
- In the Kagi Small Web view: **← Discover**.

The Dashboard itself reaches Discover through the **Discover** icon in the
sidebar toolbar (`src/components/sidebar.ts`), whose position users can change
in settings. That icon follows the clickable-icon pattern, not the Tier 1
button style.

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

### Primary Navigation Buttons (Tier 1)

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

## Responsive Intent by Breakpoint

- Desktop: `> 1200px`
- Tablet and below: `<= 1200px` (`TABLET_LAYOUT_MAX_WIDTH` in `src/utils/platform-utils.ts`)
- Mobile: `<= 768px` (`PHONE_MAX_WIDTH`)

These tiers use the width of the window showing the view, not the device. At
tablet width and below, the dashboard sidebar becomes a drawer
(`shouldUseMobileSidebarLayout`), including in a narrow desktop window.

Some components also use their own breakpoints (`600px`, `400px`,
`1024px`, `1600px`) and a touch query, `(hover: none) and (pointer: coarse)`.
New rules should use the three tiers above unless a component has a documented
reason to differ.

Rules:

1. Preserve the same hierarchy model at all breakpoints.
2. Modal overrides must not invert hierarchy.
3. Discover secondary tabs must keep tab semantics in both sidebar and modal.
4. Any breakpoint-specific overrides for nav controls must be declared in one place per component and referenced here.
5. Mobile sidebar modal header top spacing must be status-bar aware and may include platform-scoped overrides.

### Desktop Intent

- Keep sidebar-based layout for Discover filters and preserve simultaneous visibility of navigation + content.
- Tier 1 and Tier 2 controls should read as distinct by both scale and fill treatment, not only position.
- Card grids may expand horizontally, but card action rows must remain stable and legible.

### Tablet Intent

- Sidebar filters may collapse out of the main layout and be replaced by mobile/modal filter affordances.
- Hierarchy must remain unchanged when controls stack or wrap.
- Wrapped control groups are acceptable, but nav labels and key CTA labels should remain single-line.

### Mobile Intent

- Discover filters and some navigation affordances may move into modal shells.
- Header spacing must be safe-area aware and platform-scoped where needed.
- Primary nav and close affordances must remain easy to hit without oversized vertical chrome.
- Content cards may stack to a single column, but card actions and labels should remain readable without text truncation regressions beyond existing intentional ellipsis patterns.

### Modal Header Inset Ownership

- Platform marker classes (`.rss-mobile-platform-ios`, `.rss-mobile-platform-android`) live on mobile modal root elements.
- The Android marker is retained as an explicit platform hook. It currently has no built-in CSS rules; Android uses the shared modal styling.
- Mobile sidebar header top-padding tokens and rules are defined in `src/styles/modals.css`, including `.modal.rss-mobile-navigation-modal .rss-dashboard-header` and `.modal.rss-mobile-discover-filters-modal .rss-discover-header`.
- iPhone modal header top spacing must use normalized safe-area tokens (not direct raw `env(safe-area-inset-top)` additions) to avoid duplicate status-bar clearance/headroom.

## Color and Token Usage

Preferred tokens:

- `--color-accent`
- `--interactive-accent`
- `--interactive-accent-hover`
- `--text-normal`
- `--text-muted`
- `--text-on-accent`
- `--background-primary`
- `--background-secondary`
- `--background-modifier-border`

Most-used Obsidian tokens, by `var()` uses in `src/styles/` on 2026-09-27 (count in parentheses):

- `--background-modifier-border` (256): default borders, dividers, and neutral outlines
- `--text-normal` (219): primary body and control text
- `--interactive-accent` (200): primary interactive accent for active states, pills, and CTA surfaces
- `--text-muted` (171): secondary text, helper copy, and subdued icon color
- `--background-modifier-hover` (87): hover fill for neutral controls
- `--background-secondary` (86): raised neutral surfaces such as cards, controls, and grouped rows
- `--background-primary` (75): base app surface and input backgrounds
- `--text-on-accent` (67): high-contrast text/icon color on accent-filled surfaces
- `--text-accent` (46): accent-colored text treatment without a filled background
- `--icon-size` (40): icon dimensions; see **Icon Rendering Standards**
- `--interactive-normal` (25) and `--interactive-hover` (18): Obsidian's neutral button fill and its hover
- `--color-accent` (20): theme accent used by Tier 1 navigation and some legacy high-emphasis surfaces

Destructive and error states use `--text-error` and `--background-modifier-error`.

Accent button pairing rule:

- When a button or tab uses `background: var(--color-accent)` or `background: var(--interactive-accent)`, pair it with `color: var(--text-on-accent)` unless there is a documented accessibility exception.
- Example patterns in the codebase include `src/styles/layout.css` primary nav buttons and Discover accent buttons in `src/styles/discover.css`.

## Token Mapping

| Token                          | Intended purpose                                             | Common usage examples                                                      | Avoid / non-goals                                                                   |
| ------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `--interactive-accent`         | Default interactive accent fill and emphasis color           | Primary CTA states, pills, active controls, focus-adjacent emphasis        | Do not use as a neutral hover replacement for every control                         |
| `--color-accent`               | Theme accent for high-emphasis nav or legacy accent surfaces | Primary nav active fills, accent-forward tabs, established legacy surfaces | Do not introduce for new generic buttons when `--interactive-accent` fits           |
| `--text-on-accent`             | Contrast-safe text/icon color on accent surfaces             | Text and icons on `--interactive-accent` or `--color-accent` backgrounds   | Do not use on neutral or transparent surfaces                                       |
| `--text-normal`                | Primary readable text color                                  | Headers, labels, body copy, neutral button text                            | Do not use to imply inactive or disabled states                                     |
| `--text-muted`                 | Secondary or lower-emphasis text/icon color                  | Metadata, helper text, inactive icons, secondary labels                    | Do not use when the control needs primary emphasis                                  |
| `--text-accent`                | Accent-colored text without filled background                | Links, active text-only treatments, underline-tab text emphasis            | Do not substitute for filled CTA styling                                            |
| `--background-primary`         | Base app and input background                                | Primary panes, inputs, modal bodies                                        | Do not use when a raised neutral surface is intended                                |
| `--background-secondary`       | Raised neutral control/card background                       | Cards, grouped controls, secondary surfaces                                | Do not use to indicate active selection by itself                                   |
| `--background-modifier-border` | Neutral border and divider token                             | Dividers, outlines, subtle separators, skeleton fills                      | Do not use as a focus ring substitute                                               |
| `--background-modifier-hover`  | Neutral hover surface treatment                              | Hover fill for neutral buttons and selectable rows                         | Do not use for selected-state persistence                                           |
| `--interactive-accent-hover`   | Hover-state accent variant where needed                      | Accent CTA hover or stronger accent affordance                             | Do not add unless the component already distinguishes accent hover from accent rest |

### Token Precedence

1. Use `--interactive-accent` for standard interactive controls and active UI states.
2. Use `--color-accent` for higher-emphasis nav or legacy accent surfaces that intentionally match theme accent styling.
3. Use `--text-on-accent` as the default text/icon pairing for either accent fill.
4. Prefer `--text-accent` for text-only emphasis and link-like affordances.
5. Prefer neutral background and border tokens before introducing custom fills.

Rules:

1. Use tokens before introducing hardcoded colors.
2. Hardcoded color values require a comment explaining why token usage is insufficient.
3. Keep active vs hover distinctions consistent across components.

## Interaction State Matrix

| Control type            | Default                                           | Hover                                                               | Active / selected                                                              | Focus-visible                                                  | Disabled                                             | Loading                                                                    |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Primary nav buttons     | Neutral or subdued fill with semibold label       | May increase fill or border emphasis without outranking active peer | Filled accent surface with `--text-on-accent`                                  | Visible outline using accent-compatible token                  | Reduced emphasis, no fake active fill                | Preserve width; spinner/icon swaps must not shift layout noticeably        |
| Secondary tabs          | Transparent, text-first tab styling               | Text emphasis only, no full fill                                    | Accent text plus underline indicator                                           | Visible outline that does not erase underline semantics        | Reduced contrast but still readable                  | Rare; avoid unless content mode switch truly waits on async state          |
| Neutral buttons         | Neutral fill, border, `--text-normal`             | `--background-modifier-hover` and optional accent border            | May use subtle pressed or selected styling, but should not mimic CTA fill      | Visible outline                                                | Opacity and cursor changes without disappearing text | Preserve button label and width while showing progress if async            |
| Accent buttons          | Accent fill plus `--text-on-accent`               | Hover brightness or accent-hover refinement                         | Same family as hover; active state may darken slightly                         | Accent-compatible outline with clear separation from fill edge | Lower emphasis but keep contrast legible             | Spinner allowed; keep text readable or reserve width                       |
| Destructive buttons     | Distinct destructive treatment with readable text | Stronger destructive hover, no ambiguity with neutral controls      | Persistent destructive emphasis only when the state is truly destructive/armed | Visible outline maintained on destructive fills                | Lower emphasis, no misleading active danger state    | Preserve destructive intent while preventing duplicate actions             |
| Clickable-icon controls | Compact hit area with scoped icon rendering       | Background or icon-color emphasis only                              | Optional selected state if the icon represents a toggle                        | Required keyboard-visible outline                              | Reduced opacity and no pointer affordance            | Avoid swapping icon size; loading may use spin only if motion is necessary |

## Typography and Density

### Typography

- Section headers: `font-weight: 600`; use `--text-normal`; visually above control labels but below page titles.
- Primary nav labels: semibold (`600`), tight line-height around `1.1`, one scale step above secondary tabs at the same breakpoint.
- Secondary tab labels: medium inactive / semibold active, compact line-height around `1.0`.
- Standard button labels: medium or semibold depending on emphasis; prefer `13px` to `16px` depending on surface density.
- Helper and meta text: use smaller UI sizes and `--text-muted` unless stronger emphasis is required.

### Density

- Do not rely on dark strips to imply hierarchy.
- Use spacing + typography + state treatment to communicate importance.
- Compact control padding should usually stay within `6px 12px` to `8px 14px` unless a mobile touch target requires more.
- Standard gaps inside grouped controls should generally stay in the `6px` to `12px` range.
- Avoid large top/bottom padding around tab rows unless required for touch targets.
- Keep section dividers subtle and singular.

## Shape, Border, and Elevation

- Rounded rectangles are the default control shape; avoid capsule styling unless a surface already establishes it.
- Standard control and card radii should generally stay in the `4px` to `8px` range.
- Default border weight is `1px` using `--background-modifier-border`.
- Underlines or inset accents are preferred over filled surfaces for subordinate navigation such as secondary tabs.
- Filled accent surfaces are preferred for primary actions and active Tier 1 navigation.
- Shadows are optional and should be reserved for overlays, popups, menus, or hover-elevated cards where separation from the background is necessary.
- Do not stack heavy border + shadow + saturated fill on the same control unless there is a clear hierarchy reason.

## Accessibility

This section gives implementation guidance within the project-wide [Accessibility scope and support](../../ACCESSIBILITY.md).

Minimum expectations:

1. `:focus-visible` outlines on keyboard-focusable nav controls ([WCAG 2.4.7 Focus Visible, AA](https://www.w3.org/TR/WCAG22/#focus-visible)).
2. Active/inactive states remain distinguishable without relying on color alone ([WCAG 1.4.1 Use of Color, A](https://www.w3.org/TR/WCAG22/#use-of-color)).
3. Text remains single-line for nav labels (`white-space: nowrap`).
4. Interaction targets remain usable on touch screens.
5. Accent-filled controls must preserve readable contrast in both dark and light themes ([WCAG 1.4.3 Contrast (Minimum), AA](https://www.w3.org/TR/WCAG22/#contrast-minimum); [1.4.11 Non-text Contrast, AA](https://www.w3.org/TR/WCAG22/#non-text-contrast)).
6. Icon-only controls must maintain keyboard parity with standard buttons ([WCAG 2.1.1 Keyboard, A](https://www.w3.org/TR/WCAG22/#keyboard)).
7. New motion on interactive surfaces should respect reduced-motion expectations where animation meaningfully affects perception. This is a project expectation beyond the WCAG 2.2 AA reference; see [2.3.3 Animation from Interactions, AAA](https://www.w3.org/TR/WCAG22/#animation-from-interactions).

### Explicit Accessibility Expectations

- The RSS Dashboard hit-area target is `32 by 32 CSS pixels`, with `40 by 40 CSS pixels` preferred for mobile modal controls and icon buttons. This is a project design baseline; WCAG 2.2 AA [2.5.8 Target Size (Minimum)](https://www.w3.org/TR/WCAG22/#target-size-minimum) sets a `24 by 24 CSS pixel` minimum where applicable, with exceptions.
- Focus-visible styling must remain visible against both neutral and accent-filled surfaces ([WCAG 2.4.7 Focus Visible, AA](https://www.w3.org/TR/WCAG22/#focus-visible)).
- Do not communicate active, destructive, or disabled state with color alone when another signal is feasible ([WCAG 1.4.1 Use of Color, A](https://www.w3.org/TR/WCAG22/#use-of-color)).
- Interactive controls must expose an appropriate name, role, and state, using native semantics where available ([WCAG 4.1.2 Name, Role, Value, A](https://www.w3.org/TR/WCAG22/#name-role-value)). Clickable icons must support `Enter` and `Space` activation ([WCAG 2.1.1 Keyboard, A](https://www.w3.org/TR/WCAG22/#keyboard)).
- If a loading state removes text or swaps icons, the control should retain a stable footprint and accessible labeling.
- New non-essential animations should be short, restrained, and disable gracefully under reduced-motion preferences.

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
6. Are control states defined and consistent for the affected surface?
7. Is the change reflected in this spec if behavior or styling conventions changed?

## Icon Rendering Standards

To ensure cross-platform compatibility (especially Android WebView) and accessibility, all interactive icons must follow the `clickable-icon` pattern.

### Critical: CSS Scoping (Do Not Break Obsidian Core) @design-spec

Obsidian loads plugin styles globally. Any unscoped rule that targets Obsidian core classes can create vault-wide UI failures (ex: Properties showing type-mismatch errors everywhere).

Rules:

- Never ship global selectors like `.clickable-icon`, `.suggestion-container`, `.hidden`, `.status-bar-item`, or `.setting-item` without an `rss-` scope.
- All icon visibility / sizing fixes must be component-scoped, e.g. `.rss-dashboard-modal .clickable-icon svg`, not `.clickable-icon svg`.
- For Obsidian `AbstractInputSuggest` dropdowns, add a plugin-specific class to the suggest container and style that class (do not style `.suggestion-container` globally).
- Keep the CSS collision guardrail passing: `npm run check:css-scope` (runs in `npm run build`).

### Implementation Structure

> **Legacy controls only:** the `div` pattern below describes existing controls until they're migrated. Do not use it for new interactive controls. New icon buttons use a native `<button>`; see **Open Questions** and [#502](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/502). The migration remains gated on that issue's styling spike.

Existing controls use a `div` (or `span` if inline) with the following attributes:

- **Class**: `clickable-icon`
- **Role**: `button`
- **Tabindex**: `0`
- **Accessible name**: Provide an `aria-label`; never use `title` (see [`.instructions.md`](../../.instructions.md#compliance-declarations-required)).

```typescript
const iconButton = container.createDiv({
  cls: "clickable-icon",
  attr: {
    "aria-label": "Desired Action",
    role: "button",
    tabindex: "0",
  },
});
setIcon(iconButton, "lucide-icon-name");
```

### Keyboard Interactivity

This custom keyboard handling applies only to the existing legacy elements shown above. New interactive controls should use native semantic elements so the browser supplies standard keyboard behavior.

Interactive icons MUST handle keyboard events to maintain 1:1 parity with standard buttons:

```typescript
iconButton.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    // execute action
  }
});
```

### Styling Guidelines

- **Sizing**: Use the `--icon-size` CSS variable to control the SVG dimensions.
- **Stroke Weights**: Preserve Lucide's default `stroke-width: 2` unless a specific variation is required.
- **Android Visibility**: Use contain: layout style on the container and explicit pixel dimensions on > svg to prevent Android WebView rendering drops. See §Android WebView SVG Rendering: Avoiding !important."

### Android WebView SVG Rendering: Avoiding `!important`

**This section supersedes the `!important` guidance previously listed under Styling Guidelines.** The prior pattern worked but conflicted with the v2.3.0 remediation goal of eliminating `!important` from the codebase. The approach below solves the same Android WebView failures without it.

#### Why WebView Fails

Android WebView has two distinct SVG-in-icon failure modes:

1. **SVG sizing collapse.** Lucide icons are injected as inline `<svg>` elements with `width` and `height` set to `100%`. WebView does not reliably resolve percentage-based SVG intrinsic sizing when the parent is a flex container without explicit pixel dimensions on the SVG element itself. The icon collapses to 0×0 or an unintended fallback size.

2. **Paint-layer drop.** On certain WebView builds, SVG children of `.clickable-icon` elements can be dropped from the paint layer during layout recalculation when ancestor elements have active `transform` or `opacity` transitions. The prior workaround patched this with `visibility: visible !important`.

#### The Fix: Target SVG Directly, Isolate the Paint Layer

The fix addresses both failure modes at source rather than overriding them with `!important`:

- Set explicit pixel dimensions on the `> svg` element, not only on the `.clickable-icon` container. This is where WebView actually fails to resolve sizing.
- Use `contain: layout style` on the container to isolate the subtree's paint layer.
- Use `will-change: transform` on `> svg` to force compositing, which prevents the paint-drop bug.
- Use the direct child combinator (`> svg`) rather than the descendant combinator (`svg`) to avoid matching nested `<svg>` elements inside compound Lucide icons.

```css
/*
 * Android WebView Icon Rendering Fix
 * Scoped to component ancestor to avoid Obsidian core collisions.
 *
 * Problem: WebView fails to resolve % SVG sizing inside flex containers,
 * and drops SVG children from the paint layer during layout recalculation
 * when transforms/opacity transitions are active on ancestor elements.
 *
 * Fix: explicit pixel dimensions on > svg; contain + will-change resolve
 * the paint-drop bug at source rather than patching with visibility.
 *
 * Ref: design-spec §Icon Rendering Standards
 */
.your-component-scope .clickable-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  contain: layout style;
  width: var(--icon-size, 20px);
  height: var(--icon-size, 20px);
}

.your-component-scope .clickable-icon > svg {
  display: block;
  width: var(--icon-size, 20px);
  height: var(--icon-size, 20px);
  overflow: visible;
  will-change: transform;
}

.your-component-scope .clickable-icon > svg * {
  pointer-events: none;
}
```

#### Constructing Sufficient Specificity

The source stylesheet permits no `!important` declarations. When a core rule
wins the cascade, combine an existing plugin root with the component and its
state or direct child instead of creating an exception:

```css
.rss-dashboard-container
  .your-component-scope.is-compact
  > .clickable-icon
  > svg {
  width: var(--icon-size, 20px);
}
```

Prefer local wrapper or state ownership over IDs, duplicated classes, or an
unscoped `body` prefix. If a core property is itself important, redesign the
plugin-owned wrapper or style a different local property rather than entering
a specificity escalation that requires the same declaration.

## Obsidian Core Surfaces and Version Differences

Plugin styles and code sometimes touch Obsidian's own elements. Obsidian's DOM
changes between versions, and the plugin supports everything from
`minAppVersion` (1.8.7) to the current release, so target both shapes.

- **Modal close button.** In Obsidian 1.13 it's `.modal-header-button.mod-raised.clickable-icon`,
  a direct child of `modalEl`, and the title sits in `.modal-header`. Older
  releases render `.modal-close-button` instead. When a modal replaces the
  native close button, use `removeNativeModalCloseButton` in
  `src/utils/modal-close-button.ts`, which handles both. CSS that styles or hides
  the native button must list both selectors.
- **Checking a version difference.** `test_files/stubs/obsidian.contract.test.ts`
  records the Obsidian behavior the test stub models, with the version it was
  observed on. Check it before styling or querying a core element, and add an
  expectation when you rely on a new one (ADR 0014).

## Testing UI Changes

Unit tests run in jsdom against `test_files/stubs/obsidian.ts`, which models
Obsidian 1.13.7 desktop (ADR 0014). It's accurate for structure and behavior,
but jsdom doesn't lay out or paint anything. Split checks accordingly:

- **Test in unit tests:** element structure and classes, `aria-label` and
  `role`, which icon was set, and keyboard parity. For an icon button, dispatch
  `Enter` and `Space` `keydown` events and assert the action ran. The stub's
  `setIcon` records the icon name in `data-icon` and doesn't insert an SVG,
  so assert on `data-icon`, not on SVG markup. `setTooltip` stores its text
  in `aria-label`, as Obsidian does. Use `activeDocument` and the element's
  own window so tests also cover popouts.
- **Check by hand:** layout, breakpoints, colors in light and dark themes,
  focus rings, and Android and iOS icon rendering. Use the fixture vault
  (`npm run fixture:vault`, see `docs/development/fixture-vault.md`) at
  desktop width, at tablet width (a window of 1200px or less), and with
  `app.emulateMobile(true)`. Test real devices for the Android WebView SVG
  fixes.

See `docs/development/test_coverage/testing-guide.md` for the testing rules.

## Open Questions

Found in the 2026-09-27 review, each with its own issue.

- **Icon button element: decided, migration pending ([#502](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/502)).** Follow
  the accessibility guidelines: new icon buttons use a native
  `<button type="button" class="clickable-icon">` with an `aria-label`, not a
  `div` with `role="button"`. The `div` rule dates from 2.3.0-alpha.3
  (commit `8b0c7d5d`), which blamed the element type for broken icons on
  Android. The Android bug was later fixed in CSS (**Android WebView SVG
  Rendering**), and that fix works with either element. **Icon Rendering
  Standards** below is updated once #502's spike confirms Obsidian's base button
  styles don't leak in. Until then, don't add new `div[role=button]` controls.
- **Native close button CSS ([#500](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/500)).** Rules in
  `src/styles/modals.css` style or hide only `.modal-close-button`, which
  Obsidian 1.13 no longer renders. On 1.13 the shortcut help modal shows two
  close buttons (confirmed), and the mobile modals' close-button positioning
  doesn't apply.

---

## Change Management

When a visual pattern changes:

1. Update this spec in the same PR.
2. Link affected selectors/files in PR notes.
3. Include before/after screenshots for desktop + mobile modal where relevant.

## Known Exceptions / Legacy Patterns

- `--color-accent` remains an approved token for established high-emphasis nav surfaces and a small number of legacy accent-forward controls. Do not treat that as the default accent choice for all new buttons.
- Destructive controls use `--text-error` and `--background-modifier-error` (or `--color-red` with a fallback). The remaining hardcoded reds are `#e74c3c` borders in `src/styles/podcast-themes.css` and the YouTube badge color `--rss-color-youtube-badge: #ff0000` in `src/styles/modals.css`, which is a brand color. New destructive styles use the Obsidian tokens.
- Discover header nav buttons and related accent-forward controls intentionally inherit parts of the primary nav visual language. Reuse this pattern only when the control is acting as high-emphasis navigation, not as a generic action button.
- Transitional legacy patterns may remain in place when replacing them immediately would create broad visual churn, but they should not be copied into new components without documenting the reason.

## Reader Format Control Ownership

- Reader quick-format controls live in `src/utils/reader-format-portal.ts` and `src/styles/reader.css`.
- This surface is a compact quick-actions menu, not a stacked settings form.
- Icon-only quick actions in the reader format menu must use scoped `.rss-reader-format-*` selectors together with the `clickable-icon` pattern.
- Lower-frequency reader format controls belong in the `Display` settings tab under the `Reader` section.

## Known Current Conventions (September 2026)

- Tier 1 navigation buttons are implemented in `layout.css` and overridden in `modals.css`.
- Discover secondary tabs are implemented in `discover-sidebar-nav.css`, including modal-specific rules.
- Discover secondary tabs use an underline active state to remain visually subordinate to primary tabs.
