# FreshRSS / Google Reader integration boundary

## Status

proposed — unnumbered draft, pending Wayfinder map #341

This ADR intentionally has no `NNNN` number yet. It is not ready to be voted
on: it records an open, contested question rather than a settled decision.
When [Wayfinder map #341](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/341)
resolves which option below is chosen, rename this file to the next available
number under `docs/adr/`, change this section to `accepted`, and merge it to
`dev`. Do not reuse a number already taken on `dev` at that time — re-check
`docs/adr/` first, the same mistake that made the original "0010" draft of
this ADR stale.

## Context

RSS Dashboard is adding support for FreshRSS through the Google Reader
compatible API, originally requested in
[#50](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/50). The
portable-state client itself is done — all 13 workstream tickets from
[Wayfinder map #221](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/221)
are implemented, tested (including a live Docker FreshRSS contract run), and
documented on `feat/fresh-rss`. It is deliberately parked for a coordinated
3.0 release rather than shipped in a minor — see `docs/plans/public-roadmap.md`.

What is *not* settled is where the integration lives architecturally. Two
documents disagree, and this ADR exists to hold that disagreement openly
until it is resolved with Marc rather than silently pick a side:

- An earlier draft of this ADR (written before the audit below existed)
  concluded RSS Dashboard should keep FreshRSS inside the main plugin as a
  modular monolith, and explicitly rejected extracting a companion
  "Connectors" plugin. Its stated reason for rejecting extraction was that
  the SecretStorage/`minAppVersion` version-isolation benefit "is no longer
  sufficient" once other first-party features (AI providers, YouTube) are
  expected to need SecretStorage too.
- `docs/archive/investigations/2026/freshrss-connector-extraction-audit.md`
  (architecture audit, no code changed by it) was written after that draft
  and reaches the opposite conclusion: extract into two build targets
  sharing one repository — a `core` entry point and a `connectors` entry
  point, one manifest each, sharing one `src/` tree. Its case is not a
  preference between equally valid options; it is a specific, verified,
  lint-enforced constraint: `eslint-plugin-obsidianmd`'s recommended config
  (`eslint.config.mjs`, confirmed still active) statically forbids
  referencing an Obsidian API above the declared `minAppVersion` — **even
  behind a runtime `typeof` capability guard** — and
  `eslint-comments/no-restricted-disable` blocks suppressing that rule with a
  disable comment. `getFreshRssSecretStorage` in `main.ts` already tries the
  "gate it at runtime, keep `minAppVersion` low" approach, and it does not
  satisfy the linter regardless. `dev`'s manifest floor is `1.8.7`;
  `feat/fresh-rss`'s is `1.11.4` purely because of five SecretStorage call
  sites in `main.ts` (`getFreshRssCapability`, `getFreshRssSecretReferences`,
  two credential-read call sites, and the two accessor/guard methods they
  funnel through). The audit finds the FreshRSS service layer itself
  (`freshrss-sync-client.ts`, `freshrss-sync-coordinator.ts`, etc.) never
  touches `app.secretStorage` — only those five `main.ts` call sites do — so
  isolating them is structurally possible without a rewrite.

The earlier draft's rejection of extraction never addressed this constraint;
it was written on the assumption that runtime gating inside one plugin was
an available alternative. The audit's finding is that this repository's own
lint policy has already foreclosed that alternative.

The audit also raises a question neither prior document answered: if
extraction relieves Core's `minAppVersion` pressure, is 3.0 still the right
vehicle for FreshRSS at all, or could a Connectors plugin ship on its own
schedule independent of Core's release cadence? That is a product/scope
question, not an architecture one, and is explicitly left to Marc.

## Decision

Not yet made. Two options are on the table for
[Wayfinder map #341](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/341)
to resolve.

### Option A — modular monolith (the earlier draft's position)

Keep FreshRSS/Google Reader support inside the main RSS Dashboard plugin and
its single release lifecycle, refactored behind explicit internal boundaries
(`Core` → defined domain operations ← `Integrations`) so provider-specific
code does not leak into Core orchestration, but never physically split into
a second plugin, build target, or repository unless a concrete extraction
trigger (multiple providers, integration code destabilizing ordinary
reading, an incompatible platform floor, a needed independent release
cadence, or credible third-party demand) actually materializes.

Unresolved under this option: how Core avoids the lint-enforced
`minAppVersion` constraint described above if SecretStorage-touching code
must remain in the same bundle Core's linter checks. The earlier draft does
not answer this; it predates the finding.

### Option B — two build targets, one repository (the audit's recommendation)

Split the build into a `core` entry point (local feed/article model, reader
UI, storage, filtering, import/export — `minAppVersion` returns to `dev`'s
floor) and a `connectors` entry point (FreshRSS/Google Reader protocol,
SecretStorage, provider auth, `minAppVersion` `1.11.4`), sharing one
repository and one `src/` tree, communicating through a versioned
`RssDashboardConnectorApi` that Core exposes and Connectors calls — modeled
on the audit's §6–§7 draft. Not a second published Community Plugin listing,
not a second repository, and not one-plugin-per-provider — those remain
explicitly out of scope per the audit's §12 verdict regardless of whether
Option B is chosen.

Unresolved under this option: the two-manifest build tooling (new to this
repo), the settings migration for `RssDashboardSettings.freshRss`, and
whether relieving the `minAppVersion` constraint changes the 3.0 timing
decision.

## Considered Options

Recorded here only as a pointer — the full evaluation lives in
`docs/archive/investigations/2026/freshrss-connector-extraction-audit.md`
§12 and in the earlier draft's own reasoning, both summarized under Context
above. This ADR does not re-litigate either document; it holds them next to
each other pending Wayfinder map #341.

## Consequences

Undetermined until the map resolves the Decision section above. Whichever
option is chosen, the FreshRSS portable-state client implementation on
`feat/fresh-rss` is preserved and refactored, not restarted — that much is
common ground between both documents and is not reopened by this ADR.

## Related work

- [#50](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/50) — originating FreshRSS / Google Reader feature request.
- [Wayfinder map #221](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/221) — FreshRSS portable-state client, closed/implemented.
- [Wayfinder map #341](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/341) — resolves this ADR's open Decision.
- `docs/archive/investigations/2026/freshrss-connector-extraction-audit.md` — architecture audit informing Option B.
