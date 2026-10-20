import type { FeedItem } from "../types/types";

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
