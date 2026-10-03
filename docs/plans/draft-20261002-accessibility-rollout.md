---
status: accepted
created: 2026-10-02
issue: "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/681"
milestone: ""
owner: unassigned
workstream: accessibility
sequence: null
depends_on: []
release_requirement: ""
implementation: ""
---

# Accessibility Policy and Incremental Rollout

## Summary

Establish a clear accessibility scope and improve RSS Dashboard incrementally against WCAG 2.2 AA as a design and audit reference. Human access remains the purpose of the work. Better AI-agent testability is an added benefit, not the primary driver.

The scope and governing decision are recorded in [ACCESSIBILITY.md](../../ACCESSIBILITY.md) and [ADR 0016](../adr/0016-wcag-22-aa-accessibility-reference.md). This plan does not claim current conformance.

## Goals

1. Keep one clear, repository-wide statement of accessibility scope, known limitations, reporting path, and maintenance responsibility.
2. Align contributor guidance with the accepted native-control, naming, keyboard, focus, and tooltip expectations.
3. Improve reusable interaction patterns and high-impact user workflows across desktop, mobile, and popout contexts.
4. Add verification that combines automated checks with keyboard, targeted screen-reader, accessibility-tree, and visual evidence.
5. Record what was verified and what remains unknown without treating an unrun audit as proof of support.

## Constraints and priorities

- Do not make a blanket WCAG conformance claim. Apply applicable WCAG 2.2 AA criteria as an ongoing reference for plugin-owned UI and content.
- Host-owned Obsidian UI and third-party article content are dependencies, not plugin-owned scope. Document material verified barriers and integration gaps.
- Do not delay useful improvements for a traffic analytics study or exhaustive coverage inventory. Make a lightweight pass for obvious barriers while fixing shared controls and important workflows.
- Prioritize barrier severity and task impact, then improvements that benefit multiple surfaces. Use low test coverage as a risk signal and tie-breaker, not the only ordering rule.
- Accessibility for people determines whether an interaction is acceptable. Bot-friendly semantics and CDP/screenshot affordances supplement the user-facing path.

## Work sequence

### 1. Publish and cross-link the scope

- Review and publish the root accessibility declaration as the canonical scope statement.
- Keep detailed implementation rules in the design spec and contributor instructions; link them to the canonical declaration.
- Direct barrier reports to GitHub Issues with the existing `accessibility` label and useful reproduction details. A dedicated issue template is optional and should be considered only if the existing flow proves insufficient.
- Treat project maintainers collectively as scope owners; review the declaration when supported plugin surfaces, Obsidian requirements, or accessibility tooling change.

### 2. Reconcile existing guidance

- Remove the legacy `aria-label`-or-`title` ambiguity: use an accessible name and never the HTML `title` attribute for Obsidian tooltips.
- Keep the existing `div[role="button"]` example explicitly migration-only. New icon buttons use native `<button type="button">` elements with accessible names.
- Continue [issue #502](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/502) independently. Its styling spike remains a gate for the icon rendering spec update and migration; the project-wide policy does not block it.
- Link the design spec, `.instructions.md`, test guidance, and documentation index to the canonical scope where it helps contributors find the same expectations.

### 3. Improve shared patterns and clear barriers

- During regular UI work, check reusable controls for native semantics, accessible names and states, keyboard operation, focus visibility, and non-color state cues.
- Address clearly severe barriers as they are found, even when the affected surface is not in an assumed high-traffic area.
- Make a lightweight pass over dashboard navigation and article actions, Reader controls, settings and forms, dialogs, and keyboard-opened menus. These are candidate workflows, not analytics-verified traffic rankings.
- Extend the same checks to relevant empty, loading, error, expanded, theme, mobile, and popout states as each surface is touched. Do not require a costly one-time census before useful fixes begin.

### 4. Verify human access and agent operation

- For changed interactive flows, verify the keyboard path and visible focus in the running plugin.
- Use targeted screen-reader checks when a change affects names, state, focus management, or dynamic announcements.
- For each implementation issue and PR, cite the applicable WCAG 2.2 success criterion or criteria and the relevant project baseline. If no single criterion directly applies, state the local or platform expectation and why; the reference scopes the acceptance check and is not a conformance claim.
- Keep jsdom tests for DOM structure and behavior. Treat lint, automated accessibility scans, and unit tests as partial regression signals rather than conformance proof.
- Where runtime automation is available, prefer user-facing role/name/state and keyboard paths. CDP accessibility-tree inspection checks exposed semantics; screenshots check focus visibility, contrast, clipping, and layout. Test-only selectors may assist setup or disambiguation but must not conceal an inaccessible user path.
- Record the environment and evidence for each manual or automated check. Mark combinations not yet checked as unknown.
- Before choosing new test dependencies or a permanent CI browser runner, verify the actual Obsidian/CDP harness capabilities and whether they can be reused without undermining human checks.

### 5. Maintain known gaps

- Keep a short list of verified barriers, host dependencies, and untested contexts in the accessibility declaration or a linked tracking issue.
- Revisit priorities during normal feature work and when a reported barrier is confirmed.
- Review the scope when plugin surfaces, supported Obsidian versions, accessibility criteria, or test tooling materially change.

## Completion evidence

- A maintainer can find one scope statement and distinguish an aspiration/reference from verified support or conformance.
- Active repository instructions do not contradict the native-button or accessible-name guidance.
- A representative set of changed flows has keyboard evidence; dynamic or complex interactions have targeted screen-reader evidence.
- Agent tests can exercise user-facing semantics and preserve screenshots/AX evidence where the harness supports them, without replacing human-oriented checks.
- Verified platform/assistive-technology combinations and known unknowns are stated accurately.

## Open decisions for implementation

- Which existing Obsidian/CDP runtime setup can provide repeatable accessibility-tree and screenshot checks without adding a new browser stack?
- Which screen-reader/device combinations are practical to verify first across the supported desktop and mobile contexts?
- Which automated scan, if any, provides a useful supplemental regression signal for the actual plugin runtime?

These are implementation questions to answer while the rollout proceeds; they are not prerequisites for the accepted scope or for issue #502.

## Related

- [Accessibility declaration](../../ACCESSIBILITY.md)
- [ADR 0016 — WCAG 2.2 AA as the accessibility reference](../adr/0016-wcag-22-aa-accessibility-reference.md)
- [Accessibility research](../development/accessibility-research.md)
- [Issue #502 — Native icon buttons](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/502)
