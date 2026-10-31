# ADR 0042: Keep FreshRSS in Core for v1

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all ADRs.

## Status

accepted

## Date

2026-10-24

## Context and problem

RSS Dashboard is adding FreshRSS support through the Google Reader-compatible
API. The integration needs to fit the plugin's existing user experience,
article-state model, credential handling, and release process. The project had
considered keeping FreshRSS in the main plugin or separating it into a
connector build target with its own boundary and release path.

The earlier case for a separate target treated the Obsidian API lint rule as a
barrier to using SecretStorage in the main plugin. Research in
[#1073](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1073)
corrected that claim: the rule allows a newer API behind a literal
`requireApiVersion` guard. The 3.0 support-floor decision is separately set at
Obsidian 1.11.5, where the plugin can use SecretStorage without a compatibility
fallback; see [ADR 0023](0023-set-the-3-0-support-floor-at-obsidian-1-11-5.md)
and [#1075](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1075).
Neither lint nor the support floor requires a separate connector target.

## Decision

FreshRSS v1 is part of Core: it ships within the existing RSS Dashboard plugin
and shares its build target and release lifecycle. The project will not add a
Connectors plugin, second build target, second Community Plugin listing,
separate repository, or public connector API for this integration.

FreshRSS uses the existing SecretStorage implementation. The integration
remains within the existing product boundary, keeping its user experience,
article state, credentials, and lifecycle together. This ADR does not prescribe
the internal module layout.

The boundary may be reconsidered if a concrete need emerges, such as another
provider, a genuinely independent release cadence, a platform-support conflict,
or integration work that disrupts ordinary RSS Dashboard development. These
signals prompt a new decision; they do not commit the project to extraction.

## Consequences

### Benefits

- Users install and update one plugin, and FreshRSS uses the product's existing
  state, credential, and lifecycle boundaries.
- The project does not take on a second build and release path or create a
  connector API before there is a concrete need for one.
- The integration can use SecretStorage without retaining a plaintext fallback
  or a lower-version capability path under the 3.0 support floor.

### Trade-offs

- FreshRSS ships and is maintained on the main plugin's release cadence rather
  than independently.
- Connector-specific responsibilities remain part of the main plugin and may
  warrant a new boundary decision if additional providers or other concrete
  needs arise.

### Existing users and data

- This packaging decision does not migrate or modify existing user data.
- FreshRSS behavior, migration work, and release-readiness requirements remain
  governed by [#1079](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1079)
  and the accepted behavior contracts in [#221](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/221).

## Considered options

### Keep FreshRSS in Core (chosen)

Keep FreshRSS within the existing plugin, build target, and release lifecycle.
This keeps its user experience, article state, and credentials alongside the
product that owns them, without adding a new packaging or API boundary before
one is needed.

### Create a separate connector target

A separate target could give connector code a distinct package and allow a
different release cadence. It would also require another build and release
path and an integration boundary for the plugin's existing state and user
experience. The earlier lint-based reason for this split was corrected by
#1073, and the 1.11.5 floor removes the compatibility pressure; no current
product need justifies that added boundary.

## Related

- [#50 — FreshRSS / Google Reader API integration](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/50)
- [#221 — FreshRSS portable-state behavior contracts](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/221)
- [#226 — FreshRSS test architecture](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/226)
- [#341 — Wayfinder: FreshRSS Core/Connector integration boundary](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/341)
- [#1073 — Research the Obsidian floor candidates](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1073)
- [#1075 — Pick the 3.0 `minAppVersion` floor](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1075)
- [#1079 — Choose how FreshRSS returns to the 3.0 line](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1079)
- [ADR 0023 — Set the 3.0 support floor at Obsidian 1.11.5](0023-set-the-3-0-support-floor-at-obsidian-1-11-5.md)
- [ADR 0039 — Use User-Managed SecretStorage References for Credentials](0039-use-user-managed-secretstorage-references.md)
