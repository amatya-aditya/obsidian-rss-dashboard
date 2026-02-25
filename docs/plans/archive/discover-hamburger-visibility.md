# Bug: Discover Page Hamburger Menu Icon Not Visible (600px–1200px)

**Status:** ✅ CLOSED (Resolved 2026-02-23)
**Severity:** High — core navigation control invisible on tablet resolutions
**Affected Area:** Discover view header, tablet viewport (600px–1200px)

---

## 1. Problem Description

The hamburger menu icon on the Discover page is **invisible** at tablet resolutions (approximately 600px–1200px width). The element is present in the DOM but not rendered visually. At ≤600px or >1200px the UI works as expected (mobile header visible or desktop filters visible, respectively).

---

## 2. Architecture Overview

### CSS Files (loaded in this order via `index.css`)

| Order | File             | Relevant Rules                                                                                                      |
| ----- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1     | `controls.css`   | Base `display: none` for `.rss-discover-mobile-header` (line 21); media queries for `.rss-dashboard-hamburger-menu` |
| 2     | `discover.css`   | `.is-narrow` overrides for mobile-header, desktop-filters; hamburger button styles                                  |
| 3     | `responsive.css` | No discover-hamburger rules found                                                                                   |

### TypeScript: `discover-view.ts`

The `renderContent()` method builds the DOM as:

```
.rss-discover-controls-container          ← ResizeObserver target, gets .is-narrow
  └─ .rss-discover-top-section
       ├─ .rss-discover-mobile-header     ← base: display:none (controls.css:21)
       │    ├─ .rss-discover-header-left
       │    │    ├─ sidebar toggle button
       │    │    └─ "RSS Discover" title
       │    └─ .rss-discover-header-right
       │         └─ .rss-discover-hamburger-menu
       │              ├─ button.rss-discover-hamburger-button (setIcon "menu")
       │              └─ .rss-discover-dropdown-menu
       └─ .rss-discover-desktop-filters   ← base: display:flex
```

The **ResizeObserver** runs on `.rss-discover-controls-container` and adds/removes `.is-narrow` at the 1200px breakpoint.

### Component Icon Rendering

| Icon Purpose                 | File               | Method/Mechanism       | Selector/Class                        |
| :--------------------------- | :----------------- | :--------------------- | :------------------------------------ |
| **Discover Hamburger**       | `discover-view.ts` | `renderMobileHeader()` | `.rss-discover-hamburger-button`      |
| **Discover Sidebar Toggle**  | `discover-view.ts` | `renderMobileHeader()` | `.rss-discover-sidebar-toggle`        |
| **Dashboard Hamburger**      | `article-list.ts`  | `renderHeader()`       | `.rss-dashboard-hamburger-button`     |
| **Dashboard Sidebar Toggle** | `article-list.ts`  | `renderHeader()`       | `.rss-dashboard-sidebar-toggle`       |
| **Dashboard View Controls**  | `article-list.ts`  | `renderHeader()`       | `.rss-dashboard-refresh-button`, etc. |
| **Sidebar Feed Icons**       | `sidebar.ts`       | `renderFeed()`         | `.rss-dashboard-feed-icon`            |
| **Sidebar Folder Icons**     | `sidebar.ts`       | `renderFolder()`       | `.rss-dashboard-folder-icon`          |

In all cases, icons are rendered via the Obsidian API `setIcon(container, iconId)`, which injects an `<svg>` element with `lucide` classes.

### Visibility Chain

For the hamburger icon to be visible, ALL of the following must be true:

1. `.rss-discover-controls-container` must have `.is-narrow` class
2. `.rss-discover-mobile-header` must be `display: flex` (overriding `controls.css:21` base `display: none`)
3. `.rss-discover-hamburger-menu` must not be `display: none`
4. `.rss-discover-hamburger-button` must have proper dimensions and the SVG icon must render

---

## 3. Current CSS State (after all iterations)

### controls.css

```css
/* Line 20-28 — Base: hidden */
.rss-discover-mobile-header {
  display: none;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--background-primary);
  border-bottom: 1px solid var(--background-modifier-border);
  width: 100%;
}

/* Line 657-658 — Mobile override (≤768px): shown */
@media (max-width: 768px) {
  .rss-discover-mobile-header {
    display: flex;
  }
}
```

> **Note:** There is NO tablet media query (769px-1200px) that shows `.rss-discover-mobile-header` in `controls.css`. The tablet media query at line 696 only targets `.rss-dashboard-hamburger-menu` and `.rss-dashboard-desktop-controls` (the **dashboard** classes, not discover).

### discover.css

```css
/* Line 693-694 — Removed containment context */
.rss-discover-controls-container {
}

/* Line 717-719 — .is-narrow hides desktop filters */
.rss-discover-controls-container.is-narrow .rss-discover-desktop-filters {
  display: none !important;
}

/* Line 721-724 — .is-narrow shows mobile header */
.rss-discover-controls-container.is-narrow .rss-discover-mobile-header {
  display: flex !important;
  width: 100%;
}

/* Line 726-740 — Hamburger button styles */
.rss-discover-hamburger-button {
  display: flex !important;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  /* ... */
}
```

### discover-view.ts — ResizeObserver

```typescript
this.resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const width = entry.contentRect.width;
    if (width <= 1200) {
      controlsContainer.classList.add("is-narrow");
    } else {
      controlsContainer.classList.remove("is-narrow");
    }
  }
});
this.resizeObserver.observe(controlsContainer);
```

---

## 4. Attempts Made (Chronological)

### Iteration 1: CSS Breakpoint Alignment

- Aligned all CSS media query breakpoints across `controls.css`, `discover.css`, and `responsive.css`. Result: ❌ No effect.

### Iteration 2: ResizeObserver Implementation

- Replaced CSS media queries with `ResizeObserver` for responsive behavior in the Discover view. Result: ❌ ResizeObserver fires correctly, but hamburger remains invisible.

### Iteration 3: CSS Specificity Audit

- Reviewed the full cascade. Confirmed `discover.css` loads after `controls.css`. Result: ❌ No effect.

### Iteration 4: Debug Logging (Computed Styles)

- Logged computed styles. Found `display: none` on the hamburger menu in the 600-1200px range. Result: ❌ Confirmed symptom.

### Iteration 5: Root Cause Hypothesis — Layout Conflict

- Identified `.rss-discover-mobile-header` was being squeezed in `.rss-discover-top-section`.

### Iteration 6: Solution A — Move Hamburger Into Mobile Header

- Moved hamburger button creation into `renderMobileHeader()`. Result: ❌ Icon still not visible.

### Iteration 7: Remove Nav Tabs from Headers

- Removed Dashboard/Discover navigation tabs from headers. Result: ✅ Tabs removed successfully, but hamburger still invisible.

### Iteration 8: Remove Redundant `display: none`

- Removed base `display: none` on `.rss-discover-hamburger-menu`. Result: ❌ Icon still not visible.

### Iteration 9: Container Scaling Cleanup

- Removed `container-type: inline-size`. Result: ❌ Icon still not visible.

### Iteration 10: Diagnostic Phase 3 — Header Content Inspection

- **What:** Forced `.is-narrow` class in TS and added text labels ("TOGGLE", "MENU") to the header buttons. Applied distinct background colors (Red header, Blue/Green sections, Yellow button).
- **Findings:**
  - The **Yellow button** and the word **"MENU"** were clearly visible at all resolutions (including 600px–1200px).
  - The **Lucide icon (SVG)** was completely missing/invisible within that visible button.
- **Result:** 🎯 Isolated the issue to the **SVG element itself**. The parent containers and the button are rendering correctly; the icon is being suppressed or shrunk.

### Iteration 11: Diagnostic Phase 4 — SVG Survival Test

- **What:** Applied aggressive, high-specificity overrides specifically to the `svg` element (`magenta border`, `cyan background`, `visibility: visible`).
- **Result:** ✅ **Icon became visible.** The magenta border and cyan box appeared, confirming that the SVG exists but is being suppressed by a global or broad CSS rule.

### Iteration 12: Source Code Audit for "Ghost Styles"

- **What:** Audited `responsive.css` and `controls.css` for dangling `svg` selectors.
- **Finding:** Found a highly suspicious selector in `responsive.css:71` where a comma separated `svg` from its parent, effectively applying the subsequent rule to **every SVG in the plugin**.

---

## 5. Remaining Hypotheses

### H1: High-Resolution SVG Suppression (Dangling Selectors)

**Confidence: Very High**
A rule in `responsive.css` (specifically around line 71-72) uses a comma-separated list that includes a naked `svg` tag. This causes layout rules (like `color: red` or `display: none`) to bleed into all icons when the associated condition (like YouTube feed detection) is met or when the media query fires.

### H2: The "Dark Mode Nesting" Trap

**Confidence: High**
Over 500 lines of responsive layout rules are nested inside `@media (prefers-color-scheme: dark)`. If a user is in Light mode, or if the media query evaluation is delayed, the layout breaks.

---

## 6. Recommended Next Steps

1.  **Hardening Styles (Immediate):** Add high-specificity SVG hardening to `discover.css` to protect navigation icons from global overrides.
2.  **Fix Dangling Selectors:** Clean up `responsive.css` (specifically line 71) to ensure `svg` targets are always scoped to their parent classes.
3.  **Refactor Nesting:** Move layout-critical media queries (600px-1200px) out of the `prefers-color-scheme: dark` blocks in `responsive.css`.
4.  **Lucide Wrapper:** If icons remain fragile, wrap `setIcon` calls in a `<span>` with a specific class (`.rss-icon-wrapper`) to provide a stable CSS target.

---

## 7. Key Files

| File             | Path                         |
| ---------------- | ---------------------------- |
| Discover View TS | `src/views/discover-view.ts` |
| Controls CSS     | `src/styles/controls.css`    |
| Discover CSS     | `src/styles/discover.css`    |
| Responsive CSS   | `src/styles/responsive.css`  |
| CSS Import Order | `src/styles/index.css`       |
| Built Output     | `styles.css` (root)          |

## 8. Final Resolution

The issue was resolved through a three-pronged approach:

1.  **Icon Hardening**: Applied high-specificity CSS rules with `!important` to the width, height, and visibility of SVG icons within the hamburger and sidebar toggle buttons. This prevents them from being suppressed by broad global selectors or layout-shifts.
2.  **Un-nesting Layout Rules**: Identified that `responsive.css` had wrapped over 500 lines of layout-critical media queries inside an `@media (prefers-color-scheme: dark)` block. This meant that on systems in Light mode, or if the media query evaluation was delayed, the tablet/mobile layout would break or lose specific icon dimensions. These were moved to the top-level.
3.  **Scoped Selectors**: Audited and confirmed that all SVG targeting is now scoped to specific parent components to prevent "style bleeding."

The hamburger icon is now consistently visible across the 600px–1200px "narrow" range in both Discover and Dashboard views.
