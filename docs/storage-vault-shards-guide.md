# Vault Shards Storage Guide

**Note:** This feature is still a work in progress. RSS Dashboard supports three storage modes: Legacy JSON, Vault Shards (v1), and Vault Shards v2. Updated 6/19/26

This guide explains the Vault Shards storage modes in RSS Dashboard: what they are, when to use each, and how to safely migrate between them.

## What Vault Shards Is

Vault Shards stores article history in separate per-feed JSON files in your vault, instead of keeping all feed history inside one large plugin data file.

In practice:

- You still use RSS Dashboard normally.
- The app still loads feeds the same way in the UI.
- Feed history is split into one file per feed in a folder you choose.

Vault Shards (Shard Storage v1) was implemented in v2.3.0 and released on 5/26/26, replacing legacy JSON storage as the default storage method.

## What Shard Storage v2 Is

Shard Storage v2 is the latest evolution of Vault Shards. It retains the same per-feed shard file structure as v1, but separates user state (read, starred, tags, saved, playback progress) from feed content.

In practice:

- You still use RSS Dashboard normally.
- The app still loads feeds the same way in the UI.
- Each feed's content lives in a shard file, and your interaction state lives in a separate `user-state.json` file in your metadata folder.

Shard Storage v2 was implemented in v2.4.0-beta.3 and released on 6/19/26. It is opt-in and backwards compatible with Vault Shards v1 via auto migration.

## Why You Might Use It

Vault Shards can help if you:

- Track many feeds and want to avoid one large monolithic history file.
- Want feed history stored in a normal vault path that is easier to inspect/sync.
- Need better desktop/mobile portability for feed history.

## Storage Mode Comparison

| Feature                | Legacy JSON                                 | Vault Shards v1                               | Vault Shards v2                                     |
| ---------------------- | ------------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| File structure         | Monolithic data.json                        | Per-feed shard files                          | Per-feed shard files (content only)                 |
| User state location    | Inside monolithic data.json                 | Embedded in each feed shard                   | Separate `user-state.json`                          |
| Metadata file location | `.obsidian/plugins/rss-dashboard/data.json` | Same or vault folder                          | Vault folder (forced to vault-location, schema v2)  |
| Sync robustness        | Poor (large, rarely sync-friendly)          | Moderate (per-feed, minor conflicts possible) | Best (content and state split, fewer conflicts)     |
| Best for               | Simple, single-device setups                | Most users wanting vault-based feed history   | Multi-device sync, max portability, fewer conflicts |

## Important Notes Before You Switch

- Plugin settings and metadata still use the plugin data file.
- Vault Shards improves portability, but does not fully replace all plugin-managed metadata storage.
- **When using Shard Storage v2**, metadata is automatically forced to vault-location mode (for example, `.rss-dashboard-data`), and cannot remain in plugin-default mode.

## Quick Start (Legacy JSON or Vault Shards v1)

1. Open Obsidian Settings.
2. Go to Community plugins -> RSS Dashboard -> General.
3. In Storage, choose the desired mode: `Legacy JSON`, `Vault shards` (v1), or `Vault Shards v2`.
4. Confirm or edit Storage folder.
5. Click the matching storage action:
   - For Legacy JSON, click **Migrate to legacy JSON** if coming from shard mode.
   - For Vault Shards v1/v2, click **Migrate to vault storage**.
   - For an existing v1 vault, click **Update to Shard Storage v2** to split user state into `user-state.json`.
6. Wait for completion notice.
7. Confirm shard files exist in your configured storage folder.

## Storage Actions Explained

### Migrate to vault storage

Use this once to move from legacy JSON history to per-feed shard files.

What it does:

- Ensures each feed has a stable feed ID.
- Normalizes and validates your storage folder.
- Creates the storage folder if missing.
- Writes one shard file per feed.
- Saves metadata in plugin data without embedded feed items.

### Repair/Rebuild storage

Use this when shard storage seems out of sync, incomplete, or after manual folder moves.

What it does:

- Re-checks and normalizes your storage folder path.
- Force-rewrites all shard files from current feed data.
- Force-saves storage metadata.
- Refreshes storage status.

Think of this as a safe "re-generate all shard files" action.

### Update to Shard Storage v2

Use this when you are currently on Vault Shards v1 and want to upgrade to the more sync-friendly v2 mode.

What it does:

- Strips `read`, `starred`, `tags`, `saved`, `savedFilePath`, and `playbackProgress` from each feed shard, storing them only in `user-state.json`.
- Forces metadata storage to vault-location mode and updates schema to v2.
- Preserves or migrates metadata using snapshot/rollback if something goes wrong.
- Re-saves all feed shards and metadata after the transition.

### Revert to legacy JSON

Use this to go back to the previous storage model.

What it does:

- Deletes shard JSON files in the configured storage folder.
- Switches storage mode back to legacy-json.
- Saves full feed history back to plugin data.
- Refreshes settings and views.

## Storage Mode FAQ

### Is my data format changing in the app?

No. In-app behavior should remain the same. Feeds are still hydrated in memory for normal UI usage, regardless of which mode is active.

### Where are shard files stored?

In your configured storage folder. Default is:
.rss-dashboard-data/feeds

### What does Repair/Rebuild storage actually do?

It force-regenerates shard storage from your current feed state:

- rewrites all per-feed shard files
- rewrites storage metadata
- updates status

Use it for recovery, desyncs, or after storage-path changes.

### What if migration says "folder already exists"?

That folder should be treated as valid if it is a folder. If you still get an error:

1. Verify the configured path points to a folder (not a file).
2. Run Repair/Rebuild storage.
3. Retry migration.

### Does this solve all mobile sync issues?

Not fully. It improves portability by moving large feed history into a normal vault path, but plugin settings/metadata still matter. For the best cross-device sync experience, use Vault Shards v2, which splits user state from content.

### Can I move shard data between devices?

Yes. Use the Import shard data and Export shard data actions in settings for transfer workflows.

### What does Shard Storage v2 change from v1?

v2 moves per-item user state (read, starred, tags, saved items, playback progress) out of feed shards and into a separate `user-state.json` file. This reduces sync conflicts by separating frequently changing state from relatively stable feed content.

### Why does v2 force metadata to vault-location?

Vault Shards v2 writes `user-state.json` alongside metadata, so it forces the metadata location to vault-location (for example, `.rss-dashboard-data`) and upgrades the metadata schema to v2. This keeps content, state, and config in a predictable portable bundle.

## Recommended Safe Workflow

1. Back up your vault and plugin data before switching modes.
2. Migrate to vault shards.
3. Verify shard files were created.
4. Use RSS Dashboard normally for a while.
5. If anything looks wrong, run Repair/Rebuild storage.
6. Revert to legacy JSON if you prefer the old behavior.

## Troubleshooting Checklist

- Storage folder path exists and is a folder.
- You used Migrate to vault storage after selecting shard mode.
- Shard files are present after migration.
- Repair/Rebuild storage completes without error.
- Revert action succeeds if returning to legacy mode.

If problems continue, capture your exact steps and any notice text, then open an issue with those details.

## Metadata Storage Location

In addition to feed storage, RSS Dashboard now allows you to configure where plugin metadata (data.json) is stored.

### Why Move Metadata?

- **Better sync**: Store metadata in a vault folder that syncs across devices
- **Portability**: Include metadata in portable data bundles for desktop/mobile transfers
- **Isolation**: Keep metadata in the plugin directory if you prefer local-only storage

### Metadata Storage Options

**Plugin Default** (default)

- Stores metadata in: `<vault>/.obsidian/plugins/rss-dashboard/`
- Isolated from sync
- Good for local-only vaults

**Vault Location**

- Stores metadata in a user-defined vault folder (default: `.rss-dashboard-data`)
- Syncs with your vault
- Good for multi-device workflows

> **Note about dot-prefixed folders:** Folder names starting with `.` (for example, `.rss-dashboard-data`) are hidden from Obsidian's vault file explorer. If you use Obsidian Sync, the sync engine can still sync these hidden folders, so you do not need to rename or unhide the folder. If you use third-party sync software, it may ignore hidden folders. In that case, rename the folder to remove the leading `.` (for example, `rss-dashboard-data`) before syncing, and update the metadata location setting accordingly.

### How to Configure Metadata Storage

1. Open Obsidian Settings
2. Go to Community plugins -> RSS Dashboard -> General
3. Scroll to **Metadata Storage** section
4. Edit **Metadata data.json location**:
   - Leave it empty to keep metadata in the plugin directory
   - Enter a vault folder such as `.rss-dashboard-data` to move metadata into the vault
5. Click **Apply metadata location** to run the change
6. After a successful move, choose whether to keep or delete the previous `data.json` copy

### Metadata Storage FAQ

**What data is stored in data.json?**

data.json contains plugin configuration and metadata, including feed definitions (titles, URLs, update intervals, filters, and settings), folder organization, last-refresh timestamps, and cleanup rules. It does **not** contain actual article content or history in vault shards mode; those live in the per-feed shard files (and `user-state.json` in v2).

**Why might I want to move the metadata location?**

- **Sync**: When metadata lives in your vault, it syncs across devices alongside your notes and shard data
- **Portability**: A vault-located metadata file is easier to back up, export, or include in portable bundles
- **Isolation**: Plugin-default storage keeps metadata separate from your vault, useful for local-only workflows

**Can I change metadata storage location after migration?**
Yes. You can apply a new metadata folder later, or clear the field to move metadata back to the plugin-default location.

**Will metadata migration affect my feeds?**
No. Metadata migration only moves the data.json file. Your feeds and articles are unaffected.

**What happens to the old data.json after a move?**
After a successful metadata move, RSS Dashboard asks whether you want to keep the previous `data.json` copy as a backup or delete it.

**Does metadata need to be in the same location as feed shards?**
No. You can:

- Store metadata in `.rss-dashboard-data` and shards in `.rss-dashboard-data/feeds`
- Store metadata in plugin directory and shards in vault location
- Any combination of storage modes

**What happens to metadata when I import a portable bundle?**
The metadata storage configuration is preserved in the bundle. When you import:

- Metadata location setting is restored from the bundle
- Current metadata is backed up before import
- On successful import, the metadata is placed according to the bundle's configuration
- On failure, previous metadata is restored
