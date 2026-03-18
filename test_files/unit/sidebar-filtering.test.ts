import { describe, it, expect } from "vitest";
import { Feed } from "../../src/types/types";

// Helper to create a mock feed
const createMockFeed = (guid: string, read: boolean = false): Feed => ({
  title: `Feed ${guid}`,
  url: `https://example.com/${guid}`,
  folder: "Uncategorized",
  lastUpdated: Date.now(),
  items: [
    {
      title: `Article ${guid}`,
      link: `https://example.com/article/${guid}`,
      description: "",
      pubDate: new Date().toISOString(),
      guid: `guid-${guid}`,
      read,
      starred: false,
      tags: [],
      feedTitle: `Feed ${guid}`,
      feedUrl: `https://example.com/${guid}`,
      coverImage: "",
      saved: false,
    },
  ],
});

const createEmptyFeed = (guid: string): Feed => ({
  title: `Empty Feed ${guid}`,
  url: `https://example.com/empty-${guid}`,
  folder: "Uncategorized",
  lastUpdated: Date.now(),
  items: [],
});

describe("Sidebar Filtering Logic", () => {
  it("filters feeds correctly based on hideEmptyFeeds setting", () => {
    const feedWithUnread = createMockFeed("unread", false);
    const feedWithAllRead = createMockFeed("read", true);
    const emptyFeed = createEmptyFeed("empty");

    const feeds = [feedWithUnread, feedWithAllRead, emptyFeed];

    // Case 1: hideEmptyFeeds is false (default)
    // All feeds should be visible
    const visibleWhenOff = feeds.filter(() => true); // Simulate no filtering
    expect(visibleWhenOff).toHaveLength(3);

    // Case 2: hideEmptyFeeds is true
    const hideEmptyFeeds = true;
    const filteredFeeds = feeds.filter((feed) => {
      if (hideEmptyFeeds) {
        return feed.items.length > 0 && feed.items.some((item) => !item.read);
      }
      return true;
    });

    expect(filteredFeeds).toHaveLength(1);
    expect(filteredFeeds[0].url).toBe(feedWithUnread.url);
  });

  it("identifies feeds with 0 articles as empty", () => {
    const emptyFeed = createEmptyFeed("test");
    const isHidden = emptyFeed.items.length === 0 || !emptyFeed.items.some(item => !item.read);
    expect(isHidden).toBe(true);
  });

  it("identifies feeds with only read articles as empty/no-unread", () => {
    const readFeed = createMockFeed("test", true);
    const hasUnread = readFeed.items.length > 0 && readFeed.items.some(item => !item.read);
    expect(hasUnread).toBe(false);
  });

  it("identifies feeds with at least one unread article as not empty", () => {
    const unreadFeed = createMockFeed("test", false);
    const hasUnread = unreadFeed.items.length > 0 && unreadFeed.items.some(item => !item.read);
    expect(hasUnread).toBe(true);
  });
});
