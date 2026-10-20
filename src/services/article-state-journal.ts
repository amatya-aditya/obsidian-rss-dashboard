import type { ArticleUserState, Feed } from "../types/types";
import {
  articleStateFromItem,
  articleStateFromUpdates,
  type UserStateJournalChange,
} from "./user-state-journal";
import type { ArticleStateChange } from "../utils/article-update";

/**
 * One journal record for a known article, or none when nothing stateful
 * changed. Keeping this beside the journal keeps the composition root out of
 * article-state identity mapping (#1380).
 */
export function articleStateChanges(
  feedId: string | undefined,
  guid: string,
  changes: ArticleUserState,
): UserStateJournalChange[] {
  if (!feedId || !guid || Object.keys(changes).length === 0) return [];
  return [{ feedId, guid, changes }];
}

/**
 * Turns the UI-facing descriptor into journal records. UI modules know a feed
 * by URL; the device-local journal keys records by feed ID. A descriptor whose
 * feed is gone is skipped instead of writing an unattributable record.
 */
export function articleStateJournalChanges(
  feeds: readonly Feed[],
  descriptors: readonly ArticleStateChange[],
): UserStateJournalChange[] {
  const changes: UserStateJournalChange[] = [];
  for (const descriptor of descriptors) {
    const feed = feeds.find(
      (candidate) => candidate.url === descriptor.feedUrl,
    );
    changes.push(
      ...articleStateChanges(
        feed?.feedId,
        descriptor.guid,
        articleStateFromUpdates(descriptor.changes),
      ),
    );
  }
  return changes;
}

/**
 * Journal records for the articles a saved-note path change affected. The
 * record carries the article's full state, because clearing a path can also
 * clear the saved flag and automatic tags.
 */
export function savedAssociationJournalChanges(
  feeds: readonly Feed[],
  updates: readonly { feedUrl: string; guid: string }[],
): UserStateJournalChange[] {
  const changes: UserStateJournalChange[] = [];
  for (const update of updates) {
    const feed = feeds.find((candidate) => candidate.url === update.feedUrl);
    const article = feed?.items.find((item) => item.guid === update.guid);
    if (!feed || !article) continue;
    changes.push(
      ...articleStateChanges(
        feed.feedId,
        article.guid,
        articleStateFromItem(article),
      ),
    );
  }
  return changes;
}
