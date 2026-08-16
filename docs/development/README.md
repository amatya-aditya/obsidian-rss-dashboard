# Development Docs

Last updated: 2026-08-16

Internal developer documentation for the RSS Dashboard plugin.

## Core References

- [Compliance Patterns and Audit Guardrails](./compliance-patterns.md)
- [Feed Data Lifecycle](./data-flow.md)
- [Feed Validation](./feed-validation.md)
- [Obsidian Settings Reference](./obsidian-settings-reference.md)
- [Release Notes Workflow](./release-notes-workflow.md)
- [Testing Guide](./test_coverage/testing-guide.md)
- [Pull Request Template](../../.github/PULL_REQUEST_TEMPLATE.md)

## Plan Lifecycle and Archive

This section is the source of truth for implementation-plan organization.

### Directory Model

```text
docs/
  plans/                         # Active and future work
  archive/
    README.md                    # Searchable archive catalog
    plans/
      unreleased/                # Implemented and validated, not released
      v<version>/                # Shipped plans grouped by first release
      unshipped/                 # Deferred, rejected, or superseded plans
    investigations/
      <YYYY>/                    # Incident, bug, and research records
  decisions/
    NNNN-<slug>.md               # Durable architectural decisions
```

Use release versions as the primary grouping for implemented feature and bug
plans. Use calendar years for investigations whose value is chronological.
Keep durable architectural decisions in `docs/decisions/`; update their status
to `superseded` and link the replacement instead of archiving them.

### Plan Metadata

Use this frontmatter for new active plans:

```yaml
---
status: idea
created: YYYY-MM-DD
issue: ""
milestone: ""
owner: unassigned
workstream: ""
sequence: null
depends_on: []
release_requirement: ""
implementation: ""
---
```

- Use `idea` while exploring, `proposed` while design is under review,
  `accepted` when approved for implementation, `blocked` when an accepted plan
  has an unmet dependency, and `in-progress` after implementation begins.
- Keep `issue` empty until a canonical GitHub issue exists. Before implementation
  or milestone assignment, create the issue and store its exact URL.
- Keep `milestone` empty until the issue joins a release milestone. Use
  `release_requirement: required` or `stretch` only for milestone work.
- Use `workstream`, `sequence`, and `depends_on` only when they add real
  coordination value. Before issue creation, dependencies may be draft plan
  filenames. After issue creation, replace them with canonical issue URLs.
- An owner may remain `unassigned`; issue identity and assignment are separate.

Before archiving an implemented plan, replace its lifecycle fields with:

```yaml
---
status: implemented
completed: YYYY-MM-DD
released_in: unreleased
issue: ""
implementation: ""
---
```

- Set `released_in` to `unreleased` until release cut, then replace it with the
  version number.
- Preserve an exact canonical issue URL when one exists.
- Put a PR URL or commit hash in `implementation` when known; leave it empty
  rather than inventing one.
- For deferred, rejected, or superseded plans, use that value for `status`, move
  the file to `docs/archive/plans/unshipped/`, and add `superseded_by` when
  applicable.

### Plan Filename Convention

Use lowercase kebab-case and a two-stage identity:

1. Before a canonical issue exists, use
   `draft-YYYYMMDD-<descriptive-slug>.md`.
2. After creating the issue, rename the plan once to
   `<issue-number>-<descriptive-slug>.md` and keep that filename through
   implementation and archival.

Examples:

```text
draft-20260816-refresh-status-indicators.md
143-refresh-status-indicators.md
```

The date identifies a draft; it is not a promised delivery date. Use product or
domain language that is understandable without a private abbreviation list.
Keep status, priority, ownership, milestone, and release version in frontmatter
or GitHub rather than filenames.

Release roadmaps are durable coordination artifacts and use
`release-v<version>-roadmap.md`, or `release-vnext-roadmap.md` before the version
is chosen. ADRs retain `NNNN-<slug>.md` under `docs/decisions/`.

Legacy plans do not need opportunistic renaming. Normalize them through a
dedicated documentation migration so every inbound link is updated together.

### Idea-to-Release Workflow

1. Capture an uncommitted idea in a GitHub Discussion or a dated draft plan.
2. Triage it as accepted, deferred, rejected, superseded, or still proposed.
3. For accepted work, create a GitHub issue, rename the plan with the issue
   number, and replace draft dependencies with issue URLs.
4. Keep accepted backlog issues unassigned and unmilestoned when appropriate.
5. Add only intended release work to the release milestone; mark it Required or
   Stretch in the Project and plan metadata.
6. Use an issue branch and pull request that link the canonical issue. Update
   the plan when implementation changes the accepted contract.
7. Complete validation, changelog, archive, release-note, and milestone gates
   through the completion workflow below.

### Completion Workflow

1. Keep the plan in `docs/plans/` while behavior is incomplete or validation is
   failing.
2. Update the plan when implementation changes its accepted design, file map,
   tests, limitations, or manual verification.
3. After implementation and every required validation gate succeed, mark the
   plan `implemented` and move it to `docs/archive/plans/unreleased/` unless a
   release version is already assigned.
4. Update all repository links to the moved file.
5. Add or update its row in `docs/archive/README.md`, including status,
   completion date, release, and implementation link when available.
6. Keep the granular user-facing change in `CHANGELOG.md`; the archived plan is
   supporting developer history, not public release-note copy.

At release cut, move implemented plans from `unreleased/` into
`docs/archive/plans/v<version>/`, replace `released_in`, update the archive
catalog and repository links, and include the user-facing summary under
`docs/releases/<version>.md`.

## Documentation Index

### Active Plans and History

- [Active implementation plans](../plans/)
- [Public roadmap](../plans/public-roadmap.md)
- [Archive catalog](../archive/README.md)
- [Release summaries](../releases/)

### Additional Development Notes

- [Automatic deletion](./auto-deletion.md)
- [Audit remediation 2.3.0](./audit-remediation-2.3.0.md)
- [Defuddle evaluation](./defuddle-evaluation.md)
- [Substack CDATA entity encoding](./substack-cdata-entity-encoding.md)
- [Test-lint backlog tracker](./test-lint-backlog-tracker.md)

### Design and Bug References

- [RSS Dashboard Design Spec](../design/design-spec.md)
- [Why YouTube Shorts Auto-Tagging Is Fundamentally Brittle](../bugs/youtube-shorts-tagging-failure.md)
