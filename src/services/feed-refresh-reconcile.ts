import type { Feed, FeedItem, RssDashboardSettings } from "../types/types";
import {
  applyFeedRetentionLimits,
  mergeFeedHistoryItems,
} from "./feed-parser/feed-retention";

/** Preserve the user's newer state when a refreshed snapshot meets a reload. */
function keepCurrentArticleState(
  refreshed: FeedItem,
  current: FeedItem,
): FeedItem {
  const sameUrl = refreshed.link === current.link;
  return {
    ...refreshed,
    read: current.read,
    starred: current.starred,
    tags: current.tags,
    saved: current.saved,
    savedFilePath: current.savedFilePath,
    playbackProgress: current.playbackProgress,
    firstSeenMs: current.firstSeenMs ?? refreshed.firstSeenMs,
    ...(sameUrl
      ? {
          refreshEnrichment:
            current.refreshEnrichment?.url === current.link
              ? current.refreshEnrichment
              : refreshed.refreshEnrichment,
          publisherDescription:
            current.publisherDescription ?? refreshed.publisherDescription,
          metadataFetchedAt:
            current.metadataFetchedAt ?? refreshed.metadataFetchedAt,
          language: current.language ?? refreshed.language,
          languageSource: current.languageSource ?? refreshed.languageSource,
          canonicalUrl: current.canonicalUrl ?? refreshed.canonicalUrl,
          pageImage: current.pageImage ?? refreshed.pageImage,
          ...(current.metadataFetchedAt ? { authors: current.authors } : {}),
          ...(current.coverImageFromPage
            ? { coverImage: current.coverImage, coverImageFromPage: true }
            : {}),
        }
      : {}),
  };
}

/** Merge refreshed content into a newer in-memory feed without reviving removals. */
export function reconcileRefreshedFeed(
  current: Feed,
  refreshed: Feed,
  before: ReadonlySet<string>,
  settings: RssDashboardSettings,
): FeedItem[] {
  const currentItems = new Map(current.items.map((item) => [item.guid, item]));
  const refreshedItems = refreshed.items.flatMap((item) => {
    const latest = currentItems.get(item.guid);
    if (latest) return [keepCurrentArticleState(item, latest)];
    return before.has(item.guid) ? [] : [item];
  });
  const combined = mergeFeedHistoryItems(current.items, refreshedItems);
  return applyFeedRetentionLimits(
    { ...current, items: combined },
    {
      protections: {
        protectStarred: settings.protectStarred,
        protectSaved: settings.protectSaved,
        protectTagged: settings.protectTagged,
        protectUnread: settings.protectUnread,
      },
      useFirstSeenDateFallback: settings.useFirstSeenDateFallback,
    },
  ).items;
}
