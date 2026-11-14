# Domain Docs

How engineering skills should consume this repo’s domain documentation.

## Before exploring, read these

- `CONTEXT.md` at the repo root.
- `docs/specs/README.md` for the spec graph: the product goal, the architecture
  guardrails, and one spec per module with its responsibility, boundary, and
  invariants.
- `docs/adr/` for architecture decisions that touch the area being explored.

If any of these files do not exist, proceed silently. The domain-modeling skill creates them lazily when terms or decisions are resolved.

## Layout

This is a single-context repo:

- `CONTEXT.md` — domain vocabulary and terminology.
- `docs/specs/` — the spec graph: the product goal, the architecture node, and
  the module specs. Each node carries frontmatter (`id`, `type`, `parent`) and is
  reached from the `docs/specs/README.md` index.
- `docs/adr/` — architecture decision records.

## Use the glossary vocabulary

When naming a domain concept in an issue, proposal, hypothesis, or test, use the term defined in `CONTEXT.md`. Avoid synonyms explicitly marked as terms to avoid.

If a needed concept is not defined, note the gap for the domain-modeling skill.

## Flag ADR conflicts

If output contradicts an existing ADR, surface the conflict explicitly rather than silently overriding it.

## Align with the owning spec

A module spec records the boundary and invariants its module now holds. Read
the owning spec before changing behavior in an area, and update it in the same
change when the boundary or an invariant moves.
