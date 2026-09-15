import { describe, it, expect } from "vitest";
import {
  applyStarredImportCandidateToFeed,
  findMatchingFeedItem,
  mergeStarredImportIntoExistingItem,
} from "../../../src/services/starred-import-merge";
import type { Feed, FeedItem, Tag } from "../../../src/types/types";

function makeFeed(items: FeedItem[] = []): Feed {
  return {
    title: "Example Feed",
    url: "https://example-feed.test/rss",
    folder: "Uncategorized",
    items,
    lastUpdated: 0,
  };
}

function makeCandidateItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Existing Feed Article One",
    link: "https://example-feed.test/articles/one",
    description: "<p>content</p>",
    content: "<p>content</p>",
    pubDate: "2023-11-14T00:00:00.000Z",
    guid: "tag:google.com,2005:reader/item/0000000000000001",
    starred: true,
    read: false,
    feedTitle: "Example Feed",
    feedUrl: "https://example-feed.test/rss",
    coverImage: "",
    ...overrides,
  };
}

describe("findMatchingFeedItem", () => {
  it("matches an existing item by guid identity", () => {
    const existing = makeCandidateItem();
    const candidate = makeCandidateItem();

    expect(findMatchingFeedItem([existing], candidate)).toBe(existing);
  });

  it("falls back to link identity when guid is absent on both sides", () => {
    const existing = makeCandidateItem({ guid: "" });
    const candidate = makeCandidateItem({ guid: "" });

    expect(findMatchingFeedItem([existing], candidate)).toBe(existing);
  });

  it("returns undefined when no existing item shares the candidate's identity", () => {
    const existing = makeCandidateItem({
      guid: "tag:google.com,2005:reader/item/other",
      link: "https://example-feed.test/articles/other",
    });
    const candidate = makeCandidateItem();

    expect(findMatchingFeedItem([existing], candidate)).toBeUndefined();
  });

  it("never matches when both the candidate and an existing item have no identity", () => {
    const existing = makeCandidateItem({ guid: "", link: "" });
    const candidate = makeCandidateItem({ guid: "", link: "" });

    expect(findMatchingFeedItem([existing], candidate)).toBeUndefined();
  });
});

describe("mergeStarredImportIntoExistingItem", () => {
  it("forces starred true and merges tags without removing user-added tags", () => {
    const userTag: Tag = { name: "Read Later", color: "#111111" };
    const newLabelTag: Tag = { name: "Design", color: "#3498db" };
    const existing = makeCandidateItem({ starred: false, tags: [userTag] });
    const candidate = makeCandidateItem({ tags: [newLabelTag] });

    const merged = mergeStarredImportIntoExistingItem(existing, candidate);

    expect(merged.starred).toBe(true);
    expect(merged.tags).toEqual([userTag, newLabelTag]);
  });

  it("leaves read, saved, savedFilePath, and playbackProgress untouched", () => {
    const existing = makeCandidateItem({
      read: true,
      saved: true,
      savedFilePath: "Articles/one.md",
      playbackProgress: { position: 42, duration: 100, lastUpdated: 123 },
    });
    // Simulate a re-exported item that now reports unread/no-tags.
    const candidate = makeCandidateItem({ read: false, tags: undefined });

    const merged = mergeStarredImportIntoExistingItem(existing, candidate);

    expect(merged.read).toBe(true);
    expect(merged.saved).toBe(true);
    expect(merged.savedFilePath).toBe("Articles/one.md");
    expect(merged.playbackProgress).toEqual({
      position: 42,
      duration: 100,
      lastUpdated: 123,
    });
  });

  it("is a no-op merge (idempotent) when tags and starred state are unchanged", () => {
    const tag: Tag = { name: "Design", color: "#3498db" };
    const existing = makeCandidateItem({ starred: true, tags: [tag] });
    const candidate = makeCandidateItem({ tags: [tag] });

    const merged = mergeStarredImportIntoExistingItem(existing, candidate);

    expect(merged.tags).toEqual([tag]);
    expect(merged.starred).toBe(true);
  });
});

describe("applyStarredImportCandidateToFeed", () => {
  it("inserts a brand-new item when no existing item matches (unchanged prior behavior)", () => {
    const feed = makeFeed([]);
    const candidate = makeCandidateItem();

    const result = applyStarredImportCandidateToFeed(feed, candidate);

    expect(result).toBe("inserted");
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toBe(candidate);
  });

  it("produces zero duplicate articles when the same export is re-imported unchanged", () => {
    const feed = makeFeed([]);
    const first = makeCandidateItem();
    applyStarredImportCandidateToFeed(feed, first);

    const second = makeCandidateItem();
    const result = applyStarredImportCandidateToFeed(feed, second);

    expect(result).toBe("updated");
    expect(feed.items).toHaveLength(1);
  });

  it("preserves read/saved/savedFilePath on an already-imported article across re-import", () => {
    const feed = makeFeed([
      makeCandidateItem({
        read: true,
        saved: true,
        savedFilePath: "Articles/one.md",
      }),
    ]);
    // Re-exported item now reports unread and unsaved (irrelevant local state).
    const reimported = makeCandidateItem({ read: false });

    applyStarredImportCandidateToFeed(feed, reimported);

    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].read).toBe(true);
    expect(feed.items[0].saved).toBe(true);
    expect(feed.items[0].savedFilePath).toBe("Articles/one.md");
  });

  it("merges a newly-present label into an existing article's tags and forces starred true", () => {
    const userTag: Tag = { name: "Read Later", color: "#111111" };
    const feed = makeFeed([
      makeCandidateItem({ starred: false, tags: [userTag] }),
    ]);
    const newLabelTag: Tag = { name: "Design", color: "#3498db" };
    const reimported = makeCandidateItem({ tags: [newLabelTag] });

    applyStarredImportCandidateToFeed(feed, reimported);

    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].tags).toEqual([userTag, newLabelTag]);
    expect(feed.items[0].starred).toBe(true);
  });
});
