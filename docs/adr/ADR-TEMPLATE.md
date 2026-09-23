# ADR NNNN: Decision title

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

Proposed

## Date

YYYY-MM-DD

## Context and problem

<!--
Explain the problem that requires a durable decision.

Assume the reader was not part of the original discussion and may not be a
developer. Describe the relevant user behavior, constraints, history, or
technical context before discussing implementation details.

Questions that may help:
- What prompted this decision?
- What behavior or constraint needs to change or be preserved?
- Why is this important enough to record as an ADR?

For product or UX decisions, the optional User stories section may follow this section to translate the problem into concrete user expectations.
-->

Describe the problem and the context that led to this decision.

## User stories

<!--
Optional. Recommended for product, UX, workflow, or behavior decisions where
user expectations help explain why the decision matters.

Include only the small number of user stories that directly justify the ADR
(typically 2–4). Do not copy the entire specification or acceptance-criteria
set into the ADR.

Use the project's standard user-story format:

As a [type of user], I want [goal or behavior], so that [reason or outcome].

The stories should describe durable user expectations rather than implementation
details.

If a larger set of user stories exists in a GitHub issue, specification, or
planning document, include only the most decision-relevant stories here and
link to the complete source below them.
-->

The decision is intended to preserve these core user expectations:

1. As a [user], I want [goal], so that [reason].
2. As a [user], I want [goal], so that [reason].
3. As a [user], I want [goal], so that [reason].

For the complete set of user stories identified for this decision, see
[GitHub Issue #NNN](...).

## Decision

<!--
State the chosen approach clearly and early.

Focus on the durable decision rather than the implementation plan. Someone
should be able to read this section and understand what the project has committed
to doing.
-->

We will...

## Consequences

<!--
Describe the meaningful results and trade-offs of the decision.

Include both benefits and costs where applicable. Explicitly describe effects
on existing users, stored data, compatibility, migration, or recovery behavior
when relevant.
-->

### Benefits

- ...

### Trade-offs

- ...

### Existing users and data

<!-- Remove this subsection if it is not relevant. -->

- ...

## Considered options

<!--
Optional, but recommended when multiple reasonable approaches existed.

Represent alternatives fairly. Explain why each was considered and the relevant
benefits, risks, or reasons it was not selected.
-->

### Option A — ...

...

### Option B — ...

...

### Option C — ... (chosen)

...

## Historical precedent

<!--
Optional.

Document relevant prior art, standards, APIs, products, or established patterns.
Explain why the precedent is relevant rather than relying on the external
reference to make the argument for you.
-->

- ...

## Implementation notes

<!--
Optional.

Use this for technical constraints or implementation details that future
maintainers need to know but that are not necessary to understand the decision
itself.

Do not turn this section into an implementation plan or task checklist.
-->

- ...

## Related

<!--
Optional.

Link related ADRs, GitHub issues or pull requests, user documentation,
investigations, standards, or other useful context.
-->

- [ADR NNNN — Related decision](...)
- [GitHub Issue #NNN](...)
- [Relevant documentation](...)
