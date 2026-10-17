# Executing a test checklist

Shared reference for `/test-drive` and `/test-drive-and-fix`: how to drive each
item, capture evidence that stands on its own, and report it. Read
`test-scenarios.md` first for how the list is built.

## Pick the lightest route

For each item choose the cheapest route that exercises the real thing:

- **Script/CLI**: commands, a REPL snippet, reading a written file.
- **Browser pane**: web UIs and dev servers.
- **CDP**: a native Electron app already running with a debug port (Obsidian):
  read the DOM, click, and screenshot through the repo's CDP helper
  (`scripts/obsidian-cdp.mjs`; see `docs/development/fixture-vault.md`). Probe
  the common ports 9222, 9333, 9334; launch the app with
  `--remote-debugging-port=<port>` and a disposable `--user-data-dir`.
  Several sessions can share the machine, so guard against attaching to
  another session's window (**Guard the session you attach to** in
  `docs/development/fixture-vault.md`): give this run its own port and
  profile (for example `$env:TEMP\rss-dashboard-cdp-profile-$PID`), and pass
  `--profile <dir>` and `--expect-vault <path>` on every harness call so it
  refuses, with a non-zero exit, unless the attached window is your vault. A
  refusal means another session owns that window: never attach to it, close
  it, or kill it. Kill only your own instance, matched by its
  `--user-data-dir`, never Obsidian as a whole.
- **Computer use**: real mouse/keyboard, drag, native chrome, or OS dialogs.
  Needs a computer-control capability (Codex `computer`, Claude computer use);
  request `request_access` for every app up front.
- **Out of reach**: a real phone, a second synced device, hardware. Mark it
  now so it lands in the hand-off list instead of silently vanishing.

Pick the lightest route that can observe the behaviour and escalate only when
it cannot: script/CLI, then CDP for a running native app, then full computer
control only when the behaviour needs real input, native chrome, or pixel-level
layout. A CDP screenshot beats a clicked-through run when the only question is
what the UI shows.

## Set up a sandbox

Every item runs in a **sandbox**: a disposable vault, profile, or dataset where
destructive actions cost nothing. Check memory for a known test environment;
when none is known, ask once, then save the answer to memory. Seed it with
enough data to hit each item's zero/one/many case, rebuild the project, and
load the build into it (for Obsidian: copy the build into the test vault's
plugin folder, reload the plugin, and launch with a debug port and a disposable
`--user-data-dir` so the CDP route works). Real user data is touched only with
the user's explicit go-ahead in chat and after a backup.

**Clean the window once the vault is open.** Run `prepare-vault` (see **Prepare
the window** in `docs/development/fixture-vault.md`) to close the vault picker
and the Settings window enabling plugins opens, and to collapse the side panes,
so only the vault shows. Pass `--keep-settings` only when the item under test is
a settings feature, and `--keep-left` only when it drives the file explorer.

**Promote reusable data.** When an item needs new sandbox data (a fixture, a
seed record, an edge case), decide once: if it is durable and cheap, **promote**
it into the repo's fixture generator and template (and its scenario docs) so the
next tester reuses it; if it is one-off, heavy, or network-bound, build it in a
disposable copy and leave nothing behind. Hand-edits that live only in the
disposable working copy are invisible to the next run.

**Never dirty the change under test.** Building is fine; the working tree stays
clear of edits to the change. Build into the sandbox and leave the checkout as
you found it, so a read-only run (`/test-drive`) genuinely changes nothing.

## Run each item

Work top to bottom. Each item ends in exactly one terminal status:

| Status     | Meaning                                              |
| ---------- | ---------------------------------------------------- |
| ✅ Pass    | Observed the expected result; evidence captured      |
| 🔧 Fixed   | Failed, fixed, re-run, now passes                    |
| 🔴 Open    | Failed; fix blocked or out of scope, with the reason |
| ❓ Parked  | Needs a user decision                                |
| ⏭ Hand-off | Out of reach for you; the user must check it         |

A read-only run has no 🔧: a failure is 🔴 or ❓. A run with write authority
(`/test-drive-and-fix`) may use all five. A read-only run may also sit an item
out as not applicable to the change; say why.

**Evidence** is what you observed, not what you expected: a screenshot for
visual items, the exact text or output for the rest. Take a fresh screenshot
after every state-changing action and read it before judging, because UI
settles asynchronously. Post a one-line status per item as you finish it.

**Before/after pairs.** For every item with a visible UI effect, capture a
**before** screenshot on the base build (the branch's merge-base with its
target, for example `origin/dev`) and an **after** screenshot on the branch
build, at the same viewport, theme, and UI state, so the pair compares like
with like. Shoot all the befores first, then load the branch build and shoot
the afters. Save them outside the vault and outside tracked files, as
`<repo>/.agent/test-evidence/<branch>/<NN>-<slug>-before.png` and
`...-after.png` (`.agent/` is gitignored). When a before cannot exist (a brand
new control with no prior state), take the after alone and say why.

Frame the change, not the page. Scroll, expand (for example a textarea's
`rows`), or crop until the exact lines or elements that changed are in view.
Before reporting a pair, open both images and confirm they visibly differ where
the change is. A pair that looks identical is not evidence: reframe and reshoot.
When the change lives in a file (a saved note, written config), also save the
before and after text next to the screenshots and report their diff.

## Report

Done when every item has a terminal status and the sandbox is left in a known
state. Then report:

1. The sandbox that was tested, first line of the report: the full absolute
   path of the vault (or profile/dataset) and the build identifier loaded into
   it (for example the status-bar build stamp). Say whether it is still on disk
   and what state it was left in. Always include this, even when the path was
   already mentioned earlier in the run.
2. The checklist with final statuses and one line of evidence each.
3. Before/after screenshots: for each visual item, the absolute paths of the
   before and after PNGs side by side, with one line saying what changed. Send
   the pairs to the user (`SendUserFile`, or attach them) so they can validate
   at a glance without opening the vault.
4. ⏭ Hand-off items the user must check themselves, as checkboxes.

A run with write authority also appends its findings in the repo's bug report
format, its parked decisions, and the commits it made; see the skill you are
running for those.
