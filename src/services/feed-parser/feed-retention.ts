import type { Feed, FeedItem, FeedRetentionProtections } from "../../types/types.js";
import { canonicalizeItemIdentityUrl } from "../../utils/url-utils.js";

export function getPubDateMs(pubDate: string | undefined | null): number {
  if (!pubDate) return 0;
  const ms = Date.parse(pubDate);
  return Number.isFinite(ms) ? ms : 0;
}

export function isProtectedItem(
  item: FeedItem,
  protections?: FeedRetentionProtections,
): boolean {
  const protectStarred = protections?.protectStarred ?? true;
  const protectSaved = protections?.protectSaved ?? true;
  const protectTagged = protections?.protectTagged ?? false;
  const protectUnread = protections?.protectUnread ?? false;

  if (protectStarred && item.starred) return true;
  if (protectSaved && item.saved) return true;
  if (protectTagged && item.tags && item.tags.length > 0) return true;
  if (protectUnread && !item.read) return true;
  return false;
}

/**
 * Merge refreshed items with any previously cached items that fell out of the
 * server's latest-N window, keyed by item guid.
 *
 * Assumes `guid` values are stable identifiers (as produced by our parser).
 */
export function mergeFeedHistoryItems(
  existingItems: FeedItem[] | null | undefined,
  refreshedItems: FeedItem[],
): FeedItem[] {
  const seen = new Set<string>();
  const uniqueRefreshed: FeedItem[] = [];

  for (const item of refreshedItems) {
    const key = canonicalizeItemIdentityUrl(item.guid || item.link || "");
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRefreshed.push(item);
  }

  const carriedForward: FeedItem[] = [];
  for (const item of existingItems || []) {
    const key = canonicalizeItemIdentityUrl(item.guid || item.link || "");
    if (!key) continue;
    if (!seen.has(key)) {
      carriedForward.push(item);
      seen.add(key);
    }
  }

  return [...carriedForward, ...uniqueRefreshed];
}

export function applyFeedRetentionLimits(
  feed: Feed,
  options?: { nowMs?: number; protections?: FeedRetentionProtections },
): Feed {
  const nowMs = options?.nowMs ?? Date.now();
  const protections = options?.protections;
  const maxItemsLimit =
    typeof feed.maxItemsLimit === "number" ? feed.maxItemsLimit : undefined;
  const autoDeleteDuration =
    typeof feed.autoDeleteDuration === "number"
      ? feed.autoDeleteDuration
      : undefined;

  const isProtected = (item: FeedItem): boolean =>
    isProtectedItem(item, protections);

  const byNewest = (a: FeedItem, b: FeedItem): number => {
    const aMs = getPubDateMs(a.pubDate);
    const bMs = getPubDateMs(b.pubDate);
    if (aMs !== bMs) return bMs - aMs;
    return (a.guid || "").localeCompare(b.guid || "");
  };

  let items = [...(feed.items || [])];

  if (autoDeleteDuration && autoDeleteDuration > 0) {
    const cutoffMs = nowMs - autoDeleteDuration * 24 * 60 * 60 * 1000;
    items = items.filter((item) => {
      if (isProtected(item)) return true;
      return getPubDateMs(item.pubDate) > cutoffMs;
    });
  }

  if (maxItemsLimit && maxItemsLimit > 0) {
    const protectedItems = items.filter(isProtected);
    const nonProtected = items.filter((item) => !isProtected(item));
    nonProtected.sort(byNewest);
    const limitedNonProtected = nonProtected.slice(0, maxItemsLimit);
    items = [...protectedItems, ...limitedNonProtected];
  }

  items.sort(byNewest);

  return {
    ...feed,
    items,
  };
}
