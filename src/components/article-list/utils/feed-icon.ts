import { setIcon } from "obsidian";
import type { Feed } from "../../../types/types";
import type { DisplaySettings } from "../../../types/types";
import { MediaService } from "../../../services/media-service";
import { MastodonService } from "../../../services/mastodon-service";
import { extractDomain, getFaviconUrl } from "../../../utils/favicon-utils";

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
    const imgEl = iconContainer.createEl("img", {
      attr: { src: feed.iconUrl!, alt: feed.title || feedUrl },
      cls: "rss-dashboard-article-feed-icon-img",
    });
    imgEl.onerror = () => {
      handleFeedIconFallback(iconContainer, feedUrl, context, feed, mediaType, isYouTubeFeed);
    };
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
    const imgEl = container.createEl("img", {
      attr: {
        src: feed.iconUrl!,
        alt: feed.title || feedUrl,
      },
      cls: "rss-dashboard-header-feed-icon-img",
    });
    imgEl.onerror = () => {
      handleHeaderFeedIconFallback(container, feedUrl, context, feed, mediaType, isYouTubeFeed);
    };
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
    const fallbackImg = iconContainer.createEl("img", {
      attr: {
        src: faviconUrl,
        alt: "Twitter/X",
      },
      cls: "rss-dashboard-feed-favicon",
    });
    fallbackImg.onerror = () => {
      iconContainer.empty();
      if (!context.display.hideDefaultRssIcon) {
        setIcon(iconContainer, "rss");
      }
    };
  } else if (MastodonService.isResolvedFeedUrl(feedUrl)) {
    const domain = extractDomain(feedUrl);
    if (domain) {
      const faviconUrl = getFaviconUrl(domain);
      const fallbackImg = iconContainer.createEl("img", {
        attr: {
          src: faviconUrl,
          alt: "Mastodon",
        },
        cls: "rss-dashboard-feed-favicon",
      });
      fallbackImg.onerror = () => {
        iconContainer.empty();
        if (!context.display.hideDefaultRssIcon) {
          setIcon(iconContainer, "rss");
        }
      };
    } else if (!context.display.hideDefaultRssIcon) {
      setIcon(iconContainer, "rss");
    }
  } else if (!context.display.hideDefaultRssIcon) {
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
    const fallbackImg = container.createEl("img", {
      attr: {
        src: faviconUrl,
        alt: "Twitter/X",
      },
      cls: "rss-dashboard-header-favicon",
    });
    fallbackImg.onerror = () => {
      container.empty();
      if (!context.display.hideDefaultRssIcon) {
        setIcon(container, "rss");
      }
    };
  } else if (MastodonService.isResolvedFeedUrl(feedUrl)) {
    const domain = extractDomain(feedUrl);
    if (domain) {
      const faviconUrl = getFaviconUrl(domain);
      const fallbackImg = container.createEl("img", {
        attr: {
          src: faviconUrl,
          alt: "Mastodon",
        },
        cls: "rss-dashboard-header-favicon",
      });
      fallbackImg.onerror = () => {
        container.empty();
        if (!context.display.hideDefaultRssIcon) {
          setIcon(container, "rss");
        }
      };
    } else if (!context.display.hideDefaultRssIcon) {
      setIcon(container, "rss");
    }
  } else if (!context.display.hideDefaultRssIcon) {
    setIcon(container, "rss");
  }
}

function renderTwitterFallbackIcon(iconContainer: HTMLElement, context: FeedIconContext): void {
  const faviconUrl = getFaviconUrl("twitter.com");
  iconContainer.empty();
  const imgEl = iconContainer.createEl("img", {
    attr: {
      src: faviconUrl,
      alt: "Twitter/X",
    },
    cls: "rss-dashboard-feed-favicon",
  });
  imgEl.onerror = () => {
    iconContainer.empty();
    if (!context.display.hideDefaultRssIcon) {
      setIcon(iconContainer, "rss");
    }
  };
}

function renderMastodonFallbackIcon(iconContainer: HTMLElement, feedUrl: string, context: FeedIconContext): void {
  const domain = extractDomain(feedUrl);
  if (domain) {
    const faviconUrl = getFaviconUrl(domain);
    iconContainer.empty();
    const imgEl = iconContainer.createEl("img", {
      attr: {
        src: faviconUrl,
        alt: "Mastodon",
      },
      cls: "rss-dashboard-feed-favicon",
    });
    imgEl.onerror = () => {
      iconContainer.empty();
      if (!context.display.hideDefaultRssIcon) {
        setIcon(iconContainer, "rss");
      }
    };
  } else if (!context.display.hideDefaultRssIcon) {
    setIcon(iconContainer, "rss");
  }
}

function renderHeaderTwitterFallbackIcon(container: HTMLElement, context: FeedIconContext): void {
  const faviconUrl = getFaviconUrl("twitter.com");
  container.empty();
  const imgEl = container.createEl("img", {
    attr: {
      src: faviconUrl,
      alt: "Twitter/X",
    },
    cls: "rss-dashboard-header-favicon",
  });
  imgEl.onerror = () => {
    container.empty();
    if (!context.display.hideDefaultRssIcon) {
      setIcon(container, "rss");
    }
  };
}

function renderHeaderMastodonFallbackIcon(container: HTMLElement, feedUrl: string, context: FeedIconContext): void {
  const domain = extractDomain(feedUrl);
  if (domain) {
    const faviconUrl = getFaviconUrl(domain);
    container.empty();
    const imgEl = container.createEl("img", {
      attr: {
        src: faviconUrl,
        alt: "Mastodon",
      },
      cls: "rss-dashboard-header-favicon",
    });
    imgEl.onerror = () => {
      container.empty();
      if (!context.display.hideDefaultRssIcon) {
        setIcon(container, "rss");
      }
    };
  } else if (!context.display.hideDefaultRssIcon) {
    setIcon(container, "rss");
  }
}

function renderDomainFallbackIcon(iconContainer: HTMLElement, feedUrl: string, context: FeedIconContext): void {
  const domain = extractDomain(feedUrl);
  if (domain) {
    const faviconUrl = getFaviconUrl(domain);
    iconContainer.empty();
    const imgEl = iconContainer.createEl("img", {
      attr: {
        src: faviconUrl,
        alt: domain,
      },
      cls: "rss-dashboard-feed-favicon",
    });
    imgEl.onerror = () => {
      iconContainer.empty();
      if (!context.display.hideDefaultRssIcon) {
        setIcon(iconContainer, "rss");
      }
    };
  } else if (!context.display.hideDefaultRssIcon) {
    setIcon(iconContainer, "rss");
  }
}

function renderHeaderDomainIcon(container: HTMLElement, feedUrl: string, context: FeedIconContext): void {
  const domain = extractDomain(feedUrl);
  if (domain) {
    const faviconUrl = getFaviconUrl(domain);
    const imgEl = container.createEl("img", {
      attr: {
        src: faviconUrl,
        alt: domain,
      },
      cls: "rss-dashboard-header-favicon",
    });
    imgEl.onerror = () => {
      container.empty();
      if (!context.display.hideDefaultRssIcon) {
        setIcon(container, "rss");
      }
    };
  } else if (!context.display.hideDefaultRssIcon) {
    setIcon(container, "rss");
  }
}