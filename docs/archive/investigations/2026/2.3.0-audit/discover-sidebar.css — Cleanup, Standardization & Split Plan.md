# discover-sidebar.css — Cleanup, Standardization & Split Plan

Comprehensive plan to clean up `src/styles/discover-sidebar.css` (696 lines, ~17 KB)
in line with the audit-remediation-2.3.0 checklist and the design-spec token/scoping
rules. Modeled after the section-comment structure of `modals.css`.

---

## 1. Recommended File Split

The current monolith mixes distinct concerns including core layout, complex filter interactions, and navigation tabs. Extracting the filter controls and navigation tabs mirrors existing module patterns.

| New file | Lines (approx) | What it owns |
| -------- | -------------- | ------------ |
| `discover-sidebar.css` _(keep, trimmed)_ | ~350 | Core sidebar container, search inputs, category and tag tree lists. |
| `discover-sidebar-filters.css` _(new)_ | ~250 | Filter headers, mobile filter dropdowns, sort controls, clear buttons, and selected filter chips. |
| `discover-sidebar-nav.css` _(new)_ | ~100 | Sidebar navigation tabs and their active/hover states. |

> [!NOTE]
> **Why not more splits?** The category and tag tree lists are tightly coupled to the sidebar's scroll container layout and don't contain enough independent styling complexity to warrant their own file yet. They remain in the core sidebar file.

---

## 2. Structural Section Map

The cleaned `discover-sidebar.css` will use these numbered comment blocks:

```
1.  Base Variables & Custom Properties
2.  Sidebar Layout & Container
3.  Search Inputs
4.  Category & Tag Trees
5.  Media Query — Mobile (max-width: 1200px)
```

The new `discover-sidebar-filters.css` will use:

```
1.  Base Variables & Custom Properties
2.  Filter Header & Actions
3.  Selected Filter Chips
4.  Mobile Filters Menu
5.  Filter Buttons (Clear, OK)
6.  Media Query — Mobile (max-width: 1200px)
```

The new `discover-sidebar-nav.css` will use:

```
1.  Base Variables & Custom Properties
2.  Navigation Tabs
3.  Media Query — Mobile (max-width: 1200px)
```

---

## 3. Dead Code & Redundancies to Remove

| Lines | Issue | Action |
| ----- | ----- | ------ |
| 457–460 | `.rss-clear-filter-button:hover` — Re-declares exact same background/color | **Remove** — Redundant with base rule. |
| 461–464 | `.rss-clear-filter-button-danger` — Re-declares exact same background/color | **Remove** — Redundant with `.rss-clear-filter-button` base rule. |
| 465–467 | `.rss-clear-filter-button-danger:hover` — Re-declares exact same background | **Remove** — Redundant with base rule. |
| 398 | `box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);` | **Token needed** — no design-spec token exists yet; see Open Questions Q1 |
| 435 | `box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);` | **Token needed** — no design-spec token exists yet; see Open Questions Q2 |

---

## 4. `!important` Audit

| Lines | Declaration | Disposition |
| ----- | ----------- | ----------- |
| 23–27 | `.rss-discover-sidebar { display: none !important }` | **Keep** — sanctioned responsive display toggle. Add `/* audit-ok: responsive display toggle */` |
| 64–66 | `.rss-discover-search-clear-hidden { display: none !important }` | **Keep** — utility toggle class. Add `/* audit-ok: display toggle utility */` |
| 259–265 | `.rss-discover-header-nav-button svg { … !important × 4 }` | **Keep** — sanctioned by design-spec. Add `/* audit-ok: svg icon normalization */` |
| 373–382 | `.rss-discover-mobile-filters-button svg { … !important × 6 }` | **Keep** — sanctioned by design-spec. Add `/* audit-ok: svg icon normalization */` |
| 616–620 | `.rss-discover-mobile-header { display: flex !important }` | **Scope** — use higher specificity: `body .rss-discover-controls-container.is-narrow .rss-discover-mobile-header` |
| 621–623 | `.rss-discover-filter-controls { display: none !important }` | **Keep** — utility toggle class. Add `/* audit-ok: display toggle utility */` |
| 668–674 | `.rss-discover-sidebar-toggle svg { … !important × 4 }` | **Keep** — sanctioned by design-spec. Add `/* audit-ok: svg icon normalization */` |

---

## 5. Selector / Rule Redundancies

Lines 441–484 define `.rss-clear-filter-button` and `.rss-discover-ok-button`.
These two button selectors share almost all structural properties (`padding`, `border-radius`, `font-size`, `line-height`, `cursor`, `margin`, `min-height`, `display`, `align-items`, `justify-content`).
**Action:** Extract shared properties into a common `.rss-discover-btn-base` (or similar) utility within the file or merge the duplicated properties into a shared selector group, leaving only the specific background/color overrides in the individual selectors.

Lines 81–117 define identical structural styling for `.rss-discover-type-list` / `.rss-discover-tag-list` and `.rss-discover-type-item` / `.rss-discover-tag-item`.
**Action:** They are currently grouped effectively with comma-separated selectors, which is fine, but ensure they don't diverge. No further action needed as they are already deduplicated.

---

## 6. Proposed Changes Summary

### [MODIFY] discover-sidebar.css
- Add file-level header block (matching modals.css style)
- Add numbered section comment blocks (sections 1–5 per map above)
- Remove all dead/redundant button pseudo-classes (`.rss-clear-filter-button-danger` etc.)
- Replace hardcoded `rgba()` values with design-spec tokens (pending Q1/Q2 approval)
- Append `/* audit-ok: ... */` comments to sanctioned `!important` rules
- Scope `.rss-discover-mobile-header` to remove `!important`
- Move filter controls and related mobile menus to `discover-sidebar-filters.css`
- Move sidebar nav tabs to `discover-sidebar-nav.css`

---

### [NEW] discover-sidebar-filters.css
- File-level header comment
- Filter Header & Actions styles (`.rss-discover-filter-header`, `.rss-discover-add-all-btn`)
- Selected Filter Chips styles (`.rss-discover-selected-filters`, `.rss-discover-selected-filter`)
- Mobile Filters Menu & Dropdown (`.rss-discover-mobile-filters-menu`, `.rss-discover-sort-dropdown`)
- Filter Buttons (`.rss-clear-filter-button`, `.rss-discover-ok-button`)

---

### [NEW] discover-sidebar-nav.css
- File-level header comment
- Sidebar Navigation Tabs styles (`.rss-discover-sidebar-nav`)

---

### [MODIFY] index.css
- Add imports for the 2 new CSS files (`discover-sidebar-filters.css`, `discover-sidebar-nav.css`)

---

## Open Questions

> [!IMPORTANT]
> **Q1 — Token needed for modal shadow?**
> Line 398 uses `box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);` for the mobile filters dropdown. There is no existing shadow token for dropdowns. Should we introduce `--rss-shadow-dropdown` mapped to this value, or use a native Obsidian token like `var(--shadow-s)` / `var(--shadow-l)`?
> Approve or redirect?

> [!IMPORTANT]
> **Q2 — Token needed for focus outline ring?**
> Line 435 uses `box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);` for the sort dropdown focus state. Can we replace this with the standard focus outline `outline: 2px solid var(--interactive-accent);` (as used elsewhere in the file), or should we introduce a specific `--rss-shadow-focus` token?
> Approve or redirect?

---

## Verification Plan

### Manual Checks

- Sidebar renders correctly in Obsidian on desktop and mobile
- Search inputs accept text and display clear icons correctly
- Filter header and dropdowns open properly on mobile screens
- Selected filter chips display and can be removed
- "Add All" button displays correctly and shows spinner during process
- Clear and OK buttons render with correct colors and hover states
- Sidebar navigation tabs toggle active states appropriately
- Focus rings visible for keyboard navigation on inputs and buttons

### Lint / Build

- `npm run build` passes with no new CSS scope violations
- No regressions in `npm run check:css-scope`
