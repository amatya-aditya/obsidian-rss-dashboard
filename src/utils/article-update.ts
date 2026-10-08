import type { FeedItem } from "../types/types";

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
