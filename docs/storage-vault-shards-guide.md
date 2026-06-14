# Vault Shards Storage Guide

**Note:** This feature is still a work in progress. We are trialing a new Vault Shards Storage v2 so the information below may be outdated. Updated 6/14/26

This guide explains the new Vault Shards storage mode in RSS Dashboard: what it is, when to use it, and how to safely migrate.

## What Vault Shards Is

Vault Shards stores article history in separate per-feed JSON files in your vault, instead of keeping all feed history inside one large plugin data file.

In practice:

- You still use RSS Dashboard normally.
- The app still loads feeds the same way in the UI.
- Feed history is split into one file per feed in a folder you choose.

## Why You Might Use It

Vault Shards can help if you:

- Track many feeds and want to avoid one large monolithic history file.
- Want feed history stored in a normal vault path that is easier to inspect/sync.
- Need better desktop/mobile portability for feed history.

## Important Notes Before You Switch

- Plugin settings and metadata still use the plugin data file.
- Vault Shards improves portability, but does not fully replace all plugin-managed metadata storage.

## Quick Start

1. Open Obsidian Settings.
2. Go to Community plugins -> RSS Dashboard -> General.
3. In Storage, choose 'Vault shards'.
4. Confirm or edit Storage folder.
5. Click Migrate to vault storage.
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

### Revert to legacy JSON

Use this to go back to the previous storage model.

What it does:

- Deletes shard JSON files in the configured storage folder.
- Switches storage mode back to legacy-json.
- Saves full feed history back to plugin data.
- Refreshes settings and views.

## FAQ

### Is my data format changing in the app?

No. In-app behavior should remain the same. Feeds are still hydrated in memory for normal UI usage.

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

Not fully. It improves portability by moving large feed history into a normal vault path, but plugin settings/metadata still matter.

### Can I move shard data between devices?

Yes. Use the Import shard data and Export shard data actions in settings for transfer workflows.

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
