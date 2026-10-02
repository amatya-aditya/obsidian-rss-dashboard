# Accessibility

RSS Dashboard aims to make the interface it controls usable by people with disabilities. Human accessibility is the purpose of this work; making the same interface easier for automated tests to operate is a useful additional benefit.

## Standard and scope

We use [WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22/) as the design and audit reference for applicable RSS Dashboard interface and plugin-rendered content. This is a target for ongoing work, not a claim that the plugin currently conforms to WCAG 2.2 AA. The plugin has not had a complete accessibility audit.

This scope applies to plugin-owned views, controls, accessible names and states, and content the plugin creates or presents in its own interface across desktop, mobile, and popout use. Obsidian's host interface and third-party article content are outside RSS Dashboard's direct control. We aim to integrate with the host accessibly and will document material host or content limitations when they are verified.

## User experience expectations

- Interactive controls use native semantic elements when available and have names, roles, and states that describe their purpose and current state.
- Interactive behavior is available by keyboard, with visible focus and a logical focus order. Controls remain usable without hover and on touch screens.
- State is not conveyed by color alone. Text and controls remain usable across supported themes, zoom, and reduced-motion preferences where applicable.
- New icon buttons use native buttons with accessible names. Existing custom `div[role="button"]` controls are legacy patterns being migrated under [issue #502](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/502).
- Use visible text or an appropriate `aria-label`/Obsidian `setTooltip()` to provide a programmatic name for icon-only controls. Never use the HTML `title` attribute; Obsidian already uses `aria-label` for its tooltip.

The [design spec's accessibility section](docs/development/design-spec.md#accessibility) contains detailed contributor expectations and UI examples. This page defines the project scope and intent; it does not replace those implementation details.

## Verification

Automated checks, DOM tests, accessibility-tree inspection, and screenshot review each provide partial evidence. No automated scan or test run alone establishes conformance.

For interactive changes, verify the changed user flow with the keyboard. Use targeted screen-reader checks when a change affects a control's name or state, focus behavior, or dynamic announcement. Use role, accessible name, state, and keyboard pathways for automated UI interactions where possible. CDP accessibility-tree inspection can verify runtime semantics; screenshots can verify visual focus, contrast, clipping, and layout. These are complementary checks, and AI-driven testing remains an aid to human accessibility rather than its driver.

For each tracked accessibility implementation change, link the applicable WCAG 2.2 success criterion or criteria and any more specific RSS Dashboard baseline that shapes acceptance. If no single criterion directly describes the change, state the project or platform expectation and why it applies. A criterion link explains the change's scope and verification; it does not establish product-wide conformance.

The rollout plan records how to extend these checks across existing surfaces and contexts. Environment combinations that have not been checked are unknown, not verified support claims.

## Current limitations and reporting barriers

- RSS Dashboard has not completed a plugin-wide accessibility audit, so this page does not claim conformance or complete coverage.
- The project has no verified support matrix for specific screen reader, browser, operating-system, Obsidian-version, theme, and device combinations. We will report combinations as verified only after checking them.
- Some existing controls still use custom interactive elements; their migration and verification are tracked in [issue #502](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/502).
- Obsidian host surfaces and third-party article content can introduce barriers RSS Dashboard cannot directly fix. We will distinguish these dependencies from plugin-owned issues when reporting known limitations.

Report an accessibility barrier through [GitHub Issues](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues) with the `accessibility` label. When possible, include the relevant plugin task or view, platform and Obsidian version, keyboard or assistive-technology details, steps to reproduce, and screenshots or other evidence that help explain the barrier. Discord is also available for general support, but GitHub Issues is the trackable path for barriers and fixes.

## Maintenance

Project maintainers collectively maintain this scope. Review it when supported plugin surfaces, Obsidian requirements, or accessibility standards and testing tools change. Update verified environments and known limitations as evidence changes.

## Related project records

- [ADR 0016 — WCAG 2.2 AA as the accessibility reference](docs/adr/0016-wcag-22-aa-accessibility-reference.md)
- [Accessibility rollout plan](docs/plans/draft-20261002-accessibility-rollout.md)
- [Accessibility research](docs/development/accessibility-research.md)
