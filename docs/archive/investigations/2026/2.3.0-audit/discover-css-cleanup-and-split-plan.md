# discover.css — Cleanup, Standardization & Split Plan

Comprehensive plan to clean up `src/styles/discover.css` (2027 lines, ~42 KB)
in line with the audit-remediation-2.3.0 checklist and the design-spec token/scoping
rules. Modeled after the section-comment structure of `modals.css`.

---

## 1. Recommended File Split

The current monolith mixes **5 distinct concerns**. Splitting produces files
that mirror the existing pattern established by `add-feed-modal.css`,
`feed-manager-modal.css`, etc.

| New file                            | Lines (approx) | What it owns                                              |
| ----------------------------------- | -------------- | --------------------------------------------------------- |
| `discover.css` _(keep, trimmed)_    | ~600           | Core layout, grid, and basic card elements                |
| `discover-sidebar.css` _(new)_      | ~400           | Sidebar layout, search input, filters, category/tag trees |
| `feed-preview-modal.css` _(new)_    | ~300           | Feed preview modal, metadata, article grids, and states   |
| `kagi-smallweb.css` _(new)_         | ~250           | Kagi smallweb view, badges, skeletons, and footer         |
| `folder-selector-popup.css` _(new)_ | ~150           | Folder selector popup, list, and input interactions       |

> [!NOTE]
> **Why not more splits?** The layout grid and card definitions remain in `discover.css`
> because they are central to the primary structural layout and share many layout state
> dependencies with the `.rss-discover-layout` container.

---

## 2. Structural Section Map (matching modals.css style)

The cleaned `discover.css` will use these numbered comment blocks:

```
1.  Base Variables & Custom Properties
2.  Core Layout & Containers
3.  Responsive Grid
4.  Card Component
5.  States (Loading, Empty, Error)
6.  Media Query — Mobile (max-width: 1200px)
```

The new `discover-sidebar.css` will use:

```
1.  Sidebar Layout & Header
2.  Search Input & Filter Controls
3.  Category & Tag Trees
4.  Mobile Filters Menu & Dropdown
5.  Media Query — Mobile (max-width: 1200px)
```

The new `feed-preview-modal.css` will use:

```
1.  Modal Container & Header
2.  Feed Metadata & Title Section
3.  Article Grid & Cards
4.  States (Loading, Error, Empty)
5.  Media Query — Mobile (max-width: 768px)
```

The new `kagi-smallweb.css` will use:

```
1.  Container & Header
2.  Title & Status Row
3.  Badges & Warnings
4.  Skeleton Loading States
5.  Media Query — Mobile (max-width: 768px)
```

The new `folder-selector-popup.css` will use:

```
1.  Popup Container
2.  Input Controls
3.  Folder List & Items
4.  Scrollbar Styles
5.  Media Query — Mobile (max-width: 600px)
```

The split-out files each get the same file-level header block as `modals.css`.

---

## 3. Dead Code & Redundancies to Remove

| Lines     | Issue                                                             | Action                                                                             |
| --------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 300-302   | Commented-out margins in `.rss-discover-header`                   | **Remove** — Dead code                                                             |
| 572       | Commented-out color in `.rss-discover-card-type`                  | **Remove** — Dead code                                                             |
| 1518      | Commented-out color in close button                               | **Remove** — Dead code                                                             |
| 114, 896  | `color: #ea6962;`                                                 | **Replace** with new token `--rss-color-danger`                                    |
| 115, 897  | `background-color: rgba(234, 105, 98, 0.12);`                     | **Replace** with new token `--rss-color-danger-bg`                                 |
| 125, 905  | `color: #d94839;`                                                 | **Replace** with new token `--rss-color-danger-hover`                              |
| 126, 906  | `background-color: rgba(217, 72, 57, 0.2);`                       | **Replace** with new token `--rss-color-danger-bg-hover`                           |
| 653-655   | `background: #e74c3c !important`, `border`, `color`               | **Replace** with `var(--background-modifier-error)` and `var(--text-error)` tokens |
| 768-789   | `background: #c0392b` and `#a93226` in `.rss-clear-filter-button` | **Replace** with new token `--rss-color-danger` and `--rss-color-danger-hover`     |
| 983       | `background-color: #3ca03c;` in `.mod-cta:hover`                  | **Replace** with `var(--interactive-success)` token                                |
| 1524-1526 | `background: #9b59b6` in close button hover                       | **Replace** with new token `--rss-color-kagi-brand`                                |
| 1681      | `background: #981fc8` in `.rss-smallweb-badge`                    | **Replace** with new token `--rss-color-kagi-brand`                                |

---

## 4. `!important` Audit

| Lines     | Declaration                                                                     | Disposition                                                                                                                     |
| --------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 56        | `.rss-discover-sidebar { display: none !important }`                            | **Keep** — utility toggle class for mobile breakpoint. Add `/* audit-ok: display toggle utility */`                             |
| 121       | `.rss-discover-search-clear-hidden { display: none !important }`                | **Keep** — utility toggle class. Add `/* audit-ok: display toggle utility */`                                                   |
| 349-352   | `.rss-discover-header-nav-button svg { ... !important × 4 }`                    | **Keep with audit comment** — Sanctioned if overcoming Obsidian SVG overrides. Add `/* audit-ok: Obsidian SVG normalization */` |
| 483-490   | `.rss-discover-mobile-filters-button svg { ... !important × 6 }`                | **Keep with audit comment** — Obsidian SVG override. Add `/* audit-ok: Obsidian SVG normalization */`                           |
| 653-655   | `.rss-discover-card-remove-btn { ... !important × 3 }`                          | **Scope to higher specificity**: `body .rss-discover-card-actions .rss-discover-card-remove-btn`                                |
| 660-662   | `.rss-discover-card-remove-btn:hover { ... !important × 3 }`                    | **Scope to higher specificity**: `body .rss-discover-card-actions .rss-discover-card-remove-btn:hover`                          |
| 1106      | `.rss-discover-mobile-header { display: flex !important }`                      | **Keep** — Responsive state toggle utility. Add `/* audit-ok: responsive toggle utility */`                                     |
| 1112      | `.rss-discover-filter-controls { display: none !important }`                    | **Keep** — Responsive state toggle utility. Add `/* audit-ok: responsive toggle utility */`                                     |
| 1169-1173 | `.rss-discover-sidebar-toggle svg { ... !important × 4 }`                       | **Keep with audit comment** — Obsidian SVG override                                                                             |
| 1699-1703 | `.rss-smallweb-following-btn { ... !important × 4 }`                            | **Scope to higher specificity** — Use stronger parent selector to avoid `!important`                                            |
| 1716-1719 | `.rss-smallweb-unfollow-hover { ... !important × 3 }`                           | **Scope to higher specificity**                                                                                                 |
| 1723-1726 | `.rss-smallweb-error-btn { ... !important × 3 }`                                | **Scope to higher specificity**                                                                                                 |
| 1883      | `.rss-folder-selector-input-invalid { border-color: ... !important }`           | **Keep** — State utility toggle. Add `/* audit-ok: validation state utility */`                                                 |
| 1990-1991 | `.rss-folder-selector-popup { left: 16px !important; right: 16px !important; }` | **Keep** — Mobile media query override utility                                                                                  |
| 1997      | `.rss-folder-selector-input-wrapper { position: relative !important }`          | **Scope to higher specificity**                                                                                                 |
| 2000      | `.rss-folder-selector-input { padding-right: 32px !important }`                 | **Scope to higher specificity**                                                                                                 |
| 2009      | `.rss-folder-selector-clear { display: flex !important }`                       | **Keep** — toggle utility                                                                                                       |
| 2025      | `.rss-folder-selector-clear.is-hidden { display: none !important }`             | **Keep** — toggle utility                                                                                                       |

---

## 5. Selector / Rule Redundancies

Lines 1185–1192 define `.rss-discover-card-footer` and lines 1176–1183 define `.rss-discover-card-footer` directly above it.
**Action:** Merge the two duplicate blocks into 1 clean declaration (delete the redundant one).

Lines 1429–1436 define another `.rss-discover-card-footer` with conflicting properties (`padding`, `border-top`, `background`).
**Action:** Resolve properties into the primary `.rss-discover-card-footer` rule or properly scope the override under a parent like `.feed-preview-modal` if it was intended specifically for that context.

---

## 6. Proposed Changes Summary

### [MODIFY] discover.css

- Add file-level header block (matching modals.css style)
- Add numbered section comment blocks (sections 1–6 per map above)
- Remove all dead/commented-out code
- Replace hardcoded hex values with design-spec tokens
- Eliminate / scope `!important` declarations per audit plan
- Merge duplicate `.rss-discover-card-footer` selectors
- Move sidebar rules to `discover-sidebar.css`
- Move feed preview rules to `feed-preview-modal.css`
- Move smallweb rules to `kagi-smallweb.css`
- Move folder selector rules to `folder-selector-popup.css`

---

### [NEW] discover-sidebar.css

- File-level header comment
- Sidebar layout, filter controls, and category tree styles extracted from `discover.css`

---

### [NEW] feed-preview-modal.css

- File-level header comment
- Feed preview modal, article grid, and metadata styles extracted from `discover.css`

---

### [NEW] kagi-smallweb.css

- File-level header comment
- Kagi smallweb container, badges, skeletons, and footer styles extracted from `discover.css`

---

### [NEW] folder-selector-popup.css

- File-level header comment
- Folder selector popup, inputs, and list styles extracted from `discover.css`

---

### [MODIFY] index.css

- Add imports for the 4 new CSS files

---

## Open Questions

None at this time. All previously flagged tokens (`--rss-color-danger` suite and `--rss-color-kagi-brand`) have been approved for use.

---

## Verification Plan

### Manual Checks

- Discover view layout renders correctly with responsive resizing in Obsidian (desktop and mobile)
- Sidebar search, category expand, and filter clearing functional
- Feed preview modal displays article grids properly
- Folder selector popup renders above and below correctly
- Kagi Smallweb skeleton loading states pulse correctly
- Focus rings visible for keyboard navigation

### Lint / Build

- `npm run build` passes with no new CSS scope violations
- No regressions in `npm run check:css-scope`
