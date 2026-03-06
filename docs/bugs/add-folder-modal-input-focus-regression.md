# Bug Report: Add Folder Modal Input Focus/Typing Regression on Mobile and Mobile Emulation

## Summary
The Add Folder modal in the sidebar intermittently loses input focus on mobile and desktop mobile emulation, causing one or more of the following:
- keyboard not opening,
- input defocusing immediately after tap,
- typed characters being overwritten/deleted,
- typing lag and dropped characters.

This issue emerged while fixing mobile focus behavior for the folder-name modal.

## Affected Area
- Sidebar folder creation modal
- Primary implementation location: `src/components/sidebar.ts` (`showFolderNameModal`)
- Related styling: `src/styles/modals.css`

## Environment
- Platform: Obsidian desktop with mobile emulation (reported), mobile behavior also targeted
- Date observed: 2026-03-02
- Build status during changes: passing (`npm run build`)

## Original User-Visible Symptoms
1. Tap Add Folder icon in sidebar toolbar on mobile
2. Modal opens
3. Tapping input does not reliably allow typing
4. In later iterations:
   - input accepted focus but letters were deleted/replaced,
   - intermittent lag appeared,
   - eventually typing could fail again.

## Expected Behavior
- Tapping folder name input should reliably place caret in input.
- Keyboard should open on mobile.
- Typing should be immediate and stable.
- OK should validate and show clear errors:
  - empty name rejected,
  - duplicate name rejected.

## Actual Behavior (Observed Across Iterations)
- Focus instability due to event/focus interactions with host-level handlers.
- Text replacement/deletion caused by repeated selection/refocus loops.
- Intermittent input lag and missed keystrokes due to aggressive focus recovery.

## Change History and Attempted Fixes

### Attempt 1: Validation + modal UX improvements
Implemented:
- Added inline validation errors (empty + duplicate checks).
- Added `existingNames` support to all folder-name modal call sites.
- Added mobile-friendly attributes (`autocorrect`, `autocapitalize`, `spellcheck`)
- Changed mobile modal position to top-pinned in CSS.

Outcome:
- Validation behavior improved.
- Focus issue remained.

### Attempt 2: Focus protection via propagation guards + immediate focus
Implemented:
- Added propagation blocking on modal for `mousedown` and `touchstart`.
- Used synchronous `focus()` (with rAF follow-up) to preserve mobile keyboard chain.

Outcome:
- Improved in some scenarios.
- Defocus still reproducible in emulation.

### Attempt 3: Stronger guards + blur recovery
Implemented:
- Added modal propagation guards for `pointerdown`, `mousedown`, `click`, `touchstart`.
- Added blur-based refocus recovery logic.

Outcome:
- Input became typeable in some runs.
- New regression: letters overwritten/deleted due to focus/select interaction.

### Attempt 4: Remove select-on-focus loop
Implemented:
- Removed per-focus `select()` listener to stop replacing typed text.

Outcome:
- Deletion regression improved.
- Residual lag/dropped characters still reported.

### Attempt 5: Remove blur-based refocus recovery
Implemented:
- Removed blur refocus handler to reduce focus churn during typing.
- Retained propagation guards.

Outcome:
- Typing responsiveness improved in one report.
- Latest report indicates inability to type can still recur.

## Technical Analysis (Most Likely Root Cause)
The modal is attached to `document.body`, while Obsidian host/workspace focus handling can react to pointer/click flows outside the modal’s intended interaction context. Repeated attempts to force focus recovery introduced race conditions:
- host-level focus reclaim,
- modal-level re-focus,
- text selection side effects,
- event-order differences across desktop emulation vs mobile WebKit.

This creates unstable caret state and inconsistent text input behavior.

## Current Risk
- High UX impact for mobile folder management.
- Regressions have occurred while patching focus behavior.
- Potential for future regressions if more ad-hoc focus forcing is layered in the same modal.

## Recommended Next Steps (Resolution Plan)

### 1) Stabilize interaction model (preferred)
Replace ad-hoc `document.body` modal handling with a modal pattern that is host-consistent (Obsidian-native modal lifecycle/focus trap where feasible) for folder-name entry.

Reason:
- Reduces custom event/focus race handling.
- Lets host manage focus semantics predictably.

### 2) If keeping custom modal, isolate focus strategy
Use a single, minimal focus policy:
- Keep only one initial focus on open.
- Do **not** auto-select on subsequent focus events.
- Avoid blur-triggered forced refocus during typing.
- Keep validation independent of focus logic.

### 3) Add focused instrumentation (temporary)
Add short-lived debug logging gated by dev flag to capture, per interaction:
- `focus`, `blur`, `pointerdown`, `mousedown`, `click`, `touchstart`
- active element transitions
- whether event reached document-level handlers

Reason:
- Confirms exact event ordering in failing environment.
- Prevents further speculative fixes.

### 4) Cross-environment verification matrix
Before merging final fix, validate:
- Desktop normal mode
- Desktop mobile emulation
- Real iOS Safari/WebView if available
- Real Android WebView if available

For each environment verify:
- tap input once → caret appears,
- type 10+ chars continuously with no drops,
- duplicate/empty validation works,
- OK/Cancel works reliably.

### 5) Regression protection
Add a concise test checklist entry in release QA notes for folder-name modal input behavior on mobile/emulation to prevent reintroduction.

## Suggested Owner / Priority
- Priority: High
- Owner: Sidebar/modal interaction surface (`showFolderNameModal`)

## Status
Open — unresolved focus/input stability regression persists intermittently.
