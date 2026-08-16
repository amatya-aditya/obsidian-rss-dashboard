---
status: accepted
owner: unassigned
created: 2026-08-16
issue: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/165
milestone: vNext
workstream: release
sequence: null
depends_on: []
release_requirement: required
implementation: ""
---

# Developer Roadmap to the Next Release

## Purpose

Establish a lightweight release-control system that shows what must be built,
validated, documented, and shipped before the next version. Use GitHub for live
work state and this repository for the durable release contract.

## Source-of-truth model

Each artifact has one responsibility:

| Artifact | Responsibility |
| --- | --- |
| GitHub issue | One actionable feature, fix, maintenance task, or documentation task |
| Issue dependency or sub-issue | Ordering and decomposition |
| `vNext` milestone | Authoritative set of issues and pull requests required for release |
| GitHub Project | Live prioritization, workflow, blocked work, and optional timeline views |
| Release-tracking issue | Cross-cutting validation and launch checklist |
| This roadmap | Release intent, scope, sequencing, non-goals, risks, and links |
| `CHANGELOG.md` | Granular user-visible changes under Unreleased |
| `docs/releases/<version>.md` | Shipped, audience-focused release narrative |
| Archived implementation plans | Durable implementation and validation history |

Store each changing fact once. In particular, keep issue status in GitHub, the
target issue set in the milestone, and the release date in one selected GitHub
field rather than copying them into Markdown.

## Recommended setup

### 1. Create a `vNext` milestone

- Attach every release-required issue and pull request.
- Remove deferred work instead of leaving it open as an implied requirement.
- Rename the milestone to the concrete version once the version is selected.
- Treat milestone completion as necessary but not sufficient for release; the
  release-tracking issue owns the remaining gates.

### 2. Create one release-tracking issue

Title it `Release tracker: vNext`, then rename it with the milestone. Its task
list should link to issues for implementation work and directly track only
release-level gates:

- [ ] All required milestone issues are closed.
- [ ] Required focused and full automated validation passes.
- [ ] Desktop manual testing is complete.
- [ ] Mobile manual testing is complete.
- [ ] Upgrade, migration, and storage-mode testing is complete.
- [ ] Accessibility and popout checks are complete where applicable.
- [ ] `CHANGELOG.md` Unreleased entries are reconciled with shipped behavior.
- [ ] `docs/releases/<version>.md` is complete.
- [ ] Version and manifest files agree.
- [ ] Implemented plans move from `archive/plans/unreleased/` to the version folder.
- [ ] The archive catalog and all moved-plan links are updated.
- [ ] The release package contents are inspected.
- [ ] The GitHub release is published.
- [ ] A clean-install and post-release smoke test passes.

### 3. Add a GitHub Project when useful

A Project is recommended once the release has more than about a dozen work
items, multiple simultaneous workstreams, or a meaningful blocked-work queue.
Use the same issues and pull requests already assigned to the milestone.

Recommended views:

- **Release board:** Backlog, Ready, In progress, Validation, Done.
- **Priority table:** Required, Stretch, Deferred.
- **Blocked:** open items with unresolved dependencies.
- **Roadmap:** optional timeline across the next and later releases.

Recommended fields:

| Field | Values |
| --- | --- |
| Target release | Next version, Later |
| Release requirement | Required, Stretch, Deferred |
| Work type | Feature, Bug, Maintenance, Documentation |
| Area | Refresh, Reader, Sidebar, Storage, Build, Documentation |
| Validation | Not started, Automated complete, Manual complete |
| Risk | Low, Medium, High |

### 4. Maintain a concise repository roadmap

Once a concrete version is chosen, either rename this file or create a
version-specific successor. Record only durable information:

- release objective and intended audience impact;
- required and stretch scope;
- explicit non-goals;
- major dependencies and implementation order;
- release-blocking quality gates;
- known risks and accepted limitations;
- links to the milestone, Project, release tracker, and detailed plans.

Do not duplicate individual issue status or acceptance criteria here.

## Initial dependency chain

First complete the required
[development branch realignment](draft-20260816-development-branch-realignment.md).
Then implement the refresh work in three separately validated changes:

1. [Per-feed auto-refresh scheduling fix](draft-20260816-per-feed-auto-refresh-scheduling.md)
2. [Refresh status and progress indicators](draft-20260816-refresh-status-indicators.md)
3. [Retry failed feeds with Shift+click](draft-20260816-retry-failed-feeds.md)

Each stage must be implemented, validated, committed, and have its plan moved
according to the repository plan lifecycle before implementation starts on the
next stage. Documentation cleanup is independently tracked in
[Documentation Archive Cleanup](draft-20260816-documentation-archive-cleanup.md).

## Operating workflow

1. Define the release objective and select the version.
2. Create the milestone and release-tracking issue.
3. Convert every required roadmap item into an issue with observable acceptance
   criteria; represent ordering with dependencies.
4. Assign required issues to the milestone and place optional work in Stretch.
5. Link detailed repository plans from their matching issues.
6. Keep the Project and milestone current as pull requests merge or scope moves.
7. Run the release tracker only after required implementation issues close.
8. Complete release documentation, archive plans, publish, and smoke-test.

## Completion criteria

- One milestone identifies the complete required release scope.
- Every required implementation item has an issue and an owner or explicit
  unassigned state.
- Dependencies expose the critical sequence and blocked work.
- One release-tracking issue contains every cross-cutting validation and launch
  gate.
- This roadmap links to GitHub artifacts once created and contains no duplicated
  live status.
- Changelog, release notes, and archived plans agree with the shipped behavior.
- The published package passes a post-release smoke test.

## References

- [GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects)
- [GitHub issues and dependencies](https://docs.github.com/en/issues/tracking-your-work-with-issues/learning-about-issues/about-issues)
- [GitHub planning guidance](https://docs.github.com/en/issues/tracking-your-work-with-issues/learning-about-issues/planning-and-tracking-work-for-your-team-or-project)
- [Repository plan lifecycle](../development/README.md#plan-lifecycle-and-archive)
