## Plan: Normalize 2.2.0 release docs + beta history using `docs/releases/`

### Summary

(1) make `docs/releases/2.2.0.md` the public, stable “what’s new” summary, (2) add a single `docs/releases/2.2.0-beta-series.md` that preserves the full beta-by-beta history, and (3) make `CHANGELOG.md` stable-focused with a pointer to the beta-series doc.

### Repo Reality Check (current structure)

- `docs/releases/` contains stable notes for `2.1.0`–`2.1.9`, plus `docs/releases/2.2.0.md` and one pre-release file `docs/releases/2.2.0-beta.3.md`.
- `CHANGELOG.md` currently contains the authoritative beta entries `2.2.0-beta.1` → `2.2.0-beta.8`.

### Implementation Changes

- Create `docs/releases/2.2.0-beta-series.md`
  - Title: `## 2.2.0 Beta Series (beta.1 → beta.8)`
  - Opening note includes the “IMPORTANT: mis-versioned 2.3.0-alpha.\* tags” explanation (short, factual, dated).
  - For each beta entry, add a section like `### 2.2.0-beta.8 — March 24, 2026` and copy in the curated bullet groups (New Features / Fixed / Development), fixing obvious formatting corruption (dangling `-`, encoding quotes) as needed.
  - Add a short note at top: “For stable summary, see `docs/releases/2.2.0.md`.”
- Update `docs/releases/2.2.0.md` to be the public/stable summary
  - Structure it like your earlier stable notes (e.g., `### Highlights`, then grouped `### New Features`, `### Improvements`, `### Fixes`, `### Upgrade Notes`).
  - Strictly dedupe across betas and keep it readable in ~2 minutes.
  - Avoid deep file paths/symbol-level details; link to `docs/releases/2.2.0-beta-series.md` for full beta history.
  - Fix the current mojibake/encoding artifacts in headings (either remove emojis or ensure UTF-8 so they render correctly).
- Update `CHANGELOG.md` when 2.2.0 ships (stable-focused)
  - Add `## [2.2.0] - <release date>` with a concise rollup (highlights + key fixes + migrations).
  - Replace the block of beta entries with a single pointer line to `docs/releases/2.2.0-beta-series.md` (so the changelog stays scannable).
- Handle `docs/releases/2.2.0-beta.3.md` (avoid confusion)
  - Option A (recommended): Convert it into a short stub that links to `docs/releases/2.2.0-beta-series.md` and notes it’s superseded.
  - Option B: Move it to `docs/archive/` if you want `docs/releases/` to be “final public docs only”.

### Test Plan (docs-only)

- Verify internal links resolve: `docs/releases/2.2.0.md` ↔ `docs/releases/2.2.0-beta-series.md` ↔ `CHANGELOG.md`.
- Quick scan for corruption: no dangling bullets, no `â€œ/â€` quote artifacts, consistent headings.
- Ensure the “Filters → Rules” migration (and any other user-noticeable migrations) appears in `2.2.0.md` under “Upgrade Notes”.

### Assumptions / Defaults

- `docs/releases/2.2.0.md` is the canonical public release notes for 2.2.0 stable.
- Beta history remains available and complete in `docs/releases/2.2.0-beta-series.md`, sourced from `CHANGELOG.md`.
