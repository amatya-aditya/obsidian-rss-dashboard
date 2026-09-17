import type { Feed, FeedItem, FeedRetentionProtections } from "../../types/types.js";
import { canonicalizeItemIdentityUrl } from "../../utils/url-utils.js";

// RFC 822/2822 obsolete named-zone offsets. Some Chromium/V8 builds don't
// recognize these in Date.parse() (support is implementation-defined, not
// part of any ECMAScript standard), silently producing NaN for otherwise
// well-formed pubDate values like "Fri, 06 May 1983 09:00:00 CST". Rewriting
// the abbreviation to an explicit offset before parsing sidesteps the engine
// dependency entirely.
const RFC822_ZONE_OFFSETS: Record<string, string> = {
  UT: "+0000",
  GMT: "+0000",
  EST: "-0500",
  EDT: "-0400",
  CST: "-0600",
  CDT: "-0500",
  MST: "-0700",
  MDT: "-0600",
  PST: "-0800",
  PDT: "-0700",
};

export function normalizeRfc822Zone(pubDate: string): string {
  const match = pubDate.match(
    /\s(UT|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT)$/,
  );
  const zone = match?.[1];
  if (!match || !zone) return pubDate;
  const offset = RFC822_ZONE_OFFSETS[zone];
  return pubDate.slice(0, match.index) + " " + offset;
}

export function getPubDateMs(pubDate: string | undefined | null): number {
  if (!pubDate) return 0;
  let ms = Date.parse(pubDate);
  if (!Number.isFinite(ms)) {
    ms = Date.parse(normalizeRfc822Zone(pubDate));
  }
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * The single date an item sorts and retains by: its real `pubDate` when
 * parseable, falling back to its `firstSeenMs` timestamp when
 * `useFirstSeenDateFallback` is enabled and no real date exists. Returns 0
 * (sorts last, eligible for retention cutoff) when neither is available.
 */
export function getEffectiveDateMs(
  item: Pick<FeedItem, "pubDate" | "firstSeenMs">,
  useFirstSeenDateFallback?: boolean,
): number {
  const pubDateMs = getPubDateMs(item.pubDate);
  if (pubDateMs > 0) return pubDateMs;
  if (useFirstSeenDateFallback && typeof item.firstSeenMs === "number") {
    return item.firstSeenMs;
  }
  return 0;
}

/**
 * The date to show in UI chrome (reader header, date badges): the real
 * `pubDate` when parseable, otherwise the item's `firstSeenMs` so undated
 * items never render the literal string "Invalid Date". Unlike
 * {@link getEffectiveDateMs}, this always prefers `firstSeenMs` when it's
 * available — display is not gated by `useFirstSeenDateFallback`, which only
 * controls sorting/retention behavior. Returns null when there is truly
 * nothing to show (no pubDate and no firstSeenMs).
 */
export function resolveDisplayDate(
  item: Pick<FeedItem, "pubDate" | "firstSeenMs">,
): Date | null {
  const pubDateMs = getPubDateMs(item.pubDate);
  if (pubDateMs > 0) return new Date(pubDateMs);
  if (typeof item.firstSeenMs === "number") return new Date(item.firstSeenMs);
  return null;
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
  options?: { nowMs?: number },
): FeedItem[] {
  const nowMs = options?.nowMs ?? Date.now();

  const existingByKey = new Map<string, FeedItem>();
  for (const item of existingItems || []) {
    const key = canonicalizeItemIdentityUrl(item.guid || item.link || "");
    if (key && !existingByKey.has(key)) {
      existingByKey.set(key, item);
    }
  }

  // Never regenerated once set: inherit the prior record's firstSeenMs by
  // identity key even if the incoming item itself doesn't carry it (e.g. a
  // freshly re-parsed item that hasn't been merged with its own history yet).
  const stampFirstSeen = (item: FeedItem, key: string): FeedItem => {
    if (typeof item.firstSeenMs === "number") return item;
    const priorFirstSeenMs = existingByKey.get(key)?.firstSeenMs;
    return {
      ...item,
      firstSeenMs:
        typeof priorFirstSeenMs === "number" ? priorFirstSeenMs : nowMs,
    };
  };

  const seen = new Set<string>();
  const uniqueRefreshed: FeedItem[] = [];

  for (const item of refreshedItems) {
    const key = canonicalizeItemIdentityUrl(item.guid || item.link || "");
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRefreshed.push(stampFirstSeen(item, key));
  }

  const carriedForward: FeedItem[] = [];
  for (const item of existingItems || []) {
    const key = canonicalizeItemIdentityUrl(item.guid || item.link || "");
    if (!key) continue;
    if (!seen.has(key)) {
      carriedForward.push(stampFirstSeen(item, key));
      seen.add(key);
    }
  }

  return [...carriedForward, ...uniqueRefreshed];
}

export function applyFeedRetentionLimits(
  feed: Feed,
  options?: {
    nowMs?: number;
    protections?: FeedRetentionProtections;
    useFirstSeenDateFallback?: boolean;
  },
): Feed {
  const nowMs = options?.nowMs ?? Date.now();
  const protections = options?.protections;
  const useFirstSeenDateFallback = options?.useFirstSeenDateFallback ?? false;
  const maxItemsLimit =
    typeof feed.maxItemsLimit === "number" ? feed.maxItemsLimit : undefined;
  const autoDeleteDuration =
    typeof feed.autoDeleteDuration === "number"
      ? feed.autoDeleteDuration
      : undefined;

  const isProtected = (item: FeedItem): boolean =>
    isProtectedItem(item, protections);

  const byNewest = (a: FeedItem, b: FeedItem): number => {
    const aMs = getEffectiveDateMs(a, useFirstSeenDateFallback);
    const bMs = getEffectiveDateMs(b, useFirstSeenDateFallback);
    if (aMs !== bMs) return bMs - aMs;
    return (a.guid || "").localeCompare(b.guid || "");
  };

  let items = [...(feed.items || [])];

  if (autoDeleteDuration && autoDeleteDuration > 0) {
    const cutoffMs = nowMs - autoDeleteDuration * 24 * 60 * 60 * 1000;
    items = items.filter((item) => {
      if (isProtected(item)) return true;
      return getEffectiveDateMs(item, useFirstSeenDateFallback) > cutoffMs;
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
