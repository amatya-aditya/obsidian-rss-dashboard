# Context hygiene

Keep durable state outside the conversation using the [artifact contracts](contracts.md). Load the current unit, required source excerpts, and relevant repository guidance. Retrieve deeper material when a concrete decision needs it.

Consider compaction or a fresh session at a natural phase boundary, after irrelevant history accumulates, or when decisions are forgotten, contradictions recur, information is repeatedly rediscovered, retrieval fails, or cost rises. Approximately 150k tokens can be a local checkpoint if token usage is visible. It is not a universal cognitive cliff, compulsory reset, or evidence of failure.

Compaction is lossy. Persist and verify the following before handing off:

```text
Task and authorized scope:
Workspace/branch and code revision (include uncommitted changes):
Canonical spec location, namespace, revision:
Applicable AC/DEC/TEST IDs and exact contract excerpts:
Settled constraints; assumptions; consequential unknowns:
Evidence locators, results, environment, limitations:
Failed approaches worth avoiding and why:
Pending work, active agents/tools, integration owner:
Next useful action and escalation trigger:
```

The receiving agent checks source and code identity before trusting old evidence. A summary is an index to durable artifacts, not a substitute for them. If a source cannot be retrieved, state what is missing and keep affected judgments `UNVERIFIED`.

A model switch transfers artifacts and authorization boundaries; it does not transfer a hidden reasoning transcript. Escalate to stronger capability when difficulty exceeds the current route, rather than extending prompts indefinitely.
