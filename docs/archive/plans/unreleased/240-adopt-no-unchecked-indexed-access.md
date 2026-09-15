---
status: implemented
created: 2026-09-10
issue: ""
milestone: ""
owner: unassigned
workstream: configuration-alignment
sequence: 1
depends_on:
  - https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/240
release_requirement: ""
implementation: ""
---

# Adopt noUncheckedIndexedAccess and remediate undefined-index access errors

## Scope

Keep `strict: true` and adopt `noUncheckedIndexedAccess: true`. This is not a strict-null migration. Remediate the 260 errors in coherent, tested slices by guarding genuinely optional values, proving presence, or strengthening source contracts; do not use blanket assertions or casts.

## Acceptance criteria

- `npx tsc --noEmit --skipLibCheck --pretty false` passes with strict indexing enabled.
- Representative missing-value behavior has focused regression coverage where an observable seam exists.
- No compiler-policy weakening or broad suppression is introduced.
