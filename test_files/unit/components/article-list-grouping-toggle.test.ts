import { describe, it, expect } from "vitest";
import { buildArticle, createArticleListHarness } from "./article-list-harness";
import type { FeedItem } from "../../../src/types/types";

describe("ArticleList grouping header toggle", () => {
  it("renders Feed View as a flat article sequence when grouping is disabled", () => {
    const { container, list, cleanup } = createArticleListHarness({
      settings: { articleGroupBy: "none", viewStyle: "feed" },
      articles: [
        buildArticle({ guid: "a1", feedTitle: "Feed A" }),
        buildArticle({ guid: "b1", feedTitle: "Feed B" }),
        buildArticle({ guid: "a2", feedTitle: "Feed A" }),
      ],
    });

    try {
      list.render();

      expect(
        container.querySelectorAll(".rss-dashboard-feed-section"),
      ).toHaveLength(0);
      expect(
        container.querySelectorAll(".rss-dashboard-feed-section-header"),
      ).toHaveLength(0);
      expect(
        container.querySelectorAll(".rss-dashboard-feed-section-toggle"),
      ).toHaveLength(0);
      expect(
        Array.from(
          container.querySelectorAll<HTMLElement>(
            ".rss-dashboard-feed-item",
          ),
          (item) => item.dataset.articleGuid,
        ),
      ).toEqual(["a1", "b1", "a2"]);
    } finally {
      cleanup();
    }
  });

  it("renders one collapsible header per feed when Feed View groups by feed", () => {
    const { container, list, cleanup } = createArticleListHarness({
      settings: { articleGroupBy: "feed", viewStyle: "feed" },
      articles: [buildArticle({ guid: "a1", feedTitle: "Feed A" })],
    });

    try {
      list.render();

      expect(
        container.querySelectorAll(".rss-dashboard-article-group-header"),
      ).toHaveLength(0);
      expect(
        container.querySelectorAll(".rss-dashboard-feed-section-header"),
      ).toHaveLength(1);
      expect(
        container.querySelectorAll(".rss-dashboard-feed-section-toggle"),
      ).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("renders group header toggle and toggles collapsed state and persists setting", () => {
    const articlesToUse: FeedItem[] = [
      {
        guid: "a1",
        title: "A1",
        link: "https://example.com/a1",
        pubDate: new Date().toISOString(),
        description: "<p>desc</p>",
        read: false,
        starred: false,
        saved: false,
        tags: [],
        feedTitle: "Feed A",
        feedUrl: "https://feed-a.example.com/rss",
        coverImage: "",
      },
      {
        guid: "a2",
        title: "A2",
        link: "https://example.com/a2",
        pubDate: new Date().toISOString(),
        description: "<p>desc</p>",
        read: false,
        starred: false,
        saved: false,
        tags: [],
        feedTitle: "Feed B",
        feedUrl: "https://feed-b.example.com/rss",
        coverImage: "",
      },
    ];

    const { container, settings, list, cleanup } = createArticleListHarness({
      articles: articlesToUse,
      settings: { articleGroupBy: "feed", viewStyle: "list" },
    });

    // Initial render
    list.render();

    try {
      const groupHeaders = container.querySelectorAll(
        ".rss-dashboard-article-group-header",
      );
      expect(groupHeaders.length).toBeGreaterThanOrEqual(2);

      const toggles = container.querySelectorAll(
        ".rss-dashboard-article-group-toggle",
      );
      expect(toggles.length).toBeGreaterThanOrEqual(2);

      // Click the first toggle and assert group collapsed and setting persisted
      const firstToggle = toggles[0] as HTMLElement;
      const header = groupHeaders[0] as HTMLElement;
      const titleEl = header.querySelector(
        ".rss-dashboard-article-group-title",
      );
      const groupName = titleEl?.textContent?.trim() ?? "";

      // Before click: ensure not collapsed
      const groupContent = container.querySelector(
        ".rss-dashboard-article-group-content",
      );
      if (groupContent)
        expect(groupContent.classList.contains("collapsed")).toBe(false);

      firstToggle.click();

      // After click: collapsed class present on the corresponding group content
      // Find the group content next to the header
      const maybeContent = header.nextElementSibling as HTMLElement | null;
      if (maybeContent) {
        expect(maybeContent.classList.contains("collapsed")).toBe(true);
      }

      // Persisted to settings.collapsedFeedSections
      expect(Array.isArray(settings.collapsedFeedSections)).toBe(true);
      expect(settings.collapsedFeedSections.includes(groupName)).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("renders flat feed cards under date group header when articleGroupBy is date in Feed view", () => {
    const { container, list, cleanup } = createArticleListHarness({
      settings: { articleGroupBy: "date", viewStyle: "feed" },
      articles: [
        buildArticle({ guid: "a1", feedTitle: "Feed A", pubDate: "2026-08-25T10:00:00Z" }),
        buildArticle({ guid: "b1", feedTitle: "Feed B", pubDate: "2026-08-25T11:00:00Z" }),
      ],
    });

    try {
      list.render();

      expect(
        container.querySelectorAll(".rss-dashboard-article-group-header"),
      ).toHaveLength(1);
      expect(
        container.querySelectorAll(".rss-dashboard-feed-section-header"),
      ).toHaveLength(0);
      expect(
        container.querySelectorAll(".rss-dashboard-feed-item"),
      ).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it("renders nested feed sections under date group header when articleGroupBy is date_feed in Feed view", () => {
    const { container, list, cleanup } = createArticleListHarness({
      settings: { articleGroupBy: "date_feed", viewStyle: "feed" },
      articles: [
        buildArticle({ guid: "a1", feedTitle: "Feed A", pubDate: "2026-08-25T10:00:00Z" }),
        buildArticle({ guid: "b1", feedTitle: "Feed B", pubDate: "2026-08-25T11:00:00Z" }),
      ],
    });

    try {
      list.render();

      expect(
        container.querySelectorAll(".rss-dashboard-article-group-header"),
      ).toHaveLength(1);
      expect(
        container.querySelectorAll(".rss-dashboard-feed-section-header"),
      ).toHaveLength(2);
      expect(
        container.querySelectorAll(".rss-dashboard-feed-item"),
      ).toHaveLength(2);
    } finally {
      cleanup();
    }
  });
});
