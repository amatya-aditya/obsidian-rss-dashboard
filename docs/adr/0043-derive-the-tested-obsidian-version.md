# ADR 0043: The test harness derives the app version it tests; it never pins one

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

Decided in
[#1787](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1787),
which carries the implementation.

## Date

2026-11-11

## Context and problem

The first `/orchestrate` run, on #732, produced evidence that was valid for
Obsidian **1.14.4** while the maintainer's app ran **1.15.0**. Nothing in the run
said so, and nothing could have: the harness recorded whatever version happened
to boot.

The mechanism is Obsidian's, not the repository's. `Obsidian.exe` on the
maintainer's machine reports `ProductVersion` 1.14.4 permanently. Obsidian ships
updates as a downloaded app archive — `%APPDATA%\obsidian\obsidian-1.15.0.asar`,
24,553,884 bytes, logged as `Loaded updated app ...` at the next launch — and a
disposable `--user-data-dir` has no such archive. So a fresh profile boots
`resources\obsidian.asar` from the installer, and:

```text
%TEMP%\opencode\obsidian-profile-732\obsidian.log
  2026-11-11 18:06:12 Loaded main app package C:\Program Files\Obsidian\resources\obsidian.asar
  2026-11-11 18:06:15 Update complete.
```

The update arrived during the session and took effect only at the next launch,
which never happened. A whole drive ran on the wrong build, and every checklist
item was recorded as if it were current.

The same run exposed a second instance of the same defect class: the harness did
not know what viewport it had tested either. Two "desktop" captures measured
1023×800 and 1499×1000 CSS px at devicePixelRatio 2 — the first one pixel inside
the stylesheet's `max-width: 1024px` group, the second in the `1400-1600` band.
The documentation already told testers to "set the window to desktop width", in
prose, with no command; the tester hand-wrote CDP scripts to satisfy it.

A literal version would have fixed neither problem for long. Obsidian releases
often enough that a pinned number in a script is stale within weeks, and it
asserts a build the machine may not have.

## Decision

**The expected version is derived, never written down.** The harness resolves it
in order: an explicit `--expect-version` (release-gate runs only), the archive the
profile will load, the newest archive on this machine, the installer's archive.
A version in prose is an observation with a date attached; a version in a script
is a claim that expires.

**Priming is a file copy of something Obsidian already fetched.** `prime` copies
the newest local `obsidian-<version>.asar` into the profile, offline. Downloading
is opt-in (`--fetch`) and documented as unverified-signature, because only
Obsidian's own updater checks hash and signature. Nothing is fetched silently,
and neither `fixture:vault` nor CI may fetch.

**Identity is checked from three independent signals, and they must agree.**
Intent is the archive's own root `package.json`; what loaded is the
`Loaded ... app` line in the profile's `obsidian.log`; what runs is the renderer
(`app.version` when a build exposes it, else the window title). The plugin's
`minAppVersion` is a fourth, independent floor.

**Older than expected fails; newer only warns.** Running an older build than
intended is exactly the failure above and must stop a drive. A newer build means
a local archive moved ahead, which is not a false claim.

**A stated canvas is part of a test, not an accident of launch.** `viewport`
sets a named size and prints `innerWidth×innerHeight @ devicePixelRatio`, the
layout band, and whether the width sits on a breakpoint. The default desktop
canvas is 1440×900, deliberately inside the `1400-1600` band. Real window bounds
are preferred; emulation is the fallback for a band the display cannot host, and
only inside the connection that captures.

## Consequences

### Benefits

- Evidence names the build and the canvas it was captured on, so a reader can
  tell what was exercised without re-running anything.
- The #732 failure becomes a non-zero exit before the first checklist item, with
  both versions named and the remedy stated.
- No version literal exists to go stale in a script, a skill or a doc.
- The harness reuses `check-stub-drift.mjs`'s release resolution and
  `@electron/asar`, so the canary and the drive cannot disagree about what a
  version is.
- `doctor` exits 0 with no Obsidian running, so it costs nothing to run first.

### Trade-offs

- The expectation is local, not authoritative: a machine whose newest archive is
  months old reports that archive as the expectation. Only `--latest` (and the
  weekly canary, which files the update issue) speaks to public freshness.
- Priming copies 24 MB per profile. Cheap beside an hour of wrong evidence, but
  still real disk churn for parallel worktrees.
- A harness that downloads an archive it then executes is a supply-chain
  decision. It is why `--fetch` is consent-gated, and why the docs say the
  signature is not verified.
- The canvas rule adds a line of output to every row. Rows without it are
  declared incomplete, which will read as pedantic until it catches the next
  1023px capture.

### Existing users and data

Nothing user-facing changes; this is repository test tooling. No plugin code,
stored data, or `minAppVersion` changes, and there is no `CHANGELOG.md` entry.

## Considered options

### Pin a version in the harness

Rejected. It is what the retrospective proposed first, and it goes stale within
weeks while asserting a build the maintainer may not run.

### Record the running version and never compare

Rejected. This is the status quo that let an entire drive run on the wrong
build. Recording without comparing turns a silent failure into a documented one,
not into a caught one.

### Always compare against the newest public release

Rejected as the default. It needs network, and it forces a build the machine does
not have. Kept behind `--latest`, which reports and never downloads or fails.

### Download the archive automatically when none is local

Rejected. `check-stub-drift.mjs` may download that asset because it only reads
strings out of it; priming executes it, and only Obsidian's updater verifies the
signature.

### Tell testers to maximise the window

Rejected as the requirement, kept as a mechanism. A maximised 1366-px laptop
still misses the `1400-1600` band, and fullscreen hides OS chrome without making
the band any more predictable.

### Adopt the official `obsidian` CLI now

Deferred. The CLI (1.12.4+) covers `eval`, `vault:open` and `plugin:reload`, but
our CDP route also reaches Android's WebView and needs no CLI socket or Settings
toggle. Documented beside the IPC route, with a follow-up spike.

## Historical precedent

- [`chhoumann/obsidian-e2e`](https://github.com/chhoumann/obsidian-e2e) ships a
  runner whose version guard reads cached `obsidian-*.asar` files from the
  Obsidian config directory plus the installer's `resources/obsidian.asar`,
  refuses below `minAppVersion`, and hard-fails reuse when Obsidian updated
  mid-session. Same two sources, no pinned literal.
- [ADR 0014](0014-obsidian-test-stub-fidelity.md) already treats a recorded
  release as a reference observation rather than a pin.

## Implementation notes

- `scripts/obsidian-release.mjs` holds release selection, asar version reads and
  local archive discovery; `check-stub-drift.mjs` re-exports the names it
  already published, so its callers are unchanged.
- `scripts/obsidian-profile.mjs` owns `prime`, `version` and `doctor`; the
  read-only `version` and `viewport` commands stay in `scripts/obsidian-cdp.mjs`,
  which only attaches to a running app.
- `npm run fixture:doctor` is the passive default: files, the log, and the
  fixture build hashes, with no window touched.
- `--allow-version-mismatch` downgrades a version failure to a warning and says
  so in the output, so a hard rule cannot strand whoever hits it.

## Related

- [GitHub Issue #1787](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1787) - the plan of record
- [ADR 0014](0014-obsidian-test-stub-fidelity.md) - the recorded reference release and its drift check
- [ADR 0023](0023-set-the-3-0-support-floor-at-obsidian-1-11-5.md) - the support floor the `minAppVersion` check reads
- [Fixture vault](../development/fixture-vault.md) - the route this decision documents
- [ADR Policy](POLICY.md)
