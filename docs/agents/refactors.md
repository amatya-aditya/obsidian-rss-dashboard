# Refactors (#436)

Moved from `AGENTS.md`; read this in full before extracting.

A refactor ticket uses `.github/ISSUE_TEMPLATE/refactor.md` and a
`refactor/<issue>-<slug>` branch. Before extracting, read
`docs/development/architecture.md`: **Refactor Commits** holds the commit
mechanics, beside the suppression, ratchet, and characterization-test rules.

1. A refactor preserves behavior exactly. A bug found along the way gets its
   own issue: labels `bug`, `status: blocked`, and an `area:` label; sections
   Summary, Reproduce, Cause, and Fix direction; and "Blocked by #436" (see
   #468). The refactor PR links it and leaves the bug in place.
2. Characterization tests come first: pin current behavior, bugs included
   (`// BUG: pinned, see #<issue>`), and see them green on untouched code.
3. Characterization tests stay read-only during the extraction.
4. Read the target file and every importer before extracting.
5. One extraction per session and per PR. When tests go red, revert and cut a
   smaller slice.
6. Two commits, each one building and passing the gates: move only, then
   wiring.
7. Public plugin methods stay as one-line delegates (the facade) until a
   separate ticket moves their callers.
8. Only the plugin calls `registerEvent`, `registerInterval`, and
   `registerDomEvent`. Services return disposers or receive a register
   callback.
9. Preserve `onload` order, `this` binding for callbacks, and
   async/debounce/watcher-suppression timing exactly.
10. Report the raw `vitest` summary line and `git diff --stat`.
11. Test manually in the fixture vault, following **Testing a refactor** in
    `docs/development/fixture-vault.md`. Run the ticket's scoped checklist,
    including its extra checks, and verify the files on disk as well as the UI.
