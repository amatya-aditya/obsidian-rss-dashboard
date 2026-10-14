# ADR 0016: Use WCAG 2.2 AA as the Accessibility Reference

## Status

accepted

## Date

2026-10-02

## Context and problem

RSS Dashboard already has local accessibility expectations, but it has no project-wide target or clearly stated boundary. A formal conformance claim would overstate what has been audited, while leaving the reference unspecified makes it difficult to align design, verification, and known limitations. Automated agents can help exercise the UI, but optimizing for bots must not displace access for people.

## Decision

Use WCAG 2.2 Level AA as the design and audit reference for applicable plugin-owned interface and plugin-rendered content across desktop, mobile, and popout use. This is an ongoing target, not a present-tense claim of conformance. Obsidian host UI and third-party article content remain external dependencies; document material verified limitations and integration gaps.

Human accessibility is the purpose and deciding factor. AI-assisted UI testing is an additional benefit: test agents should use the same user-facing semantic controls and keyboard pathways where practical, with CDP accessibility-tree inspection and screenshots as complementary evidence. Automated checks alone do not prove accessibility. Prioritize severe barriers, user-task impact, and reusable improvements; low test coverage is a risk signal, not a reason to delay broad, practical improvements for extensive coverage research.

### Amendment, 2026-10-13

Obsidian's own behavior is not the pass/fail bar. RSS Dashboard is a reading tool, and a reader who depends on assistive technology needs the article list and Reader to work whether or not core Obsidian meets WCAG elsewhere. WCAG 2.2 AA stays the bar for plugin-owned UI. Obsidian's behavior is used two ways:

- **A floor.** A plugin surface is never less accessible than the comparable host surface.
- **A consistency guide.** Reuse host patterns (for example Obsidian's `Menu`) instead of inventing new ones, and fix gaps the host leaves in our content rather than inheriting them. For example, Obsidian's `Modal` adds no dialog role or name, so plugin modals add their own.

The reading path (article list, cards, Reader, and moving between feeds and articles) is fixed first and gets the extra checks: heading and landmark structure and screen-reader walks. The bar is the same everywhere; only the order differs.

Audits label findings so a criterion failure is not confused with a recommendation:

- **FAIL**: violates a named WCAG 2.2 A or AA success criterion; the finding cites the criterion and the W3C failure or technique it rests on.
- **GAP**: falls short of an ARIA Authoring Practices pattern or an `ACCESSIBILITY.md` expectation without violating a criterion.
- **HOST**: owned by Obsidian; recorded as a limitation.
- **UNVERIFIED**: not exercised, or not checked with the evidence the finding needs.

This amendment refines how the reference is applied; it does not change the decision above. It came out of the Slice 4 audit for [#826](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/826).

## Consequences

- Contributors have a named, stable reference for applicable accessibility expectations and can distinguish a target from a completed audit or conformance claim.
- The policy must describe host and third-party boundaries, verified environments, known gaps, and a reporting path without claiming support that has not been checked.
- Verification must include human-oriented keyboard and targeted screen-reader checks in addition to automated and visual evidence.
- The rollout can proceed incrementally, improving shared patterns and obvious high-impact barriers without waiting for a traffic or coverage analytics study.

## Considered options

### No named standard

This avoids implying legal or technical conformance, but preserves the ambiguity between scattered local rules and makes audits difficult to scope consistently.

### Claim current WCAG 2.2 AA conformance

This is not supported by the current audit and test evidence and would be misleading.

### Use WCAG 2.2 AA as an ongoing reference (chosen)

This provides a clear basis for design and audit work while stating plainly that no blanket conformance claim has been established.

## Related

- [Accessibility declaration](../../ACCESSIBILITY.md)
- [Accessibility rollout tracking issue (#681)](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/681)
- [Accessibility research](../development/accessibility-research.md)
- [Issue #502 — Use native buttons for icon buttons instead of div role="button"](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/502)
