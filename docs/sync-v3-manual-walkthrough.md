# Sync V3 manual walkthrough

> Obsidian Sync is a paid Obsidian subscription feature. Obsidian does not publish a
> public sync API and has stated it discourages third-party sync clients, since it
> cannot quality-control the undefined behavior they might cause ([Obsidian forum,
> July 2025](https://forum.obsidian.md/t/sync-api-way-to-access-syncd-data/25371/20)).
> RSS Dashboard supports Obsidian Sync and does its best to accommodate third-party
> sync tools (Syncthing, iCloud, etc.), but neither is officially supported by
> Obsidian, and V3's design assumptions (device-owned files, no completion signal)
> are validated against Obsidian Sync specifically.

On a new device, use the first-run storage choice: choose local V2 storage for one-device use, or choose Sync V3. To review the same choices later, open **Settings → RSS Dashboard → General → Show startup wizard**. For Sync V3, choose **first device** only on the device that will create the shared set. Choose **additional device** everywhere else; it waits locally and never seeds an empty shared set. Reopened setup asks for confirmation before it changes this device's storage mode.

1. Update RSS Dashboard on every device that will share the dashboard.
2. On the device containing the authoritative feeds and read state, open **Settings → RSS Dashboard → Storage**.
3. Confirm Obsidian Sync is enabled for **all other types** and that `rss-dashboard-data` is not excluded.
4. **On every device**, open Obsidian's own **Settings → Sync → Conflict resolution** and select **Create conflict file**, not **Automatically merge**. This setting is per-device and does not travel with Obsidian Sync's settings sync — it must be checked on each device individually. V3's shared files are JSON: "Automatically merge" performs a text-level merge that can silently corrupt them, where "Create conflict file" instead preserves both full versions as a separate `*.sync-conflict-<timestamp>.json` file that Sync v3's diagnostics can detect and recover from.
5. Export a portable backup from the legacy recovery controls before migration. V2 files are left in place, but the backup is an additional recovery point.
6. Select **Create V3 sync set from this device**. Wait until the V3 health line reports `ready` and one replica.
7. On each other device, wait for Obsidian Sync to deliver `rss-dashboard-data/sync-v3`, then select **Join existing V3 sync set**. Do not use the second device to create a new V3 set.
8. Check the health line: it should show the shared folder, the current epoch, a unique device ID, the expected replica count, no invalid replicas, and no sync conflict copies.
9. On device A, mark a test article read. On device B, let the replica arrive and reopen/refresh the dashboard view; it should become read. Mark it unread on B and verify it becomes unread on A.
10. Refresh feeds on both devices. Refresh only updates `.rss-dashboard-cache-v3`; it must not change the shared config log or state buckets.
11. Delete a temporary feed and verify it remains absent on the other device. Re-add it deliberately as a new feed if needed.

If the health line reports degraded status or lists any sync conflict copies, stop migration work and preserve the affected V3 files. Do not run legacy **Repair/rebuild storage** against an active V3 set — use **Export sync v3 health report** (Settings → Storage → Sync v3 recovery) to capture the diagnosis, and **Run sync v3 recovery** to reconcile this device with the current shared set; it always exports a portable backup first and never touches another device's files. You can also return to V2 by using the untouched V2 files and the portable backup; V3 does not automatically delete either.

## Manual test checklist: migration diagnostics and recovery

Scoped to the Phase 4 diagnostics/recovery work (issue #274) — not a full Sync v3 regression pass.

- [ ] Both devices' **Settings → Sync → Conflict resolution** show **Create conflict file**, checked independently on each device (confirm the setting really is per-device and not carried over by Obsidian's settings sync).
- [ ] Trigger an adoption race: on two devices with no existing V3 set, select **Create V3 sync set from this device** on both before either's `epoch.json` has synced to the other. After sync catches up, confirm the health line on the losing device shows `degraded` and lists a `epoch.sync-conflict-*.json` path.
- [ ] **Export sync v3 health report** on a `ready` device — confirm the exported JSON includes `epochId`, an empty `conflictCopyPaths`, and matches the on-screen health line.
- [ ] **Export sync v3 health report** on the degraded device from the adoption-race scenario above — confirm the report lists the conflict-copy path and `health: "degraded"`.
- [ ] **Run sync v3 recovery** on the degraded (losing) device — confirm it prompts for and performs a portable backup export before doing anything else, then re-adopts the winning epoch (health becomes `ready`, replica count reflects the current set).
- [ ] After recovery, confirm the *other* device's replica and epoch files are untouched (recovery never writes to another device's replica folder).
- [ ] **Run sync v3 recovery** on an already-`ready` device with no issues — confirm it re-hydrates without error and reports `rehydrated` rather than `rejoined-current-epoch`.
- [ ] Manually create a stray `*.sync-conflict-*.json` file under `rss-dashboard-data/sync-v3/replicas/<device>/` (simulating Obsidian Sync) — confirm the health line and exported report both detect and list it.
- [ ] Confirm the storage tab's Sync v3 status line surfaces the "check every device's Conflict resolution setting" guidance whenever any conflict copy is present.
