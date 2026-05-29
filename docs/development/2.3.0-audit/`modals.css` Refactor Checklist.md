# `modals.css` Refactor Checklist

## 3. Fix Base Container Specificity (Biggest Win — ~60 `!important` removed)

- [ ] Remove `!important` from the same properties in the `@media (max-width: 768px)` OPML modal override

## 6. Document and Preserve Legitimate `!important` (Android Icon Rendering)

- [ ] Audit the 4 repeated icon SVG blocks (`import-preview-icon`, `cleaner-row clickable-icon`, `preview-tree clickable-icon`, base `clickable-icon`) — confirm each needs its own scope or consolidate where selectors can be combined

---

## 7. Extract Hardcoded Colors to Custom Properties

- [ ] Add a comment on `background: rgba(0, 0, 0, 0.6)` on the overlay explaining no Obsidian token equivalent exists
- [ ] Add a comment on `box-shadow` values that use hardcoded `rgba(0,0,0,...)` explaining shadow token gap

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

---

**Updated Plan**

## Completed

- Added explanatory comments for the hardcoded shadow values in `src/styles/modals.css`.
- Kept the combobox padding split as-is.
- Left `import-hidden` / `import-visible` in place because they are still used by the import modal state flow.
- Began the feed-manager responsive cleanup by extracting a canonical grouped block for the search/button layout.

## Still Unfinished

- Remove the remaining duplicate lower feed-manager block in `src/styles/modals.css`.
- Finish consolidating the remaining breakpoint rules so there is one clear source of truth for the feed-manager mobile behavior.
- Audit the Android/WebView `clickable-icon` SVG blocks and merge any truly shared selectors.
- Do the final `modals.css` section reorder to match the checklist layering.
- Re-check whether the `@media (min-width: 769px)` feed manager grid rule is still needed after the consolidation is complete.

## Current Status

- The work is currently in a safe-but-partially-refactored state.
- No behavior-changing utility swaps were made.
- The main remaining risk is CSS duplication, not functional regression.

If you want, I can turn this into a tighter “done vs next” checklist with file-level bullets for the remaining `modals.css` cleanup.
