import { describe, it, expect } from "vitest";
import type { Feed, FeedItem } from "../../../../../src/types/types";
import { groupArticles, getFeedFolder } from "../../../../../src/components/article-list/utils/article-grouping";

describe("article-grouping utils", () => {
  describe("groupArticles", () => {
    it("returns all articles under 'All articles' when groupBy is 'none'", () => {
      const articles: FeedItem[] = [
        { guid: "1", title: "A1", feedTitle: "Feed A", feedUrl: "url-a", pubDate: "2024-01-01", read: false, starred: false, tags: [], coverImage: "" },
        { guid: "2", title: "A2", feedTitle: "Feed B", feedUrl: "url-b", pubDate: "2024-01-02", read: false, starred: false, tags: [], coverImage: "" },
      ];
      
      const result = groupArticles(articles, "none");
      
      expect(Object.keys(result)).toEqual(["All articles"]);
      expect(result["All articles"]).toHaveLength(2);
    });

    it("groups articles by feed title when groupBy is 'feed'", () => {
      const articles: FeedItem[] = [
        { guid: "1", title: "A1", feedTitle: "Feed A", feedUrl: "url-a", pubDate: "2024-01-01", read: false, starred: false, tags: [], coverImage: "" },
        { guid: "2", title: "A2", feedTitle: "Feed A", feedUrl: "url-a", pubDate: "2024-01-02", read: false, starred: false, tags: [], coverImage: "" },
        { guid: "3", title: "B1", feedTitle: "Feed B", feedUrl: "url-b", pubDate: "2024-01-03", read: false, starred: false, tags: [], coverImage: "" },
      ];
      
      const result = groupArticles(articles, "feed");
      
      expect(Object.keys(result).sort()).toEqual(["Feed A", "Feed B"]);
      expect(result["Feed A"]).toHaveLength(2);
      expect(result["Feed B"]).toHaveLength(1);
    });

    it("groups articles with missing feed title under 'Uncategorized'", () => {
      const articles: FeedItem[] = [
        { guid: "1", title: "A1", feedTitle: "", feedUrl: "url-a", pubDate: "2024-01-01", read: false, starred: false, tags: [], coverImage: "" },
      ];
      
      const result = groupArticles(articles, "feed");
      
      expect(Object.keys(result)).toContain("Uncategorized");
    });

    it("groups articles by date when groupBy is 'date'", () => {
      const articles: FeedItem[] = [
        { guid: "1", title: "A1", feedTitle: "Feed A", feedUrl: "url-a", pubDate: new Date().toISOString(), read: false, starred: false, tags: [], coverImage: "" },
        { guid: "2", title: "A2", feedTitle: "Feed A", feedUrl: "url-a", pubDate: new Date().toISOString(), read: false, starred: false, tags: [], coverImage: "" },
      ];
      
      const result = groupArticles(articles, "date");
      
      // All articles published today should be in "Today" group
      expect(Object.keys(result)).toContain("Today");
    });

    it("groups articles with no tags under 'All articles' when groupBy is 'none'", () => {
      const articles: FeedItem[] = [
        { guid: "1", title: "A1", feedTitle: "Feed A", feedUrl: "url-a", pubDate: "2024-01-01", read: false, starred: false, tags: [], coverImage: "" },
      ];
      
      const result = groupArticles(articles, "none");
      
      expect(result["All articles"][0]).toBe(articles[0]);
    });
  });

  describe("getFeedFolder", () => {
    it("returns the folder for a matching feed URL", () => {
      const settingsFeeds: Feed[] = [
        { title: "Feed A", url: "https://example.com/feed", folder: "Tech", items: [], lastUpdated: 0 },
      ];
      
      const result = getFeedFolder("https://example.com/feed", settingsFeeds);
      
      expect(result).toBe("Tech");
    });

    it("returns undefined for non-matching feed URL", () => {
      const settingsFeeds: Feed[] = [
        { title: "Feed A", url: "https://example.com/feed", folder: "Tech", items: [], lastUpdated: 0 },
      ];
      
      const result = getFeedFolder("https://other.com/feed", settingsFeeds);
      
      expect(result).toBeUndefined();
    });

    it("returns undefined for empty feeds array", () => {
      const result = getFeedFolder("any-url", []);
      
      expect(result).toBeUndefined();
    });
  });
});
