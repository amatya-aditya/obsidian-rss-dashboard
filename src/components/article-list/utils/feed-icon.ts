import { setIcon } from "obsidian";
import type { Feed } from "../../../types/types";
import type { DisplaySettings } from "../../../types/types";
import { MediaService } from "../../../services/media-service";
import { MastodonService } from "../../../services/mastodon-service";
import {
  extractDomain,
  getFaviconUrl,
  failedFeedIconUrls,
  createSafeIconImage,
} from "../../../utils/favicon-utils";

export interface FeedIconContext {
  feeds: Feed[];
  display: DisplaySettings;
}

export function renderFeedIcon(
  container: HTMLElement,
  feedUrl: string,
  mediaType: "article" | "video" | "podcast" | undefined,
  context: FeedIconContext,
): void {
  const iconContainer = container.createDiv({
    cls: "rss-dashboard-article-feed-icon",
  });
  const isYouTubeFeed = MediaService.isYouTubeFeed(feedUrl);
  const feed = context.feeds?.find((f) => f.url === feedUrl);

  if (feed && MediaService.shouldShowFeedIcon(feed, context.display)) {
    if (!feed.iconUrl || failedFeedIconUrls.has(feed.iconUrl)) {
      renderFallbackForFeed(iconContainer, feed, feedUrl, mediaType, isYouTubeFeed, context);
      return;
    }
    createSafeIconImage(iconContainer, feed.iconUrl, feed.title || feedUrl, () => {
      handleFeedIconFallback(iconContainer, feedUrl, context, feed, mediaType, isYouTubeFeed);
    }, "rss-dashboard-article-feed-icon-img");
  } else if (MediaService.isTwitterOrNitterFeed(feedUrl)) {
    renderTwitterFallbackIcon(iconContainer, context);
  } else if (MastodonService.isResolvedFeedUrl(feedUrl)) {
    renderMastodonFallbackIcon(iconContainer, feedUrl, context);
  } else if (mediaType === "video" && isYouTubeFeed) {
    setIcon(iconContainer, "play");
    iconContainer.addClass("video");
  } else if (mediaType === "podcast") {
    setIcon(iconContainer, "mic");
    iconContainer.addClass("podcast");
  } else if (context.display.useDomainIconsRss) {
    renderDomainFallbackIcon(iconContainer, feedUrl, context);
  } else if (!context.display.hideDefaultRssIcon) {
    setIcon(iconContainer, "rss");
  }
}

export function renderHeaderFeedIcon(
  container: HTMLElement,
  feedUrl: string,
  context: FeedIconContext,
): void {
  const feed = context.feeds.find((f) => f.url === feedUrl);
  const mediaType = feed?.mediaType;
  const isYouTubeFeed = MediaService.isYouTubeFeed(feedUrl);

  if (feed && MediaService.shouldShowFeedIcon(feed, context.display)) {
    if (!feed.iconUrl || failedFeedIconUrls.has(feed.iconUrl)) {
      renderHeaderFallbackForFeed(container, feed, feedUrl, mediaType, isYouTubeFeed, context);
      return;
    }
    createSafeIconImage(container, feed.iconUrl, feed.title || feedUrl, () => {
      handleHeaderFeedIconFallback(container, feedUrl, context, feed, mediaType, isYouTubeFeed);
    }, "rss-dashboard-header-feed-icon-img");
  } else if (MediaService.isTwitterOrNitterFeed(feedUrl)) {
    renderHeaderTwitterFallbackIcon(container, context);
  } else if (MastodonService.isResolvedFeedUrl(feedUrl)) {
    renderHeaderMastodonFallbackIcon(container, feedUrl, context);
  } else if (mediaType === "video" && isYouTubeFeed) {
    setIcon(container, "play");
    container.addClass("video");
  } else if (mediaType === "podcast") {
    setIcon(container, "mic");
    container.addClass("podcast");
  } else if (context.display.useDomainIconsRss) {
    renderHeaderDomainIcon(container, feedUrl, context);
  } else if (!context.display.hideDefaultRssIcon) {
    setIcon(container, "rss");
  }
}

function renderFallbackForFeed(
  iconContainer: HTMLElement,
  feed: Feed,
  feedUrl: string,
  mediaType: "article" | "video" | "podcast" | undefined,
  isYouTubeFeed: boolean,
  context: FeedIconContext,
): void {
  if (MediaService.isTwitterOrNitterFeed(feedUrl)) {
    renderTwitterFallbackIcon(iconContainer, context);
  } else if (MastodonService.isResolvedFeedUrl(feedUrl)) {
    renderMastodonFallbackIcon(iconContainer, feedUrl, context);
  } else if (mediaType === "video" && isYouTubeFeed) {
    setIcon(iconContainer, "play");
    iconContainer.addClass("video");
  } else if (mediaType === "podcast") {
    setIcon(iconContainer, "mic");
    iconContainer.addClass("podcast");
  } else if (context.display.useDomainIconsRss) {
    renderDomainFallbackIcon(iconContainer, feedUrl, context);
  } else if (!context.display.hideDefaultRssIcon) {
    setIcon(iconContainer, "rss");
  }
}

function renderHeaderFallbackForFeed(
  container: HTMLElement,
  feed: Feed,
  feedUrl: string,
  mediaType: "article" | "video" | "podcast" | undefined,
  isYouTubeFeed: boolean,
  context: FeedIconContext,
): void {
  if (MediaService.isTwitterOrNitterFeed(feedUrl)) {
    renderHeaderTwitterFallbackIcon(container, context);
  } else if (MastodonService.isResolvedFeedUrl(feedUrl)) {
    renderHeaderMastodonFallbackIcon(container, feedUrl, context);
  } else if (mediaType === "video" && isYouTubeFeed) {
    setIcon(container, "play");
    container.addClass("video");
  } else if (mediaType === "podcast") {
    setIcon(container, "mic");
    container.addClass("podcast");
  } else if (context.display.useDomainIconsRss) {
    renderHeaderDomainIcon(container, feedUrl, context);
  } else if (!context.display.hideDefaultRssIcon) {
    setIcon(container, "rss");
  }
}

function handleFeedIconFallback(
  iconContainer: HTMLElement,
  feedUrl: string,
  context: FeedIconContext,
  _feed: Feed,
  _mediaType: "article" | "video" | "podcast" | undefined,
  _isYouTubeFeed: boolean,
): void {
  iconContainer.empty();
  if (MediaService.isTwitterOrNitterFeed(feedUrl)) {
    const faviconUrl = getFaviconUrl("twitter.com");
    if (!failedFeedIconUrls.has(faviconUrl)) {
      createSafeIconImage(iconContainer, faviconUrl, "Twitter/X", () => {
        iconContainer.empty();
        if (!context.display.hideDefaultRssIcon) {
          setIcon(iconContainer, "rss");
        }
      }, "rss-dashboard-feed-favicon");
      return;
    }
  } else if (MastodonService.isResolvedFeedUrl(feedUrl)) {
    const domain = extractDomain(feedUrl);
    if (domain) {
      const faviconUrl = getFaviconUrl(domain);
      if (!failedFeedIconUrls.has(faviconUrl)) {
        createSafeIconImage(iconContainer, faviconUrl, "Mastodon", () => {
          iconContainer.empty();
          if (!context.display.hideDefaultRssIcon) {
            setIcon(iconContainer, "rss");
          }
        }, "rss-dashboard-feed-favicon");
        return;
      }
    }
  }
  if (!context.display.hideDefaultRssIcon) {
    setIcon(iconContainer, "rss");
  }
}

function handleHeaderFeedIconFallback(
  container: HTMLElement,
  feedUrl: string,
  context: FeedIconContext,
  _feed: Feed,
  _mediaType: "article" | "video" | "podcast" | undefined,
  _isYouTubeFeed: boolean,
): void {
  container.empty();
  if (MediaService.isTwitterOrNitterFeed(feedUrl)) {
    const faviconUrl = getFaviconUrl("twitter.com");
    if (!failedFeedIconUrls.has(faviconUrl)) {
      createSafeIconImage(container, faviconUrl, "Twitter/X", () => {
        container.empty();
        if (!context.display.hideDefaultRssIcon) {
          setIcon(container, "rss");
        }
      }, "rss-dashboard-header-favicon");
      return;
    }
  } else if (MastodonService.isResolvedFeedUrl(feedUrl)) {
    const domain = extractDomain(feedUrl);
    if (domain) {
      const faviconUrl = getFaviconUrl(domain);
      if (!failedFeedIconUrls.has(faviconUrl)) {
        createSafeIconImage(container, faviconUrl, "Mastodon", () => {
          container.empty();
          if (!context.display.hideDefaultRssIcon) {
            setIcon(container, "rss");
          }
        }, "rss-dashboard-header-favicon");
        return;
      }
    }
  }
  if (!context.display.hideDefaultRssIcon) {
    setIcon(container, "rss");
  }
}

function renderTwitterFallbackIcon(iconContainer: HTMLElement, context: FeedIconContext): void {
  const faviconUrl = getFaviconUrl("twitter.com");
  if (!failedFeedIconUrls.has(faviconUrl)) {
    createSafeIconImage(iconContainer, faviconUrl, "Twitter/X", () => {
      iconContainer.empty();
      if (!context.display.hideDefaultRssIcon) {
        setIcon(iconContainer, "rss");
      }
    }, "rss-dashboard-feed-favicon");
  } else if (!context.display.hideDefaultRssIcon) {
    setIcon(iconContainer, "rss");
  }
}

function renderMastodonFallbackIcon(iconContainer: HTMLElement, feedUrl: string, context: FeedIconContext): void {
  const domain = extractDomain(feedUrl);
  if (domain) {
    const faviconUrl = getFaviconUrl(domain);
    if (!failedFeedIconUrls.has(faviconUrl)) {
      createSafeIconImage(iconContainer, faviconUrl, "Mastodon", () => {
        iconContainer.empty();
        if (!context.display.hideDefaultRssIcon) {
          setIcon(iconContainer, "rss");
        }
      }, "rss-dashboard-feed-favicon");
      return;
    }
  }
  if (!context.display.hideDefaultRssIcon) {
    setIcon(iconContainer, "rss");
  }
}

function renderHeaderTwitterFallbackIcon(container: HTMLElement, context: FeedIconContext): void {
  const faviconUrl = getFaviconUrl("twitter.com");
  if (!failedFeedIconUrls.has(faviconUrl)) {
    createSafeIconImage(container, faviconUrl, "Twitter/X", () => {
      container.empty();
      if (!context.display.hideDefaultRssIcon) {
        setIcon(container, "rss");
      }
    }, "rss-dashboard-header-favicon");
  } else if (!context.display.hideDefaultRssIcon) {
    setIcon(container, "rss");
  }
}

function renderHeaderMastodonFallbackIcon(container: HTMLElement, feedUrl: string, context: FeedIconContext): void {
  const domain = extractDomain(feedUrl);
  if (domain) {
    const faviconUrl = getFaviconUrl(domain);
    if (!failedFeedIconUrls.has(faviconUrl)) {
      createSafeIconImage(container, faviconUrl, "Mastodon", () => {
        container.empty();
        if (!context.display.hideDefaultRssIcon) {
          setIcon(container, "rss");
        }
      }, "rss-dashboard-header-favicon");
      return;
    }
  }
  if (!context.display.hideDefaultRssIcon) {
    setIcon(container, "rss");
  }
}

function renderDomainFallbackIcon(iconContainer: HTMLElement, feedUrl: string, context: FeedIconContext): void {
  const domain = extractDomain(feedUrl);
  if (domain) {
    const faviconUrl = getFaviconUrl(domain);
    if (!failedFeedIconUrls.has(faviconUrl)) {
      createSafeIconImage(iconContainer, faviconUrl, domain, () => {
        iconContainer.empty();
        if (!context.display.hideDefaultRssIcon) {
          setIcon(iconContainer, "rss");
        }
      }, "rss-dashboard-feed-favicon");
      return;
    }
  }
  if (!context.display.hideDefaultRssIcon) {
    setIcon(iconContainer, "rss");
  }
}

function renderHeaderDomainIcon(container: HTMLElement, feedUrl: string, context: FeedIconContext): void {
  const domain = extractDomain(feedUrl);
  if (domain) {
    const faviconUrl = getFaviconUrl(domain);
    if (!failedFeedIconUrls.has(faviconUrl)) {
      createSafeIconImage(container, faviconUrl, domain, () => {
        container.empty();
        if (!context.display.hideDefaultRssIcon) {
          setIcon(container, "rss");
        }
      }, "rss-dashboard-header-favicon");
      return;
    }
  }
  if (!context.display.hideDefaultRssIcon) {
    setIcon(container, "rss");
  }
}