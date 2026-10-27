/**
 * The shard a save serializes has shallow item copies instead of a deep clone.
 * It must produce the same text as the deep-cloned shard and must never touch
 * the feed's live articles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createComparableFeedShardJson,
  createFeedShard,
  createSerializableFeedShard,
} from "../../../src/services/feed-storage-shard";
import type { Feed, FeedItem } from "../../../src/types/types";

function makeItem(guid: string, overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: `Article ${guid}`,
    link: `https://example.com/${guid}`,
    description: "",
    pubDate: "2026-01-01T00:00:00Z",
    guid,
    read: true,
    starred: true,
    tags: [{ name: "keep", color: "#ff0000" }],
    saved: true,
    savedFilePath: `Saved/${guid}.md`,
    playbackProgress: { position: 42, duration: 100, lastUpdated: 1 },
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    ...overrides,
  };
}

function makeFeed(items: FeedItem[]): Feed {
  return {
    title: "Feed",
    url: "https://example.com/feed.xml",
    folder: "RSS",
    items,
    lastUpdated: 0,
    feedId: "feed-1",
  };
}

/** Items whose values a JSON round trip changes or drops. */
function awkwardItems(): FeedItem[] {
  return [
    makeItem("plain"),
    makeItem("undefined-field", { author: undefined }),
    makeItem("non-finite", {
      playbackProgress: { position: Number.NaN, duration: 1, lastUpdated: 1 },
    }),
    makeItem("dated", {
      pubDate: new Date("2026-02-03T04:05:06Z") as unknown as string,
    }),
    makeItem("nested", {
      enclosure: { url: "https://example.com/a.mp3", length: "1", type: "x" },
    }),
  ];
}

describe("createSerializableFeedShard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([false, true])(
    "serializes to the same text as the deep-cloned shard (stripState %s)",
    (stripState) => {
      const feed = makeFeed(awkwardItems());

      expect(
        JSON.stringify(createSerializableFeedShard(feed, stripState), null, 2),
      ).toBe(JSON.stringify(createFeedShard(feed, stripState), null, 2));
    },
  );

  it("keeps article state out of the comparable text only when asked", () => {
    const feed = makeFeed([makeItem("a")]);

    expect(createComparableFeedShardJson(feed, true)).not.toContain('"read"');
    expect(createComparableFeedShardJson(feed, false)).toContain('"read"');
  });

  it("leaves the feed's articles untouched when it strips state", () => {
    const items = [makeItem("a"), makeItem("b")];
    const feed = makeFeed(items);
    const before = JSON.stringify(feed);

    createSerializableFeedShard(feed, true);
    createComparableFeedShardJson(feed, true);

    expect(JSON.stringify(feed)).toBe(before);
    expect(feed.items[0].read).toBe(true);
    expect(feed.items[0].tags).toEqual([{ name: "keep", color: "#ff0000" }]);
  });

  it("does not return the feed's own item objects", () => {
    const feed = makeFeed([makeItem("a")]);

    const shard = createSerializableFeedShard(feed);

    expect(shard.items[0]).not.toBe(feed.items[0]);
    expect(shard.items[0]).toEqual(feed.items[0]);
  });
});
