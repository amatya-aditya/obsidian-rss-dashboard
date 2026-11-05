import type { Feed } from "../types/types";

export interface DroppedDuplicateFeed {
  feedId: string;
  url: string;
  keptCompletedAt: number | undefined;
  droppedCompletedAt: number | undefined;
}

/** A feed that never finished a refresh counts as older than any that did. */
function completedAt(feed: Feed): number {
  return feed.lastRefreshAttemptCompletedAt ?? -1;
}

/**
 * Keeps one feed for each `feedId` that more than one feed carries (#1764).
 * The survivor is the copy with the latest `lastRefreshAttemptCompletedAt`
 * (a tie goes to the first listed). It takes the slot of the first copy, so
 * the sidebar order does not move, and is not merged with the copies it
 * replaces. Feeds without a `feedId` are never grouped. Edits `feeds` in place
 * and returns what it dropped.
 */
export function collapseDuplicateFeedIds(
  feeds: Feed[],
): DroppedDuplicateFeed[] {
  const winners = new Map<string, Feed>();
  for (const feed of feeds) {
    if (!feed.feedId) continue;
    const winner = winners.get(feed.feedId);
    if (!winner || completedAt(feed) > completedAt(winner)) {
      winners.set(feed.feedId, feed);
    }
  }

  const dropped: DroppedDuplicateFeed[] = [];
  const placed = new Set<string>();
  const collapsed: Feed[] = [];
  for (const feed of feeds) {
    const winner = feed.feedId ? winners.get(feed.feedId) : undefined;
    if (!feed.feedId || !winner) {
      collapsed.push(feed);
      continue;
    }
    if (feed !== winner) {
      dropped.push({
        feedId: feed.feedId,
        url: feed.url,
        keptCompletedAt: winner.lastRefreshAttemptCompletedAt,
        droppedCompletedAt: feed.lastRefreshAttemptCompletedAt,
      });
    }
    if (!placed.has(feed.feedId)) {
      placed.add(feed.feedId);
      collapsed.push(winner);
    }
  }

  if (dropped.length > 0) feeds.splice(0, feeds.length, ...collapsed);
  return dropped;
}
