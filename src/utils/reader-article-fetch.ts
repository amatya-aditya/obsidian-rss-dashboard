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
import { isLikelyVideoItem } from "./video-detection";

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

  if (!item.link) {
    return;
  }

  const link = banner.createEl("a", {
    cls: "rss-reader-paywall-banner-link",
    text: RESTRICTED_ARTICLE_LINK_TEXT,
    href: item.link,
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

  if (!item.link) {
    return;
  }

  const link = banner.createEl("a", {
    cls: "rss-reader-video-banner-link",
    text: VIDEO_ARTICLE_LINK_TEXT,
    href: item.link,
  });
  link.target = "_blank";
  link.rel = "noopener noreferrer";
}
