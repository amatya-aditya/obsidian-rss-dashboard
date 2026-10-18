---
name: test-drive-and-fix
description: Drive the real app to verify the current work, fix what fails with a regression test and a commit, and park decisions for the user.
disable-model-invocation: true
---

# Test Drive and Fix

You take over the machine and **run** the checklist yourself: drive the real
app, gather evidence, fix what fails, and keep moving. The user is likely away;
you ping them only for decisions and never wait on them. (For a list the user
clicks through by hand, they invoke `/manual-test-checklist`. To run the same
checklist without changing any code, they invoke `/test-drive`.)

## 1. Build the checklist

Read `docs/development/test_coverage/test-scenarios.md` in full and build the
scenario list from it. For each item add the **route** you will drive it
through, from the lightest-route ladder in the execution reference. Print the
numbered checklist with routes before starting, so the user can see the plan if
they are watching. Done when every item has action → expected result → route.

## 2. Run it

Read `docs/development/test_coverage/test-execution.md` in full for the routes,
sandbox setup, evidence rules, statuses, and report format, and follow it. You
hold write authority here, so 🔧 Fixed is available to you.

## 3. Fix what fails

A failure is a bug report in progress. Before touching code:

1. Confirm it is the change under test and not the sandbox (stale build,
   missing seed data, plugin not reloaded). Re-run once after correcting
   the setup.
2. Build a **red** loop at the right seam: a failing regression test that
   reproduces the observed symptom (follow the `diagnosing-bugs` discipline).
3. Fix, watch the test go green, run the repo's required validation, rebuild,
   reload, and re-run the failed item plus every earlier ✅ item that shares
   the code you changed.
4. Commit each fix on its own on the current branch, stating the cause in the
   message. Push only when the user asks.

**Fix in scope**: the bug sits in behavior this diff introduced or touched.
A bug in untouched code gets 🔴 plus a background task chip (`spawn_task`), and
you move on.

## 4. Park decisions, keep moving

A **decision** is anything where the expected result is genuinely ambiguous or
the fix changes product behavior, UX copy, scope, or data: the user's call, not
yours. For each one:

1. Send a push notification (`PushNotification`, loaded via ToolSearch) with
   the item number, the question, and your recommended answer.
2. Mark it ❓ with the options and your recommendation.
3. Continue with the next item. When later items depend on the answer, test
   them under your recommended answer and say so.

When the user answers mid-run, apply it at the next item boundary and re-run
what it affects.

## 5. Report

Done when every item has a terminal status, every 🔧 has a commit and a
regression test, and the sandbox is left in a known state. Follow the report
format in the execution reference, and append:

1. Each bug in the repo's bug report format (in `AGENTS.md`/`CLAUDE.md` when
   defined), one per 🔧 and 🔴.
2. ❓ Parked decisions: question, options, recommendation.
3. Commits made, and validation results for the final state.
