# ADR 0028: A plan lives in its issue body

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

Decided in
[#1156](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1156),
which carries the migration.

## Date

2026-10-16

## Context and problem

A plan used to be written twice. The ticket carried the proposal, and a file
under `docs/plans/` carried the plan. Nothing reconciled the two, so they
drifted.

On `dev` at 2026-10-14 the drift was measurable rather than hypothetical. Four
of the seven issue-numbered plan files pointed at closed issues while still
declaring themselves active: #437, #646, #663, and #1063. The body of #319 says
"Companion plan: `docs/plans/319-plugin-local-data-backups.md`", and no file of
that name exists in any reachable history — the sentence was added through the
GitHub UI, so the claim never passed through git at all. `docs/plans/README.md`
did not exist; the rule lived two hops away in `docs/development/README.md`.
The archive shows the same lapse in miniature: its version grouping is already
partial, with no `v2.3.0` or `v2.5.0` directory although both releases shipped,
because promotion into a version directory happens at release cut and nothing
enforced it afterwards.

Enforcement could not have caught any of this. `check:pre-release` reads git and
the filesystem only: it validated that `status:` existed and held one of five
values, and it had no way to learn that an issue had closed. A rule that needs a
human to keep two systems in agreement is a rule that lapses.

## Decision

**A plan lives in its issue body, and there is no second copy.** The ticket
carries the question, the decisions, the slices, and the acceptance criteria.
Accepted work gets a canonical GitHub issue before implementation begins, and
implementation that changes the accepted contract edits the issue body.

**`docs/planning/` holds only what does not fit one issue body.** A document
earns a file there only when it serves more than one issue, or holds data
updated over time independently of any issue. A document serving exactly one
issue fails both tests; when a body genuinely outgrows one issue, the issue is
split rather than a file created. A plan is a working and coordination artifact,
not a durable record — the durable records beside it are ADRs, `CHANGELOG.md`,
the curated What's New note, and `docs/releases/`.

**Provenance runs one way, and is one line.** A supporting document declares the
issues it serves in `issues:` frontmatter, and never mirrors their content. The
issue links the document; the document names the issues.

**The plan-file lifecycle retires with the convention.** No `status:`
frontmatter, no `<issue-number>-<slug>.md` identity, no completion step, no
archive step. Status lives on the issue: open or closed, its milestone, its
labels. A number in a filename is a record of which issue a document serves, not
a stage in a lifecycle.

**`docs/archive/plans/` is frozen history.** It keeps the plans written under the
old convention and takes no new entries. The catalog parity check stays as the
tripwire that fires if anything is added.

**A closed issue is not a plan holder.** When work outlives its issue, the issue
reopens, or a follow-up issue is filed and linked. The retired convention's
alternative — a file that stays `in-progress` after its issue closes — is
exactly what produced the staleness above.

## Consequences

### Benefits

- The failure mode is deleted rather than monitored. There is no second copy to
  contradict the first, and no reconciliation to forget.
- The reader who arrives at the ticket finds the answer there.
- Enforcement gets stronger while the paperwork shrinks. `check:pre-release` now
  fails a `status:` field under `docs/planning/`, requires every supporting
  document to name the issues it serves, and requires a program directory's
  `README.md` to do the same. The check it replaced could only ask whether a
  status string was spelled correctly.
- A missing file can no longer be mistaken for a missing plan, which is what
  made #319's dangling companion reference invisible for so long.

### Trade-offs

- Plan revisions are no longer reviewed as a diff. GitHub keeps edit history,
  but it is not addressable per revision, and a body can be edited without
  review. The pull request remains the reviewed artifact.
- Plan history leaves git. Portions of a plan that once travelled with the code
  now live on a host, outside link checking.
- A single-issue plan is bounded by the issue body's 65,536-character ceiling,
  which is generous but not unlimited; a program that outgrows it becomes
  several issues, which is more coordination than one long file.
- Numbers stay in document filenames for the issues they serve, so a reader can
  still meet a numbered file that is not a plan. Its `issues:` frontmatter is
  the answer to why.

### Existing users and data

This is a repository-process decision, and nothing user-facing changes. Plan
files move their unique content into their issue bodies and are deleted, one
migration issue per group, so nothing is lost in the transition. The two
implemented plans still in `docs/archive/plans/unreleased/` move into their
version directory at the next release cut — the last act of the retired
convention, after which the promotion step leaves the workflow.

## Considered options

### Keep the file as the source of truth and make the issue a stub

Rejected. This is the documented status quo that produced the drift above, and
it leaves the ticket, where a reader actually arrives, empty of the answer.

### Keep the file and add a gate that can see GitHub

Rejected. This is the strongest alternative, and it should not be dismissed
lightly: a network-aware check could fail a plan whose issue has closed, or
whose companion file is missing, which would have caught #319's dangling
reference on the day it was written. But such a gate can only detect a plan that
is _stale_. It cannot detect a plan that _contradicts_ its issue, and that is
the failure that costs a future reader. It also keeps two copies of every plan
alive and asks reviewers to maintain both.

### Keep the archive pipeline and only stop writing plan files

Rejected. A pipeline with no input is a lifecycle step waiting to lapse, which
is what the partial version grouping already shows. Freezing the archive and
retiring the promotion step states the outcome honestly.

### Carry the plan in an issue comment rather than the body

Rejected. A comment is not what a reader sees first, it is not what issue search
surfaces, and it buries the plan beneath whatever discussion follows.

## Implementation notes

- `docs/planning/README.md` is the canonical rule for what may live in the
  folder and how provenance is declared; `docs/development/README.md` keeps only
  the workflow.
- `scripts/check-pre-release.mjs` fails a `status:` field under
  `docs/planning/`, requires `issues:` on every supporting document, and
  requires a program directory's `README.md` to declare the issues it serves.
  The `PENDING_MIGRATION_PLANS` exemption this rule started with retired with
  the last file it named (#1234), so the rule now has no exemption at all.
- Where a plan's parent is a file, its derived tickets keep the base-commit pin
  they already carry. Where the parent is an issue body, the created ticket's
  own body is the record of what it was cut from, so no new pin mechanism is
  needed.
- `docs/archive/plans/` and the archive catalog stay as they are, apart from
  their live pointers into the current layout.

## Related

- [GitHub Issue #1156](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1156) — the plan of record for this convention
- [Planning documents](../planning/README.md) — the folder rule
- [ADR 0024](0024-enforce-the-read-only-cutoff-at-the-persistence-choke-point.md) — an earlier record that already named its issue as the plan of record
- [ADR 0009](0009-curated-whats-new-release-notes.md) — the durable user-facing record, kept separate from the technical changelog
- [ADR Policy](POLICY.md)
