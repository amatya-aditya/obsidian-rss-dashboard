# ADR 0012: Guard Storage Folder Changes Instead of Detecting Twin Folders

> **What is an ADR?** An Architecture Decision Record explains an important
> product or technical decision, why it was made, and the alternatives considered.
> See the [ADR index](README.md) to browse all project decisions.

## Status

accepted

## Date

2026-09-24

## Context and problem

Shard storage v2 keeps each feed's articles in its own file, and those files live in a storage folder that defaults to `.rss-dashboard-data/feeds`. Obsidian Sync, and most other sync tools, skip files and folders whose names begin with `.`. So on a second device the plugin receives its feed list (the plugin's `data.json`) but none of the article files, and every feed appears empty.

The storage folder setting itself lives in that synced `data.json`. When a user reacts to the empty second device by removing the dot from the storage folder **on that device**, the change syncs back to every device. The device that actually holds the articles is then pointed at a new, empty folder, while the articles stay in the old hidden one. Before [#360](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/360), the second device also filled the new folder with empty article files. The setting and the data had ended up in different folders.

We considered a safety net for this mismatch: when feeds cannot be found in the configured folder, look in its twin (the same path with the leading `.` added or removed), and if the articles are there, offer to switch to it. We also decided not to move existing users' folders automatically without their permission. This ADR records which approach was chosen, and the scenario analysis behind it, so the question does not have to be re-derived if it comes up again.

## User stories

The decision is intended to preserve these core user expectations:

1. As a user syncing across devices, I want to be warned before a change on one device points my other devices at a folder without my articles, so that I don't have to recover my feeds afterwards.
2. As a user whose storage folder is hidden, I want the plugin to tell me why a second device shows no articles and where to fix it, so that I fix it on the right device.
3. As a user, I want my feed data never moved or re-pointed without my explicit action, so that a sync still in progress can't be mistaken for a problem to "fix".

## Decision

We will prevent the mismatch where it starts instead of detecting it afterwards.

- When the user applies a new storage folder on a device that has not loaded the articles for one or more feeds, the plugin shows a warning before saving. The warning says how many feeds have not loaded, that the folder setting reaches every synced device, and that the change should be made on the device where the articles appear. The user can cancel or change the folder anyway.
- When every feed's article file is missing and the storage folder is hidden, the dashboard shows a single alert (added in #360). Its text also covers the case where the user renamed or moved the folder outside Obsidian: update the storage folder setting to match.
- The plugin does not look in twin folders, and does not offer to switch to one automatically.

## Consequences

### Benefits

- The most likely way to cause the mismatch (scenario 1 below) is stopped before anything is written, on the device where it would happen.
- There is no background detection that could misfire while sync is still in progress.
- Nothing is moved or re-pointed without the user's explicit confirmation.

### Trade-offs

- A mismatch that already exists is not detected automatically. A user who renamed the folder outside Obsidian, or who restored an older `data.json`, is told only in general terms to make the setting match the folder.
- The warning is shown whenever any feed has not loaded, including when a single article file on an otherwise healthy device is missing. In that case the message is still accurate: the change will not carry that feed's articles.

### Existing users and data

- No existing data is moved. The warning appears only when a user changes the storage folder.

## Considered options

### Option A: Move existing users' hidden folders automatically

Rejected. It moves user data without permission, and whichever device runs the move first decides the outcome for all of them. If that device is one without the data, the move spreads an empty folder to every device.

### Option B: Detect the twin folder and offer to switch

Rejected, based on the scenario matrix below. It catches only rare cases, reacts to the most plausible case after the damage is done, and turns the most common case into a harmful one-tap action.

### Option C: Guard the folder change and improve the alert (chosen)

Stops scenario 1 at the source and covers scenario 2 through the alert text, without detection logic and without false positives during sync.

### Scenario matrix

Each row is a way the configured storage folder and the folder holding the articles can end up different, with how option B would have handled it.

| # | How the mismatch happens | How likely | Option B (twin detection) | Option C (chosen) |
|---|---|---|---|---|
| 1 | The storage folder is changed on a device that does not hold the articles. The setting syncs through `data.json`, so every device points at the new, empty folder. | Plausible: it is the natural reaction to an empty second device, and `docs/syncing.md` tells users to remove the dot. | Catches it, but only after every device has been re-pointed. | The warning appears before the change is saved. |
| 2 | The folder is renamed outside Obsidian (for example, unhidden in the operating system's file manager) without updating the setting. | Uncommon | Catches it. | The alert text tells the user to update the setting to match. |
| 3 | Empty article files exist in the configured folder while the real articles are in the twin (the state reported in #360). | Only on pre-release builds: #360 stopped the empty writes, and the code that caused them never shipped. | Catches a state that can no longer arise. | Not needed. |
| 4 | The folder is changed correctly on the device that holds the articles, but a second device loads the plugin before sync delivers the moved files, while its old hidden folder still holds local copies. | Common, and temporary | **False positive, and harmful:** one tap re-points that device back to the old folder, the setting syncs, and the first device is pointed at a folder it has just emptied. | No action: nothing is triggered unless the user applies a folder change. |
| 5 | `data.json` is restored from a backup, or a settings bundle is imported, carrying a different folder name. | Rare | Catches it. | Not covered: the user is expected to check storage settings after a restore. |

Revisit this decision if scenarios 2 or 5 turn out to be common in support requests. In that case, reconsider a detection that only reports and never switches automatically, and that stays quiet until sync has settled.

## Implementation notes

- "Has not loaded" means the feed's article file was missing or unreadable when the plugin started and the feed has received no articles since, for example from a refresh. The storage repository tracks this per feed; `countUnloadedFeeds` exposes the count.
- Changing the storage folder through the normal settings path rewrites every loaded feed's articles into the new folder and removes them from the old one. A future "switch folder" feature must only re-point the setting and reload from the new folder. It must never write from memory, because on an affected device memory holds no articles.

## Related

- [ADR 0004: Split Article State from Feed Content in Shard Storage v2](0004-split-article-state-from-feed-content-in-shard-storage-v2.md)
- [ADR 0006: Deprecate Legacy JSON and Shard Storage v1](0006-deprecate-legacy-json-and-shard-storage-v1.md)
- [PR #360: stop empty shard writes on unsynced devices](https://github.com/amatya-aditya/obsidian-rss-dashboard/pull/360)
- [Syncing across devices](../syncing.md)
- [Storage and Vault Shards guide](../storage-vault-shards-guide.md)
