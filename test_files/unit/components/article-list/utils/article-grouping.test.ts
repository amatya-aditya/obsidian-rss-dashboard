import { describe, it, expect, vi, afterEach } from "vitest";
import type { Feed, FeedItem } from "../../../../../src/types/types";
import { groupArticles, getFeedFolder } from "../../../../../src/components/article-list/utils/article-grouping";

describe("article-grouping utils", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("groupArticles", () => {
    it("returns all articles under 'All articles' when groupBy is 'none'", () => {
      const articles: FeedItem[] = [
        { guid: "1", link: "", description: "", title: "A1", feedTitle: "Feed A", feedUrl: "url-a", pubDate: "2024-01-01", read: false, starred: false, tags: [], coverImage: "" },
        { guid: "2", link: "", description: "", title: "A2", feedTitle: "Feed B", feedUrl: "url-b", pubDate: "2024-01-02", read: false, starred: false, tags: [], coverImage: "" },
      ];
      
      const result = groupArticles(articles, "none");
      
      expect(Object.keys(result)).toEqual(["All articles"]);
      expect(result["All articles"]).toHaveLength(2);
    });

    it("groups articles by feed title when groupBy is 'feed'", () => {
      const articles: FeedItem[] = [
        { guid: "1", link: "", description: "", title: "A1", feedTitle: "Feed A", feedUrl: "url-a", pubDate: "2024-01-01", read: false, starred: false, tags: [], coverImage: "" },
        { guid: "2", link: "", description: "", title: "A2", feedTitle: "Feed A", feedUrl: "url-a", pubDate: "2024-01-02", read: false, starred: false, tags: [], coverImage: "" },
        { guid: "3", link: "", description: "", title: "B1", feedTitle: "Feed B", feedUrl: "url-b", pubDate: "2024-01-03", read: false, starred: false, tags: [], coverImage: "" },
      ];
      
      const result = groupArticles(articles, "feed");
      
      expect(Object.keys(result).sort()).toEqual(["Feed A", "Feed B"]);
      expect(result["Feed A"]).toHaveLength(2);
      expect(result["Feed B"]).toHaveLength(1);
    });

    it("groups articles with missing feed title under 'Uncategorized'", () => {
      const articles: FeedItem[] = [
        { guid: "1", link: "", description: "", title: "A1", feedTitle: "", feedUrl: "url-a", pubDate: "2024-01-01", read: false, starred: false, tags: [], coverImage: "" },
      ];
      
      const result = groupArticles(articles, "feed");
      
      expect(Object.keys(result)).toContain("Uncategorized");
    });

    it("groups articles by date when groupBy is 'date'", () => {
      const articles: FeedItem[] = [
        { guid: "1", link: "", description: "", title: "A1", feedTitle: "Feed A", feedUrl: "url-a", pubDate: new Date().toISOString(), read: false, starred: false, tags: [], coverImage: "" },
        { guid: "2", link: "", description: "", title: "A2", feedTitle: "Feed A", feedUrl: "url-a", pubDate: new Date().toISOString(), read: false, starred: false, tags: [], coverImage: "" },
      ];
      
      const result = groupArticles(articles, "date");
      
      // All articles published today should be in "Today" group
      expect(Object.keys(result)).toContain("Today");
    });

    it("keeps same-calendar-day articles in one date group even when they straddle a relative-time bucket boundary", () => {
      // "now" is fixed so the two pubDates below (1 hour apart, same calendar
      // day) fall on opposite sides of a "2 weeks ago" / "3 weeks ago"
      // relative-time boundary. Grouping must key off calendar date, not off
      // a live "time ago" string computed against the current moment.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-15T10:46:00Z"));

      const articles: FeedItem[] = [
        { guid: "1", link: "", description: "", title: "A1", feedTitle: "Feed A", feedUrl: "url-a", pubDate: "2026-08-25T10:00:00Z", read: false, starred: false, tags: [], coverImage: "" },
        { guid: "2", link: "", description: "", title: "A2", feedTitle: "Feed B", feedUrl: "url-b", pubDate: "2026-08-25T11:00:00Z", read: false, starred: false, tags: [], coverImage: "" },
      ];

      const result = groupArticles(articles, "date");

      expect(Object.keys(result)).toHaveLength(1);
    });

    it("buckets an undated item with a firstSeenMs under its first-seen date when the fallback is enabled", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-15T10:46:00Z"));

      const articles: FeedItem[] = [
        {
          guid: "1",
          link: "",
          description: "",
          title: "A1",
          feedTitle: "Feed A",
          feedUrl: "url-a",
          pubDate: "",
          firstSeenMs: new Date("2026-08-25T10:00:00Z").getTime(),
          read: false,
          starred: false,
          tags: [],
          coverImage: "",
        },
      ];

      const result = groupArticles(articles, "date", undefined, true);

      expect(Object.keys(result)).toEqual(["Aug 25, 2026"]);
    });

    it("buckets an undated item under 'Unknown date' when the first-seen fallback is disabled", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-15T10:46:00Z"));

      const articles: FeedItem[] = [
        {
          guid: "1",
          link: "",
          description: "",
          title: "A1",
          feedTitle: "Feed A",
          feedUrl: "url-a",
          pubDate: "",
          firstSeenMs: new Date("2026-08-25T10:00:00Z").getTime(),
          read: false,
          starred: false,
          tags: [],
          coverImage: "",
        },
      ];

      const result = groupArticles(articles, "date", undefined, false);

      expect(Object.keys(result)).toEqual(["Unknown date"]);
    });

    it("buckets an undated item under 'Unknown date' when there is no firstSeenMs, even with the fallback enabled", () => {
      const articles: FeedItem[] = [
        { guid: "1", link: "", description: "", title: "A1", feedTitle: "Feed A", feedUrl: "url-a", pubDate: "", read: false, starred: false, tags: [], coverImage: "" },
      ];

      const result = groupArticles(articles, "date", undefined, true);

      expect(Object.keys(result)).toEqual(["Unknown date"]);
    });

    it("groups articles with no tags under 'All articles' when groupBy is 'none'", () => {
      const articles: FeedItem[] = [
        { guid: "1", link: "", description: "", title: "A1", feedTitle: "Feed A", feedUrl: "url-a", pubDate: "2024-01-01", read: false, starred: false, tags: [], coverImage: "" },
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
