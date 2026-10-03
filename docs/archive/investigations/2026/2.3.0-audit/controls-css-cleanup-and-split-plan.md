# controls.css — Cleanup, Standardization & Split Plan

Comprehensive plan to clean up `src/styles/controls.css` (1717 lines, ~41 KB)
in line with the audit-remediation-2.3.0 checklist and the design-spec token/scoping
rules. Modeled after the section-comment structure of `modals.css`.

---

## 1. Recommended File Split

The current monolith mixes **3 distinct concerns**. Splitting produces files
that mirror the existing pattern established by `add-feed-modal.css`,
`feed-manager-modal.css`, etc.

| New file | Lines (approx) | What it owns |
| -------- | -------------- | ------------ |
| `controls.css` _(keep, trimmed)_ | ~550 | Core header layout, basic toggles, search input, and responsive media queries. |
| `controls-dropdown.css` _(new)_ | ~750 | The complex dropdown menu, view style selectors, card layout controls, toolbar mode, and mark-all buttons. |
| `controls-filter-bar.css` _(new)_ | ~250 | The collapsible filter status bar, highlight chips, and viewing stats. |

> [!NOTE]
> **Why not more splits?** The media queries for the core layout are kept in `controls.css` rather than a separate file to ensure responsive rules remain tightly coupled to the base layout components they modify.

---

## 2. Structural Section Map

The cleaned `controls.css` will use these numbered comment blocks:

```css
1.  Base Variables & Custom Properties
2.  Header Layout & Search
3.  Refresh & Action Buttons
4.  Tag Notifications
5.  Media Queries & Responsive Overrides
```

The new `controls-dropdown.css` will use:
```css
1.  Dropdown Menu Shell
2.  Toolbar Mode & Layout Controls
3.  Multi-Filter & Search Actions
4.  Mark All Controls
5.  Themed Selectors
```

The new `controls-filter-bar.css` will use:
```css
1.  Subheader Shell & Collapsible State
2.  Keyword Filter Stats
3.  Highlight Match Stats
```

The two split-out files each get the same file-level header block as `modals.css`.

---

## 3. Dead Code & Redundancies to Remove

| Lines | Issue | Action |
| ----- | ----- | ------ |
| 1243–1273 | Light mode override for `.rss-dashboard-view-refresh-button` is commented out as dead code | **Remove** — "REMOVED: causing black icons on active buttons" |
| 468–470 | `.[selector]` — hardcoded colors `#8e44ad`, `#fff` | **Replace** with `var(--rss-color-podcast)` and `var(--text-on-accent)` |
| 478–480 | `.[selector]:hover` — hardcoded colors `#9b59b6`, `#fff` | **Replace** with `var(--rss-color-podcast-hover)` and `var(--text-on-accent)` |
| 763–764 | `.[selector]` — hardcoded colors `#9b59b6`, `#a66ac0` for variables | **Replace** with `var(--rss-color-podcast)` and `var(--rss-color-podcast-hover)` |
| 834, 846 | `.[selector]` — hardcoded colors `rgba(46, 204, 113, 0.3)`, `#2ecc71` | **Replace** with `var(--rss-color-success)` or similar existing token |
| 1647 | `.[selector]` — hardcoded color `#ff0000` | **Replace** with `var(--rss-color-video)` or `var(--color-red)` |
| 1651 | `.[selector]` — hardcoded color `#8e44ad` | **Replace** with `var(--rss-color-podcast)` |

> [!NOTE]
> **Open Question needed** — Several hardcoded colors like `#2ecc71` or `#ff0000` may not have an exact matching token in `design-spec.md` yet. Need author confirmation.

---

## 4. `!important` Audit

| Lines | Declaration | Disposition |
| ----- | ----------- | ----------- |
| 289–292 | `.rss-dashboard-viewing-filter-open-btn svg { ... !important }` | **Keep** — SVG normalization. Add `/* audit-ok: svg normalizer */` |
| 620 | `.rss-dashboard-tag-change-feedback { background-color: ... !important }` | **Keep with audit comment** — Visual override for feedback state; add `/* audit-ok: temporary state visual override */` |
| 662 | `.rss-dashboard-mobile-filter-button { display: none !important }` | **Keep** — Display toggle utility. Add `/* audit-ok: display toggle utility */` |
| 798–809 | `.rss-dashboard-dropdown-card-layout-trigger { width: 110px !important; ... }` | **Scope to higher specificity** — Use parent selector to avoid `!important` |
| 1168–1189 | `.[selector] svg { width: var(--icon-size) !important; ... }` | **Keep** — Sanctioned by design-spec for icon sizing. Add `/* audit-ok: svg normalizer */` |
| 1453–1541 | Responsive breakpoints using `display: none !important` and `display: block !important` | **Keep** — Sanctioned pattern for layout display toggles. Add `/* audit-ok: display toggle utility */` |
| 1552–1560 | `.rss-dashboard-hamburger-button svg { ... !important }` | **Keep** — Sanctioned SVG normalizations. Add `/* audit-ok: svg normalizer */` |
| 1582–1592 | Narrow overrides using `display: none !important` | **Keep** — Host override for responsive component states. Add `/* audit-ok: display toggle utility */` |

---

## 5. Selector / Rule Redundancies

Lines 39–47 define `.rss-dashboard-search-input` and lines 441–450 define `.rss-dashboard-search-input` again. Lines 899–905 define `.rss-dashboard-article-search-input` and lines 1669–1681 define it again.
**Action:** Merge the duplicate declarations into a single block for `.rss-dashboard-search-input` and `.rss-dashboard-article-search-input`.

Lines 457, 1192, and 1613 define variants of `.rss-dashboard-refresh-button`.
**Action:** Merge base properties into a single rule and only keep modifiers for specific contexts.

Lines 1067–1094 have a massive block repeating `.rss-dashboard-dropdown-controls .rss-dashboard-select-with-icon .rss-dashboard-[filter|sort|group|view-style-select]`.
**Action:** Refactor these to use a common utility class for themed select triggers instead of chaining multiple long selectors.

---

## 6. Proposed Changes Summary

### [MODIFY] controls.css
- Add file-level header block (matching modals.css style)
- Add numbered section comment blocks (sections 1–5 per map above)
- Remove all dead/commented-out code (e.g. light mode overrides)
- Replace hardcoded hex values with design-spec tokens
- Eliminate / scope `!important` declarations where possible, and add `audit-ok` comments to the rest
- Merge duplicate `.[selector]` rules for search inputs and refresh buttons
- Move dropdown menu rules to `controls-dropdown.css`
- Move filter subheader rules to `controls-filter-bar.css`

### [NEW] controls-dropdown.css
- File-level header comment
- Extracted rules for the dropdown menu, toolbar mode, multi-filter, and themed selectors

### [NEW] controls-filter-bar.css
- File-level header comment
- Extracted rules for the collapsible filter status bar, keyword filter stats, and highlight stats

### [MODIFY] index.css
- Add imports for the 2 new CSS files

---

## Open Questions

> [!IMPORTANT]
> **Q1 — Token for Success Color?**
> The rules for `.rss-dashboard-mark-read` use `rgba(46, 204, 113, 0.3)` and `#2ecc71`. Do we have a `var(--rss-color-success)` or similar token in `design-spec.md` to map these to?
> Approve or redirect?

> [!IMPORTANT]
> **Q2 — Token for Video Color?**
> The rule `.rss-dashboard-header-feed-icon.video svg` uses `#ff0000`. Should this map to a specific UI token like `var(--rss-color-video)` or a generic red?
> Confirm?

> [!NOTE]
> **Q3 — Utility class for Dropdown Selectors**
> Instead of mapping 5 long chained selectors for the `.rss-dashboard-select-with-icon` children, I recommend creating a unified `.rss-dashboard-dropdown-select` class to apply to all of them.
> Confirm?

---

## Verification Plan

### Manual Checks
- Dashboard header layout renders correctly in Obsidian (desktop and mobile)
- Filter status subheader correctly collapses/expands and displays stats
- Dropdown menu opens correctly and all toolbar modes display correctly
- Themed selects and search inputs retain their borders, backgrounds, and hover states
- Mark-all buttons and view style selectors render correctly
- SVG icons remain properly sized without visual regressions

### Lint / Build
- `npm run build` passes with no new CSS scope violations
- No regressions in `npm run check:css-scope`
