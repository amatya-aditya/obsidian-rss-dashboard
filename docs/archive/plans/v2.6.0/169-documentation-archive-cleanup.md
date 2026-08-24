---
status: implemented
completed: 2026-08-16
released_in: 2.6.0
issue: https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/169
implementation: "314ae6f"
---

# Documentation Archive Cleanup Plan

## Objective

Bring the existing `docs/` tree into the repository's documented lifecycle
without losing historical context. Classify legacy documents, migrate plans and
investigations to their canonical locations, add reliable metadata, repair
repository links, and leave searchable indexes for active and archived work.

The canonical rules are in
[`docs/development/README.md`](../../../development/README.md#plan-lifecycle-and-archive).
The archive inventory is maintained in
[`docs/archive/README.md`](../../README.md).

## Recommended Codex Model

Use **`gpt-5.6-terra` with high reasoning effort**.

This is a broad but bounded repository-maintenance task. It needs enough
reasoning to distinguish plans, investigations, durable references, and release
records; trace links; and avoid inventing historical metadata. It does not need
the flagship tier's maximum capability. OpenAI describes GPT-5.6 Terra as the
balance of intelligence and cost, which fits this workload:
[https://developers.openai.com/api/docs/models](https://developers.openai.com/api/docs/models).

Escalate to `gpt-5.6-sol` only if the repository history is too ambiguous to
classify safely after examining the documents, changelog, releases, and Git
history. Do not use a lower-capability model for the first migration pass,
because an incorrect bulk classification can be harder to detect than a broken
link.

## Scope

### Included

- Inventory every Markdown file under `docs/` and assign a document kind and
  lifecycle state.
- Review every file currently under `docs/plans/`, including `docs/plans/Future/`,
  to determine whether it is active, future, implemented, deferred, rejected,
  or superseded.
- Migrate completed plans to `docs/archive/plans/unreleased/` or the matching
  `docs/archive/plans/v<version>/` directory.
- Migrate deferred, rejected, and superseded plans to
  `docs/archive/plans/unshipped/`.
- Classify historical bug reports, audits, and investigations and move
  chronological records to `docs/archive/investigations/<YYYY>/` when that is
  their correct long-term role.
- Resolve the three documents currently cataloged as legacy archive-root files.
- Review development and test-coverage documents that appear to be completed
  plans or historical audits rather than current guidance.
- Add or normalize lifecycle frontmatter on archived plans.
- Update all affected Markdown links, instruction references, changelog links,
  and indexes.
- Refresh the archive catalog after every move.
- Extract a durable architectural decision into `docs/decisions/NNNN-<slug>.md`
  only when the source records a lasting decision that still governs the code.

### Excluded

- Plugin source-code or behavior changes.
- Implementing any active plan, including refresh scheduling or refresh status.
- Rewriting public release notes solely for style.
- Deleting historical records because they are old, incomplete, or redundant.
- Guessing issue links, pull requests, commits, completion dates, or release
  versions.
- Reorganizing non-Markdown assets unless a verified link repair requires it.

## Classification Rules

Use the document's purpose and current truth, not its existing directory name.

| Kind                                     | Canonical location                    | Rule                                                   |
| ---------------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| Active or future implementation plan     | `docs/plans/`                         | Work remains intentionally actionable                  |
| Implemented and validated, unreleased    | `docs/archive/plans/unreleased/`      | Required validation passed but no release contains it  |
| Released implementation plan             | `docs/archive/plans/v<version>/`      | Group by the first release containing the behavior     |
| Deferred, rejected, or superseded plan   | `docs/archive/plans/unshipped/`       | Preserve the decision and replacement link             |
| Investigation, incident, or bug analysis | `docs/archive/investigations/<YYYY>/` | Group by the record's meaningful event/completion year |
| Durable current guidance                 | Existing topical`docs/` area          | Keep where developers will consult it                  |
| Durable architectural decision           | `docs/decisions/`                     | Record status and replacement instead of archiving it  |
| Public release summary                   | `docs/releases/<version>.md`          | Do not merge into implementation-plan archives         |

When evidence is insufficient, leave the file in place, add it to the archive
catalog's unresolved section, and record exactly which metadata could not be
established. Ambiguity is not permission to infer a release or completion date.

## Execution Plan

### 1. Establish a Safe Baseline

- Read `AGENTS.md`, `.instructions.md`, `.agents/project-context.md`, and the
  canonical plan-lifecycle section before changing files.
- Run `git status --short` and preserve all unrelated user changes.
- Capture the complete Markdown inventory with `rg --files docs -g "*.md"`.
- Create a working classification table containing current path, document kind,
  status, evidence, destination, and links that may need repair.

### 2. Resolve Status from Evidence

- Read each candidate document in full.
- Search `CHANGELOG.md`, `docs/releases/`, issue references, and relevant Git
  history for implementation and release evidence.
- Compare implementation claims with the current repository only when needed to
  distinguish active from completed work; do not modify code.
- Treat filenames such as `plan`, `audit`, `fix`, or a version number as hints,
  not proof.
- Record unresolved cases explicitly instead of forcing every file to move.

### 3. Normalize Active Plans

- Keep genuinely active and future work under `docs/plans/`.
- Replace the legacy `docs/plans/Future/` distinction with metadata or a clearly
  documented convention if the canonical lifecycle does not require that
  subdirectory.
- Give active plan filenames concise kebab-case names where renaming materially
  improves navigation; repair all inbound links in the same change.
- Add minimal active-plan metadata consistently without inventing ownership,
  issue, or implementation values.

### 4. Migrate Historical Documents

- Create only the archive directories required by verified classifications.
- Add the canonical archive frontmatter before moving each plan.
- Move implemented plans to the correct unreleased or version directory.
- Move unshipped plans and chronological investigations to their respective
  directories.
- Resolve the legacy archive-root documents individually and remove the
  `Legacy Root Documents` section only when no unresolved root documents remain.
- Preserve original prose. Add a short archival note only when needed to explain
  status, provenance, limitations, or a superseding document.

### 5. Repair Navigation and References

- Search the entire repository for every old path and filename before and after
  each batch of moves.
- Update relative Markdown links, `AGENTS.md`, developer READMEs, changelog
  references, release notes, and skill instructions when affected.
- Update `docs/archive/README.md` with status, completion date, release, issue,
  and implementation links when known.
- Keep `docs/development/README.md` as the single source of truth for lifecycle
  policy; other documents should link to it rather than restating the policy.
- Prefer small, durable indexes over manually duplicating the full docs tree in
  several files.

### 6. Validate the Migration

- Run an automated local Markdown-link check that handles spaces, anchors, and
  repository-relative paths.
- Use `rg` to confirm that no old moved paths remain.
- Check required frontmatter fields and allowed status values for every archived
  plan.
- Run `git diff --check`.
- Inspect `git diff --stat` and representative renames to confirm content was not
  silently lost or rewritten.
- Run `git status --short` and remove only verified artifacts created by the
  validation commands.
- Application lint, type-check, platform checks, unit tests, and build are not
  required if the migration changes Markdown only. If any application file is
  changed, follow the repository's complete validation requirements for that
  file type.

## Acceptance Criteria

- Every Markdown file under `docs/` appears in the audit inventory and has a
  recorded classification or an explicit unresolved reason.
- `docs/plans/` contains only active or intentionally future work.
- Implemented, released, unshipped, and investigative records use the canonical
  directory model.
- No legacy file remains directly under `docs/archive/` unless it is explicitly
  cataloged as unresolved with the missing evidence identified.
- Archived plans contain accurate lifecycle frontmatter; unknown metadata is
  empty or documented, never fabricated.
- Superseded plans link to their replacements when one exists.
- The archive catalog and developer documentation reflect the resulting tree.
- All changed local Markdown links and anchors resolve.
- Repository searches find no stale references to moved paths.
- No historical content is deleted, and unrelated worktree changes are
  preserved.
- Final handoff lists moved and unresolved documents and reports every validation
  result, including exact reasons for any check that could not run.

## Risks and Mitigations

- **Incorrect historical classification:** require corroborating evidence from
  the document, changelog/releases, or Git history; leave uncertain items
  unresolved.
- **Broken inbound links:** search globally before moves and run a link checker
  afterward.
- **Noisy rename diff:** migrate in coherent batches and avoid prose rewrites in
  the same pass.
- **Duplicate policy:** keep lifecycle rules canonical in the development README
  and link to them elsewhere.
- **Accidental scope expansion:** treat code findings as follow-up issues or
  plans, not authorization to change plugin behavior.

## Handoff Record

- **Inventory:** 2026-08-16; 72 Markdown documents classified in
  [`docs/archive/document-inventory.md`](../../document-inventory.md).
- **Completed migration batches:** normalized active-plan metadata and removed
  the legacy `Future/` split; moved seven implemented plans to release or
  unreleased archives; moved one deferred plan to `unshipped`; moved historical
  audits, bug reports, and research records to `investigations/2026`.
- **Unresolved evidence:** none. `main-ts-refactor.md` remains an active
  in-progress plan because its own record still has incomplete work; unknown
  issue and implementation fields on archival records remain empty.
- **Validation:** local Markdown link and anchor check passed for all 72 docs;
  archived-plan frontmatter check passed for all eight pre-existing archived
  plans; moved-path search found no stale references.
- **Catalog:** `docs/archive/README.md` and this inventory now reflect the
  resulting archive tree.
- **Implementation:** commit and pull-request references are added when they
  exist; no value is invented before that point.
