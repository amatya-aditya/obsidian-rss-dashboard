import type { Feed, FeedItem } from "../types/types";
import { canonicalizeItemIdentityUrl } from "../utils/url-utils";
import { mergeTagArrays } from "../utils/tag-utils";

/**
 * Idempotent re-import support (GH Issue #234, ticket 234-05).
 *
 * Re-running the starred-import against the same or an updated export must
 * not duplicate articles already imported into a target feed. This module
 * matches a starred-import candidate against a feed's existing `items` using
 * `canonicalizeItemIdentityUrl` on guid-or-link — the exact identity logic
 * feed-refresh merging already uses (see `mergeFeedHistoryItems` and
 * `FeedParserService`'s existing-item lookup in
 * `src/services/feed-parser/feed-retention.ts` and
 * `src/services/feed-parser/feed-parser-class.ts`) — so a matched item is
 * treated as an update rather than a new insertion.
 */

function identityKey(item: Pick<FeedItem, "guid" | "link">): string {
  return canonicalizeItemIdentityUrl(item.guid || item.link || "");
}

/**
 * Finds the existing item in `existingItems` whose guid-or-link identity
 * matches `candidateItem`, if any. Two items with no identity at all (empty
 * guid and link) never match each other, to avoid false-positive matches on
 * an empty key.
 */
export function findMatchingFeedItem(
  existingItems: readonly FeedItem[],
  candidateItem: Pick<FeedItem, "guid" | "link">,
): FeedItem | undefined {
  const candidateKey = identityKey(candidateItem);
  if (!candidateKey) return undefined;

  return existingItems.find((existing) => identityKey(existing) === candidateKey);
}

/**
 * Produces the updated form of an already-imported article for a re-import
 * match. Only two fields are ever changed:
 *
 * - `tags`: newly-present labels from `candidateItem.tags` are merged into
 *   `existingItem.tags` via `mergeTagArrays`, which never drops a tag the
 *   user added locally that isn't present in the new label set.
 * - `starred`: forced to `true` — re-import always (re)confirms starred
 *   state.
 *
 * Every other field — including `read`, `saved`, `savedFilePath`,
 * `playbackProgress`, and anything else on `existingItem` — is carried
 * forward completely untouched, since it may have been edited locally since
 * the article was first imported.
 */
export function mergeStarredImportIntoExistingItem(
  existingItem: FeedItem,
  candidateItem: FeedItem,
): FeedItem {
  return {
    ...existingItem,
    tags: mergeTagArrays(existingItem.tags, candidateItem.tags),
    starred: true,
  };
}

/**
 * Applies a single starred-import candidate item to its target feed in
 * place: if an existing item with the same guid-or-link identity is found,
 * it is replaced with the merged (update) form; otherwise the candidate is
 * appended as a brand-new item, unchanged from 234-01's original behavior.
 */
export function applyStarredImportCandidateToFeed(
  feed: Feed,
  candidateItem: FeedItem,
): "inserted" | "updated" {
  const existingItem = findMatchingFeedItem(feed.items, candidateItem);
  if (!existingItem) {
    feed.items.push(candidateItem);
    return "inserted";
  }

  const index = feed.items.indexOf(existingItem);
  feed.items[index] = mergeStarredImportIntoExistingItem(
    existingItem,
    candidateItem,
  );
  return "updated";
}
