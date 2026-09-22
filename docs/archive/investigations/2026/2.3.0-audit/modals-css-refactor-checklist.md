# `modals.css` Refactor Checklist

- [ ] Remove `!important`

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

## Current Status

- The `modals.css` file has been fully refactored and modularized.
- Feature-specific modals (`feed-manager`, `add-feed`, `edit-feed`) have been broken off into their own child CSS files.
- Base structural styles and responsive overrides have been consolidated in `modals.css`.
- This unblocks the next phase of the `!important` declaration audit.
