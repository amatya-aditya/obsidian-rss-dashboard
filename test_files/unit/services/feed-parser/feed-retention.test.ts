import { describe, it, expect } from "vitest";
import type { Feed, FeedItem } from "../../../../src/types/types";
import {
  mergeFeedHistoryItems,
  applyFeedRetentionLimits,
} from "../../../../src/services/feed-parser/feed-retention.js";

describe("mergeFeedHistoryItems", () => {
  const makeItem = (
    guid: string,
    pubDate: string,
    overrides?: Partial<FeedItem>,
  ): FeedItem => ({
    title: guid,
    link: `https://example.com/${guid}`,
    description: "",
    pubDate,
    guid,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    saved: false,
    ...overrides,
  });

  it("preserves existing history items outside the server's latest-N window", () => {
    const existingItems: FeedItem[] = Array.from({ length: 60 }, (_, i) => {
      const n = i + 1;
      const pubDate = new Date(Date.UTC(2024, 0, n)).toISOString();
      return makeItem(`id-${n}`, pubDate);
    });

    const refreshedItems: FeedItem[] = Array.from({ length: 25 }, (_, i) => {
      const n = 36 + i;
      const pubDate = new Date(Date.UTC(2024, 0, n)).toISOString();
      return makeItem(`id-${n}`, pubDate, { title: `updated-${n}` });
    });

    const merged = mergeFeedHistoryItems(existingItems, refreshedItems);
    expect(merged).toHaveLength(60);
    expect(new Set(merged.map((i) => i.guid)).size).toBe(60);
    expect(merged.some((i) => i.guid === "id-1")).toBe(true);
    expect(merged.some((i) => i.guid === "id-60")).toBe(true);
  });
});

describe("applyFeedRetentionLimits", () => {
  const makeItem = (
    guid: string,
    pubDate: string,
    overrides?: Partial<FeedItem>,
  ): FeedItem => ({
    title: guid,
    link: `https://example.com/${guid}`,
    description: "",
    pubDate,
    guid,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    saved: false,
    ...overrides,
  });

  it("keeps newest non-protected items up to maxItemsLimit (protected do not count)", () => {
    const feed: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      maxItemsLimit: 1,
      items: [
        makeItem("saved-old", "2024-01-01T00:00:00Z", {
          saved: true,
          read: true,
        }),
        makeItem("old", "2024-01-02T00:00:00Z", { read: true }),
        makeItem("new", "2024-01-03T00:00:00Z", { read: false }),
      ],
    };

    const updated = applyFeedRetentionLimits(feed, {
      nowMs: Date.parse("2024-01-10T00:00:00Z"),
    });
    expect(updated.items.map((i) => i.guid)).toEqual(["new", "saved-old"]);
  });

  it("auto-deletes read-only items older than cutoff while keeping unread and protected", () => {
    const nowMs = Date.parse("2024-01-20T00:00:00Z");
    const tenDaysAgo = "2024-01-10T00:00:00Z";
    const oneDayAgo = "2024-01-19T00:00:00Z";

    const feed: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      autoDeleteDuration: 7,
      maxItemsLimit: 0,
      items: [
        makeItem("read-old", tenDaysAgo, { read: true }),
        makeItem("unread-old", tenDaysAgo, { read: false }),
        makeItem("saved-old", tenDaysAgo, { read: true, saved: true }),
        makeItem("read-new", oneDayAgo, { read: true }),
      ],
    };

    const updated = applyFeedRetentionLimits(feed, { nowMs });
    expect(updated.items[0]?.guid).toBe("read-new");
    expect(new Set(updated.items.map((i) => i.guid))).toEqual(
      new Set(["read-new", "unread-old", "saved-old"]),
    );
  });

  it("does not collapse to the server window size when maxItemsLimit > 25", () => {
    const existingItems: FeedItem[] = Array.from({ length: 60 }, (_, i) => {
      const n = i + 1;
      const pubDate = new Date(Date.UTC(2024, 0, n)).toISOString();
      return makeItem(`id-${n}`, pubDate);
    });

    const refreshedItems: FeedItem[] = Array.from({ length: 25 }, (_, i) => {
      const n = 36 + i;
      const pubDate = new Date(Date.UTC(2024, 0, n)).toISOString();
      return makeItem(`id-${n}`, pubDate, { title: `updated-${n}` });
    });

    const feedBase: Omit<Feed, "items"> = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      maxItemsLimit: 50,
      autoDeleteDuration: 0,
    };

    const firstMerged = mergeFeedHistoryItems(existingItems, refreshedItems);
    const first = applyFeedRetentionLimits({
      ...feedBase,
      items: firstMerged,
    } as Feed);
    expect(first.items).toHaveLength(50);
    expect(first.items[0]?.guid).toBe("id-60");

    const secondMerged = mergeFeedHistoryItems(first.items, refreshedItems);
    const second = applyFeedRetentionLimits({
      ...feedBase,
      items: secondMerged,
    } as Feed);
    expect(second.items).toHaveLength(50);
    expect(second.items[0]?.guid).toBe("id-60");
  });
});
