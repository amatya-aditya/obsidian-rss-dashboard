# Artifact contracts

Markdown is the interchange format. Add fields only when the task needs them. These contracts apply whenever a skill creates, transforms, implements, or reviews an artifact.

## Identity and authority

Each workstream has a namespace (for example `EXPORT`) and a source revision (Git SHA or immutable artifact revision). IDs such as `DEC-001`, `AC-001`, and `TEST-001` are unique within that namespace. Downstream artifacts state the namespace, source location, and source revision. Allocate new IDs monotonically; retain retired IDs with a superseding reference. Never reuse an ID for a different meaning.

The current authorized requirements are authoritative. A newer explicit user correction can supersede a settled decision: record its source, affected IDs, and new revision, then reconcile dependent tickets and evidence. Resolve contradictions with the decision owner; do not silently pick a convenient version. A missing or inaccessible authoritative source blocks dependent conclusions, not unrelated work.

Meaning changes invalidate affected downstream mappings and evidence until reconciled. An artifact snapshot must contain enough applicable contract text to execute offline and a pointer to the full pinned source. A link alone is insufficient if the next agent cannot retrieve it. Copied excerpts are revision-bound snapshots, not competing sources of truth.

## Decision record

| Field             | Meaning                                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| ID                | Stable `DEC-nnn`                                                                     |
| Decision          | Exact settled proposition, assumption, unknown, or exclusion                         |
| Status            | `settled`, `assumption`, `unknown`, `out-of-scope`, or `superseded`                  |
| Rationale         | Why it matters; concise                                                              |
| Source            | User statement, repository evidence, or explicit inference; include locator/revision |
| Affected criteria | AC IDs, or `pending spec` until assigned                                             |

Assumptions do not become settled by being copied. Record unresolved consequential unknowns with an owner or next action. A routine implementation choice can cite repository evidence without prompting the user.

## Acceptance contract

| Field               | Meaning                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------- |
| ID                  | Stable `AC-nnn`                                                                               |
| Requirement         | Observable behavior, including relevant failure and compatibility behavior                    |
| Verification method | What observation can establish the requirement; reference TEST IDs                            |
| Evidence            | Locator, command/inspection, result, environment, code revision or file hash, and limitations |
| Status              | `PASS`, `FAIL`, `UNVERIFIED`, or `NOT_APPLICABLE`                                             |

Initialize status as `UNVERIFIED`. A plan, test name, passing unrelated suite, or implementation summary is not evidence. `PASS` requires evidence covering the entire criterion at the reviewed revision and required boundary. `FAIL` means evidence contradicts it. `UNVERIFIED` means missing, stale, blocked, partial, or insufficient evidence. `NOT_APPLICABLE` needs a sourced scope decision; it cannot hide failed or untested required behavior.

If one criterion contains separable behaviors, keep explicit sub-obligations or split it with traceable replacement IDs. Partial ticket contributions never imply that the parent criterion passes.

## Testing seam

| Field                  | Meaning                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| ID                     | Stable `TEST-nnn`                                                            |
| Behavior               | AC IDs and behavior to observe                                               |
| Boundary               | Public function, process, adapter, persistence, UI, or cross-system boundary |
| Preferred verification | Test/inspection/manual procedure plus inputs and expected observation        |
| Reason                 | Why this boundary can establish the contract                                 |

Record necessary doubles, real dependencies, and conditions when relevant. Preserve a settled boundary through decomposition. Replacing it requires an explicit equivalence argument and, if it changes the settled requirement, authorization recorded in the decision artifact. A convenient mock cannot silently stand in for a required integration boundary.

## Coverage ledger

For every AC in the pinned source, record one disposition: `represented`, `deferred`, or `excluded`. Represented entries name the owning ticket, all contributing tickets, and the integration verifier if work is split. Deferred/excluded entries cite the authorized scope decision and reason; an unapproved proposed deferral remains a blocker.

Verify both directions: every source AC has a disposition, and every ticket obligation maps to source ACs or an explicitly justified enabling task. Carry relevant DEC IDs, constraints, TEST IDs with their definitions, dependencies, and non-goals. Recheck after ticket edits, issue publication, and source corrections.

## Completion and review

A completed unit has evidence for every applicable AC and inherited seam, satisfies constraints and settled decisions, and resolves failures introduced by its change. Required project checks must run or be reported blocked. A deliverable can be handed over with unresolved verification, but must not be labeled complete/verified while required ACs remain `FAIL` or `UNVERIFIED`.

Unit completion is distinct from whole-spec completion. Authorized deferred criteria remain visible at spec level; they are not passes. Cross-ticket integration has an explicit owner and stays unverified until combined behavior is checked.

Reviews state the base and head revisions (or working-tree content identity), relevant source revision, findings, and AC verdicts. Check repository standards and original intent separately. With no defect found but missing evidence, report no confirmed defect plus `UNVERIFIED`; absence of findings is not proof of correctness.
