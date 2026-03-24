# OPML Import Refactor (TDD-First)

## Goal
Refactor the OPML import flow to deliver a polished, aligned preview experience with:

- Tree preview (folders + feeds) with selective import (all checked by default)
- Strict name validation for feed titles + folder path segments
- Inline “fix in preview” editing + explicit “Auto-fix invalid names” action
- Parse-failure fallback that suggests an OPML cleaning tool with a link + `external-link` Lucide icon control

## Success Criteria
- Unit tests cover the new import model behaviors and are green (`npm run test:unit`).
- UI/CSS changes adhere to `docs/design/design-spec.md` (especially icon rendering + CSS scoping).
- `npm run build` passes (eslint + typecheck + production bundle + CSS bundle).
- Manual smoke test in Obsidian confirms the preview is aligned, accessible, and behaves correctly on desktop + mobile.

## Non-Negotiable Design Rules (Design Spec)
Follow `docs/design/design-spec.md` for any UI/CSS work:

- **Clickable icons**: icon-only interactive controls MUST use the `clickable-icon` pattern (role/button/tabindex, keyboard handlers).
- **CSS scoping**: never ship unscoped global selectors (Obsidian loads plugin CSS globally). Scope preview styles under an `rss-` surface selector such as `.rss-dashboard-modal` / `.rss-dashboard-modal-container` and the import modal classes.
- **Tokenized colors**: prefer Obsidian variables over hardcoded colors.
- **Accessibility**: preserve `:focus-visible`, readable contrast, and touch targets at mobile breakpoints.

## TDD Strategy (Order Matters)
1. **Baseline check (keep main green)**
   - Run `npm run test:unit` and fix/align any existing failing tests that would block TDD work.
   - Run `npm run build` once to confirm a clean baseline.

2. **Write failing unit tests first**
   - Introduce a pure “import preview model” module (no DOM) that can be unit-tested deterministically.
   - Add unit tests that describe the desired behavior (see “Test Cases” below).

3. **Implement minimal code to pass tests**
   - Implement the model builder + validation + selection logic until tests pass.
   - Only then wire the model into the modal DOM rendering.

4. **UI integration + CSS**
   - Update the modal rendering to match the model.
   - Update `src/styles/modals.css` with scoped selectors + design-spec compliant icon rendering.

5. **Build verification**
   - Run `npm run build` and fix any lint/type/build issues before considering the refactor complete.

## Implementation Plan
### Phase A — Testable Model Extraction
Create a new module responsible for building and mutating preview state (no DOM dependency), e.g.:

- `src/services/opml-import-preview-model.ts` (or `src/utils/opml-import-preview-model.ts`)

Responsibilities:
- Build a stable tree from parsed OPML: folders + feeds + “Uncategorized”.
- Track selection state (feed URLs; folder tri-state derived).
- Compute counts: total, selected importable, duplicates (Update mode), invalid selected, etc.
- Validate:
  - Feed titles via `isValidFeedTitle`.
  - Folder segments via `isValidFolderName` for each path segment.
- Support mutations:
  - Toggle feed selection
  - Toggle folder selection (applies to descendants)
  - Collapse/expand folder nodes
  - Rename feed title
  - Rename folder segment name (updates descendant paths)
  - Auto-fix invalid names via `sanitizeName`
- Expose “import payload” helpers:
  - Selected importable feeds list
  - Derived minimal folder tree for selected feeds (plus explicitly-selected empty folders, if supported)

### Phase B — Modal Wiring (ImportOpmlModal)
Update `src/modals/import-opml-modal.ts` to:
- Use the model module as the single source of truth.
- Render a CSS-grid aligned tree list:
  - checkbox | icon | label | meta/badges | expand/collapse control
- Replace emoji glyphs with `setIcon()` icons.
- Add header controls: select all/none, expand/collapse all, auto-fix.
- Enforce gating: disable Import when model reports invalid **selected importable** items.
- Duplicates in Update mode:
  - Render as checked+disabled with “Already exists” badge
  - Exclude from “to import” and from validation gating

### Phase C — Parse-Failure Fallback (OPML Cleaner Suggestion)
When OPML parsing/structure checks fail (invalid XML, missing `<opml>`, missing `<body>`, parse errors), show an error callout that suggests cleaning the OPML:

- URL: `https://www.freecodeformat.com/opml-to-format.php`
- Provide both:
  - A visible text link in the callout
  - A **design-spec compliant** icon-only control using the `clickable-icon` pattern with `setIcon(..., "external-link")`
- Clicking opens the user’s browser via `window.open(url, "_blank", "noopener,noreferrer")`
  - If blocked, show a `Notice` telling the user to copy/paste the URL

Do **not** show this cleaner suggestion for name-validation errors (those are fixed inline in preview).

### Phase D — CSS / Styling
Update `src/styles/modals.css`:
- Scope all new rules under the import modal surface selectors (per design spec).
- Use CSS grid rows for alignment.
- Add styles for:
  - Badges (duplicate / needs-fix / counts)
  - Inline edit inputs + invalid states
  - `clickable-icon` sizing and Android visibility fixes **scoped to the import modal**

## Test Cases (Write These First)
Add `test_files/unit/opml-import-preview-model.test.ts` (or similar) to cover:

1. **Tree build**
   - Builds nested folders from OPML folders + feed folder paths.
   - Feeds with missing/unknown folder end up under “Uncategorized”.

2. **Selection**
   - Default: all feeds selected.
   - Toggling a folder selects/unselects all descendants.
   - Folder tri-state becomes indeterminate for partial selection.

3. **Duplicates (Update mode)**
   - Existing URLs are marked as duplicates and treated as non-importable.
   - Duplicate rows do not contribute to “to import” count and do not block validation gating.

4. **Validation**
   - Invalid feed titles are detected via `isValidFeedTitle`.
   - Invalid folder segment names are detected via `isValidFolderName`.
   - Import gating is true only when selected importable items are invalid.

5. **Renaming / editing**
   - Renaming a folder segment updates descendant feed folder paths.
   - Renaming a feed title updates its validation state.

6. **Auto-fix**
   - `sanitizeName()` applied to invalid names clears validation errors when possible.
   - Auto-fix collisions merge or otherwise deterministically resolve without throwing.

## Build Checklist
- `npm run test:unit`
- `npm run build`
- Manual Obsidian smoke test:
  - Invalid XML OPML shows cleaner suggestion + external-link control works
  - Invalid names are fixable inline; import blocked only for selected invalid items
  - Preview alignment holds across desktop/tablet/mobile
