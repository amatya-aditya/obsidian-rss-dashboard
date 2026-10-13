---
name: code-review
description: Review a code change or pull request URL against original acceptance contracts and repository standards, with independent evidence and explicit verification gaps.
---

# Code review

Read the fixed review range, original spec/decisions, applicable repository standards, and [artifact contracts](references/shared/contracts.md). If the range or source cannot be established, identify that limitation and withhold affected verdicts.

For a pull request URL, retrieve its metadata and diff through an available tracker integration, establish the base/head, and inspect the linked issue or spec. Review the PR without posting a review or changing it unless asked.

For pre-commit review, include staged, unstaged, and relevant untracked files; identify their content separately from HEAD. A committed-only diff cannot establish a verdict on uncommitted work.

Review the actual change against original ACs, constraints, and testing seams. Treat implementation summaries and passing tests as claims to assess, not substitutes for intent. Inspect whether the evidence observes the required behavior at the required boundary and revision.

Report standards findings separately from intent/acceptance findings. Each actionable finding identifies location, violated contract, concrete trigger or counterexample, impact, and supporting evidence. Use PASS, FAIL, UNVERIFIED, or justified NOT_APPLICABLE for each criterion.

Completion: every applicable AC and constraint is accounted for; the report identifies review revisions, findings, evidence gaps, and any required integration/manual checks. No findings does not establish PASS where evidence is absent. Keep review read-only unless fixes were also requested.

Use the [review template](templates/review.md). Consult [evidence pitfalls](references/evidence.md) for partial tests, stale evidence, and dependency-spanning criteria. Separate sessions or reviewers can improve independence when available; no particular orchestration tool is required.
