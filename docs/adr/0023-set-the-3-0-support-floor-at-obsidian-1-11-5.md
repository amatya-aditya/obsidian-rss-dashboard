# ADR 0023: Set the 3.0 Support Floor at Obsidian 1.11.5

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

proposed

The maintainer confirmed the floor decision in
[#1075](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1075).
This record remains proposed until its pull request and this text are reviewed.

## Date

2026-10-14

## Context and problem

The plugin declares the oldest Obsidian version it supports in three places that
must agree: `minAppVersion` in `manifest.json`, the entry for the release in
`versions.json`, and `MINIMUM_SUPPORTED_APP_VERSION` in
`scripts/check-release-compatibility.mjs`. That declared floor has been 1.8.7
since 1.0.

3.0 adds FreshRSS subscriptions and, optionally, a user-supplied YouTube Data
API key. Both need a user-managed credential. Obsidian's SecretStorage API,
which keeps credentials out of the vault and — from 1.11.5 — encrypts them at
rest with encryption provided by the operating system, arrived in 1.11.4.
Issue [#403](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/403)
assumed that needing SecretStorage forces the declared floor to rise, and
[ADR 0006](0006-deprecate-legacy-json-and-shard-storage-v1.md) recorded the same
assumption when it tied the Legacy JSON and Shard storage v1 cutoff to "the
`minAppVersion` floor raise those features require".

The research behind the floor decision
([#1073](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1073))
found that assumption is wrong. The `obsidianmd/no-unsupported-api` lint rule
accepts an API newer than the declared floor when the reference sits inside an
`if`, a ternary, or an `&&` whose condition is _literally_
`requireApiVersion("x.y.z")` at or above that API's version; computed and
structurally typed access, such as a cast to a local interface, is invisible to
the rule. SecretStorage is therefore reachable at 1.8.7 behind a guard, and the
FreshRSS work already does exactly that.

So the floor is a choice rather than a technical requirement, and the choice
needs its reasoning recorded: which version 3.0 declares, and what that
declaration protects.

A declared floor is not a wish-list of versions the plugin tolerates. Its only
direct effect is which releases an older app is offered: Obsidian serves a user
the newest release whose `versions.json` floor their app version satisfies. A
plugin that uses a newer API anyway must then maintain the behavior of every
version below the floor — the guard, the fallback, the disabled control —
indefinitely, and that guard cannot be hoisted into a shared helper, because
the lint escape matches a literal call and nothing else.

Two further facts shape the decision. First, the floor raise does not travel
alone: ADR 0006 makes Legacy JSON and Shard storage v1 read-only at 3.0,
unconditionally. Second, the next API this plugin actually wants —
`getSettingDefinitions`, which puts the plugin's settings into Obsidian's
settings search — does not exist before 1.13.0.

## Decision

3.0 declares a support floor of Obsidian **1.11.5**, in all three places.

Users below 1.11.5 stop receiving plugin updates. Obsidian serves them the last
release mapped to their app version, so they remain on 2.x, where their feed
storage still writes.

The plugin does not straddle the floor. It carries no SecretStorage guard, no
capability-absent path, and no structural cast for versions below 1.11.5.

1.11.5 is chosen over 1.11.4, and not one minor higher. 1.11.4 and 1.11.5 are
eight days apart (2026-01-12 and 2026-01-20) and declare an identical plugin
API; the difference is that 1.11.5 encrypts Secret Storage on disk. A feature
whose purpose is to move a credential out of the vault should not ship to users
whose credentials Obsidian would keep unencrypted. Above 1.11.5 through 1.12.x,
no API this plugin uses is added, so nothing justifies a higher floor; the next
API the plugin wants is 1.13.0's, which belongs to the later release that
adopts settings search, not to 3.0.

The floor raise is not what makes SecretStorage work on newer Obsidian — it
already does. The raise removes the guard and the cast from the credential path,
and it spares users who cannot use the feature from a release that would
otherwise still freeze their storage.

## Consequences

### Benefits

- The credential path has one implementation, rather than a guarded modern path
  plus a capability-absent path kept alive for versions the plugin still claims
  to support.
- No version check has to be written as a literal at every SecretStorage call
  site, which the lint escape requires and a shared helper cannot satisfy.
- Users below 1.11.5 never receive a major release that freezes their storage
  while withholding the feature that major adds.
- Every user who can reach the feature has their secret encrypted at rest by
  Obsidian.

### Trade-offs

- Users on Obsidian 1.8.7 through 1.11.4 receive no further updates. How many
  that is cannot be stated: Obsidian publishes no per-version adoption data, and
  the community statistics site counts installer downloads only.
- The declaration becomes a user-visible cutoff, so the release note must name
  the versions that stop receiving updates.
- `src/settings/settings-ui-compat.ts` survives: it is still needed until a
  1.13.0 floor, so the plugin keeps the DOM-presentation compatibility branch
  for settings controls.
- The `requireApiVersion("1.7.2")` gates in `src/views/dashboard-view.ts` and
  `src/views/reader-view.ts` are already dead at the current floor; raising the
  floor does not remove them.

### Existing users and data

- The floor raise itself migrates and modifies nothing. It changes which
  releases an older app is offered.
- Users below the floor keep their last 2.x release and its behavior, including
  write access to Legacy JSON and Shard storage v1. ADR 0006's read-only cutoff
  does not reach them.
- Users at or above the floor receive 3.0 and are subject to ADR 0006's cutoff.
- A user who later updates Obsidian past 1.11.5 begins receiving 3.0 and
  subsequent releases at the next update check.

## Considered options

- **Keep 1.8.7 and guard SecretStorage (rejected).** This is the option the
  research proved possible. It keeps 1.8.7–1.11.4 users on the update channel,
  but it commits the plugin to a permanently guarded credential path that no
  shared helper can contain, and it delivers those users ADR 0006's storage
  cutoff without the FreshRSS feature that motivates 3.0. It also makes the
  FreshRSS capability-absent status a supported behavior forever rather than a
  transitional one.
- **1.11.4 (rejected).** The bare API floor. It admits eight extra days of users
  at the cost of shipping a credential feature to people whose secrets Obsidian
  stores unencrypted on disk.
- **1.11.7 (rejected).** No API exists in 1.11.5, 1.11.6 or 1.11.7; those
  releases are bug fixes only. It would cut off 1.11.5 and 1.11.6 users for no
  gain.
- **1.12.x (rejected).** The only APIs added are `Plugin.registerCliHandler`
  (1.12.2) and `Vault`/`DataAdapter.appendBinary` (1.12.3), neither of which
  this plugin uses. The one non-API difference that could matter, 1.12's
  handling of machines where Secret Storage encryption is unavailable, concerns
  Obsidian's own settings surface: the plugin never writes a secret, only reads
  one the user created, and already handles the missing and throwing cases.
- **1.13.x in 3.0 (rejected).** A 1.13.0 floor unlocks settings search and
  retires `settings-ui-compat.ts`, but it also pulls the declarative-settings
  migration into 3.0, turns on four settings-tab lint warnings that do not exist
  today, and cuts off every user below the first public 1.13 build. It is a
  release-sized change of its own.
- **1.14.x (rejected).** Too new to adopt as a floor: 1.14 went public on
  2026-10-05, and its only relevant addition is an optional `id` on setting
  definitions, which is meaningless without the declarative settings 3.0 does
  not adopt.

## Implementation notes

- Raise `minAppVersion` to `1.11.5` in `manifest.json` and add the matching
  `3.0.0` entry to `versions.json`. `MINIMUM_SUPPORTED_APP_VERSION` in
  `scripts/check-release-compatibility.mjs` is the second declaration of the
  same floor and must be raised with them, or `npm run check:release-compatibility`
  fails.
- Every `versions.json` entry below `3.0.0` keeps its 1.8.7 floor; only 3.0.0
  onward declares 1.11.5.
- Re-run `npm run lint` after the raise. It passes at 1.11.5 with no
  `no-unsupported-api` findings, because raising the floor only ever removes
  restrictions. The first failing floor is 1.13.0, and for an unrelated
  settings-tab rule.
- Under [ADR 0014](0014-obsidian-test-stub-fidelity.md) the test stub models the
  latest stable Obsidian release, so the floor raise does not change the stub.
  Re-check any stub behavior whose real-world shape differs at 1.11.5.

## Related

- [#1075 — Pick the 3.0 minAppVersion floor](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1075)
- [#1073 — Research the Obsidian floor candidates](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1073) — the findings this record acts on, [full text](https://github.com/amatya-aditya/obsidian-rss-dashboard/blob/research/obsidian-floor-candidates/docs/archive/investigations/2026/obsidian-floor-candidates-research.md)
- [#403 — Raise minAppVersion to 1.11.5 for SecretStorage and encryption](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/403)
- [#1071 — Wayfinder: 3.0 release plan](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1071)
- [ADR 0006 — Deprecate Legacy JSON and Shard storage v1](0006-deprecate-legacy-json-and-shard-storage-v1.md) — the cutoff bundled with this raise
- [ADR 0014 — The Obsidian test stub models observed Obsidian behavior](0014-obsidian-test-stub-fidelity.md)
- [Version support vocabulary](../../CONTEXT.md#version-support)
