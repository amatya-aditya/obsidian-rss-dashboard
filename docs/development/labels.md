# Issue Labels and Milestones

How we label and schedule issues and pull requests. The goal is that anyone can
open the issue list, filter it, and see what to work on next and why.

## The short version

Every open issue should have:

- one **type** (`bug`, `enhancement`, `refactor`, `maintenance`, `documentation`);
- one **status** (`status: …`);
- one **priority** (`priority: …`), except trackers and umbrella issues;
- at least one **area** (`area: …`) when an area fits;
- a **milestone** once it's scheduled.

Flags such as `data-loss` or `good first issue` are added only when they apply.

The label families use a `family: value` prefix, like `status: blocked`, so
they sort together in GitHub's label picker and read clearly in the issue
list. obsidian-tasks uses the same convention (`scope: …`, `status: …`,
`priority: …`).

## Type

| Label | Use for |
| --- | --- |
| `bug` | Something isn't working as intended |
| `enhancement` | A new feature, or a change to how an existing feature behaves |
| `refactor` | Behavior-preserving restructuring (see #436 and **Refactors (#436)** in `AGENTS.md`) |
| `maintenance` | Tooling, cleanup, compliance, and upkeep with no user-visible change |
| `documentation` | Documentation additions, corrections, and reorganization |

Dependabot applies `dependencies`, `github_actions`, and `javascript` to its
own pull requests. Leave them as they are.

## Status

Status tracks where an issue is in its lifecycle. Replace the previous status
when it changes; don't stack them.

| Label | Meaning |
| --- | --- |
| `status: needs-triage` | New; a maintainer needs to review and label it |
| `status: needs-info` | Waiting on the reporter for more information |
| `status: accepted` | Confirmed and ready to work on |
| `status: blocked` | Waiting on another issue or decision; the issue body names it (for example "Blocked by #436") |
| `status: in-progress` | Someone is working on it |
| `status: ready-for-testing` | A fix is available and needs manual testing |
| `status: pending-release` | Merged; ships in the next release |

Closed issues don't need a status. Use `duplicate` or `wontfix` when an issue
is closed without a fix.

## Priority

Priority says **when** we intend to deal with an issue.

| Label | Meaning |
| --- | --- |
| `priority: high` | Immediate attention: next up, ahead of planned work |
| `priority: medium` | Normal backlog item, scheduled into a milestone |
| `priority: low` | Minor fix or nice-to-have; done when convenient |

Trackers and umbrella issues (release trackers, #436) don't get a priority.

## Severity flags

These describe **how bad** a problem is, separately from when we'll fix it. A
rare data-loss bug can be `data-loss` and still `priority: medium`.

| Label | Meaning |
| --- | --- |
| `data-loss` | Can lose or overwrite user data. These are the major fixes that may still target a frozen release branch (#436, phase 2); see **Freezing the release branch** in `CONTRIBUTING.md` |
| `regression` | Worked in an earlier release and is broken now. Name the last working version in the issue |
| `breaking change` | Changes behavior, stored data, or requirements (such as `minAppVersion`) in a way users must adapt to. Ships only in a major release, bundled with the other breaking changes in its milestone |

## Area

Area says which part of the plugin is affected. Use more than one when an
issue spans parts.

| Label | Covers |
| --- | --- |
| `area: dashboard` | Dashboard view: article list, filters, selection |
| `area: sidebar` | Feed and folder sidebar, including the navigation drawer |
| `area: reader` | Reader view and article rendering |
| `area: refresh` | Fetching, parsing, and refreshing feeds |
| `area: import-export` | OPML, preferences, and bundle import and export |
| `area: storage` | Settings, shards, user state, and on-disk layout |
| `area: build` | Build, CI, release tooling, and `minAppVersion` |

## Contribution flags

| Label | Meaning |
| --- | --- |
| `good first issue` | Small and well scoped; a good place to start. GitHub surfaces these to new contributors |
| `help wanted` | Maintainers would welcome a contribution |
| `ready-for-agent` | Fully specified, ready for an AFK agent |
| `ready-for-human` | Fully specified, but needs a human to implement |

## Other labels

| Label | Meaning |
| --- | --- |
| `duplicate` | Another issue or pull request covers this; link it when closing |
| `wontfix` | Won't be worked on; explain why when closing |
| `wayfinder:map`, `wayfinder:research`, `wayfinder:grilling`, `wayfinder:task`, `wayfinder:prototype` | Wayfinder planning issues: a map and its prerequisite decisions and tasks |

## Milestones

| Milestone | Holds |
| --- | --- |
| A release number, such as `2.7.0` or `2.8.0` | Work planned to ship in that release |
| `3.0.0` | The next major release: breaking changes bundled together (see `breaking change`) |
| `vNext` | Accepted work that isn't scheduled for a specific release yet |

Move an issue to a release milestone when it's scheduled, and out again if it
slips. An unfixed issue in a closed release milestone should move to the next
one.

## Triage checklist

When a new issue arrives:

1. Confirm it's actionable. If not, apply `status: needs-info` and ask the
   reporter, or close it as `duplicate` or `wontfix` with a reason.
2. Apply a type, an area, and a priority. Add `data-loss`, `regression`, or
   `breaking change` if they apply.
3. Replace `status: needs-triage` with `status: accepted`, or with
   `status: blocked` plus a "Blocked by #…" line in the body.
4. Add a milestone once it's scheduled.

## Labels through the workflow

Labels track an issue through the **Idea-to-Release Workflow** in
[`README.md`](./README.md#idea-to-release-workflow). Each stage changes them as
follows.

| Stage | Label and milestone changes |
| --- | --- |
| Issue opened | The bug and feature templates apply `bug` or `enhancement` plus `status: needs-triage`; the refactor template applies `refactor` |
| Triaged | Follow the triage checklist above: `status: accepted` (or `blocked`, `needs-info`, `wontfix`), plus a priority and an area |
| Scheduled | A release milestone, or `vNext` if it's accepted but not scheduled |
| Ready to pick up | Add `ready-for-agent` or `ready-for-human` once the issue is specified well enough to hand off |
| Work starts | `status: in-progress`, and an issue branch named per [`branch-naming.md`](../agents/branch-naming.md) |
| Fix needs manual checks | `status: ready-for-testing` while a pull request waits on a fixture-vault or beta checklist |
| Merged | A pull request that says `Fixes #…` closes the issue on merge to `dev` (the default branch). Closed issues don't need a status. Use `status: pending-release` only for an issue that stays open until a release, for example a fix on a release branch |

### Suggested agent workflow (optional)

Contributors choose their own tools, and nothing here is required. The
maintainers use [Matt Pocock's skills](https://github.com/mattpocock/skills),
plus local variants of some of them (`grill`, `to-issue`). Each step in that
flow keeps the labels above:

1. `grill-with-docs` and `to-spec` to settle an idea, then `to-tickets` to turn
   the spec into issues (`status: accepted`, plus `ready-for-agent` or
   `ready-for-human`).
2. `triage` for issues that arrive from outside (`status: needs-triage` to a
   decision).
3. `implement` on an issue branch (`status: in-progress`), then `code-review`
   before the pull request.
4. `wayfinder` maps for larger, multi-issue efforts (`wayfinder:` labels).

Whatever tools you use, apply the same label changes at each stage.

## Agent triage roles

The agent skills we use come from Matt Pocock's
[skills](https://github.com/mattpocock/skills). They refer to five canonical
triage roles: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, and `wontfix`. `docs/agents/triage-labels.md` maps those
roles to our labels.

In that system an issue carries exactly one state role. Here,
`status: needs-triage` and `status: needs-info` are status labels, while
`ready-for-agent` and `ready-for-human` are flags on an issue that is
`status: accepted`: they say who can pick it up. The `wayfinder:` labels come
from the same skills.

## References

- GitHub Docs, [Managing labels](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels):
  the default labels (`bug`, `enhancement`, `documentation`, `duplicate`,
  `good first issue`, `help wanted`, `invalid`, `question`, `wontfix`,
  `accessibility`) that this system keeps and extends.
- GitHub Docs, [Encouraging helpful contributions to your project with labels](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/encouraging-helpful-contributions-to-your-project-with-labels):
  why `good first issue` matters: GitHub uses it to surface approachable
  issues to new contributors.
- Matt Pocock's skills, [triage](https://github.com/mattpocock/skills/blob/main/docs/engineering/triage.md)
  and [wayfinder](https://github.com/mattpocock/skills/blob/main/docs/engineering/wayfinder.md):
  the canonical triage roles and their state machine, and the `wayfinder:`
  ticket labels.
- [obsidian-tasks labels](https://github.com/obsidian-tasks-group/obsidian-tasks/labels):
  prefixed families (`scope: …`, `status: …`, `priority: …`) in a large
  Obsidian plugin.
- [obsidian-linter labels](https://github.com/platers/obsidian-linter/labels):
  `breaking-change`, `needs-triage`, `maintenance`, and the GitHub defaults.
- [Dataview labels](https://github.com/blacksmithgu/obsidian-dataview/labels)
  and [Obsidian Git labels](https://github.com/Vinzent03/obsidian-git/labels):
  priority levels, and area labels (for example `mobile`, `desktop`) alongside
  `bug`, `good first issue`, `help wanted`, and `wontfix`.
