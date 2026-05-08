import { describe, expect, it } from "vitest";
import {
  buildArticleEmptyStateContext,
  detectFilteredOutScenario,
} from "../../../src/utils/filter-detection";
import type {
  FeedItem,
  FeedRefreshDiagnostics,
} from "../../../src/types/types";

interface ArticleFilter {
  type: "age" | "read" | "unread" | "starred" | "saved" | "none";
  value: unknown;
}

// Helper: Create a FeedItem with defaults
function createItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Sample Article",
    link: "https://example.com/article",
    description: "<p>This is a sample article</p>",
    pubDate: new Date().toISOString(),
    guid: `guid-${Math.random()}`,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Sample Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    ...overrides,
  };
}

describe("Filter Detection - detectFilteredOutScenario", () => {
  describe("Age Filter Detection", () => {
    it("detects when all articles are filtered by age threshold (1 month)", () => {
      // Arrange: Create articles older than 1 month
      const oneMonthAgoMs = 30 * 24 * 60 * 60 * 1000;
      const twoMonthsAgoDate = new Date(
        Date.now() - 2 * oneMonthAgoMs,
      ).toISOString();

      const feedItems: FeedItem[] = [
        createItem({ pubDate: twoMonthsAgoDate, title: "Old Article 1" }),
        createItem({ pubDate: twoMonthsAgoDate, title: "Old Article 2" }),
        createItem({ pubDate: twoMonthsAgoDate, title: "Old Article 3" }),
      ];

      const articleFilter: ArticleFilter = {
        type: "age",
        value: oneMonthAgoMs,
      };

      // Mock matchesFilters function that always returns false (all articles filtered)
      const matchesFiltersFn = () => false;

      // Act
      const result = detectFilteredOutScenario(
        feedItems,
        articleFilter,
        matchesFiltersFn,
      );

      // Assert
      expect(result.type).toBe("AllArticlesFiltered");
      expect(result.unfilteredCount).toBe(3);
      expect(result.filteredCount).toBe(0);
      expect(result.filterReason).toContain("age");
      expect(result.thresholdLabel).toBe("1 month");
    });

    it("returns NoArticlesAtAll when feed is genuinely empty", () => {
      // Arrange: No articles
      const feedItems: FeedItem[] = [];

      const articleFilter: ArticleFilter = {
        type: "age",
        value: 30 * 24 * 60 * 60 * 1000,
      };

      const matchesFiltersFn = () => false;

      // Act
      const result = detectFilteredOutScenario(
        feedItems,
        articleFilter,
        matchesFiltersFn,
      );

      // Assert
      expect(result.type).toBe("NoArticlesAtAll");
      expect(result.unfilteredCount).toBe(0);
    });

    it("returns NoArticlesAtAll when some articles pass the filter", () => {
      // Arrange: Mix of old and recent articles, with some passing filter
      const oneMonthAgoMs = 30 * 24 * 60 * 60 * 1000;
      const recentDate = new Date(
        Date.now() - 1 * 24 * 60 * 60 * 1000,
      ).toISOString(); // 1 day ago

      const feedItems: FeedItem[] = [
        createItem({ pubDate: recentDate, title: "Recent Article" }),
        createItem({ pubDate: recentDate, title: "Another Recent" }),
      ];

      const articleFilter: ArticleFilter = {
        type: "age",
        value: oneMonthAgoMs,
      };

      // Mock: Some articles pass the filter
      const matchesFiltersFn = (item: FeedItem) =>
        item.title.includes("Recent");

      // Act
      const result = detectFilteredOutScenario(
        feedItems,
        articleFilter,
        matchesFiltersFn,
      );

      // Assert
      expect(result.type).toBe("NoArticlesAtAll");
    });
  });

  describe("Multi-Filter Detection", () => {
    it("detects when articles are filtered by multi-filter combination (date + tags)", () => {
      // Arrange: Articles exist but all fail tag requirement
      const feedItems: FeedItem[] = [
        createItem({ title: "No Tags", tags: [] }),
        createItem({ title: "No Tags 2", tags: [] }),
      ];

      const articleFilter: ArticleFilter = {
        type: "none",
        value: 0,
      };

      // Mock: All articles filtered out by tag requirements
      const matchesFiltersFn = () => false;

      // Act
      const result = detectFilteredOutScenario(
        feedItems,
        articleFilter,
        matchesFiltersFn,
      );

      // Assert
      expect(result.type).toBe("AllArticlesFiltered");
      expect(result.unfilteredCount).toBe(2);
      expect(result.filteredCount).toBe(0);
      expect(result.filterReason).toContain("filter");
    });
  });

  describe("Mixed Article Filtering", () => {
    it("correctly counts when some articles pass filters and some don't", () => {
      // Arrange: 5 articles total, 2 pass filter, 3 fail
      const feedItems: FeedItem[] = [
        createItem({ title: "Passes 1" }),
        createItem({ title: "Fails 1" }),
        createItem({ title: "Passes 2" }),
        createItem({ title: "Fails 2" }),
        createItem({ title: "Fails 3" }),
      ];

      const articleFilter: ArticleFilter = {
        type: "none",
        value: 0,
      };

      // Mock: Only articles with "Passes" pass the filter
      const matchesFiltersFn = (item: FeedItem) =>
        item.title.includes("Passes");

      // Act
      const result = detectFilteredOutScenario(
        feedItems,
        articleFilter,
        matchesFiltersFn,
      );

      // Assert
      expect(result.type).toBe("NoArticlesAtAll"); // Some pass, so not all filtered
      expect(result.unfilteredCount).toBe(5);
    });

    it("detects all articles filtered out even with mixed starting set", () => {
      // Arrange: 5 articles, but ALL get filtered by new filter
      const feedItems: FeedItem[] = [
        createItem({ title: "Article 1" }),
        createItem({ title: "Article 2" }),
        createItem({ title: "Article 3" }),
        createItem({ title: "Article 4" }),
        createItem({ title: "Article 5" }),
      ];

      const articleFilter: ArticleFilter = {
        type: "age",
        value: 30 * 24 * 60 * 60 * 1000,
      };

      // Mock: New filter fails all
      const matchesFiltersFn = () => false;

      // Act
      const result = detectFilteredOutScenario(
        feedItems,
        articleFilter,
        matchesFiltersFn,
      );

      // Assert
      expect(result.type).toBe("AllArticlesFiltered");
      expect(result.unfilteredCount).toBe(5);
      expect(result.filteredCount).toBe(0);
    });
  });

  describe("Threshold Label Mapping", () => {
    it("maps 30-day threshold to '1 month'", () => {
      const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
      const feedItems = [createItem()];
      const articleFilter: ArticleFilter = { type: "age", value: oneMonthMs };
      const matchesFiltersFn = () => false;

      const result = detectFilteredOutScenario(
        feedItems,
        articleFilter,
        matchesFiltersFn,
      );

      expect(result.thresholdLabel).toBe("1 month");
    });

    it("maps 90-day threshold to '3 months'", () => {
      const threeMonthsMs = 90 * 24 * 60 * 60 * 1000;
      const feedItems = [createItem()];
      const articleFilter: ArticleFilter = {
        type: "age",
        value: threeMonthsMs,
      };
      const matchesFiltersFn = () => false;

      const result = detectFilteredOutScenario(
        feedItems,
        articleFilter,
        matchesFiltersFn,
      );

      expect(result.thresholdLabel).toBe("3 months");
    });

    it("maps 7-day threshold to '1 week'", () => {
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
      const feedItems = [createItem()];
      const articleFilter: ArticleFilter = { type: "age", value: oneWeekMs };
      const matchesFiltersFn = () => false;

      const result = detectFilteredOutScenario(
        feedItems,
        articleFilter,
        matchesFiltersFn,
      );

      expect(result.thresholdLabel).toBe("1 week");
    });
  });

  describe("buildArticleEmptyStateContext", () => {
    it("builds an age-filter context when articles survive non-age filters but fail the age threshold", () => {
      const context = buildArticleEmptyStateContext({
        visibleCount: 0,
        scopedCount: 3,
        availableBeforeAgeFilterCount: 3,
        viewFilterReasonLabel: null,
        articleFilter: {
          type: "age",
          value: 30 * 24 * 60 * 60 * 1000,
        },
      });

      expect(context.type).toBe("AllArticlesFiltered");
      expect(context.unfilteredCount).toBe(3);
      expect(context.thresholdLabel).toBe("1 month");
      expect(context.actionLabel).toBe("Adjust view filters");
    });

    it("builds a view-filter context when items exist but fail the current unread/read filter", () => {
      const context = buildArticleEmptyStateContext({
        visibleCount: 0,
        scopedCount: 3,
        availableBeforeAgeFilterCount: 0,
        viewFilterReasonLabel: "the Unread view filter",
        articleFilter: {
          type: "age",
          value: 30 * 24 * 60 * 60 * 1000,
        },
      });

      expect(context.type).toBe("AllArticlesFiltered");
      expect(context.thresholdLabel).toBeUndefined();
      expect(context.filterReason).toBe("view-filter");
      expect(context.filterReasonLabel).toBe("the Unread view filter");
      expect(context.actionLabel).toBe("Adjust view filters");
    });

    it("builds a retention-pruned context when refresh skipped all items due to auto-delete cutoff", () => {
      const refreshDiagnostics: FeedRefreshDiagnostics = {
        fetchedItemCount: 4,
        mergedItemCountBeforeRetention: 0,
        retainedItemCount: 0,
        retentionRemovedCount: 0,
        skippedByRefreshCutoffCount: 4,
        autoDeleteDurationDays: 30,
      };

      const context = buildArticleEmptyStateContext({
        visibleCount: 0,
        scopedCount: 0,
        availableBeforeAgeFilterCount: 0,
        viewFilterReasonLabel: null,
        articleFilter: {
          type: "age",
          value: 30 * 24 * 60 * 60 * 1000,
        },
        refreshDiagnostics,
      });

      expect(context.type).toBe("AllArticlesPrunedByRetention");
      expect(context.prunedCount).toBe(4);
      expect(context.retentionLabel).toBe("30 days");
      expect(context.actionLabel).toBe("Adjust per-feed filter settings");
    });
  });
});
