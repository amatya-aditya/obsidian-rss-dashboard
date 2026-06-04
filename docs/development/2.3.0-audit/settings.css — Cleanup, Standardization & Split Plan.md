# settings.css — Cleanup, Standardization & Split Plan

Comprehensive plan to clean up `src/styles/settings.css` (998 lines, ~26 KB)
in line with the audit-remediation-2.3.0 checklist and the design-spec token/scoping
rules. Modeled after the section-comment structure of `modals.css`.

---

## 1. Recommended File Split

The current monolith mixes **4 distinct concerns**. Splitting aligns with existing
modular styling patterns already used in the project and reduces merge conflicts.

| New file                               | Lines (approx) | What it owns                                                                              |
| -------------------------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `settings.css` _(keep, trimmed)_       | ~230           | Shared settings shell, tab bar, generic setting rows, and common responsive utilities     |
| `settings-about-support.css` _(new)_   | ~220           | About tab and support CTA/readme sections                                                 |
| `settings-keyword-filters.css` _(new)_ | ~420           | Keyword/highlight filter editor, rule rows, toggles, and keyword-specific breakpoints     |
| `settings-icon-proxy.css` _(new)_      | ~130           | Icon visibility ordering controls, drag handles, icon preview, and proxy-setting controls |

> [!NOTE]
> **Why not more splits?** Keep shared row/setting primitives in `settings.css`
> because those primitives are reused by both keyword and icon/proxy surfaces. Moving
> the primitives into each split file would duplicate responsive overrides and increase
> specificity risk.

---

## 2. Structural Section Map

The cleaned `settings.css` will use these numbered comment blocks:

```css
1.  Base Variables & Shared Utilities
2.  Settings Shell & Tabs
3.  Import/Export & Storage Action Rows
4.  Template Input & Saved Templates
5.  Shared Settings Layout Helpers
6.  Media Query — Tablet (max-width: 1024px)
7.  Media Query — Mobile (max-width: 768px)
```

The new `settings-about-support.css` will use:

```css
1.  About Surface Container
2.  About Typography & Action Buttons
3.  Support CTA Surface
```

The new `settings-keyword-filters.css` will use:

```css
1.  Filter Display Modes (Inline / Vertical)
2.  Highlight Word Rows
3.  Keyword Filter Editor Layout
4.  Keyword Rule Cards & Controls
5.  Destructive Actions & Empty States
6.  Media Query — Desktop Compact (max-width: 1200px)
7.  Media Query — Tablet Compact (max-width: 920px)
8.  Media Query — Mobile Stack (max-width: 768px)
```

The new `settings-icon-proxy.css` will use:

```css
1.  Icon Visibility Row Actions
2.  Drag Handle & Drop Indicators
3.  Icon Preview Rendering
4.  Proxy Setting Layout
5.  Media Query — Mobile (max-width: 768px)
```

The split-out files each get the same file-level header block as `modals.css`.

---

## 3. Dead Code & Redundancies to Remove

| Lines             | Issue                                                                                              | Action                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 9-39 and 301-335  | `.rss-dashboard-settings-tab-*` blocks are duplicated with overlapping declarations                | **Merge** into one canonical tab block and keep only modernized properties (`flex-wrap`, `border-radius`, current active state styles) |
| 43-69 and 169-195 | `.rss-dashboard-support-btn-row`, `.rss-dashboard-support-btn`, and hover state duplicated exactly | **Remove** first duplicate cluster and retain a single source of truth                                                                 |
| 83-97 and 199-213 | `.rss-dashboard-support-readme` and link/hover rules duplicated exactly                            | **Remove** first duplicate cluster and retain a single source of truth                                                                 |
| 476-477           | Hardcoded `background-color: #8e44ad; color: #fff;` for mobile refresh button                      | **Replace** with `background-color: var(--interactive-accent); color: var(--text-on-accent);`                                          |
| 482-483           | Hardcoded `background-color: #9b59b6; color: #fff;` for mobile refresh hover                       | **Replace** with `background-color: var(--interactive-accent-hover); color: var(--text-on-accent);`                                    |
| 923, 925-926      | Hardcoded destructive set (`#a32020`, `#c93030`, `#fff`) in `.rss-keyword-filter-delete`           | **Replace** with approved destructive token family (`--rss-color-danger`, `--rss-color-danger-border`, `--text-on-accent`)             |
| 937               | Hardcoded hover `#b62828` in `.rss-keyword-filter-delete:hover`                                    | **Replace** with `--rss-color-danger-hover`                                                                                            |
| 941-942           | Hardcoded disabled destructive colors `#7a2a2a`, `#6a2020`                                         | **Replace** with approved disabled-danger tokens (`--rss-color-danger-disabled`, `--rss-color-danger-border-disabled`)                 |

---

## 4. `!important` Audit

| Lines | Declaration                                                                  | Disposition                                                                                                                                   |
| ----- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 967   | `.rss-keyword-filter-add-btn { border-radius: 8px !important; }`             | **Remove** — no competing selector in file; base selector specificity is already sufficient                                                   |
| 1152  | `.rss-proxy-setting-item input[type="text"] { width: 100% !important; }`     | **Remove** — this pass removes `!important`; preserve selector and verify computed width behavior across desktop/iOS/Android after change     |
| 1153  | `.rss-proxy-setting-item input[type="text"] { max-width: 100% !important; }` | **Remove** — this pass removes `!important`; preserve selector and verify computed max-width behavior across desktop/iOS/Android after change |

---

## 5. Selector / Rule Redundancies

Lines 9-39 define `.rss-dashboard-settings-tab-bar`, `.rss-dashboard-settings-tab-btn`, `.rss-dashboard-settings-tab-btn.active`, `.rss-dashboard-settings-tab-btn:hover`, and `.rss-dashboard-settings-tab-content`; lines 301-335 re-declare all of these with updated properties.

**Action:** Consolidate into one declaration group and keep the later variant as baseline, then move it into the new "Settings Shell & Tabs" section.

Lines 43-69 and 169-195 duplicate support CTA row/button/hover blocks; lines 83-97 and 199-213 duplicate support readme link blocks.

**Action:** Keep only one support block cluster in `settings-about-support.css` and remove all duplicate declarations from the main file.

Lines 380-385 and 388-393 define near-identical active-state styles for search and tags in inline mode; lines 431-436 and 439-444 repeat the same for vertical mode.

**Action:** Merge each mode's repeated active declarations using grouped selectors to reduce duplication while preserving selector scope.

---

## 6. Proposed Changes Summary

### [MODIFY] settings.css

- Add file-level header block (matching modals.css style)
- Add numbered section comment blocks (sections 1-7 per map above)
- Remove duplicate tab and support/readme rule clusters
- Keep only shared shell/layout primitives in this file
- Remove unsanctioned `!important` on `.rss-keyword-filter-add-btn`
- Remove `!important` from `.rss-proxy-setting-item input[type="text"]` width/max-width declarations this pass
- Replace hardcoded mobile refresh purple/white with design-spec tokens
- Normalize mobile refresh action colors to `--interactive-accent` / `--interactive-accent-hover`
- Introduce approved destructive token family for keyword delete states
- Move keyword filter rules to `settings-keyword-filters.css`
- Move about/support rules to `settings-about-support.css`
- Move icon/proxy rules to `settings-icon-proxy.css`

---

### [NEW] settings-about-support.css

- File-level header comment
- About tab title/version/section/button rules
- Support CTA and support-readme rules (single canonical copy)

---

### [NEW] settings-keyword-filters.css

- File-level header comment
- Filter display mode rules, highlight rows, and keyword rule editor styles
- Keyword-specific media-query overrides and destructive-action styling

---

### [NEW] settings-icon-proxy.css

- File-level header comment
- Icon ordering controls, drag handle/preview styles, and proxy setting refinements

---

### [MODIFY] index.css

- Add imports for the 3 new settings split files

---

## Resolved Decisions

> [!NOTE]
> **Q1 Resolution — Approved**
> Introduce and use a tokenized destructive family for settings keyword delete states
> in place of hardcoded reds.

> [!NOTE]
> **Q2 Resolution — Approved**
> Remove proxy input width/max-width `!important` declarations in this pass.
> Validate layout behavior manually across desktop, iOS, and Android.

> [!NOTE]
> **Q3 Resolution — Approved**
> Normalize mobile refresh action colors to `--interactive-accent` and
> `--interactive-accent-hover`.

---

## Verification Plan

### Manual Checks

- Settings tabs render correctly and active/hover states remain unchanged on desktop and mobile
- About tab and support CTA surfaces render identically after file split
- Keyword filter editor rows, segmented controls, and delete/add actions behave and align correctly
- Icon visibility drag handles, preview SVGs, and drop indicators remain stable on desktop/mobile
- Proxy setting dropdown and text input stack correctly at `max-width: 768px`
- Proxy input width/max-width remains correct after removing `!important` on desktop, iOS, and Android
- Keyboard focus visibility remains intact for buttons and toggle-like controls

### Lint / Build

- `npm run build` passes with no new CSS scope violations
- No regressions in `npm run check:css-scope`
