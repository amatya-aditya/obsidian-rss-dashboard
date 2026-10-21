# Real Sync Runbook

This runbook is for a [Real Sync pass](../../CONTEXT.md): an approved,
attended test of the plugin against real Obsidian Sync, in the maintainer's real
vault, with a second local vault ([Device B](../../CONTEXT.md)) on the same
Sync remote. It exists because no mock can show Sync's real merge, timing,
conflict files, or event delivery. The reasoning and the accepted risk are in
[ADR 0035](../adr/0035-test-real-obsidian-sync-in-the-real-vault.md).

Everything else about the fixture vault, including the disposable profile every
other CDP session uses, is in [Fixture Vault for Manual Testing](./fixture-vault.md).
A Real Sync pass is the one documented exception to the disposable-profile rule
there.

Nothing here is automated. The maintainer is present for every pass, and
no pass runs in CI or on a schedule.

## Who does what

| Maintainer                                                                | The agent (over CDP)                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Launches and closes the real-profile Obsidian instance                    | Never launches or closes it                                                 |
| Signs in to Sync, on Device B, once                                       | Never opens sign-in or account UI, never enters credentials                 |
| Approves each run, naming scenarios, files and whether Sync is paused     | Does nothing until the approval is given in chat                            |
| Turns on "Create conflict file" in Device B when a scenario needs it      | Never changes that setting or any other                                     |
| Decides when to restore, and confirms Sync is paused on both devices      | Runs the restore only after that confirmation                               |
| Keeps the real vault path out of every committed file, comment and commit | Reads the path from an environment variable and never prints it into a file |

## Allowed and forbidden CDP actions

The agent attaches to the maintainer's real, signed-in profile. That is a sensitive
session, so its actions are bounded.

**Allowed**

- Read the Sync activity log.
- Read vault and plugin state: files, `adapter.stat` size and mtime, plugin
  settings in memory, the plugin's storage folders.
- Install a temporary, in-memory event logger on the vault and workspace, and
  remove it afterwards. It writes nothing to disk and does not survive a reload.
- Run plugin commands, such as reload and refresh.
- **Pause or resume Sync** in the Sync pane, and nothing else in that pane.

**Forbidden, with no exceptions**

- Changing any other Obsidian, Sync, or account setting. That includes the
  "Create conflict file" switch, the Sync folder and plugin toggles, and the
  selective-sync options.
- Opening sign-in or account UI, or entering any credential.
- Installing anything: plugins, themes, snippets, or tooling.
- Launching or closing the real-profile Obsidian instance.
- Deleting a backup.

If a step would need a forbidden action, stop and ask the maintainer to do it by hand.

## Setup that applies to every run

### The vault path comes from an environment variable

Every call to `scripts/obsidian-cdp.mjs` carries `--expect-vault`, so a call
refuses to run against any window except the vault it names. The real vault
path is supplied through an environment variable and is never typed into a
committed file, a commit message, an issue, a PR, or a ledger entry. Refer to
it in all written output as "the real vault" and to the other as "Device B".

```powershell
# Set in the current shell only. Do not put these in a script, profile, or doc.
$env:RSS_DASHBOARD_VAULT = "<real vault path>"
$env:RSS_DASHBOARD_DEVICE_B = "<device B vault path>"
$env:RSS_DASHBOARD_BACKUP_DEST = "<backup folder outside both vaults>"

node scripts/obsidian-cdp.mjs --expect-vault $env:RSS_DASHBOARD_VAULT targets
```

`obsidian-cdp.mjs` reads `--expect-vault` from `CDP_EXPECT_VAULT`
too, so set that to one of the two paths when a whole session targets a single
window. Before committing anything from a pass, search the diff for the vault
folder name and for `C:\Users` or `/Users` style paths.

### The maintainer launches the instance

The maintainer starts Obsidian on the real profile, with a debug port, and closes
it when the pass ends. The agent can only attach to a running instance. Leave
the port open only while the maintainer has the instance open and the pass is under way.

```powershell
# The maintainer runs this; the agent does not. No --user-data-dir: this is the real profile.
& "$env:LOCALAPPDATA\Obsidian\Obsidian.exe" --remote-debugging-port=9333
```

Because this is the real profile, the disposable-profile commands in the
fixture-vault guide (`--profile`, `prepare-vault`) do not apply to it. Use
`--port`, `--target`, and `--expect-vault` instead.

### Reading "Fully synced" on both sides

Sync gives no completion event, so "Fully synced" is read from the Sync activity
log text, on each device, over CDP. Open the Sync pane's activity log in each
window and read the newest entry:

1. The entry shows today's date and time.
2. The entry says "Fully synced".
3. Both devices show it, and neither has a newer file-transfer line than the
   other. If either side is still transferring, wait and read again.

Do not treat a quiet log as done. Treat the pass step as not yet started until
both sides show the text.

"Fully synced" means Sync is idle on that side. It does not mean the files have
arrived: the same kind of change took about 1 s to about 171 s to land on the
other device while both sides read "Fully synced" (#1430). Treat it as
necessary, never sufficient. A step that waits for a delivery waits for the
expected file bytes: read the file on the receiving side, from disk (Device B is
on the same PC) or over CDP, and compare its size and SHA-256 with the sending
side's file, or with the backup manifest for a restore. Read again until they
match; the log text alone ends no wait.

## Backup and restore

Write these steps down and rehearse them before the first run. Take a verified backup before the first run, before Device B setup, and before
every run that writes. A backup copies the plugin folder, the metadata folder and
the shard folder to a dated folder outside the vault and the vault of Device B,
which Sync never touches. It writes a manifest of path, size and SHA-256 per
file, then re-hashes the copy against the manifest. The script
[`vault-storage-backup.mjs`](../../scripts/vault-storage-backup.mjs) does this
and never deletes a backup.

```powershell
npm run vault:backup -- backup --vault $env:RSS_DASHBOARD_VAULT --dest $env:RSS_DASHBOARD_BACKUP_DEST
```

A backup counts only when the script reports success. A failed or partial
backup is not a backup, so do not start a run on it.

### Restore

Restore is manual and attended by the maintainer. It replaces files that Sync has already
carried to Device B, so Sync must be paused on both devices first.

1. Pause Sync in the real vault, then in Device B. The agent may do this over
   CDP when the maintainer approves. Confirm in each window that Sync shows as paused.
2. Run the restore, naming the dated backup folder:

   ```powershell
   npm run vault:backup -- restore --vault $env:RSS_DASHBOARD_VAULT --backup <dated backup folder> --sync-paused
   ```

3. Wait for the script to report that every restored file matches its manifest
   entry. It reports failure if any file differs, and it refuses to run without
   `--sync-paused`.
4. Resume Sync in the real vault. Wait for "Fully synced" on the real vault
   before resuming it in Device B, so the restored files win rather than being
   merged against stale ones. That text only shows Sync is idle there.
5. After resuming Device B, read its restored files and compare them with the
   manifest, as above. Do not treat Device B as restored on "Fully synced"
   alone.
6. Reload the plugin and check that the feeds are back.

Do a restore drill on a throwaway folder before the first pass, and record it.
The first pass does not start until the drill is recorded.

## Device B setup

Device B is a second local copy of the real vault on the same PC, connected to
the same Sync remote. It lets the agent read both sides over CDP. The maintainer does the
setup, because it needs a sign-in.

1. **Back up first.** Take a verified backup of the real vault as above, before
   anything else.
2. **Create the copy.** The maintainer makes a second local vault folder on the same
   PC and opens it in Obsidian. It becomes the second local copy of the real
   vault by pulling it through Sync, not by copying files.
3. **Connect Sync.** The maintainer signs in and connects this vault to the same Sync
   remote. The agent does not open sign-in UI or enter credentials.
4. **Keep the plugin disabled.** The maintainer leaves RSS Dashboard disabled in Device B.
   Enabling it before the first pull finishes writes empty defaults that Sync
   then treats as authoritative, which can wipe the feeds on every device. This
   is the new-device order in [Syncing](../user/syncing.md).
5. **Wait for the first pull.** Read "Fully synced" on both devices, as above,
   then confirm the pull by reading Device B's `data.json`, `user-state.json` and
   shards and comparing their size and SHA-256 with the real vault's. "Fully
   synced" alone does not show the files arrived.
6. **Enable the plugin.** Only now does the maintainer enable RSS Dashboard in Device B.
7. **Compare storage settings.** Check that the metadata and shard folder paths
   match between the two vaults.

### Targeting both windows over CDP (open question A1)

**Open question A1, to resolve at the first setup:** both vaults open as windows of
one Obsidian instance, so one debug port serves both, and `--expect-vault` tells
them apart.

To confirm it, with both vaults open and the instance launched with a debug
port:

```powershell
node scripts/obsidian-cdp.mjs --port 9333 targets
```

- If the list shows two vault pages, one per vault, A1 holds. Target each window
  with `--expect-vault` set to that window's path. Add `--target <vault name>`
  to pick a page by title.
- If only one vault page shows, or the two share a single target, A1 is wrong.
  Record that here, and the maintainer launches a second instance on a second port, with
  its own `--remote-debugging-port`. Each call then carries `--port` for its own
  instance as well as `--expect-vault`.

Whichever holds, replace this paragraph with the confirmed result and the
Obsidian version when you first run it. Until then A1 is unconfirmed.

## Per-run approval

No run starts without approval from the maintainer, given in chat for that run. Approval
for one run does not carry to the next.

The approval names:

- the **scenarios** to run, for example late shard, `user-state` late, or an
  empty newer `data.json`;
- the **files touched**, by vault-relative path, on the real vault and on
  Device B;
- whether **Sync is paused** for the run, and on which devices.

### Dry run before any write

Before the first write of a run, the agent does a dry run. It prints the vaults
by their role names (real vault, Device B), the folders, and the files the run
would create, change, or delete, and then stops. It writes nothing. The maintainer reads
the list against the approval, and the run proceeds only if they match.

### Pass checklist

1. The maintainer has launched the instance. Both vault windows appear in `targets`.
2. A verified backup exists, taken for this run, and the restore drill is
   recorded.
3. `--expect-vault` and the environment variables are set.
4. Both sides read "Fully synced", and the plugin's storage files on both sides
   match by size and SHA-256. The text only shows Sync is idle.
5. The maintainer has approved the run: scenarios, files, Sync paused or not.
6. The dry run was printed and matches.
7. Run the scenarios. Install the in-memory event logger first, and remove it
   after.
8. Read the Sync activity log and the event logger on both sides. Record the
   Obsidian version, the OS, the date, and what each side saw.
9. Verify the plugin's data on both sides against what the scenario should
   produce. Then the maintainer decides whether to restore; after a scenario
   that writes real data, restore and verify again against the manifest.
10. Search the diff and the notes for the real vault path before committing
    anything.
11. The maintainer closes the instance.

Record results in the probe ledger, with the Obsidian version and the date. A
result that contradicts a stub or preset is fed back as a change to it. A bug a
pass reveals gets its own `bug` issue.

## The never-list

These hold on every run, whatever the approval says:

- No credentials, and no sign-in or account UI.
- No CI, scheduled, or otherwise scripted use of this tier. A pass is attended.
- No change to account settings, or to any setting outside pause and resume.
- No deleting a backup.
- No committing a real vault path, in a file, a commit message, a PR, or an
  issue.
- No run without a verified backup taken for it.

## Related

- [ADR 0035 — Test real Obsidian Sync in the real vault](../adr/0035-test-real-obsidian-sync-in-the-real-vault.md)
- [Fixture Vault for Manual Testing](./fixture-vault.md)
- [Syncing](../user/syncing.md)
- [Obsidian Test Stub Probes](../../test_files/stubs/obsidian-console-probes.md)
