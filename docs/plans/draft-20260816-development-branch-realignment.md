---
status: accepted
created: 2026-08-16
issue: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/165
milestone: vNext
owner: unassigned
workstream: release
sequence: 0
depends_on: []
release_requirement: required
implementation: ""
---

# Development Branch Realignment

## Objective

Restore a team-safe branch topology before new feature implementation starts,
without rewriting or losing the existing unreleased work. Move the 2.6.0
development history into `dev`, preserve the current documentation changes in
their own reviewable commit, reconcile unreleased version records, and reserve
`release/<version>` branches for release stabilization.

Release tracker: [GitHub issue #165](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/165).

## Audited baseline

As of 2026-08-16:

- `master`, `dev`, and tag `2.5.0` point to commit `048e739`.
- `release/2.6.0` and `origin/release/2.6.0` point to `b9cfd21`.
- `release/2.6.0` is a direct descendant of `dev` with 16 unreleased commits;
  the histories have not diverged.
- The current documentation and agent-workflow changes are uncommitted in the
  working tree on `release/2.6.0`, with a mixture of staged, modified, deleted,
  and untracked paths.
- `manifest.json` and `package.json` correctly remain at the latest shipped
  version, `2.5.0`, during development.
- `CHANGELOG.md` contains a dated `2.6.0` section even though no `2.6.0` tag or
  version metadata exists. That section represents unreleased work and must be
  reconciled before release preparation.

These facts make a forward-only recovery possible. Preserve the published
commits; do not rebase, squash, reset, or cherry-pick the 16-commit sequence.

## Target topology

```text
master (latest production release: 2.5.0)
  \
   dev (all integrated, validated unreleased work)
     |-- fix/<issue>-<slug>
     |-- feat/<issue>-<slug>
     |-- docs/<issue>-<slug>
     `-- release/2.6.0 (created only at scope freeze)
```

- Feature, fix, and documentation branches start from current `dev` and return
  through pull requests to `dev`.
- `release/2.6.0` is created from `dev` only after Required milestone scope is
  complete. It accepts release preparation and stabilization fixes, not new scope.
- The completed release merges to `master`, is tagged, and is merged back to
  `dev` before the release branch is removed.

## Execution sequence

### 1. Preserve the current documentation work

From the existing dirty working tree, create `docs/165-development-workflow`
at the current `b9cfd21` commit. Branch creation must retain the working-tree
changes.

Review the complete staged result, including the intentional replacement of old
plan filenames by dated draft filenames. Stage all intended documentation and
agent-workflow changes, run the documentation validation described below, and
commit them as one independently reviewable documentation change that references
issue #165 without closing it.

Completion criterion: the documentation branch has a clean working tree and one
reviewable commit above `b9cfd21`; no content exists only in an untracked or
unstaged state.

### 2. Integrate the existing 2.6.0 history into `dev`

Open a pull request from the existing `release/2.6.0` head to `dev`. The pull
request is a branch-recovery integration containing the 16 commits from
`fb114fd` through `b9cfd21`.

Before merge:

- Inventory every commit against `CHANGELOG.md`, an existing issue or pull
  request when available, and the pre-workflow section of issue #165.
- Run the full repository validation and the risk-selected manual checks for the
  accumulated changes.
- Confirm `dev` remains an ancestor of the source branch.
- Merge without squashing or rebasing so existing published commit identities
  remain intact.

Completion criterion: `origin/dev` contains commit `b9cfd21` and all 16
unreleased commits, with validation results recorded in issue #165.

### 3. Merge the workflow documentation

Update `docs/165-development-workflow` from the newly integrated `dev` if
needed, then open a pull request to `dev`. Resolve only genuine documentation
conflicts and preserve the audited feature history.

Completion criterion: the canonical planning workflow, release roadmap, archive
policy, draft plans, and issue #165 link are present on `dev`, and the pull
request checks pass.

### 4. Retire the premature release branch

After both previous pull requests are merged and a fresh clone or fetch confirms
that `origin/dev` contains `b9cfd21`, mark the existing `release/2.6.0` branch as
superseded by `dev`. Remove the remote and local premature release branch only
after that containment check succeeds.

At actual release scope freeze, create a fresh `release/2.6.0` from the then-current
`dev`. Branch removal is a separate, explicitly reviewed destructive operation.

Completion criterion: `dev` is the sole integration branch for unreleased work,
and no writable premature `release/2.6.0` branch invites additional feature commits.

### 5. Reconcile unreleased version records

Keep `package.json`, `manifest.json`, and `versions.json` at `2.5.0` during
feature development. Move the unreleased 2.6.0 changelog material back under
`Unreleased` and remove any text that claims 2.6.0 has already shipped.

At release scope freeze:

1. Create `release/2.6.0` from validated `dev`.
2. Run the repository version command on that release branch so package,
   manifest, lockfile, and version mapping update together.
3. Convert the accumulated Unreleased entries into the dated 2.6.0 section.
4. Run complete release validation and produce the release artifacts.
5. Apply stabilization fixes to the release branch and merge each fix back to
   `dev`.
6. Merge the approved release to `master`, tag `2.6.0`, publish, merge the final
   release state back to `dev`, and remove the release branch.

Completion criterion: development files name only the last shipped version;
release metadata advances together on the release branch; changelog and tag
state never claim a release before publication.

### 6. Establish issue-backed feature branches

After the branch recovery and workflow documentation merge:

1. Use canonical issues #166, #167, and #168 for the three refresh plans.
2. Keep their permanent issue-number filenames and canonical issue dependencies.
3. Assign milestone and Required/Stretch metadata.
4. Implement stage 1 from `fix/<issue>-per-feed-auto-refresh-scheduling` based on
   updated `dev`.
5. Merge, validate, commit, and archive stage 1 before branching stage 2 from
   updated `dev`.
6. Repeat the same gate between stage 2 and stage 3.

Completion criterion: every new implementation commit reaches `dev` through its
own issue-backed branch and pull request, in dependency order.

## Pre-workflow inventory

Issue #165 must retain a **Pre-workflow implemented changes** checklist even
after branch recovery. Moving commits to `dev` fixes topology; it does not prove
that every accumulated change is documented, tested, or ready to release.

For each of the 16 commits:

- record the user-visible change or internal purpose;
- link its existing issue or pull request when one exists;
- otherwise record the commit hash without inventing a retrospective issue;
- map it to the changelog;
- record required automated and manual validation;
- create a new issue only when unfinished work or a defect remains.

Historical changes completed before this workflow do not require retroactive
planning files.

## Label policy for the transition

- Retain `bug`, `duplicate`, and `enhancement` as the issue type labels.
- Use the adopted `status:*` labels; do not create parallel `state:*` labels.
- `status: awaiting-reply` is optional and is intentionally omitted.
- Prefer GitHub closed state and Project `Done` over `status: completed`. If the
  label is retained, define it narrowly and do not use it together with
  `status: ready-for-testing` or `status: pending-release`.
- Add `maintenance` for repository workflow, dependency, release, and tooling
  work if internal work needs a filterable type. Issue #165 may also remain
  without a type label; its milestone and release-tracker title are sufficient.

## Validation

### Documentation preservation commit

- Validate changed local Markdown links and frontmatter.
- Confirm old renamed plan paths have no inbound references.
- Run `git diff --check` before and after staging.
- Inspect `git diff --cached --stat` and the full staged diff.
- Run skill validation when its dependencies are available; otherwise record the
  exact missing dependency and equivalent manual checks.
- Finish with `git status --short` and require a clean branch after commit.

### Existing unreleased implementation

Because the 16 commits span source, UI, storage, parsing, compliance, and tests:

- run `npm run test:unit`;
- run `npm run check:platform`;
- run the applicable CSS and compliance checks;
- run `npm run build` as the complete repository gate;
- perform the manual checks identified by each accumulated change;
- finish with `git status --short` and account for every path.

Do not claim the recovery complete while any required check is failing or
unrecorded.

## Non-goals

- Rewriting the existing 16 commits into artificial feature branches.
- Creating retrospective plans or issues for already completed work.
- Beginning any refresh implementation before branch recovery finishes.
- Advancing version files during ordinary feature development.
- Publishing or tagging 2.6.0 as part of branch recovery.
