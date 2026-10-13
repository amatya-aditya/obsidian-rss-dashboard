---
name: test-drive
description: Drive the real app to verify someone else's change, capture evidence, and report failures as a change request. Reads only; never edits, commits, or pushes.
disable-model-invocation: true
---

# Test Drive

You take over the machine and **run** the checklist yourself — toward a verdict,
not a fix. This is the read-only sibling of `/test-drive-and-fix`: it exists for
a change you did not write (a contributor's PR, a branch under review), so the
deliverable is a **change request** backed by evidence, not commits. Run it
after `/code-review` when the static read left behaviour questions open. (For
the same run with permission to fix, the user invokes `/test-drive-and-fix`; for
a list the user clicks through by hand, `/manual-test-checklist`.)

## 1. Read-only contract

- Do not edit, format, refactor, commit, or push anything. Not even a typo.
- Do not post a review or comment. Prepare the body; post it only when asked.
- You still **build** the change into the sandbox — building is not editing.
- If a failure's cause is obvious, describe the fix and point at the exact
  lines; do not apply it.

## 2. Build the checklist

Read `docs/development/test_coverage/test-scenarios.md` in full and build the
scenario list from it. For each item add the **route** you will drive it
through, from the lightest-route ladder in the execution reference. Print the
numbered checklist with routes before starting. Done when every item has
action → expected result → route.

## 3. Run it

Read `docs/development/test_coverage/test-execution.md` in full for the routes,
sandbox setup, evidence rules, statuses, and report format, and follow it. With
no write authority there is no 🔧 Fixed; a failure is 🔴 Open or ❓ Parked.

## 4. Report as a change request

Verdict each item with the vocabulary `/code-review` uses, mapped onto the
execution statuses so the two agree:

| Verdict        | Status | Meaning                                                                                                                              |
| -------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| PASS           | ✅     | Observed the expected result; evidence captured                                                                                      |
| FAIL           | 🔴     | Observed the wrong result, or the app errored                                                                                        |
| UNVERIFIED     | ❓     | Could not exercise it (setup, environment, a hand-off item only the owner can check, or a genuine ambiguity you cannot settle alone) |
| NOT_APPLICABLE | ⏭      | The item does not apply to this change; say why                                                                                      |

Follow the report format in the execution reference, with two changes:

- Each **FAIL** carries a minimal reproduction — steps, the build it was seen
  on, observed vs expected — written so it can be pasted into a
  request-changes comment verbatim, with its evidence attached.
- Replace the parked-decision section with the UNVERIFIED and NOT_APPLICABLE
  items, each naming the question the owner still has to answer.

The result reads as one review: a summary verdict, the itemised table, the FAIL
reproductions with evidence, then what remains unverified. Offer to post it
(`gh pr review`, or hand the body to the `/pr` skill) — and stop there.
