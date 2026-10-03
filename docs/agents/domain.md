# Domain Docs

How engineering skills should consume this repo’s domain documentation.

## Before exploring, read these

- `CONTEXT.md` at the repo root.
- `docs/adr/` for architecture decisions that touch the area being explored.

If any of these files do not exist, proceed silently. The domain-modeling skill creates them lazily when terms or decisions are resolved.

## Layout

This is a single-context repo:

- `CONTEXT.md` — domain vocabulary and terminology.
- `docs/adr/` — architecture decision records.

## Use the glossary vocabulary

When naming a domain concept in an issue, proposal, hypothesis, or test, use the term defined in `CONTEXT.md`. Avoid synonyms explicitly marked as terms to avoid.

If a needed concept is not defined, note the gap for the domain-modeling skill.

## Flag ADR conflicts

If output contradicts an existing ADR, surface the conflict explicitly rather than silently overriding it.
