# `modals.css` Refactor Checklist

## 1. Z-index Tokens

- [ ] Add `--z-index-close-button: 10` to `:root`
- [ ] Add `--z-index-folder-dropdown: 10000` to `:root`
- [ ] Add `--z-index-drawer: 99999` to `:root`
- [ ] Replace `z-index: 1000` on `.rss-dashboard-modal` with `var(--z-index-modal)` (and reconcile with `--z-index-modal: 100000` — decide which is correct)
- [ ] Replace `z-index: 10000` on `.edit-feed-folder-dropdown` with `var(--z-index-folder-dropdown)`
- [ ] Replace `z-index: 10` on `.modal-close-button` (×4 occurrences) with `var(--z-index-close-button)`
- [ ] Replace `z-index: 99999` on mobile drawer modals (×2) with `var(--z-index-drawer)`

---

## 2. Duplicate Rule Blocks

- [ ] Merge the two `.rss-dashboard-modal, .feed-manager-modal` blocks (lines 12 and 225) — move the multi-shadow into the first block and delete the second
- [ ] Merge the two `.rss-dashboard-modal input, textarea` declarations (lines 201 and 282) into one consolidated rule including `width`, `min-width`, `max-width`, `box-sizing`, `border`, `border-radius`, `padding`, `font-size`, `color`
- [ ] Merge the two `.feed-manager-modal input, textarea` declarations into the same consolidated rule
- [ ] Delete the redundant `.modal-container.mod-dim .modal.rss-dashboard-modal-container` desktop block that is duplicated inside the 768px media query

---

## 3. Fix Base Container Specificity (Biggest Win — ~60 `!important` removed)

- [ ] Change the base `.rss-dashboard-modal-container` selector to `.modal-container .modal.rss-dashboard-modal-container` — this beats Obsidian's specificity without `!important`
- [ ] Remove `!important` from `position`, `top`, `left`, `transform`, `margin`, `z-index`, `width`, `max-width`, `max-height`, `padding` in the base container rule
- [ ] Remove `!important` from the same properties in the `@media (max-width: 1200px)` container override
- [ ] Remove `!important` from the same properties in the `@media (max-width: 768px)` bottom-sheet override
- [ ] Remove `!important` from the same properties in the `@media (max-width: 768px)` OPML modal override
- [ ] Remove `!important` from the same properties in the `@media (max-width: 400px)` override
- [ ] Remove `!important` from `.modal-close-button` positioning rules that were forced by the above

---

## 4. Drop Unnecessary `!important` from Button Styles

- [ ] `.rss-dashboard-load-button` — remove `!important` from `background` and `color`
- [ ] `.rss-dashboard-load-button:hover` — remove `!important` from `background`
- [ ] `.rss-dashboard-danger-button` — remove `!important` from `background`, `color`, `border`
- [ ] `.rss-dashboard-danger-button:hover` — remove `!important` from `background`, `border-color`
- [ ] `.rss-dashboard-danger-button:active` — remove `!important` from `background`
- [ ] `.rss-dashboard-confirm-modal .rss-folder-name-modal-cancel` — remove `!important` from `background`, `color`, `border`
- [ ] `.rss-dashboard-confirm-modal .rss-folder-name-modal-cancel:hover` — remove `!important` from `background`, `border-color`
- [ ] `.feed-manager-delete-folder-button` — remove `!important` from `background`, `color`, `border`
- [ ] `.feed-manager-delete-folder-button:hover` — remove `!important` from `border-color`
- [ ] `.delete-all-backup-notice .export-opml-btn` — remove `!important` from `background`, `color`
- [ ] `.delete-all-backup-notice .export-opml-btn:hover` — remove `!important` from `background`
- [ ] `.rss-dashboard-modal-actions button` — remove `!important` from `margin`, `border-radius`
- [ ] `.feed-url-input.loaded` — remove `!important` from `border-color`
- [ ] `.rss-dashboard-modal-interactions-disabled` — remove `!important` from `pointer-events` (own class, nothing competing)

---

## 5. Fix ShortcutHelpModal `!important` Bombing

- [ ] `.shortcut-help-modal .modal-close-button` — keep `display: none !important` (fighting Obsidian core, legitimate)
- [ ] `.shortcut-help-modal .rss-dashboard-header` — remove `!important` from ALL properties; the two-class selector already wins specificity
- [ ] `.shortcut-help-modal .rss-dashboard-header-title` — remove `!important` from all properties
- [ ] `.shortcut-help-modal .rss-dashboard-header-close-button` — remove `!important` from all properties
- [ ] `.shortcut-help-modal .rss-dashboard-header-close-button:hover` — remove `!important` from all properties
- [ ] `.shortcut-help-modal .rss-dashboard-modal-content` — remove `!important` from `padding`

---

## 6. Document and Preserve Legitimate `!important` (Android Icon Rendering)

- [ ] Add a comment block above the first `.rss-dashboard-modal .clickable-icon svg` rule explaining the Android WebView justification (per design-spec §Icon Rendering Standards)
- [ ] Audit the 4 repeated icon SVG blocks (`import-preview-icon`, `cleaner-row clickable-icon`, `preview-tree clickable-icon`, base `clickable-icon`) — confirm each needs its own scope or consolidate where selectors can be combined
- [ ] Keep `!important` on `width`, `height`, `display: block`, `visibility: visible` for all scoped SVG icon rules — these are justified

---

## 7. Extract Hardcoded Colors to Custom Properties

- [ ] Add a `/* RSS Dashboard semantic palette */` section to `:root` with:
  - `--rss-color-purple: #8b5cf6`
  - `--rss-color-purple-hover: #7c3aed`
  - `--rss-color-red-danger: #dc2626`
  - `--rss-color-red-danger-hover: #b91c1c`
  - `--rss-color-red-danger-dark: #991b1b`
  - `--rss-color-red-confirm: #ef4444`
  - `--rss-color-status-ok: #22c55e`
  - `--rss-color-status-error: #ef4444`
  - `--rss-color-status-loading: #f59e0b`
  - `--rss-color-rss-badge: #ef8833`
  - `--rss-color-podcast-badge: #7b28f2`
  - `--rss-color-youtube-badge: #ff0000`
  - `--rss-color-discover-accent: #9b59b6`
- [ ] Replace all `color: #fff` on accent-background buttons with `color: var(--text-on-accent)` per design-spec accent button pairing rule
- [ ] Replace `background: #8b5cf6` / `#7c3aed` with `var(--rss-color-purple)` / `var(--rss-color-purple-hover)` in load button
- [ ] Replace `background: #dc2626`, `#b91c1c`, `#991b1b` with danger vars throughout
- [ ] Replace `background: #ef4444` / `#dc2626` in confirm modal cancel button with danger vars
- [ ] Replace status color values (`#22c55e`, `#ef4444`, `#f59e0b`) in `.add-feed-status` with status vars
- [ ] Replace badge hardcoded colors with badge vars
- [ ] Replace `#9b59b6` in discover close button hover with `var(--rss-color-discover-accent)`
- [ ] Add a comment on `background: rgba(0, 0, 0, 0.6)` on the overlay explaining no Obsidian token equivalent exists
- [ ] Add a comment on `box-shadow` values that use hardcoded `rgba(0,0,0,...)` explaining shadow token gap

---

## 8. Fix CSS Scope Violations

- [ ] Remove or scope the bare `.feed-manager-search-clear` rule (unscoped, violates design-spec guardrail) — the scoped `.rss-dashboard-modal .feed-manager-search-clear` version is correct
- [ ] Remove or scope the bare `.feed-manager-search-container` rule — use the scoped version
- [ ] Remove or scope the bare `.feed-manager-search-clear.is-hidden` rule
- [ ] Remove or scope the bare `.feed-manager-search-input` rule (padding-right only version)
- [ ] Run `npm run check:css-scope` to confirm no regressions

---

## 9. Consolidate Responsive Blocks

- [ ] Audit all `@media (max-width: 768px)` blocks — there are at least 6 separate ones; group by feature or consolidate into a single block at the bottom
- [ ] Audit all `@media (max-width: 400px)` blocks — merge where possible
- [ ] Audit all `@media (max-width: 1200px)` blocks — merge where possible
- [ ] Confirm the `@media (min-width: 769px)` feed manager grid rule is still needed after consolidation

---

## 10. File Structure Cleanup

- [ ] Reorder file sections to match a consistent layering strategy:
  1. `:root` tokens (z-indexes + rss palette)
  2. Base modal shell (container, positioning, close button)
  3. Shared modal chrome (headings, inputs, labels, button base styles)
  4. Feature modals in order: Add/Edit Feed → Tag → Feed Manager → Import OPML → Folder Name → Delete Confirmation → Shortcut Help → Mobile Drawers
  5. Responsive overrides (consolidated, at end)
- [ ] Resolve the two combobox clear-icon `padding-right` implementations: `.rss-dashboard-folder-input-container input` (34px) vs `.rss-dashboard-folder-combobox-input` (40px) — pick one canonical approach
- [ ] Verify the `import-hidden` / `import-visible` utility classes at the bottom aren't already handled by Obsidian's `.hidden` utility (and if they are, remove to avoid redundancy)
- [ ] Add section comment headers for any feature blocks that are currently missing them
