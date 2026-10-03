# Syncing Across Devices

RSS Dashboard supports Obsidian Sync and some other third-party sync solutions, but requires
a specific setup order on new devices to prevent feed data from being overwritten.

## Before You Begin: Folder Naming Requirements

For sync to work reliably across devices, two naming rules must be followed in General
Settings → Storage → Storage Mode **as well as** Metadata storage → Metadata data.json location:

- **No dot prefix on folder names.** Folders beginning with `.` are hidden by the
  operating system and ignored by most sync tools. For example, use `rss-dashboard-data`
  not `.rss-dashboard-data`.
- **Folder names must match exactly across all devices.** Your shard storage location
  and your data folder must use identical names on every device you sync to.

## How to Set Up a New Device

Let's assume your desktop PC is your **existing device** and your phone or tablet is
your **new device**.

1. If you already have RSS Dashboard installed on your **new device** (phone/tablet), disable it there before beginning these steps: (Obsidian settings → Community Plugins → RSS Dashboard → Toggle 'Off').
2. If you do not yet have the plugin installed on your **new device**, install it but **do not enable it yet**.

> ⚠️ **Important:** Enabling the plugin before Obsidian Sync finishes its initial pull
> will cause it to write empty defaults to disk. Sync will treat this empty file as the
> authoritative state and propagate it to all your devices, wiping your feeds.

> ⚠️ **Important:** Sync will only work on legacy mode if your data.json file is below 5mb. It is highly recommended to use Shard Storage v2 since it is currently the most robust version for data storage.

3. On your **existing device** (PC): Set up RSS Dashboard with all the feeds, folders, and tags you want to sync.
4. On your **existing device** (PC): Confirm your storage folder names follow the requirements above (Settings → RSS Dashboard → Storage, **as well as** Storage → Metadata storage → Metadata data.json location).
5. On your **existing device** (PC): Open Obsidian Settings → Core Plugins → Sync → Activity Log and wait until it shows today's date and time with the text "Fully synced".

6. On your **new device** (phone/tablet): Open Obsidian and check the same Sync Activity Log. Wait until it shows today's date and time with the text "Fully synced". Close the sync window.
7. On your **new device** (phone/tablet): Enable the RSS Dashboard plugin. Your data should now be synced.

> ⚠️ **Important:** If feeds do not appear after enabling, disable the plugin, wait two minutes, and re-enable it. If the issue persists, see [Troubleshooting](./troubleshooting.md) or open an issue.

8. On your **new device** (phone/tablet): Verify that the storage folder paths match your **existing device**'s (PC) folder structure exactly. These settings sync automatically, but a mismatch here will cause future sync issues.

If you've already hit this issue, disable the plugin on the affected device, wait for
"Fully synced", then re-enable it.

## Why This Happens

Obsidian Sync has no public API to signal when a sync is in progress. On a clean install,
if the plugin loads before your data has arrived from the server, it falls back to empty
defaults and immediately writes them to disk — giving Sync a newer timestamp to treat as
authoritative.

## Ongoing Sync Reliability

To ensure minor changes (feed reorders, tag edits, folder renames) are always detected
by Obsidian Sync, the plugin appends a variable-length sync nonce to every write. This
guarantees the file size changes on each save, which Obsidian Sync uses alongside
modification time to detect changes.

## Related Guides

- **[Troubleshooting](./troubleshooting.md)** — Common sync-related issues and fixes.
- **[Storage & Vault Shards Guide](./storage-vault-shards-guide.md)** — Storage modes and migration.
