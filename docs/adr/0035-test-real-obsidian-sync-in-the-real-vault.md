# ADR 0035: Test real Obsidian Sync in the maintainer's real vault, with CDP on the real profile

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-10-20

## Context and problem

RSS Dashboard's storage is built to survive Obsidian Sync, but how it behaves
under Sync is checked only by hand. Mocks and a local simulator can replay the
order in which files arrive, but they cannot show what Sync itself does: how it
merges two edits of one JSON file, how long a delivery takes, what a conflict
file is called, or which events the plugin receives when Sync writes a file. A
mock that guesses those would only record the guess ([ADR 0014](0014-obsidian-test-stub-fidelity.md)).

Observing real Sync needs a signed-in Obsidian, and an agent cannot sign in
anywhere. It also writes plugin data that Sync then carries to a second device,
so a bad run can wipe feeds on every device.

The fixture-vault guide tells every CDP session to use its own disposable
profile, so an agent never touches a user's real Obsidian. A real-Sync test
cannot follow that rule, because a disposable profile is not signed in.

## Decision

We will test real Obsidian Sync in the maintainer's real vault, with a second
local vault (Device B) on the same Sync remote, and let an agent attach over the
Chrome DevTools Protocol (CDP) to the real, signed-in profile for that purpose
only. This is a documented exception to the disposable-profile rule in
[Fixture Vault for Manual Testing](../development/fixture-vault.md).

The exception is bounded:

- The maintainer launches and closes the real-profile instance. The agent never
  does.
- The agent may read the Sync activity log, read vault and plugin state,
  install a temporary in-memory event logger, run plugin commands, and pause or
  resume Sync. It may never change any other Obsidian, Sync, or account
  setting, open sign-in or account UI, enter credentials, or install anything.
- Every call carries `--expect-vault`, with the real vault path taken from an
  environment variable and never committed.
- Plugin scenarios may run against the maintainer's real plugin data, but only
  after a verified backup. The maintainer accepts that the other device
  receives the changes and that restore is manual.
- Each run needs the maintainer's approval, which names the scenarios, the
  files touched, and whether Sync is paused. A dry run lists everything before
  any write.
- Never: credentials or sign-in, CI or scripted use, account settings, deleting
  a backup, or committing a real vault path.

The steps are in the [Real Sync runbook](../development/real-sync-runbook.md).

## Consequences

### Benefits

- Sync's real merge, timing, conflict files, and event delivery become
  observable, and what is observed corrects the mocks instead of being guessed.
- The agent can read both sides of a sync, so a pass needs less hand
  transcription.
- The risk is stated once, in one place, with the limits that contain it.

### Trade-offs

- An agent is attached to a signed-in profile. The action limits, the
  maintainer launching and closing the instance, and keeping the debug port open
  only while it is attended are what contain that, not technical isolation.
- A bad scenario can change real feeds, and Sync carries the change to the other
  device. The verified backup, restoring with Sync paused, and per-run approval
  make that reversible, not impossible.
- Every pass needs the maintainer present, so it cannot run in CI or on a
  schedule.
- The tier tests the supported sync setup only: Shard storage v2 with visible
  storage and metadata folders.

### Existing users and data

No user's data is touched. The tier uses the maintainer's own vault, and ships
no plugin behavior. Nothing in this decision changes the plugin, its storage, or
its settings.

## Considered options

### Option A — Mocks and a local simulator only

Replay arrival orders against the plugin through a stub and a script. This is
safe, repeatable, and runs anywhere. It cannot show Sync's real merge, timing,
conflict naming, or event delivery, and modeling Sync's merge inside the mocks
would only encode a guess. It stays as the base tier. It is not enough alone.

### Option B — A throwaway folder inside the real vault

Run Sync probes against a scratch folder, so the plugin's real data is never at
risk. This works for probing Sync itself. It does not work for plugin scenarios,
because the plugin's storage folder is one global setting and cannot be
confined to a scratch folder.

### Option C — A disposable profile signed in to a test account

Keeps the disposable-profile rule intact. It would need a separate Sync account
and sign-in, and credentials the agent cannot handle, so the maintainer would do
that setup anyway while the result would still not be the real vault's
behavior.

### Option D — Real vault, Device B, real-profile CDP (chosen)

The only option that observes real Sync against real plugin data. It accepts a
bounded exception to the disposable-profile rule and a recoverable risk to real
data, in exchange for evidence the others cannot give.

## Implementation notes

- The backup and restore steps use [`vault-storage-backup.mjs`](../../scripts/vault-storage-backup.mjs).
  A backup is verified against a SHA-256 manifest, restore requires Sync to be
  confirmed paused, and the script never deletes a backup.
- `scripts/obsidian-cdp.mjs` is unchanged. This decision adds no automation of
  Sync and no credential handling.

## Related

- [Real Sync runbook](../development/real-sync-runbook.md)
- [Fixture Vault for Manual Testing](../development/fixture-vault.md)
- [ADR 0014 — Obsidian test stub fidelity](0014-obsidian-test-stub-fidelity.md)
- [ADR 0028 — Plan lives in its issue body](0028-plan-lives-in-its-issue-body.md)
- [GitHub Issue #1401 — Simulate Obsidian Sync for fixture-vault testing](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1401)
- [GitHub Issue #1428 — Write the Real Sync runbook and ADR](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/1428)
