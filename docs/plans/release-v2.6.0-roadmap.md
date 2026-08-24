---
status: in-progress
owner: unassigned
created: 2026-08-16
issue: ""
milestone: 2.6.0
workstream: release
sequence: null
depends_on: []
release_requirement: required
implementation: ""
---

# RSS Dashboard 2.6.0 release roadmap

## Objective

Prepare RSS Dashboard 2.6.0 for publication. The release improves refresh
control and reliability, makes large podcast and image-heavy libraries more
responsive, and includes Reader, Dashboard, feed-management, and compliance
improvements.

## Release scope

The candidate scope is recorded in [CHANGELOG.md](../../CHANGELOG.md) and the
audience-facing summary is in [the 2.6.0 release notes](../releases/2.6.0.md).
The detailed implementation history is archived under
[`docs/archive/plans/v2.6.0/`](../archive/plans/v2.6.0/):

- Refresh scheduling, status, retry, cancellation, and import/Discover
  cancellation: [#166](../archive/plans/v2.6.0/166-per-feed-auto-refresh-scheduling.md),
  [#167](../archive/plans/v2.6.0/167-refresh-status-indicators.md),
  [#168](../archive/plans/v2.6.0/168-retry-failed-feeds.md),
  [#173](../archive/plans/v2.6.0/173-cancel-global-refresh.md), and
  [#179](../archive/plans/v2.6.0/179-cancel-import-discover-fetches.md).
- Dashboard image-preview controls and disk caching:
  [#175](../archive/plans/v2.6.0/175-independent-dashboard-preview-settings.md)
  and [#177](../archive/plans/v2.6.0/177-image-preview-disk-cache.md).
- Podcast playlist windowing and Dashboard Mark all read/unread:
  [#183](../archive/plans/v2.6.0/183-podcast-playlist-windowing.md) and
  [#185](../archive/plans/v2.6.0/185-mark-all-read-unread-controls.md).
- Supporting documentation, security/compliance, formula rendering, and branch
  realignment:
  [#169](../archive/plans/v2.6.0/169-documentation-archive-cleanup.md),
  [#181](../archive/plans/v2.6.0/181-ci-security-hardening.md),
  [WordPress LaTeX rendering](../archive/plans/v2.6.0/wordpress-latex-image-rendering.md),
  and [#165](../archive/plans/v2.6.0/draft-20260816-development-branch-realignment.md).

## Release gates

- [ ] Confirm required 2.6.0 issues and stabilization fixes are closed or
  explicitly deferred.
- [ ] Run the complete automated release validation, including unit tests,
  platform checks, linting, type checking, and production build.
- [ ] Complete desktop, mobile, upgrade/storage-mode, accessibility, and
  popout-window checks relevant to the included changes.
- [ ] Reconcile the final `CHANGELOG.md` entries with shipped behavior and
  finalize [the public release notes](../releases/2.6.0.md).
- [ ] Verify package, manifest, and version mapping files agree on 2.6.0.
- [ ] Inspect the release package, publish the GitHub release, and complete a
  clean-install and post-release smoke test.

## Scope control

Do not add unrelated feature work after release stabilization begins. Record
stabilization fixes in `CHANGELOG.md`, update the release notes when the user
impact warrants it, and retain the detailed evidence in the matching plan or
issue.

## References

- [Release notes workflow](../development/release-notes-workflow.md)
- [Plan lifecycle and archive](../development/README.md#plan-lifecycle-and-archive)
- [Archive catalog](../archive/README.md)
