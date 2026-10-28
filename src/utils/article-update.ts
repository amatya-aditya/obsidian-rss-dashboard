import type { Feed, FeedItem } from "../types/types";

/**
 * A UI-facing article-state change. UI modules know the feed by URL and the
 * article's fields; the plugin facade maps it to the device-local journal's
 * feed-ID identity, so views never import storage internals (#1380).
 */
export interface ArticleStateChange {
  feedUrl: string;
  guid: string;
  changes: Partial<FeedItem>;
}

/**
 * The fields that live in the shared article-state snapshot rather than in feed
 * content (see `src/services/user-state-store.ts`). A change limited to these
 * shares the coalesced article-state queue instead of a full settings pass
 * (#1385).
 */
const ARTICLE_STATE_FIELDS = new Set<keyof FeedItem>([
  "read",
  "starred",
  "tags",
  "saved",
  "savedFilePath",
  "playbackProgress",
]);

/**
 * True when every field an update changes belongs to article state, so the
 * article-state-only persistence scope can carry the whole change.
 */
export function isArticleStateOnlyUpdate(updates: Partial<FeedItem>): boolean {
  const keys = Object.keys(updates) as (keyof FeedItem)[];
  return keys.length > 0 && keys.every((key) => ARTICLE_STATE_FIELDS.has(key));
}

/**
 * Captures the current value of every field an update is about to change, so a
 * failed save can put the article back. A field the article never had is
 * recorded as `undefined`.
 */
export function snapshotArticleFields(
  article: FeedItem,
  updates: Partial<FeedItem>,
): Partial<FeedItem> {
  const snapshot: Record<string, unknown> = {};
  for (const key of Object.keys(updates) as (keyof FeedItem)[]) {
    snapshot[key] = article[key];
  }
  return snapshot as Partial<FeedItem>;
}

/**
 * Finds the stored item a player reports progress for, preferring the feed
 * that supplied its URL or GUID and falling back to a video identity match.
 * Returns the owning feed too, so the change carries its identity without a
 * second scan (#1387, #1380).
 */
export function resolvePlaybackTarget(
  feeds: readonly Feed[],
  feedUrl: string,
  itemGuid: string,
  sourceItem?: FeedItem,
): { feed: Feed; item: FeedItem } | null {
  const resolveVideoMatch = (
    candidateFeed?: Feed,
  ): { feed: Feed; item: FeedItem } | undefined => {
    if (!sourceItem || sourceItem.mediaType !== "video") {
      return undefined;
    }

    const feedsToSearch = candidateFeed ? [candidateFeed] : feeds;

    for (const feed of feedsToSearch) {
      const exactRef = feed.items.find((entry) => entry === sourceItem);
      if (exactRef) {
        return { feed, item: exactRef };
      }

      const byVideoId = sourceItem.videoId
        ? feed.items.find((entry) => entry.videoId === sourceItem.videoId)
        : undefined;
      if (byVideoId) {
        return { feed, item: byVideoId };
      }

      if (sourceItem.link) {
        const byLink = feed.items.find(
          (entry) => entry.link === sourceItem.link,
        );
        if (byLink) {
          return { feed, item: byLink };
        }
      }
    }

    return undefined;
  };

  if (feedUrl) {
    const feed = feeds.find((candidate) => candidate.url === feedUrl);
    const match = feed?.items.find((item) => item.guid === itemGuid);
    if (feed && match) {
      return { feed, item: match };
    }
    const videoMatch = resolveVideoMatch(feed);
    if (videoMatch) return videoMatch;
  }

  for (const feed of feeds) {
    const match = feed.items.find((item) => item.guid === itemGuid);
    if (match) {
      return { feed, item: match };
    }
  }

  return resolveVideoMatch() ?? null;
}
