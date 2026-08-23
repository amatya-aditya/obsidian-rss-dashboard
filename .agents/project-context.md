# RSS Dashboard Project Context

Use this file to orient implementation planning. `AGENTS.md` and its required
references remain authoritative for repository policy.

## Product

RSS Dashboard is an Obsidian community plugin for subscribing to, parsing,
reading, organizing, and saving RSS, Atom, JSON Feed, podcast, YouTube, and
related content. It runs on desktop and mobile, supports popout windows, stores
user state locally or in vault-backed storage modes, and is subject to Obsidian
community-plugin review and audit requirements.

Public listing and review status:
<https://community.obsidian.md/plugins/rss-dashboard>

## Repository Map

- `main.ts`: plugin lifecycle, commands, shared orchestration, refresh, and persistence wiring.
- `src/services/`: feed parsing, storage, saving, synchronization, and integrations.
- `src/views/`, `src/components/`, `src/modals/`, `src/settings/`, `src/discover/`: user-facing behavior.
- `src/types/` and `src/utils/`: shared contracts and utilities.
- `src/styles/`: source CSS compiled into the release stylesheet.
- `test_files/unit/`: tests organized to mirror the production source areas.
- `docs/development/`: compliance patterns, data flow, testing, and release workflow.
- `docs/plans/`: active or future implementation plans only.
- `docs/archive/`: indexed historical plans and investigations.
- `docs/decisions/`: durable architectural decisions that remain discoverable by status.
- `docs/releases/`: consolidated, public-facing summaries produced at release cut.

## Sources of Truth

Read the files required by `AGENTS.md` before changing code or tests. Consult
these additional documents only when their area is affected:

- `CONTRIBUTING.md` and `docs/development/compliance-patterns.md`: audit-sensitive implementation rules.
- `docs/plugin-scorecard.md`: local audit history and current public-status snapshot.
- `docs/development/data-flow.md`: feed refresh, merge, retention, and persistence behavior.
- `docs/storage-vault-shards-guide.md`: storage modes and sync-facing behavior.
- `docs/SECURITY.md`: external-domain, clipboard, and vault-access disclosures.
- `docs/development/obsidian-settings-reference.md`: settings UI patterns.

When prose conflicts with an executable repository gate, do not weaken or
suppress the gate. Follow `eslint.config.mjs`, `npm run check:compliance`, and
the scripts they invoke, then reconcile stale documentation within the task if
it is in scope.

## Change Workflow

Use `$work-on-rss-dashboard-change` for user-visible features, bug fixes, and
GitHub issues. The skill defines intake, risk classification, TDD, conditional
Obsidian review gates, staged validation, changelog linking, plan closure, and
manual testing. When work starts from `docs/plans/`, read the canonical **Plan
Lifecycle and Archive** policy in `docs/development/README.md` and keep the plan
current as implementation decisions change. New ideas use dated draft names;
accepted implementation work receives a canonical GitHub issue and permanent
issue-number filename before coding begins.

Keep fast feedback targeted during implementation. Before handoff, use
`npm run build` as the full compliance, lint, type-check, and production-bundle
gate. Run the complete unit suite when the skill classifies a change as broad
or high risk.

For user-visible work, record the granular issue-linked entry in
`CHANGELOG.md` when the behavior is complete. Consolidate those entries for a
wider audience in `docs/releases/<version>.md` only when cutting the release.
After implementation and required validation succeed, move a matching plan to
`docs/archive/plans/unreleased/`; release cut promotes it to
`docs/archive/plans/v<version>/`.
