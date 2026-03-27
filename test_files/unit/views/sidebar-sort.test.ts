import { describe, it, expect } from "vitest";
import { applyFeedSortOrder } from "../../../src/utils/sidebar-sort-utils";
import { applyFolderSortOrder } from "../../../src/utils/sidebar-folder-sort-utils";
import type { Feed, Folder } from "../../../src/types/types";

// Helper to create mock feeds
function makeFeedWithItems(title: string, lastUpdated: number, itemCount: number): Feed {
  return {
    title,
    url: `https://example.com/${title}`,
    folder: "",
    items: Array.from({ length: itemCount }).map((_, i) => ({
      title: `Item ${i}`,
      link: `https://example.com/${title}/${i}`,
      description: "",
      pubDate: new Date(lastUpdated).toISOString(),
      guid: `${title}-${i}`,
      read: false,
      starred: false,
      feedTitle: title,
      feedUrl: `https://example.com/${title}`,
      coverImage: "",
      saved: false,
      tags: []
    })),
    lastUpdated,
    mediaType: "article",
    customTemplate: ""
  };
}

function makeSimpleFeed(title: string, folder = ""): Feed {
  return {
    title,
    url: `https://example.com/${encodeURIComponent(title)}`,
    folder,
    items: [],
    lastUpdated: 0,
  };
}

describe("Sidebar Feed Sorting", () => {
  const feedA = makeFeedWithItems("Apple News", 1000, 5); // 5 items
  const feedB = makeFeedWithItems("Zebra Tech", 2000, 2); // 2 items
  const feedC = makeFeedWithItems("Banana Weekly", 1500, 10); // 10 items
  const feedD = makeFeedWithItems("apple rumors", 3000, 1); // Case insensitive test

  const allFeeds = [feedA, feedB, feedC, feedD];

  describe("Alphabetical Sorting (name)", () => {
    it("sorts A>Z taking case-insensitivity into account", () => {
      const sorted = applyFeedSortOrder(allFeeds, { by: "name", ascending: true });
      expect(sorted[0].title).toBe("Apple News");
      expect(sorted[1].title).toBe("apple rumors");
      expect(sorted[2].title).toBe("Banana Weekly");
      expect(sorted[3].title).toBe("Zebra Tech");
    });

    it("sorts Z>A taking case-insensitivity into account", () => {
      const sorted = applyFeedSortOrder(allFeeds, { by: "name", ascending: false });
      expect(sorted[0].title).toBe("Zebra Tech");
      expect(sorted[1].title).toBe("Banana Weekly");
      expect(sorted[2].title).toBe("apple rumors");
      expect(sorted[3].title).toBe("Apple News");
    });
  });

  describe("Last Updated Sorting (created)", () => {
    it("sorts oldest to newest (ascending)", () => {
      const sorted = applyFeedSortOrder(allFeeds, { by: "created", ascending: true });
      expect(sorted[0].title).toBe("Apple News"); // 1000
      expect(sorted[1].title).toBe("Banana Weekly"); // 1500
      expect(sorted[2].title).toBe("Zebra Tech"); // 2000
      expect(sorted[3].title).toBe("apple rumors"); // 3000
    });

    it("sorts newest to oldest (descending)", () => {
      const sorted = applyFeedSortOrder(allFeeds, { by: "created", ascending: false });
      expect(sorted[0].title).toBe("apple rumors");
      expect(sorted[1].title).toBe("Zebra Tech");
      expect(sorted[2].title).toBe("Banana Weekly");
      expect(sorted[3].title).toBe("Apple News");
    });
  });

  describe("Item Count Sorting", () => {
    it("sorts lowest to highest (ascending)", () => {
      const sorted = applyFeedSortOrder(allFeeds, { by: "itemCount", ascending: true });
      expect(sorted[0].title).toBe("apple rumors"); // 1
      expect(sorted[1].title).toBe("Zebra Tech"); // 2
      expect(sorted[2].title).toBe("Apple News"); // 5
      expect(sorted[3].title).toBe("Banana Weekly"); // 10
    });

    it("sorts highest to lowest (descending)", () => {
      const sorted = applyFeedSortOrder(allFeeds, { by: "itemCount", ascending: false });
      expect(sorted[0].title).toBe("Banana Weekly");
      expect(sorted[1].title).toBe("Apple News");
      expect(sorted[2].title).toBe("Zebra Tech");
      expect(sorted[3].title).toBe("apple rumors");
    });
  });

  describe("Stability on Equal Values", () => {
    it("maintains order when sorting by a property that is equal", () => {
      const f1 = makeFeedWithItems("A", 1000, 2);
      const f2 = makeFeedWithItems("Z", 1000, 2);
      const f3 = makeFeedWithItems("B", 1000, 2);
      const equalFeeds = [f1, f2, f3];
      
      const sorted = applyFeedSortOrder(equalFeeds, { by: "created", ascending: true });
      expect(sorted[0].title).toBe("A");
      expect(sorted[1].title).toBe("Z");
      expect(sorted[2].title).toBe("B");
    });
  });
});

describe("Sidebar Custom sort mode (TDD)", () => {
  it("keeps feed order when by=custom", () => {
    const a = makeSimpleFeed("A");
    const b = makeSimpleFeed("B");
    const c = makeSimpleFeed("C");
    const input = [a, b, c];

    const sorted = applyFeedSortOrder(input, { by: "custom", ascending: true });
    expect(sorted.map((f) => f.title)).toEqual(["A", "B", "C"]);
  });

  it("keeps folder sibling order when by=custom, while still rendering pinned first", () => {
    const folders: Folder[] = [
      { name: "Unpinned-1", subfolders: [] },
      { name: "Pinned-1", subfolders: [], pinned: true },
      { name: "Pinned-2", subfolders: [], pinned: true },
      { name: "Unpinned-2", subfolders: [] },
    ];

    const result = applyFolderSortOrder(folders, {
      by: "custom",
      ascending: true,
    });

    expect(result.map((f) => f.name)).toEqual([
      "Pinned-1",
      "Pinned-2",
      "Unpinned-1",
      "Unpinned-2",
    ]);
  });
});
