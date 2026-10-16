# Planning Documents

This folder holds planning material that does not belong in a GitHub issue. It
is the canonical rule for what may live here.

**A plan lives in its issue body.** The ticket a reader arrives at carries the
question, the decisions, the slices, and the acceptance criteria — so there is
no second copy and nothing to drift. See
[ADR 0028](../adr/0028-plan-lives-in-its-issue-body.md).

## What belongs here

A document earns a file only when it meets one of two tests:

1. **It serves more than one issue.** A program or rollout that several tickets
   hang off.
2. **It holds data updated over time independently of any issue.** Measurement
   baselines and before/after results, for example.

A document that serves exactly one issue fails both tests, and its content
belongs in that issue's body — which carries a specification comfortably. When
a body genuinely outgrows one issue, split the issue rather than create a file.

## What each kind of file carries

| Kind              | Filename                                                  | Frontmatter                           |
| ----------------- | --------------------------------------------------------- | ------------------------------------- |
| Supporting doc    | descriptive kebab-case, e.g. `370-performance-program.md` | `issues:` (and optionally `created:`) |
| Program directory | `<name>/` holding two or more documents                   | its `README.md` declares `issues:`    |
| Draft idea        | `draft-YYYYMMDD-<slug>.md`                                | `created:`                            |
| Roadmap           | `public-roadmap.md`, `release-v<version>-roadmap.md`      | none                                  |

`issues:` lists the canonical issue URLs the document serves. A document never
mirrors an issue's content: a one-line reference is not a restatement, and an
`issues:` list is the whole of its provenance.

Drafts are the only pre-issue home. **Delete a draft the moment its issue
exists.** The issue body replaces it, and a draft that outlives its issue is
the drift this convention exists to prevent.

## What does not belong here

- **An implementation plan for a single issue.** Use the issue body.
- **`status:` frontmatter.** Whether work is active lives on the issue, its
  milestone, and its labels. `npm run check:pre-release` fails a file in this
  folder that carries a `status` key.
- **Local-only notes.** Scratch files belong outside the repository, so a
  clone never carries a file nobody else can see.

## Where the plan is

An issue body is the plan of record for its work, and the only place the plan
lives. The durable records beside it are [`docs/adr/`](../adr/), `CHANGELOG.md`,
the curated What's New note under `src/release-notes/notes/`, and
`docs/releases/`.

When work outlives its issue, reopen the issue or file a follow-up and link it.
A closed issue is not a plan holder, and implementation work does not wait in a
file.

`docs/archive/plans/` is frozen history. It holds plans written under the
previous convention and takes no new entries; the archive catalog still gates
against accidental additions.

Not sure whether something is a supporting document? Check the first two tests
above, then [ADR 0028](../adr/0028-plan-lives-in-its-issue-body.md) for why the
line sits where it does.
