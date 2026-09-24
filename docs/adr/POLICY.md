# Architecture Decision Record Policy

Architecture Decision Records (ADRs) preserve important decisions made during the development of RSS Dashboard.

Documentation explains **how RSS Dashboard works**. ADRs explain **why it works that way**.

ADRs are intended to be useful to both contributors and interested users. They should preserve enough context that someone unfamiliar with the original discussion can understand the problem, the decision, the alternatives considered, and its consequences.

## When to create an ADR

Create an ADR when a decision:

- establishes or changes an important product, UX, architecture, storage, data-model, compatibility, security, or development convention;
- affects behavior that future contributors may otherwise be tempted to reverse without understanding the original reasoning;
- involves meaningful trade-offs between multiple reasonable approaches;
- introduces a convention that other features or implementations are expected to follow;
- affects user data, migration behavior, compatibility, or long-term maintenance;
- resolves a recurring design question that would benefit from a durable answer.

An ADR does not need to describe only traditional software architecture. Product and interaction decisions may also warrant an ADR when the reasoning should be preserved.

## When not to create an ADR

An ADR is usually unnecessary for:

- routine bug fixes whose correct behavior is already clear;
- minor visual or copy changes;
- straightforward implementation details with no meaningful alternatives;
- temporary experiments that have not resulted in a durable decision;
- decisions already fully governed by an existing ADR.

If a change implements an existing decision rather than establishing a new one, link to the existing ADR instead.

## ADR statuses

Each ADR must have one of the following statuses.

### Proposed

The decision is under consideration and may still change.

### Accepted

The decision has been adopted and represents current project policy.

### Superseded

A newer ADR replaces this decision.

A superseded ADR remains in the repository as part of the project's decision history and must link to the ADR that replaced it.

### Deprecated

The decision is no longer recommended or relied upon, but has not necessarily been replaced by a single newer ADR.

### Rejected

The proposal was formally considered but not adopted.

Rejected ADRs may be retained when preserving the reasoning is useful.

## Decision history is preserved

Accepted ADRs are historical records.

Once an ADR has been accepted, do not rewrite its original decision or rationale simply because the project later changes direction. If a decision is materially reversed or replaced:

1. Create a new ADR describing the new context and decision.
2. Mark the previous ADR **Superseded**.
3. Link the old and new ADRs to each other.

Minor corrections are allowed, including:

- spelling and grammar;
- broken links;
- formatting;
- clarifications that do not change the recorded decision;
- navigation or metadata improvements.

Substantive reinterpretation of the original decision should be avoided.

## Required structure

Every ADR should contain:

1. **Title**
2. **Status**
3. **Date**
4. **Context and problem**
5. **Decision**
6. **Consequences**

The goal is not to fill a template mechanically. Each section should contain only as much detail as necessary to understand and preserve the decision.

## Optional sections

Use additional sections when they materially improve the record.

Common examples include:

- **Considered options** — meaningful alternatives and why they were accepted or rejected.
- **Historical precedent** — prior art, standards, earlier products, or established conventions that informed the decision.
- **Implementation notes** — technical details useful to maintainers but not essential to understanding the decision.
- **Related** — GitHub issues, pull requests, documentation, other ADRs, or external references.
- **Confirmation** — how the project can determine whether the decision worked as intended.

Optional sections should not be added merely to satisfy a format.

## Write for future readers

Assume the reader:

- was not present for the original discussion;
- may not be a developer;
- does not already understand the surrounding architecture;
- may arrive directly from a release note, issue, documentation page, or external link.

Introduce the problem before implementation details.

Prefer plain language when describing product behavior and trade-offs. Technical terminology is appropriate when precision requires it, but implementation-specific details should generally appear after the decision and rationale have been established.

Each ADR should include a short link back to the [ADR index](README.md), where readers can learn what ADRs are and browse other decisions.

## Separate the decision from the implementation

An ADR records the durable decision and why it was made.

It should not become:

- an implementation plan;
- a task checklist;
- a changelog;
- a complete technical specification;
- a chronological transcript of the discussion that produced the decision.

Implementation details belong in the ADR only when they are necessary to preserve constraints or prevent future implementations from violating the decision.

Detailed plans should live elsewhere and link back to the ADR where appropriate.

## Considered options

When multiple reasonable approaches existed, record them.

Describe alternatives fairly rather than constructing weak options solely to justify the chosen approach.

For each important alternative, explain the relevant benefit, cost, risk, or trade-off.

The chosen option should be understandable from the stated project needs and constraints rather than from preference alone.

## User data and compatibility decisions

ADRs involving stored user data, migrations, compatibility, or destructive behavior should explicitly document:

- what happens to existing users;
- whether existing data is modified;
- whether migration occurs;
- what backward-compatibility guarantees are preserved or intentionally removed;
- any meaningful failure or recovery behavior.

When provenance or intent cannot be determined safely from existing data, prefer documenting the ambiguity rather than assuming it.

## Historical precedent and external references

External precedent can strengthen a decision, but it should support the project's reasoning rather than substitute for it.

When referencing another product, standard, API, or historical system:

- explain what is relevant about the precedent;
- link to the original or authoritative source when practical;
- distinguish historical precedent from the project's own reasons for choosing an approach.

An ADR should remain understandable even if an external link later becomes unavailable.

## Naming and numbering

ADRs use sequential four-digit numbers and descriptive kebab-case filenames:

`NNNN-short-decision-title.md`

Example:

`0011-decouple-starred-state-from-tags.md`

Numbers are never reused, even if an ADR is rejected, deprecated, or superseded.

The ADR number is the stable identifier. Renaming an accepted ADR file should be avoided unless necessary.

## Linking related work

Where applicable, ADRs should link to:

- related ADRs;
- GitHub issues or pull requests;
- relevant user documentation;
- standards or external references;
- implementation plans or investigations.

Other project documentation should link back to the governing ADR when understanding the reasoning would be useful.

## ADR index

`docs/adr/README.md` is the canonical index of project decisions.

Every ADR should appear in the index with:

- ADR number;
- title;
- status;
- a one-sentence summary.

The index should be updated whenever an ADR is created, accepted, rejected, deprecated, or superseded.

## Review expectations

Before accepting an ADR, verify that:

- the problem is understandable without prior discussion;
- the decision is stated clearly;
- meaningful alternatives are represented fairly;
- consequences and trade-offs are documented;
- user-data or compatibility effects are explicit where relevant;
- related ADRs and documentation are linked;
- the ADR index is updated.

The standard is clarity and durable reasoning, not length.

A small decision may require only a short ADR. A decision with significant product, compatibility, or data implications may require substantially more detail.

## References and influences

This policy is informed by established Architecture Decision Record practices, particularly:

- [Michael Nygard's original ADR format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions), which established the lightweight **Status → Context → Decision → Consequences** model.
- [MADR — Markdown Architectural Decision Records](https://adr.github.io/madr/), which expands the basic ADR format with clearer problem statements, considered options, rationale, and related decision metadata.
- [ADR Templates](https://adr.github.io/adr-templates/), a collection of commonly used ADR formats and approaches.

RSS Dashboard intentionally uses a lightweight hybrid of these approaches. The goal is to preserve durable decision reasoning without turning ADRs into heavyweight specifications or process requirements.
