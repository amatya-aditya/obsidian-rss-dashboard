---
status: implemented
completed: 2026-09-09
released_in: unreleased
issue: ""
implementation: ""
---

# 10: Fetch additional FreshRSS history safely

**What to build:** Give a user an explicit bounded way to continue importing
older history for one FreshRSS-linked feed after the default bootstrap budget,
without weakening stream-completeness, checkpoint, retention, or pending-state
guarantees.

**Blocked by:** 07: Harden paging, recovery, scope safety, and repair.

**Status:** ready-for-agent

- [ ] **Fetch more history** is available only for an active-scope
      FreshRSS-linked feed whose bootstrap is capped or incomplete.
- [ ] Each invocation extends the selected feed's history by a documented
      bounded budget rather than starting an unbounded cycle.
- [ ] The action enters through the same coordinator, session, data-sync lease,
      paging, retry, reconciliation, persistence, and durable-outcome paths as
      ordinary FreshRSS sync.
- [ ] A capped or interrupted invocation remains partial and cannot clear
      read, starred, or mapped-label state by absence.
- [ ] A fully enumerated stream advances its checkpoint only after every
      required content and local write succeeds.
- [ ] Rerunning after failure safely rereads from the prior complete checkpoint
      without duplicating local articles.
- [ ] Imported older articles immediately follow existing local retention and
      capacity rules; remote absence never deletes a local article.
- [ ] Pending facet mutations remain authoritative for any older article
      discovered during the action.
- [ ] Progress and completion UI identifies the selected feed and reports one
      safe bounded result without exposing remote IDs or secrets.
- [ ] Mocked coordinator and settings tests cover eligibility, repeated bounded
      runs, completion, interruption, retry, local retention, pending overlays,
      and local-only feed exclusion.
- [ ] Focused tests, the broad unit suite, lint, platform checks, type checking,
      the complete build, and final generated-artifact inspection pass.
