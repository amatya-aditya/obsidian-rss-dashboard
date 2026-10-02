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
- [Accessibility rollout plan](../plans/draft-20261002-accessibility-rollout.md)
- [Accessibility research](../development/accessibility-research.md)
- [Issue #502 — Use native buttons for icon buttons instead of div role="button"](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/502)
