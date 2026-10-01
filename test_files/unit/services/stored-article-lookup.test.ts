import { describe, expect, it } from "vitest";
import {
  findStoredArticle,
  syncFeedItemMetadata,
} from "../../../src/services/stored-article-lookup";
import type { Feed, FeedItem } from "../../../src/types/types";

function makeItem(overrides: Partial<FeedItem>): FeedItem {
  return {
    guid: "g1",
    title: "Article",
    link: "https://example.com/a",
    description: "",
    pubDate: "2024-01-01T00:00:00.000Z",
    read: false,
    starred: false,
    saved: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://a.example.com/feed.xml",
    coverImage: "",
    ...overrides,
  };
}

function makeFeed(url: string, items: FeedItem[]): Feed {
  return { title: url, url, folder: "", items } as Feed;
}

describe("findStoredArticle", () => {
  it("picks the item in the item's own feed when GUID and link repeat across feeds", () => {
    const a = makeItem({ feedUrl: "https://a.example.com/feed.xml" });
    const b = makeItem({ feedUrl: "https://b.example.com/feed.xml" });
    const feeds = [
      makeFeed("https://a.example.com/feed.xml", [a]),
      makeFeed("https://b.example.com/feed.xml", [b]),
    ];

    expect(findStoredArticle(feeds, b)).toBe(b);
    expect(findStoredArticle(feeds, a)).toBe(a);
  });

  it("falls back to a unique GUID match when the item's feed URL is stale", () => {
    const stored = makeItem({ feedUrl: "https://new.example.com/feed.xml" });
    const feeds = [makeFeed("https://new.example.com/feed.xml", [stored])];

    expect(
      findStoredArticle(feeds, {
        ...stored,
        feedUrl: "https://old.example.com/feed.xml",
      }),
    ).toBe(stored);
  });

  it("uses the link to break a stale-URL GUID tie", () => {
    const mine = makeItem({ feedUrl: "https://new.example.com/feed.xml" });
    const other = makeItem({
      link: "https://other.example.com/a",
      feedUrl: "https://other.example.com/feed.xml",
    });
    const feeds = [
      makeFeed("https://other.example.com/feed.xml", [other]),
      makeFeed("https://new.example.com/feed.xml", [mine]),
    ];

    expect(
      findStoredArticle(feeds, {
        ...mine,
        feedUrl: "https://old.example.com/feed.xml",
      }),
    ).toBe(mine);
  });

  it("returns null rather than guess when a stale item matches ambiguously", () => {
    const feeds = [
      makeFeed("https://a.example.com/feed.xml", [makeItem({})]),
      makeFeed("https://b.example.com/feed.xml", [
        makeItem({ feedUrl: "https://b.example.com/feed.xml" }),
      ]),
    ];

    expect(
      findStoredArticle(
        feeds,
        makeItem({ feedUrl: "https://gone.example.com/feed.xml" }),
      ),
    ).toBeNull();
  });
});

describe("syncFeedItemMetadata", () => {
  it("rewrites only the fields that changed", () => {
    const item = makeItem({});
    const feed = makeFeed("https://a.example.com/feed.xml", [item]);

    syncFeedItemMetadata(
      feed,
      { title: "Feed", url: "https://a.example.com/feed.xml" },
      { title: "Feed", url: "https://moved.example.com/feed.xml" },
    );

    expect(item.feedUrl).toBe("https://moved.example.com/feed.xml");
    expect(item.feedTitle).toBe("Feed");
  });
});
