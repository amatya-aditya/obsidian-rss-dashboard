import type { Feed, FeedItem } from "../types/types";

/**
 * Finds the stored copy of an article a view holds. The item's feed URL
 * identifies its feed exactly, but a view opened before the feed's URL was
 * edited carries a stale one, so fall back to a unique GUID (and link) match.
 * Returns null when the article cannot be identified unambiguously, so a
 * duplicate GUID never updates another feed's item.
 */
export function findStoredArticle(
  feeds: Feed[],
  item: Pick<FeedItem, "guid" | "link" | "feedUrl">,
): FeedItem | null {
  const ownFeed = feeds.find((feed) => feed.url === item.feedUrl);
  const ownMatch = ownFeed?.items.find((stored) => stored.guid === item.guid);
  if (ownMatch) return ownMatch;

  const guidMatches = feeds.flatMap((feed) =>
    feed.items.filter((stored) => stored.guid === item.guid),
  );
  if (guidMatches.length === 1) return guidMatches[0] ?? null;

  const linkMatches = guidMatches.filter((stored) => stored.link === item.link);
  return linkMatches.length === 1 ? (linkMatches[0] ?? null) : null;
}

/** Keeps a feed's articles aligned with the feed's current title and URL. */
export function syncFeedItemMetadata(
  feed: Feed,
  previous: { title: string; url: string },
  next: { title: string; url: string },
): void {
  for (const item of feed.items) {
    if (previous.title !== next.title) item.feedTitle = next.title;
    if (previous.url !== next.url) item.feedUrl = next.url;
  }
}
