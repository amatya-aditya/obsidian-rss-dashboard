import { describe, it, expect } from "vitest";
import type { Feed, FeedItem } from "../../../../src/types/types";
import {
  mergeFeedHistoryItems,
  applyFeedRetentionLimits,
  isProtectedItem,
} from "../../../../src/services/feed-parser/feed-retention.js";

describe("isProtectedItem", () => {
  const makeItem = (overrides?: Partial<FeedItem>): FeedItem => ({
    title: "Test",
    link: "https://example.com/item",
    description: "",
    pubDate: "2024-01-01T00:00:00Z",
    guid: "test-item",
    read: true,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    saved: false,
    ...overrides,
  });

  it("evaluates default protections (starred and saved protected, tagged and unread not protected)", () => {
    expect(isProtectedItem(makeItem({ starred: true }))).toBe(true);
    expect(isProtectedItem(makeItem({ saved: true }))).toBe(true);
    expect(isProtectedItem(makeItem({ tags: ["tag1"] }))).toBe(false);
    expect(isProtectedItem(makeItem({ read: false }))).toBe(false);
    expect(isProtectedItem(makeItem())).toBe(false);
  });

  it("respects protectStarred toggle", () => {
    const item = makeItem({ starred: true });
    expect(isProtectedItem(item, { protectStarred: true })).toBe(true);
    expect(isProtectedItem(item, { protectStarred: false })).toBe(false);
  });

  it("respects protectSaved toggle", () => {
    const item = makeItem({ saved: true });
    expect(isProtectedItem(item, { protectSaved: true })).toBe(true);
    expect(isProtectedItem(item, { protectSaved: false })).toBe(false);
  });

  it("respects protectTagged toggle", () => {
    const tagged = makeItem({ tags: ["focus"] });
    const emptyTags = makeItem({ tags: [] });
    const noTags = makeItem({ tags: undefined });

    expect(isProtectedItem(tagged, { protectTagged: true })).toBe(true);
    expect(isProtectedItem(emptyTags, { protectTagged: true })).toBe(false);
    expect(isProtectedItem(noTags, { protectTagged: true })).toBe(false);
    expect(isProtectedItem(tagged, { protectTagged: false })).toBe(false);
  });

  it("respects protectUnread toggle", () => {
    const unread = makeItem({ read: false });
    const read = makeItem({ read: true });

    expect(isProtectedItem(unread, { protectUnread: true })).toBe(true);
    expect(isProtectedItem(read, { protectUnread: true })).toBe(false);
    expect(isProtectedItem(unread, { protectUnread: false })).toBe(false);
  });
});

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

  it("auto-deletes unread and read items older than cutoff by default while keeping protected items", () => {
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
      new Set(["read-new", "saved-old"]),
    );
  });

  it("retains unread items older than cutoff when protectUnread is true", () => {
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

    const updated = applyFeedRetentionLimits(feed, {
      nowMs,
      protections: { protectUnread: true },
    });
    expect(new Set(updated.items.map((i) => i.guid))).toEqual(
      new Set(["read-new", "unread-old", "saved-old"]),
    );
  });

  it("retains tagged items older than cutoff when protectTagged is true", () => {
    const nowMs = Date.parse("2024-01-20T00:00:00Z");
    const tenDaysAgo = "2024-01-10T00:00:00Z";

    const feed: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      autoDeleteDuration: 7,
      items: [
        makeItem("tagged-old", tenDaysAgo, { read: true, tags: ["research"] }),
        makeItem("untagged-old", tenDaysAgo, { read: true, tags: [] }),
      ],
    };

    const prunedByDefault = applyFeedRetentionLimits(feed, { nowMs });
    expect(prunedByDefault.items).toHaveLength(0);

    const protectedWithToggle = applyFeedRetentionLimits(feed, {
      nowMs,
      protections: { protectTagged: true },
    });
    expect(protectedWithToggle.items.map((i) => i.guid)).toEqual(["tagged-old"]);
  });

  it("purges starred and saved items older than cutoff when their protections are disabled", () => {
    const nowMs = Date.parse("2024-01-20T00:00:00Z");
    const tenDaysAgo = "2024-01-10T00:00:00Z";

    const feed: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      autoDeleteDuration: 7,
      items: [
        makeItem("starred-old", tenDaysAgo, { read: true, starred: true }),
        makeItem("saved-old", tenDaysAgo, { read: true, saved: true }),
      ],
    };

    const protectedByDefault = applyFeedRetentionLimits(feed, { nowMs });
    expect(protectedByDefault.items).toHaveLength(2);

    const unprotectedStarred = applyFeedRetentionLimits(feed, {
      nowMs,
      protections: { protectStarred: false, protectSaved: true },
    });
    expect(unprotectedStarred.items.map((i) => i.guid)).toEqual(["saved-old"]);

    const unprotectedSaved = applyFeedRetentionLimits(feed, {
      nowMs,
      protections: { protectStarred: true, protectSaved: false },
    });
    expect(unprotectedSaved.items.map((i) => i.guid)).toEqual(["starred-old"]);
  });

  it("preserves unread and tagged items under maxItemsLimit when protected", () => {
    const feed: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      maxItemsLimit: 1,
      items: [
        makeItem("unread-old", "2024-01-01T00:00:00Z", { read: false }),
        makeItem("tagged-old", "2024-01-02T00:00:00Z", { read: true, tags: ["important"] }),
        makeItem("read-mid", "2024-01-03T00:00:00Z", { read: true }),
        makeItem("read-new", "2024-01-04T00:00:00Z", { read: true }),
      ],
    };

    // By default unread & tagged are NOT protected; only 1 newest non-protected item kept
    const defaultPruning = applyFeedRetentionLimits(feed);
    expect(defaultPruning.items.map((i) => i.guid)).toEqual(["read-new"]);

    // With protectUnread and protectTagged enabled, both survive and do not count against maxItemsLimit
    const protectedPruning = applyFeedRetentionLimits(feed, {
      protections: { protectUnread: true, protectTagged: true },
    });
    expect(new Set(protectedPruning.items.map((i) => i.guid))).toEqual(
      new Set(["read-new", "unread-old", "tagged-old"]),
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
