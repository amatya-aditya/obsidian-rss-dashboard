import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Feed } from "../../../../../src/types/types";
import {
  renderFeedIcon,
  renderHeaderFeedIcon,
} from "../../../../../src/components/article-list/utils/feed-icon";
import { failedFeedIconUrls } from "../../../../../src/utils/favicon-utils";

const BASE_CONTEXT = {
  feeds: [] as Feed[],
  display: {
    hideDefaultRssIcon: false,
    useDomainIconsRss: true,
  } as Parameters<typeof renderFeedIcon>[3]["display"],
};

describe("feed-icon utils", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createDiv();
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("renderFeedIcon", () => {
    it("creates container for article feed icon", () => {
      renderFeedIcon(
        container,
        "https://example.com/feed",
        undefined,
        BASE_CONTEXT,
      );

      expect(
        container.querySelector(".rss-dashboard-article-feed-icon"),
      ).toBeTruthy();
    });

    it("renders RSS fallback when feed icon not configured", () => {
      renderFeedIcon(
        container,
        "https://unknown.com/rss",
        undefined,
        BASE_CONTEXT,
      );

      const iconEl = container.querySelector(
        ".rss-dashboard-article-feed-icon",
      );
      expect(iconEl).toBeTruthy();
    });

    it("renders podcast icon for podcast media type", () => {
      renderFeedIcon(
        container,
        "https://example.com/feed",
        "podcast",
        BASE_CONTEXT,
      );

      const iconEl = container.querySelector(
        ".rss-dashboard-article-feed-icon",
      );
      expect(iconEl?.classList.contains("podcast")).toBe(true);
    });

    it("renders video icon for YouTube video media type", () => {
      const feeds: Feed[] = [
        {
          url: "https://www.youtube.com/watch?v=123",
          title: "YouTube",
          folder: "",
          items: [],
          lastUpdated: 0,
          mediaType: "video",
        },
      ];
      renderFeedIcon(
        container,
        "https://www.youtube.com/watch?v=123",
        "video",
        {
          ...BASE_CONTEXT,
          feeds,
        },
      );

      const iconEl = container.querySelector(
        ".rss-dashboard-article-feed-icon",
      );
      expect(iconEl?.classList.contains("video")).toBe(true);
    });

    it("retries the feed icon after one failed load, then stops after a second", () => {
      const iconUrl = "https://example.com/logo.png";
      const feeds: Feed[] = [
        {
          url: "https://example.com/feed",
          title: "Example",
          folder: "",
          items: [],
          lastUpdated: 0,
          iconUrl,
        },
      ];
      const context = { ...BASE_CONTEXT, feeds };

      renderFeedIcon(container, "https://example.com/feed", undefined, context);
      const first = container.querySelector(
        ".rss-dashboard-article-feed-icon-img",
      ) as HTMLImageElement;
      first.onerror?.(new Event("error"));

      expect(failedFeedIconUrls.has(iconUrl)).toBe(false);

      container.empty();
      renderFeedIcon(container, "https://example.com/feed", undefined, context);
      const second = container.querySelector(
        ".rss-dashboard-article-feed-icon-img",
      ) as HTMLImageElement;
      expect(second).not.toBeNull();
      expect(second.getAttribute("src")).toBe(iconUrl);

      second.onerror?.(new Event("error"));

      expect(failedFeedIconUrls.has(iconUrl)).toBe(true);

      container.empty();
      renderFeedIcon(container, "https://example.com/feed", undefined, context);
      expect(
        container.querySelector(".rss-dashboard-article-feed-icon-img"),
      ).toBeNull();
    });
  });

  describe("renderHeaderFeedIcon", () => {
    it("renders configured feed logo", () => {
      const feeds: Feed[] = [
        {
          url: "https://example.com/feed",
          title: "Example",
          folder: "",
          items: [],
          lastUpdated: 0,
          iconUrl: "https://example.com/logo.png",
        },
      ];

      renderHeaderFeedIcon(container, "https://example.com/feed", {
        ...BASE_CONTEXT,
        feeds,
      });

      const img = container.querySelector(
        ".rss-dashboard-header-feed-icon-img",
      );
      expect(img).toBeTruthy();
      expect(img?.getAttribute("src")).toBe("https://example.com/logo.png");
    });

    it("renders podcast media type as mic", () => {
      const feeds: Feed[] = [
        {
          url: "https://example.com/podcast",
          title: "Podcast",
          folder: "",
          items: [],
          lastUpdated: 0,
          mediaType: "podcast",
        },
      ];

      renderHeaderFeedIcon(container, "https://example.com/podcast", {
        ...BASE_CONTEXT,
        feeds,
      });

      expect(container.classList.contains("podcast")).toBe(true);
    });

    it("renders YouTube video media type as play icon", () => {
      const feeds: Feed[] = [
        {
          url: "https://www.youtube.com/watch?v=123",
          title: "YouTube",
          folder: "",
          items: [],
          lastUpdated: 0,
          mediaType: "video",
        },
      ];

      renderHeaderFeedIcon(container, "https://www.youtube.com/watch?v=123", {
        ...BASE_CONTEXT,
        feeds,
      });

      expect(container.classList.contains("video")).toBe(true);
    });

    it("renders Mastodon fallback favicon", () => {
      renderHeaderFeedIcon(
        container,
        "https://mastodon.social/@user.rss",
        BASE_CONTEXT,
      );

      expect(
        container.querySelector(".rss-dashboard-header-favicon"),
      ).toBeTruthy();
    });

    it("retries the header feed icon after one failed load, then stops after a second", () => {
      const iconUrl = "https://example.com/logo.png";
      const feeds: Feed[] = [
        {
          url: "https://example.com/feed",
          title: "Example",
          folder: "",
          items: [],
          lastUpdated: 0,
          iconUrl,
        },
      ];
      const context = { ...BASE_CONTEXT, feeds };

      renderHeaderFeedIcon(container, "https://example.com/feed", context);
      const first = container.querySelector(
        ".rss-dashboard-header-feed-icon-img",
      ) as HTMLImageElement;
      first.onerror?.(new Event("error"));

      expect(failedFeedIconUrls.has(iconUrl)).toBe(false);

      container.empty();
      renderHeaderFeedIcon(container, "https://example.com/feed", context);
      const second = container.querySelector(
        ".rss-dashboard-header-feed-icon-img",
      ) as HTMLImageElement;
      expect(second).not.toBeNull();
      expect(second.getAttribute("src")).toBe(iconUrl);

      second.onerror?.(new Event("error"));

      expect(failedFeedIconUrls.has(iconUrl)).toBe(true);

      container.empty();
      renderHeaderFeedIcon(container, "https://example.com/feed", context);
      expect(
        container.querySelector(".rss-dashboard-header-feed-icon-img"),
      ).toBeNull();
    });
  });
});
