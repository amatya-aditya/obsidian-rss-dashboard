import type { Feed } from "../types/types";

export interface DroppedDuplicateFeed {
  feedId: string;
  url: string;
  keptCompletedAt: number | undefined;
  droppedCompletedAt: number | undefined;
}

/**
 * Keeps one feed for each `feedId` that more than one feed carries (#1764).
 * The survivor is the copy with the latest `lastRefreshAttemptCompletedAt`
 * (a missing value counts as oldest; a tie goes to the first listed). It takes
 * the slot of the first copy, so the sidebar order does not move, and is not
 * merged with the copies it replaces. Feeds without a `feedId` are never
 * grouped. Edits `feeds` in place and returns what it dropped.
 */
export function collapseDuplicateFeedIds(
  feeds: Feed[],
): DroppedDuplicateFeed[] {
  const groups = new Map<string, number[]>();
  feeds.forEach((feed, index) => {
    if (!feed.feedId) return;
    const indexes = groups.get(feed.feedId);
    if (indexes) indexes.push(index);
    else groups.set(feed.feedId, [index]);
  });

  const dropped: DroppedDuplicateFeed[] = [];
  const removeIndexes = new Set<number>();
  const replacements = new Map<number, Feed>();

  for (const [feedId, indexes] of groups) {
    if (indexes.length < 2) continue;
    let keptIndex = indexes[0] as number;
    for (const index of indexes.slice(1)) {
      const candidate = feeds[index]?.lastRefreshAttemptCompletedAt ?? -1;
      const kept = feeds[keptIndex]?.lastRefreshAttemptCompletedAt ?? -1;
      if (candidate > kept) keptIndex = index;
    }
    const survivor = feeds[keptIndex] as Feed;
    replacements.set(indexes[0] as number, survivor);
    for (const index of indexes) {
      if (index !== indexes[0]) removeIndexes.add(index);
      if (index === keptIndex) continue;
      const copy = feeds[index] as Feed;
      dropped.push({
        feedId,
        url: copy.url,
        keptCompletedAt: survivor.lastRefreshAttemptCompletedAt,
        droppedCompletedAt: copy.lastRefreshAttemptCompletedAt,
      });
    }
  }

  if (dropped.length === 0) return dropped;

  const collapsed = feeds
    .map((feed, index) => replacements.get(index) ?? feed)
    .filter((_, index) => !removeIndexes.has(index));
  feeds.splice(0, feeds.length, ...collapsed);
  return dropped;
}
