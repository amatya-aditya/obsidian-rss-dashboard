import type { Feed, FeedItem } from "../types/types";
import type { RawArticleMetadata } from "./article-metadata";
import {
  applyArticleMetadata,
  feedLanguageFor,
} from "./article-metadata-persistence";
import {
  RESTRICTED_ARTICLE_BANNER,
  RESTRICTED_ARTICLE_LINK_TEXT,
  RESTRICTED_ARTICLE_REASON,
} from "./full-article-fetch";
import { firstNonFormulaImageUrl } from "./image-url-utils";
import { isLikelyVideoItem } from "./video-detection";
import { getOpenableHttpHref } from "./url-utils";

const VIDEO_ARTICLE_BANNER =
  "This item appears to be a video. Open the source page to watch.";
const VIDEO_ARTICLE_LINK_TEXT = "Open video at source";

/**
 * Writes the fetched page's resolved metadata once (#247 slice 4). The owner
 * passes the feeds for the language fallback and `emit` to persist the update.
 */
export function persistFetchedMetadata(
  item: FeedItem,
  articleHtml: string,
  pageMetadata: RawArticleMetadata | undefined,
  feeds: readonly Feed[],
  emit: (update: Partial<FeedItem>) => void,
): void {
  const update = applyArticleMetadata(
    item,
    pageMetadata,
    articleHtml,
    undefined,
    feedLanguageFor(feeds, item),
  );
  if (update) emit(update);
}

/**
 * Gives an item with no usable picture the fetched page's own image as its
 * cover, so the Reader shows the page's hero instead of promoting whatever
 * image comes first in the extracted body (an ad, for one feed). The feed's
 * own picture always wins. `emit` persists the update.
 */
export function persistFetchedCoverImage(
  item: FeedItem,
  pageImage: string | undefined,
  emit: (update: Partial<FeedItem>) => void,
): void {
  if (!pageImage) return;
  const hasPicture = firstNonFormulaImageUrl([
    item.coverImage,
    item.image,
    item.itunes?.image?.href,
  ]);
  if (hasPicture) return;
  item.coverImage = pageImage;
  emit({ coverImage: pageImage });
}

/** Banner for fetched content that looks truncated, restricted or paywalled. */
export function renderRestrictedBanner(
  container: HTMLElement,
  item: FeedItem,
): void {
  const banner = container.createDiv({
    cls: "rss-reader-inline-banner rss-reader-paywall-banner",
  });
  const message = banner.createDiv({
    cls: "rss-reader-paywall-banner-text",
  });
  message.setText(
    item.restrictedReason === RESTRICTED_ARTICLE_REASON
      ? RESTRICTED_ARTICLE_BANNER
      : (item.restrictedReason ?? RESTRICTED_ARTICLE_BANNER),
  );

  const href = getOpenableHttpHref(item.link);
  if (!href) {
    return;
  }

  const link = banner.createEl("a", {
    cls: "rss-reader-paywall-banner-link",
    text: RESTRICTED_ARTICLE_LINK_TEXT,
    href,
  });
  link.target = "_blank";
  link.rel = "noopener noreferrer";
}

/** True for a video item that carries no playable source of its own. */
export function shouldRenderVideoSourceBanner(item: FeedItem): boolean {
  return isLikelyVideoItem(item) && !item.videoId && !item.videoUrl;
}

/** Banner for a video item that carries no playable source of its own. */
export function renderVideoSourceBanner(
  container: HTMLElement,
  item: FeedItem,
): void {
  const banner = container.createDiv({
    cls: "rss-reader-inline-banner rss-reader-video-banner",
  });
  const message = banner.createDiv({
    cls: "rss-reader-video-banner-text",
    text: VIDEO_ARTICLE_BANNER,
  });
  message.setAttr("role", "note");

  const href = getOpenableHttpHref(item.link);
  if (!href) {
    return;
  }

  const link = banner.createEl("a", {
    cls: "rss-reader-video-banner-link",
    text: VIDEO_ARTICLE_LINK_TEXT,
    href,
  });
  link.target = "_blank";
  link.rel = "noopener noreferrer";
}
