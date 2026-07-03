import { describe, it, expect } from "vitest";
import { createArticleListHarness } from "./article-list-harness";

describe("ArticleList grouping header toggle", () => {
  it("renders group header toggle and toggles collapsed state and persists setting", () => {
    const articlesToUse = [
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
      articles: articlesToUse as any,
      settings: { articleGroupBy: "feed", viewStyle: "feed" },
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
});
