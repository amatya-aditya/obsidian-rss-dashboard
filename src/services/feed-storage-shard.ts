import { normalizePath } from "obsidian";
import type {
  Feed,
  FeedItem,
  FeedItemsShard,
  RssDashboardSettings,
} from "../types/types";
import { SHARD_VERSION, cloneJson } from "./storage-json";
import { trimSurroundingSlashes } from "../utils/folder-paths";

/** Whether a storage mode keeps feed content in per-feed shard files. */
export function isShardBackedMode(
  mode: RssDashboardSettings["storageMode"],
): boolean {
  return mode === "vault-shards" || mode === "vault-shards-v2";
}

/** Keeps only entries usable as items: plain objects with a string guid. */
export function dropInvalidShardItems(items: unknown[]): FeedItem[] {
  return items.filter(
    (item): item is FeedItem =>
      item != null &&
      typeof item === "object" &&
      typeof (item as { guid?: unknown }).guid === "string",
  );
}

export function normalizeFolderPath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (!trimmed) return ".rss-dashboard-data/feeds";

  return normalizePath(trimSurroundingSlashes(trimmed));
}

/**
 * Obsidian Sync and most file-sync tools skip files and folders whose name
 * begins with ".", so shards under such a path never reach other devices.
 */
export function isHiddenFromSync(folderPath: string): boolean {
  return normalizeFolderPath(folderPath)
    .split("/")
    .some((segment) => segment.startsWith("."));
}

export function getFeedShardPath(
  storageFolder: string,
  feedId: string,
): string {
  return normalizePath(`${normalizeFolderPath(storageFolder)}/${feedId}.json`);
}

export function createFeedShard(
  feed: Feed,
  stripState = false,
): FeedItemsShard {
  return {
    version: SHARD_VERSION,
    feedId: feed.feedId ?? "",
    feedUrl: feed.url,
    updatedAt: Date.now(),
    items: cloneJson(feed.items ?? []).map((item) => {
      if (stripState) {
        delete item.read;
        delete item.starred;
        delete item.tags;
        delete item.saved;
        delete item.savedFilePath;
        delete item.playbackProgress;
      }
      return item;
    }),
  };
}

export function createComparableFeedShardJson(
  feed: Feed,
  stripState = false,
): string {
  const { updatedAt: _updatedAt, ...shardWithoutTimestamp } = createFeedShard(
    feed,
    stripState,
  );
  void _updatedAt;
  return JSON.stringify(shardWithoutTimestamp, null, 2);
}
