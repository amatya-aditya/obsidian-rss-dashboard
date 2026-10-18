import type { FeedItem } from "../../../types/types";
import { isHttpUrl } from "../../../utils/http-url";
import { resolveStoredItemFeedCover } from "../../../services/feed-parser/feed-item-builder";

/**
 * The icon the fetch states carry: `download` is carried by Obsidian 1.14.4
 * (see `test_files/stubs/lucide-icons.ts`), and the action pulls the image down
 * from the article page.
 */
export const COVER_IMAGE_FETCH_ICON = "download";

/**
 * The icon the restore states carry (`rotate-ccw`, an Obsidian-era Lucide id):
 * the action puts the cover the item already holds back, or takes the fetched
 * one away.
 */
export const COVER_IMAGE_RESTORE_ICON = "rotate-ccw";

/**
 * The class of the cover-image control (#1314). One name for the three places
 * that have to agree on it: the control's own class, the tag region that must
 * survive a tag removal because it hosts the control, and the focus hand-off
 * after the card is rebuilt. The class keeps its historical name — it is the
 * same control in both roles (#1330).
 */
export const COVER_IMAGE_FETCH_BUTTON_CLASS =
  "rss-dashboard-fetch-cover-button";

/** What the control does when it is activated. */
export type CoverImageRole = "fetch" | "restore";

/** The label, icon and role of the cover-image control in one state. */
export interface CoverImageAction {
  label: string;
  icon: string;
  role: CoverImageRole;
}

/** What the action reads: the cover fields, plus whatever the feed's own cover is recomputed from. */
export type CoverImageArticle = Partial<FeedItem> &
  Pick<FeedItem, "coverImage">;

function fetchAction(article: CoverImageArticle): CoverImageAction {
  return {
    label: article.coverImage
      ? "Replace cover image from the fetch"
      : "Fetch and replace cover image",
    icon: COVER_IMAGE_FETCH_ICON,
    role: "fetch",
  };
}

/**
 * The wording, icon and role of the cover-image control (#1314, #1330), from
 * one helper so the control's tooltip and the context-menu item never disagree.
 * Sentence case, per the UI text rules.
 *
 * The role follows the state. With no cover, or a cover the feed supplied, the
 * action is the fetch: it reads the article page, and "the fetch" is the
 * defined name for that request. With a cover the fetch stored, the action is
 * the restore: it recomputes the feed's own image from the item's stored fields
 * (blurb scan, then `itunes.image`, `image`, an image enclosure) and writes it,
 * or clears the cover when the feed supplies none — locally, with no request.
 */
export function resolveCoverImageAction(
  article: CoverImageArticle,
): CoverImageAction {
  if (!article.coverImage || !article.coverImageFromPage) {
    return fetchAction(article);
  }

  return {
    label: resolveStoredItemFeedCover(article)
      ? "Restore cover image from feed"
      : "Remove fetched cover image",
    icon: COVER_IMAGE_RESTORE_ICON,
    role: "restore",
  };
}

export interface CoverImageAvailability {
  /** The dashboard supplies the fetch at all (absent on a surface without it). */
  hasFetcher: boolean;
  /** The dashboard supplies the restore at all. */
  hasRestorer: boolean;
  /** Cover images are displayed, so the cover has somewhere to appear. */
  showCoverImage: boolean;
}

/**
 * The action this article's cover control offers, or null when the surface
 * offers none. One gate for the control and the context menu, so an action is
 * offered exactly when it can run: cover images are shown, the dashboard
 * supplies that role's handler, and a fetch additionally needs the article's
 * own `http(s)` page to read. A restore reads stored data only, so it is
 * offered whatever the link is.
 */
export function resolveCoverImageOffer(
  article: CoverImageArticle,
  options: CoverImageAvailability,
): CoverImageAction | null {
  if (!options.showCoverImage) return null;

  const action = resolveCoverImageAction(article);
  if (action.role === "restore") {
    return options.hasRestorer ? action : null;
  }
  if (!options.hasFetcher || !isHttpUrl(article.link)) return null;
  return action;
}
