# Development Docs

Internal developer documentation for the RSS Dashboard plugin.

## Core References

- [Accessibility Scope and Support](../../ACCESSIBILITY.md)
- [Architecture Guardrails](./architecture.md)
- [Article Enrichment: Previews, Pages, and Fetch-on-Open](./article-enrichment.md)
- [Accessibility Policy and Agent-Friendly Testing Research](./accessibility-research.md)
- [Accessibility Policy and Incremental Rollout (issue #681)](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/681)
- [Compliance Patterns and Audit Guardrails](./compliance-patterns.md)
- [Docs Audit Checklist](./docs-audit-checklist.md)
- [Feed Data Lifecycle](./data-flow.md)
- [Feed Validation](./feed-validation.md)
- [Fixture Vault for Manual Testing](./fixture-vault.md)
- [Issue Labels and Milestones](./labels.md)
- [Obsidian Alignment Audit](./obsidian-alignment-audit.md)
- [Obsidian Settings Reference](./obsidian-settings-reference.md)
- [Obsidian Test Stub Probes](../../test_files/stubs/obsidian-console-probes.md)
- [Real Sync Runbook](./real-sync-runbook.md)
- [Release Notes Workflow](./release-notes-workflow.md)
- [Starred State and Tags](./starred-state-and-tags.md)
- [Test Feeds for Manual QA](./test-feeds/index.md)
- [Testing Guide](./test_coverage/testing-guide.md)
- [Pull Request Template](../../.github/PULL_REQUEST_TEMPLATE.md)

## Where Plans Live

**A plan lives in its issue body.** There is no plan file to keep in sync, so
there is nothing to drift: the ticket a reader arrives at carries the question,
the decisions, the slices, and the acceptance criteria. Accepted work gets a
canonical GitHub issue before implementation begins, and that issue is the plan
of record.

`docs/planning/` holds only material that does not fit one issue body: programs
that serve several issues, the public roadmap, and dated draft ideas awaiting an
issue. Its [README](../planning/README.md) is the canonical rule for the
boundary, what each kind of file carries, and the provenance rule.

- Status is the issue's — open or closed, its milestone, its labels. No
  frontmatter lifecycle.
- Supporting documents declare `issues:` frontmatter, the only provenance a
  document carries. A document never mirrors an issue's content.
- A draft (`draft-YYYYMMDD-<slug>.md`) is deleted the moment its issue exists.
- When implementation changes the accepted contract, edit the issue body. When
  work outlives its issue, reopen it or file a follow-up and link it; a closed
  issue is not a plan holder.
- `docs/archive/plans/` is frozen history and takes no new entries. The archive
  catalog still gates against accidental additions.

At release cut the user-facing record is `CHANGELOG.md`, the curated What's New
note, and `docs/releases/<version>.md` — not an archived plan. See
[ADR 0028](../adr/0028-plan-lives-in-its-issue-body.md) for why, and
[Issue Labels and Milestones](./labels.md) for the label vocabulary that carries
status.

## Documentation Index

### Planning and History

- [Planning documents](../planning/)
- [Public roadmap](../planning/public-roadmap.md)
- [Archive catalog](../archive/README.md)
- [Release summaries](../releases/)

### Additional Development Notes

- [Main TypeScript architecture audit](../archive/investigations/2026/main-ts-architecture-audit.md)
- [Automatic deletion](./auto-deletion.md)
- [Audit remediation 2.3.0](../archive/investigations/2026/audit-remediation-2.3.0.md)
- [Defuddle evaluation](../archive/investigations/2026/defuddle-evaluation.md)
- [Description-signal precedence](../archive/investigations/2026/description-signal-precedence.md)
- [Language-signal coverage](../archive/investigations/2026/language-signal-coverage.md)
- [Substack CDATA entity encoding](../archive/investigations/2026/substack-cdata-entity-encoding.md)
- [Test-lint backlog tracker](../archive/investigations/2026/test-lint-backlog-tracker.md) (archived)

### Design and Bug References

- [RSS Dashboard Design Spec](./design-spec.md)
- [Why YouTube Shorts Auto-Tagging Is Fundamentally Brittle](../archive/investigations/2026/youtube-shorts-tagging-failure.md)
