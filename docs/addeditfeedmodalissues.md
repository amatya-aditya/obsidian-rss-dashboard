# Add/Edit Feed Modal - Mobile Bug Report

## Report Metadata
- Feature: Add/Edit Feed Modal
- Area: Filters panel + modal actions
- Platform: Mobile view
- Source: Manual review of existing notes + attached screenshot
- Report Date: 2026-02-26

## Executive Summary
Multiple mobile UI defects are present in the Add/Edit Feed modal. The highest-impact issues are inconsistent action button patterns, poor destructive-action affordance, oversized/misaligned checkbox controls, and weak visual grouping within the Filters rule editor. These issues reduce clarity, increase error risk, and hurt tap usability.

## Defect List

### BR-001: Action buttons are inconsistent in shape and layout
- Severity: High
- Priority: P1
- Steps to Reproduce:
  1. Open Add/Edit Feed modal in mobile view.
  2. Scroll to modal actions.
- Actual:
  - `Save` and `Cancel` use different visual shapes.
  - Buttons are stacked instead of presented as a clear action row.
- Expected:
  - Primary/secondary actions should use a consistent shape system.
  - Actions should appear side-by-side when space allows.
- Recommended Fix:
  - Use one shared button style token for action height/radius.
  - Place actions in a 2-column row (`Save` primary, `Cancel` destructive secondary).
  - Apply red destructive style to `Cancel` only when cancel is intended to discard edits immediately.

### BR-002: Destructive actions are not visually communicated
- Severity: High
- Priority: P1
- Steps to Reproduce:
  1. View delete/remove actions in Add/Edit Feed modal.
- Actual:
  - Delete buttons are not consistently styled as destructive.
- Expected:
  - All destructive actions use a consistent destructive color and hover/active states.
- Recommended Fix:
  - Standardize destructive controls with theme tokens (text, border, background).
  - Keep destructive iconography and labels consistent across modal sections.

### BR-003: Filter checkboxes use incorrect proportions for mobile
- Severity: High
- Priority: P1
- Steps to Reproduce:
  1. Open Filters panel in mobile view.
  2. Inspect checkboxes for `Override global filters`, `Enabled`, `Title`, `Summary`, and `Content`.
- Actual:
  - Checkboxes appear tall/rectangular rather than square.
  - Checkbox dimensions look inconsistent with expected tap controls.
- Expected:
  - Checkbox controls should be square and visually consistent.
  - Hit area should meet mobile tap guidance (minimum ~44px touch target).
- Recommended Fix:
  - Enforce fixed checkbox size tokens (visual square) with expanded invisible hit area.
  - Align checkbox baseline with associated labels and controls.

### BR-004: `Include logic` control type is suboptimal
- Severity: Medium
- Priority: P2
- Steps to Reproduce:
  1. Open Filters panel.
  2. Inspect `Include logic` control.
- Actual:
  - Control uses a dropdown for a binary choice.
- Expected:
  - Binary choice should be a segmented toggle (`AND` / `OR`) for faster scanning and fewer taps.
- Recommended Fix:
  - Replace dropdown with a two-option segmented toggle across all resolutions.
  - Persist active state styling clearly for selected option.

### BR-005: `Enabled` control appears detached from the rule card
- Severity: Medium
- Priority: P2
- Steps to Reproduce:
  1. Open rule editor inside Filters panel.
  2. Observe `Enabled` column/control placement.
- Actual:
  - `Enabled` control sits outside the perceived rule content area and feels disconnected.
- Expected:
  - Enable/disable state should be clearly associated with each rule row/card.
- Recommended Fix:
  - Move enable control inside the rule container header.
  - Consider replacing checkbox with a compact toggle switch for state clarity.

### BR-006: Rule delete (`X`) icon placement is awkward
- Severity: Medium
- Priority: P2
- Steps to Reproduce:
  1. Open Filters rule card.
  2. Locate delete/remove `X` control.
- Actual:
  - `X` button appears visually centered in a way that breaks flow and hierarchy.
- Expected:
  - Remove action should be anchored to rule card header or top-right edge.
- Recommended Fix:
  - Position delete action at top-right of each rule container.
  - Keep spacing and alignment consistent with other inline controls.

## Additional Screenshot-Based UI/UX Observations
- The Filters card has good section separation, but internal control alignment is uneven.
- The `Add rule` button appears visually low-emphasis versus other interactive controls.
- Rule configuration area is dense; spacing and grouping can be improved to reduce cognitive load.

## Recommended UI/UX Improvements (Beyond Bug Fixes)
1. Introduce a control consistency system:
   - Shared size/radius tokens for buttons, inputs, checkboxes, and toggles.
2. Improve rule-card hierarchy:
   - Rule header: enable toggle, rule type, delete action.
   - Rule body: keyword input and target fields.
3. Use segmented controls for binary choices:
   - `AND/OR`, `Include/Exclude`, and similar paired decisions.
4. Strengthen destructive-action affordance:
   - Uniform red semantics for delete/remove/discard, with confirmation where needed.
5. Optimize for thumb use:
   - Keep key actions within easy reach and ensure minimum touch-target sizing.
6. Improve readability in dense sections:
   - Increase vertical rhythm between groups and keep labels directly tied to inputs.

## Proposed Fix Order
1. P1 visual consistency and destructive-action fixes (BR-001, BR-002, BR-003).
2. P2 interaction model/layout fixes (BR-004, BR-005, BR-006).
3. Final UX polish pass for spacing, hierarchy, and control emphasis.
