# Sync V3 manual walkthrough

On a new device, use the first-run storage choice: choose local V2 storage for one-device use, or choose Sync V3. To review the same choices later, open **Settings â†’ RSS Dashboard â†’ General â†’ Show startup wizard**. For Sync V3, choose **first device** only on the device that will create the shared set. Choose **additional device** everywhere else; it waits locally and never seeds an empty shared set. Reopened setup asks for confirmation before it changes this device's storage mode.

1. Update RSS Dashboard on every device that will share the dashboard.
2. On the device containing the authoritative feeds and read state, open **Settings → RSS Dashboard → Storage**.
3. Confirm Obsidian Sync is enabled for **all other types** and that `rss-dashboard-data` is not excluded.
4. Export a portable backup from the legacy recovery controls before migration. V2 files are left in place, but the backup is an additional recovery point.
5. Select **Create V3 sync set from this device**. Wait until the V3 health line reports `ready` and one replica.
6. On each other device, wait for Obsidian Sync to deliver `rss-dashboard-data/sync-v3`, then select **Join existing V3 sync set**. Do not use the second device to create a new V3 set.
7. Check the health line: it should show the shared folder, a unique device ID, the expected replica count, and no invalid replicas.
8. On device A, mark a test article read. On device B, let the replica arrive and reopen/refresh the dashboard view; it should become read. Mark it unread on B and verify it becomes unread on A.
9. Refresh feeds on both devices. Refresh only updates `.rss-dashboard-cache-v3`; it must not change the shared config log or state buckets.
10. Delete a temporary feed and verify it remains absent on the other device. Re-add it deliberately as a new feed if needed.

If the health line reports degraded status, stop migration work and preserve the affected V3 files. Do not run legacy **Repair/rebuild storage** against an active V3 set. You can return to V2 by using the untouched V2 files and the portable backup; V3 does not automatically delete either.
