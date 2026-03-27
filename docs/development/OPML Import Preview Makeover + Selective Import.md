## OPML Import Preview: Tree UI + Selective Import + Name Validation + “OPML Cleaner” Fallback

### Summary
Revamp the OPML import preview into an aligned **tree list** (folders + feeds) with **checkbox selection** (all checked by default), **inline rename/fix** for invalid folder/feed names (must pass `src/utils/validation.ts` rules), and a parse-failure fallback that suggests an external OPML “cleaner” page with a clickable link + an **`external-link`** icon button that opens the user’s browser.

### Key Changes
- **Preview UI (aligned tree list)**
  - Update `src/modals/import-opml-modal.ts` `renderPreview()` to render one scrollable tree with CSS grid columns for consistent alignment (checkbox | icon | name | meta/badges).
  - Replace emoji glyphs with `setIcon()` (folder/rss/chevrons) to avoid column drift.
  - Add header summary badges: total feeds found, selected-to-import count, duplicates count (Update mode).

- **Selective import (all checked by default)**
  - Modal state:
    - `selectedFeedUrls: Set<string>` initialized to all parsed feed URLs.
    - `collapsedFolderPaths: Set<string>` for expand/collapse.
  - Folder checkbox toggles all descendant feeds; show indeterminate when partially selected.
  - Add controls: `Select all`, `Select none`, `Expand all`, `Collapse all`.

- **Duplicates (Update mode)**
  - Identify duplicates by URL against existing settings.
  - Show duplicates as visible rows but **checked + disabled** with an “Already exists” badge; they do not count toward “to import” and do not block validation.

- **Name validation + inline fixes (required)**
  - Use `src/utils/validation.ts`:
    - Feed title: `isValidFeedTitle`.
    - Folder names: validate each folder **path segment** with `isValidFolderName` (split on `/`; reject empty segments).
  - Inline editing in the preview:
    - Folder rows: edit folder **segment name** (not the whole path) via inline `<input>`; saving updates the tree node + recomputes descendant feed folder paths.
    - Feed rows: edit feed `title` via inline `<input>`.
    - `Enter` saves (only if valid), `Esc` cancels, blur keeps focus if invalid; show inline error text.
  - Import gating (decision): **block selected items only**.
    - Disable Import only when *selected importable* items have invalid names.
    - Users can uncheck invalid items to proceed.
  - Add “Auto-fix invalid names” button (explicit action):
    - Applies `sanitizeName()` to invalid feed titles and folder segment names.
    - If auto-fix creates collisions (same sibling folder name), merge nodes in the preview tree.

- **Parse-failure fallback: OPML cleaner suggestion**
  - In `validateAndParseFile()` track an error kind (e.g., `invalid_xml`, `missing_opml_root`, `missing_body`, `parse_failed`).
  - When the error kind is parse/structure related (not “no feeds found”, not name validation), render a callout in the error UI:
    - Text includes the direct link: `https://www.freecodeformat.com/opml-to-format.php`.
    - Add a button labeled “Open OPML cleaner” with `setIcon(button, "external-link")`.
    - Button handler: `const opened = window.open(url, "_blank", "noopener,noreferrer");` and if `!opened`, show a `Notice` telling the user to copy/paste the link.

- **Styling**
  - Update `src/styles/modals.css` for new preview tree rows, inline editor inputs, invalid state, badges, and responsive truncation.

### Test Plan
- Run `npm run test:unit` and `npm run lint` (or `npm run build`).
- Manual in Obsidian:
  - Invalid XML OPML → verify cleaner callout appears and button opens browser.
  - Valid OPML with invalid folder/feed names → verify inline edit + auto-fix + import gating.
  - Update mode duplicates → disabled rows, counts correct, no duplicates added.
  - Nested folders + selection/indeterminate behavior.

### Assumptions / Defaults
- Validation rules are exactly `src/utils/validation.ts` (most restrictive Obsidian filename constraints).
- External cleaner is optional guidance shown only for parse/structure failures; it’s not shown for name-validation issues.
- Browser opening uses the existing plugin convention (`window.open`) and falls back to a notice if blocked.
