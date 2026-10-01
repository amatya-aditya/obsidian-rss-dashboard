import { setIcon, setTooltip } from "obsidian";
import type {
  Feed,
  FeedShardHealth,
  RssDashboardSettings,
} from "../types/types";
import { MediaService } from "../services/media-service";
import { MastodonService } from "../services/mastodon-service";
import {
  createSafeIconImage,
  failedFeedIconUrls,
  extractDomain,
  getFaviconUrl,
} from "../utils/favicon-utils";

function renderFallbackFeedIcon(
  feedIcon: HTMLElement,
  settings: RssDashboardSettings,
): void {
  feedIcon.empty();
  if (settings.display.hideDefaultRssIcon) {
    feedIcon.addClass("rss-icon-hidden");
    return;
  }

  feedIcon.removeClass("rss-icon-hidden");
  setIcon(feedIcon, "rss");
}

function renderDomainFavicon(
  feedIcon: HTMLElement,
  domain: string,
  settings: RssDashboardSettings,
): void {
  const faviconUrl = getFaviconUrl(domain);
  if (!faviconUrl) {
    renderFallbackFeedIcon(feedIcon, settings);
    return;
  }

  if (failedFeedIconUrls.has(faviconUrl)) {
    renderFallbackFeedIcon(feedIcon, settings);
    return;
  }

  feedIcon.empty();
  feedIcon.removeClass("rss-icon-hidden");
  createSafeIconImage(
    feedIcon,
    faviconUrl,
    domain,
    () => {
      renderFallbackFeedIcon(feedIcon, settings);
    },
    "rss-dashboard-feed-favicon",
  );
}

export function renderFeedIcon(
  feed: Feed,
  feedEl: HTMLElement,
  feedIcon: HTMLElement,
  state: { isProcessing: boolean; isRefreshProcessing: boolean },
  settings: RssDashboardSettings,
): void {
  const { isProcessing, isRefreshProcessing } = state;
  if (isProcessing) {
    // Show loading spinner for processing feeds
    setIcon(feedIcon, "loader-2");
    feedIcon.addClass("processing");
    feedEl.classList.add("processing-feed");
  } else if (isRefreshProcessing) {
    setIcon(feedIcon, "loader-2");
    feedIcon.addClass("processing");
    feedEl.classList.add("processing-feed");
  } else if (
    feed.mediaType === "video" &&
    MediaService.isYouTubeFeed(feed.url)
  ) {
    // Show play icon only for YouTube feeds.
    feedEl.classList.add("video-feed");
    setIcon(feedIcon, "play");
    feedIcon.addClass("video");
  } else if (feed.mediaType === "podcast") {
    // Show mic icon for podcast feeds
    feedEl.classList.add("podcast-feed");
    setIcon(feedIcon, "mic");
    feedIcon.addClass("podcast");
  } else if (MediaService.shouldShowFeedIcon(feed, settings.display)) {
    if (feed.iconUrl && !failedFeedIconUrls.has(feed.iconUrl)) {
      createSafeIconImage(feedIcon, feed.iconUrl, feed.title, () => {
        renderFallbackFeedIcon(feedIcon, settings);
      });
    } else {
      renderFallbackFeedIcon(feedIcon, settings);
    }
  } else if (MastodonService.isResolvedFeedUrl(feed.url)) {
    const domain = extractDomain(feed.url);
    if (domain) {
      renderFallbackFeedIcon(feedIcon, settings);
      renderDomainFavicon(feedIcon, domain, settings);
    } else {
      renderFallbackFeedIcon(feedIcon, settings);
    }
  } else if (settings.display.useDomainIconsRss) {
    // Show domain favicon for regular feeds when setting is enabled
    const domain = extractDomain(feed.url);
    if (domain) {
      renderFallbackFeedIcon(feedIcon, settings);
      renderDomainFavicon(feedIcon, domain, settings);
    } else {
      renderFallbackFeedIcon(feedIcon, settings);
    }
  } else if (!settings.display.hideDefaultRssIcon) {
    // Show generic RSS icon when favicon setting is disabled
    setIcon(feedIcon, "rss");
  } else {
    feedIcon.addClass("rss-icon-hidden");
  }
}

export function renderFeedBadges(
  feedNameContainer: HTMLElement,
  feed: Feed,
  status: {
    unreadCount: number;
    shardHealth: FeedShardHealth | null;
    isProcessing: boolean;
    isQueuedForImport: boolean;
    isRefreshProcessing: boolean;
    isQueuedForRefresh: boolean;
  },
  settings: RssDashboardSettings,
): void {
  const {
    unreadCount,
    shardHealth,
    isProcessing,
    isQueuedForImport,
    isRefreshProcessing,
    isQueuedForRefresh,
  } = status;

  if (settings.display.showFeedUnreadBadges && unreadCount > 0) {
    feedNameContainer.createDiv({
      cls: "rss-dashboard-feed-unread-count",
      text: unreadCount.toString(),
    });
  }

  if (
    !settings.display.hideFeedFetchErrorBadges &&
    feed.lastFetchError
  ) {
    const errorBadge = feedNameContainer.createDiv({
      cls: "rss-dashboard-feed-error-badge",
      attr: {
        "aria-label": `Feed error: ${feed.lastFetchError}`,
      },
    });
    setIcon(errorBadge, "alert-circle");
  }

  if (shardHealth) {
    const shardWarning = feedNameContainer.createDiv({
      cls: "rss-dashboard-feed-shard-warning-badge",
    });
    setIcon(shardWarning, "alert-triangle");
  }

  if (isQueuedForImport && !isProcessing) {
    const processingIndicator = feedNameContainer.createDiv({
      cls: "rss-dashboard-feed-processing-indicator",
      text: "⏳",
    });
    setTooltip(processingIndicator, "Articles being fetched in background");
  } else if (
    isQueuedForRefresh &&
    !isRefreshProcessing &&
    !isProcessing &&
    !isQueuedForImport
  ) {
    const processingIndicator = feedNameContainer.createDiv({
      cls: "rss-dashboard-feed-processing-indicator",
      text: "⏳",
    });
    setTooltip(processingIndicator, "Feed queued for refresh");
  }
}
