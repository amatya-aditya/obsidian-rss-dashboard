import type { Folder, RssDashboardSettings } from "../types/types";
import { DEFAULT_SETTINGS } from "../types/types";
import { LEFT_HANDED_LAYOUT_STORAGE_KEY } from "./left-handed-layout";

export const FACTORY_RESET_LOCAL_STORAGE_KEYS = [
  "rss-discover-filters",
  "rss-podcast-progress",
  "rss-first-launch-coachmark-shown",
  LEFT_HANDED_LAYOUT_STORAGE_KEY,
] as const;

/**
 * Deep-clone a folder tree, stamping every folder (recursively, including
 * subfolders) with the given `createdAt`/`modifiedAt` timestamp.
 * @param {Folder[]} folders Folder tree to clone
 * @param {number} timestamp Timestamp (ms since epoch) to stamp on every cloned folder
 * @returns {Folder[]} A new folder tree with fresh timestamps
 */
function cloneFoldersWithFreshTimestamps(
  folders: Folder[],
  timestamp: number,
): Folder[] {
  return folders.map((folder) => ({
    ...folder,
    subfolders: cloneFoldersWithFreshTimestamps(
      folder.subfolders ?? [],
      timestamp,
    ),
    createdAt: timestamp,
    modifiedAt: timestamp,
  }));
}

/**
 * Build a fresh copy of `DEFAULT_SETTINGS` for a factory reset, with the
 * default folder tree's timestamps stamped to the current time rather than
 * whatever was baked into the static defaults.
 * @returns {RssDashboardSettings} A new, independent settings object safe to mutate
 */
export function buildFactoryResetSettings(): RssDashboardSettings {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  const timestamp = Date.now();

  settings.folders = cloneFoldersWithFreshTimestamps(
    DEFAULT_SETTINGS.folders,
    timestamp,
  );

  return settings;
}

// The load/normalize, migrate and feed-dedupe functions moved to
// settings-normalization.ts (#1167) to get them under the complexity limit.
// Re-exported here so every existing importer of this path keeps working.
export {
  dedupeAndNormalizeFeedItems,
  loadAndNormalizeSettings,
  migrateSettings,
} from "./settings-normalization";
