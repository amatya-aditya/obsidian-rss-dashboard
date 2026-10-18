import type { FeedItem } from "../../../types/types";
import { isHttpUrl } from "../../../utils/http-url";

/**
 * The wording of the manual cover-image fetch (#1314), shared by its two entry
 * points so the control and the menu item never disagree. Sentence case, per
 * the UI text rules; "Replace" when the item already shows a cover.
 */
export function coverImageActionLabel(
  article: Pick<FeedItem, "coverImage">,
): string {
  return article.coverImage
    ? "Replace cover image from page"
    : "Fetch cover image from page";
}

/**
 * The icon both entry points use. `download` is carried by Obsidian 1.14.4 (see
 * `test_files/stubs/lucide-icons.ts`); the action pulls the image down from the
 * article page.
 */
export const COVER_IMAGE_FETCH_ICON = "download";

/**
 * The class of the in-card cover-image fetch control (#1314). One name for the
 * three places that have to agree on it: the control's own class, the tag
 * region that must survive a tag removal because it hosts the control, and the
 * focus hand-off after the card is rebuilt.
 */
export const COVER_IMAGE_FETCH_BUTTON_CLASS =
  "rss-dashboard-fetch-cover-button";

export interface CoverImageAvailability {
  /** The dashboard supplies the fetch at all (absent on a surface without it). */
  hasFetcher: boolean;
  /** Cover images are displayed, so a fetched one has somewhere to appear. */
  showCoverImage: boolean;
}

/**
 * Whether this article's cover image can be fetched from its page. One gate for
 * the card control and the context menu, so a control is offered exactly when
 * the request can run: a usable `http(s)` link, a visible cover surface, and a
 * dashboard that can fetch.
 */
export function canOfferCoverImageFetch(
  article: Pick<FeedItem, "link">,
  options: CoverImageAvailability,
): boolean {
  return (
    options.hasFetcher && options.showCoverImage && isHttpUrl(article.link)
  );
}
