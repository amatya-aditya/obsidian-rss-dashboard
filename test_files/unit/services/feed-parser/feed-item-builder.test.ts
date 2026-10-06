import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Feed, FeedItem } from "../../../../src/types/types.js";
import {
  collectCarriedForwardItems,
  collectRefreshedItems,
  indexExistingItems,
  type FeedItemContext,
  type RefreshedItemsRequest,
} from "../../../../src/services/feed-parser/feed-item-builder.js";
import type {
  ParsedFeed,
  ParsedItem,
} from "../../../../src/services/feed-parser/types.js";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;
const FEED_URL = "https://example.com/feed.xml";
const RECENT = "Sun, 14 Jun 2026 00:00:00 GMT";
const OLD = "Mon, 01 Jan 2024 00:00:00 GMT";

/** Stub of the FeedParser helpers: absolute urls are resolved by `new URL`, covers are fixed. */
function makeContext(
  overrides: Partial<FeedItemContext> = {},
): FeedItemContext {
  return {
    convertToAbsoluteUrl: (relative, base) =>
      relative ? new URL(relative, base).href : relative,
    convertRelativeUrlsInContent: (content) => `[content]${content}`,
    extractCoverImage: (html) =>
      html.includes("<img") ? "https://img.example.com/c.jpg" : "",
    extractSummary: (text) => text.slice(0, 20),
    resolvePodcastCoverImage: () => "https://img.example.com/podcast.jpg",
    getRetentionProtections: () => ({
      protectStarred: true,
      protectSaved: true,
    }),
    getUseFirstSeenDateFallback: () => false,
    ...overrides,
  };
}

function pitem(overrides: Partial<ParsedItem> = {}): ParsedItem {
  return {
    title: "",
    link: "",
    description: "",
    pubDate: "",
    guid: "",
    ...overrides,
  };
}

function stored(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Stored",
    link: "https://example.com/a",
    description: "",
    pubDate: RECENT,
    guid: "https://example.com/a",
    read: true,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: FEED_URL,
    coverImage: "",
    saved: false,
    ...overrides,
  };
}

function feedOf(items: FeedItem[], overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Feed",
    url: FEED_URL,
    folder: "",
    items,
    lastUpdated: 0,
    ...overrides,
  };
}

function requestFor(
  items: ParsedItem[],
  existingFeed: Feed | null,
  ctx: FeedItemContext,
  overrides: Partial<RefreshedItemsRequest> = {},
): RefreshedItemsRequest {
  const parsed: ParsedFeed = {
    title: "Parsed",
    items,
    type: "rss",
    feedItunesImage: "",
    feedImageUrl: "",
  };
  return {
    parsed,
    feedUrl: FEED_URL,
    existingFeed,
    newFeed: existingFeed ?? feedOf([]),
    existingItems: indexExistingItems(existingFeed, FEED_URL, ctx),
    autoDeleteCutoffMs: 0,
    ...overrides,
  };
}

describe("feed-item-builder", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("indexExistingItems", () => {
    it("is empty without a stored feed", () => {
      expect(indexExistingItems(null, FEED_URL, makeContext()).size).toBe(0);
    });

    it("keys stored items by their canonical, absolute guid or link", () => {
      const ctx = makeContext();
      const byGuid = stored({
        guid: "https://example.com/a#2",
        link: "https://x.test/ignored",
      });
      const byLink = stored({ guid: "", link: "https://example.com/b" });
      const relative = stored({ guid: "post-3", link: "" });
      const nothing = stored({ guid: "", link: "" });

      const index = indexExistingItems(
        feedOf([byGuid, byLink, relative, nothing]),
        FEED_URL,
        ctx,
      );

      expect([...index.keys()]).toEqual([
        "https://example.com/a",
        "https://example.com/b",
        "https://example.com/post-3",
      ]);
      expect(index.get("https://example.com/a")).toBe(byGuid);
    });

    it("lets a later item win when two share a key", () => {
      const first = stored({ title: "first" });
      const second = stored({ title: "second" });

      const index = indexExistingItems(
        feedOf([first, second]),
        FEED_URL,
        makeContext(),
      );

      expect(index.get("https://example.com/a")).toBe(second);
    });
  });

  describe("collectRefreshedItems", () => {
    it("builds a new item through the context helpers", () => {
      const ctx = makeContext();
      const result = collectRefreshedItems(
        requestFor(
          [
            pitem({
              title: "Hello",
              link: "/hello",
              guid: "hello-1",
              pubDate: RECENT,
              description: "<img>",
              author: "Jane",
            }),
          ],
          null,
          ctx,
        ),
        ctx,
      );

      expect(result.updatedItems).toEqual([]);
      expect(result.newItems).toEqual([
        {
          title: "Hello",
          link: "https://example.com/hello",
          description: "[content]<img>",
          content: "[content]",
          pubDate: RECENT,
          guid: "https://example.com/hello-1",
          read: false,
          starred: false,
          tags: [],
          feedTitle: "Feed",
          feedUrl: FEED_URL,
          coverImage: "https://img.example.com/c.jpg",
          summary: "<img>",
          author: "Jane",
          saved: false,
          mediaType: "article",
          duration: undefined,
          explicit: false,
          image: "https://img.example.com/c.jpg",
          category: undefined,
          episodeType: undefined,
          season: undefined,
          episode: undefined,
          enclosure: undefined,
          ieee: undefined,
          audioUrl: undefined,
          mediaContentType: undefined,
          mediaContentMedium: undefined,
        },
      ]);
      expect([...result.seenGuids]).toEqual(["https://example.com/hello-1"]);
      expect(result.skippedByRefreshCutoffCount).toBe(0);
    });

    it("treats an audio enclosure as a podcast episode with the podcast cover", () => {
      const ctx = makeContext();
      const result = collectRefreshedItems(
        requestFor(
          [
            pitem({
              title: "Ep",
              link: "https://example.com/ep",
              enclosure: { url: "/a.mp3", type: "audio/mpeg", length: "1" },
              itunes: {
                explicit: "yes",
                season: "2",
                episode: "5",
                duration: "10:00",
              },
            }),
          ],
          null,
          ctx,
        ),
        ctx,
      );

      expect(result.newItems[0]).toMatchObject({
        mediaType: "podcast",
        coverImage: "https://img.example.com/podcast.jpg",
        audioUrl: "https://example.com/a.mp3",
        explicit: true,
        season: 2,
        episode: 5,
        duration: "10:00",
      });
    });

    it("synthesizes an audio enclosure for a link that contains .mp3", () => {
      const ctx = makeContext();
      const result = collectRefreshedItems(
        requestFor(
          [pitem({ title: "T", link: "https://cdn.example.com/e.mp3" })],
          null,
          ctx,
        ),
        ctx,
      );

      expect(result.newItems[0]?.enclosure).toEqual({
        url: "https://cdn.example.com/e.mp3",
        type: "audio/mpeg",
        length: "",
      });
      expect(result.newItems[0]?.mediaType).toBe("podcast");
    });

    it("updates a stored item in place of a new one and keeps the reader's state", () => {
      const ctx = makeContext();
      const existing = feedOf([
        stored({
          read: true,
          starred: true,
          savedFilePath: "s.md",
          summary: "old",
        }),
      ]);

      const result = collectRefreshedItems(
        requestFor(
          [
            pitem({
              title: "New title",
              link: "https://example.com/a",
              pubDate: RECENT,
            }),
          ],
          existing,
          ctx,
        ),
        ctx,
      );

      expect(result.newItems).toEqual([]);
      expect(result.updatedItems).toHaveLength(1);
      expect(result.updatedItems[0]).toMatchObject({
        title: "New title",
        read: true,
        starred: true,
        savedFilePath: "s.md",
        summary: "old",
        feedTitle: "Feed",
        mediaType: "article",
      });
    });

    it("keeps stored article metadata while rewriting the blurb on refresh (#247)", () => {
      const ctx = makeContext();
      const metadata = {
        publisherDescription: "Stored page description of the article",
        language: "en-GB",
        languageSource: "page" as const,
        canonicalUrl: "https://example.com/canonical",
        metadataFetchedAt: 1234,
      };
      const existing = feedOf([stored({ description: "old", ...metadata })]);

      const result = collectRefreshedItems(
        requestFor(
          [
            pitem({
              link: "https://example.com/a",
              description: "new blurb",
              pubDate: RECENT,
            }),
          ],
          existing,
          ctx,
        ),
        ctx,
      );

      expect(result.updatedItems[0]).toMatchObject(metadata);
      expect(result.updatedItems[0]?.description).toBe("[content]new blurb");
    });

    it("carries parsed authors onto new and refreshed items (#247)", () => {
      const ctx = makeContext();
      const parsed = pitem({
        link: "https://example.com/a",
        pubDate: RECENT,
        author: "Ada, Grace",
        authors: ["Ada", "Grace"],
      });

      const fresh = collectRefreshedItems(requestFor([parsed], null, ctx), ctx);
      expect(fresh.newItems[0]).toMatchObject({
        author: "Ada, Grace",
        authors: ["Ada", "Grace"],
      });

      const refreshed = collectRefreshedItems(
        requestFor([parsed], feedOf([stored({ authors: ["Old"] })]), ctx),
        ctx,
      );
      expect(refreshed.updatedItems[0]?.authors).toEqual(["Ada", "Grace"]);
    });

    it("keeps stored authors on refresh once metadata was fetched (first-write-wins)", () => {
      const ctx = makeContext();
      const existing = feedOf([
        stored({ authors: ["Page Author"], metadataFetchedAt: 9 }),
      ]);
      const result = collectRefreshedItems(
        requestFor(
          [
            pitem({
              link: "https://example.com/a",
              pubDate: RECENT,
              author: "Feed Author",
              authors: ["Feed Author"],
            }),
          ],
          existing,
          ctx,
        ),
        ctx,
      );
      expect(result.updatedItems[0]?.authors).toEqual(["Page Author"]);
    });

    it("skips duplicates and items with no identity", () => {
      const ctx = makeContext();
      const result = collectRefreshedItems(
        requestFor(
          [
            pitem({ title: "one", guid: "dup", pubDate: RECENT }),
            pitem({ title: "two", guid: "dup", pubDate: RECENT }),
            pitem({ title: "none" }),
          ],
          null,
          ctx,
        ),
        ctx,
      );

      expect(result.newItems.map((item) => item.title)).toEqual(["one"]);
    });

    it("skips and counts new and stored items past the cutoff, but not on a first fetch", () => {
      const ctx = makeContext();
      const cutoff = NOW - 30 * DAY_MS;
      const existing = feedOf([
        stored({
          guid: "https://example.com/s",
          link: "https://example.com/s",
          pubDate: OLD,
        }),
      ]);
      const items = [
        pitem({
          title: "new-old",
          link: "https://example.com/n",
          pubDate: OLD,
        }),
        pitem({
          title: "stored-old",
          link: "https://example.com/s",
          pubDate: OLD,
        }),
        pitem({
          title: "fresh",
          link: "https://example.com/f",
          pubDate: RECENT,
        }),
      ];

      const refresh = collectRefreshedItems(
        requestFor(items, existing, ctx, { autoDeleteCutoffMs: cutoff }),
        ctx,
      );
      expect(refresh.skippedByRefreshCutoffCount).toBe(2);
      expect(refresh.newItems.map((item) => item.title)).toEqual(["fresh"]);
      expect(refresh.updatedItems).toEqual([]);

      const firstFetch = collectRefreshedItems(
        requestFor(items, null, ctx, { autoDeleteCutoffMs: cutoff }),
        ctx,
      );
      expect(firstFetch.skippedByRefreshCutoffCount).toBe(0);
      expect(firstFetch.newItems).toHaveLength(3);
    });

    it("reads the retention protections and first-seen setting at each decision", () => {
      const getRetentionProtections = vi.fn(() => ({ protectUnread: true }));
      const getUseFirstSeenDateFallback = vi.fn(() => true);
      const ctx = makeContext({
        getRetentionProtections,
        getUseFirstSeenDateFallback,
      });

      const result = collectRefreshedItems(
        requestFor(
          [
            pitem({
              title: "old",
              link: "https://example.com/n",
              pubDate: OLD,
            }),
          ],
          feedOf([]),
          ctx,
          { autoDeleteCutoffMs: NOW - 30 * DAY_MS },
        ),
        ctx,
      );

      // Unread items are protected, so the old new item is kept.
      expect(result.newItems).toHaveLength(1);
      expect(getRetentionProtections).toHaveBeenCalledTimes(1);
      expect(getUseFirstSeenDateFallback).not.toHaveBeenCalled();
    });
  });

  describe("collectCarriedForwardItems", () => {
    const cutoff = NOW - 30 * DAY_MS;

    it("is empty without a stored feed", () => {
      expect(
        collectCarriedForwardItems(null, FEED_URL, new Set(), 0, makeContext()),
      ).toEqual([]);
    });

    it("keeps stored items the feed did not list and drops listed ones", () => {
      const listed = stored({
        guid: "https://example.com/listed",
        link: "https://example.com/listed",
      });
      const unlisted = stored({
        guid: "https://example.com/unlisted",
        link: "https://example.com/unlisted",
      });

      const carried = collectCarriedForwardItems(
        feedOf([listed, unlisted]),
        FEED_URL,
        new Set(["https://example.com/listed"]),
        0,
        makeContext(),
      );

      expect(carried).toEqual([unlisted]);
    });

    it("drops an unprotected item past the cutoff and keeps a protected one", () => {
      const plain = stored({
        guid: "https://example.com/plain",
        link: "https://example.com/plain",
        pubDate: OLD,
      });
      const starred = stored({
        guid: "https://example.com/starred",
        link: "https://example.com/starred",
        pubDate: OLD,
        starred: true,
      });
      const recent = stored({
        guid: "https://example.com/recent",
        link: "https://example.com/recent",
        pubDate: RECENT,
      });

      const carried = collectCarriedForwardItems(
        feedOf([plain, starred, recent]),
        FEED_URL,
        new Set(),
        cutoff,
        makeContext(),
      );

      expect(carried).toEqual([starred, recent]);
    });

    it("drops a stored item with no identity", () => {
      const carried = collectCarriedForwardItems(
        feedOf([stored({ guid: "", link: "" })]),
        FEED_URL,
        new Set(),
        0,
        makeContext(),
      );

      expect(carried).toEqual([]);
    });
  });
});
