# Docs Audit Checklist

A repeatable pass over every Markdown document in the repository before a
release. It answers three questions: what changed since the last release, does
each new or changed document follow the repository's conventions, and does
anything stray or orphaned remain.

It runs as a **release gate**. `npm run check:release-ready -- <version>`
includes the audit, so a release cannot be cut while a new or changed document
breaks a rule. It is not part of `npm run build`, so ordinary pull requests
are not held to release-timing rules.

## Scope

- **Included:** every tracked `*.md` file: root documents, `docs/**`,
  `.agents/**`, `.github/**`, `test_files/**`, and `src/**/README.md`.
- **Excluded:** `CHANGELOG.md`, `docs/releases/**`, `src/release-notes/**`,
  and `docs/development/whats-new-note-template.md`. Release notes have their
  own gates in `check:pre-release` and `check:release-ready`.

## Step 1: Refresh the baseline

```bash
git fetch origin
```

The audit compares `origin/master`, the last stable release, against the
committed content of `HEAD`. If `origin/master` is missing, the audit is
skipped with a notice, and the release gate says so instead of passing.

## Step 2: Run the audit

```bash
npm run check:docs-audit
```

Save the report with `--out <path>` to keep it for the release record. Outside
the repository, for example in your scratch directory, so it does not appear in
`git status`.

The report has two parts:

1. **Changes since base**: New, Changed, Renamed, and Deleted documents. A
   rename that did not change content is listed as Renamed and is not counted
   as Changed.
2. **Findings**, in three groups:
   - **Fail** blocks the release. A new or changed document breaks a rule.
   - **Historical** is recorded but does not block. It is an untouched document
     that predates a rule, usually in `docs/archive/`.
   - **Warn** does not block. It is an orphan: a document under `docs/` that no
     other tracked file links to.

## Step 3: Review each rule

The audit enforces these rules. Each one names its source of truth, so fix a
finding against that document rather than against the script.

| Rule                  | Applies to                           | Source of truth                                                                      |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| `adr-filename`        | `docs/adr/`                          | [ADR Policy](../adr/POLICY.md): `NNNN-short-decision-title.md`                       |
| `adr-sections`        | `docs/adr/`                          | [ADR Policy](../adr/POLICY.md): Status, Date, Context, Decision, Consequences        |
| `adr-status`          | `docs/adr/`                          | [ADR Policy](../adr/POLICY.md): proposed, accepted, superseded, deprecated, rejected |
| `adr-date`            | `docs/adr/`                          | [ADR Policy](../adr/POLICY.md): a `YYYY-MM-DD` date                                  |
| `adr-superseded-link` | `docs/adr/`                          | A superseded ADR links the ADR that replaced it                                      |
| `adr-duplicate-id`    | `docs/adr/`                          | ADR numbers are never reused                                                         |
| `adr-index`           | `docs/adr/`                          | [ADR index](../adr/README.md): one row per ADR, status matches the file              |
| `stray-markdown`      | every tracked `.md`                  | Markdown lives in a documented home (see the script's allowlist)                     |
| `naming`              | every tracked `.md`                  | Lowercase kebab-case, or a conventional name                                         |
| `archive-frontmatter` | `docs/archive/plans/`                | An archived plan records its outcome in a frontmatter block                          |
| `orphan`              | `docs/**` (not archive, not READMEs) | At least one other tracked document links to it                                      |

Planning documents, the archive catalog, and link resolution have their own
checks in `npm run check:compliance`, and `check:pre-release` enforces them. The
audit does not repeat them:

- [docs/planning/README.md](../planning/README.md): frontmatter and program
  folders, through `check:pre-release`.
- [docs/archive/README.md](../archive/README.md): the catalog, through
  `check:pre-release`.
- Relative links, through `check:doc-links`.
- Formatting, through `npm run format:check`.

## Step 4: Manual judgment

The script checks structure, not truth. Before you sign off, read the new and
changed documents in the diff and check:

- [ ] Each ADR in the diff records a durable decision (see the
      [ADR Policy](../adr/POLICY.md#when-to-create-an-adr)), and an implementation
      detail has not been mistaken for one.
- [ ] Each user-facing guide matches the current behavior it describes.
- [ ] No document claims a status ("planned", "in progress", "proposed") that
      the linked issue or release has already resolved.
- [ ] No two documents describe the same thing differently. Link one to the
      other instead of copying it.
- [ ] Each orphan warning is a deliberate entry point, or it is linked from a
      sensible index such as [docs/README.md](../README.md).

## Step 5: Resolve, then re-run

Fix each fail finding, then re-run `npm run check:docs-audit`. Fix a historical
finding only when the document is already being edited for another reason, so
the archive does not churn. A warning does not need a fix, but record why it is
intentional.

## Step 6: Record the sign-off

Put the report and the sign-off in the release tracker issue. The tracker lists
the audit under "Automated checks". Record:

- the base and head that were compared, and the document count;
- the number of fail, historical, and warn findings, and what was done about
  each fail;
- any orphan warning left in place on purpose.

## Relation to other release gates

- [pre-release-checklist.md](pre-release-checklist.md): the release-cut
  checklist. This audit is one step of it.
- `npm run check:release-ready -- <version>`: the gate that runs at the
  version bump. It includes this audit's fail findings.
- [release-notes-workflow.md](release-notes-workflow.md): changelog and release
  notes, which this audit excludes.
