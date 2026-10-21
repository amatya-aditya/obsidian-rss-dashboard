import type { FeedItem } from "../../../types/types";
import type { CoverImageRole } from "./cover-image-action";
import { withCoverImageBusyState } from "./cover-image-busy";

/**
 * The dashboard hooks the cover-image action needs (#1314): whichever role the
 * article is in runs one of the two callbacks. A structural subset of
 * `ViewDeps`, so a view can pass its deps straight through.
 */
export interface CoverImageActionDeps {
  /** Fetches the page's cover image; resolves true when one was stored. */
  fetchCoverImage?(article: FeedItem): Promise<boolean>;
  /** Puts the feed's own cover back; resolves true when the item changed. */
  restoreCoverImage?(article: FeedItem): Promise<boolean>;
  /** Rebuilds one article's rendered element in place, after its data changed. */
  replaceArticle?(article: FeedItem): void;
}

export interface CoverImageRun {
  article: FeedItem;
  /** The article element that dims while a fetch runs. */
  articleEl: HTMLElement | null;
  deps: CoverImageActionDeps;
}

/**
 * Runs one cover-image action (#1314, #1330, #1466): the one path shared by the
 * in-card control and the dashboard shortcut, so the two cannot diverge. A
 * fetch reads the article page and keeps the article's busy state for as long
 * as the read runs; a restore is local and has nothing to wait for. On success
 * the article is rebuilt in place through the caller's `replaceArticle`, which
 * keeps selection, focus and scroll where they were.
 *
 * Resolves true when the article changed.
 */
export async function runCoverImageAction(
  { article, articleEl, deps }: CoverImageRun,
  role: CoverImageRole,
): Promise<boolean> {
  if (role === "restore") {
    const restored = (await deps.restoreCoverImage?.(article)) ?? false;
    if (restored) deps.replaceArticle?.(article);
    return restored;
  }

  const fetched = await withCoverImageBusyState(
    articleEl,
    () => deps.fetchCoverImage?.(article) ?? Promise.resolve(false),
  );
  if (fetched) deps.replaceArticle?.(article);
  return fetched;
}
