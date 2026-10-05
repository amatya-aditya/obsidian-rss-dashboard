import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import type { RequestUrlResponse } from "obsidian";
import {
  DEFAULT_SETTINGS,
  type DisplaySettings,
  type Feed,
  type FeedItem,
  type FeedRetentionProtections,
  type Folder,
  type MediaSettings,
  type Tag,
} from "../../../../src/types/types.js";
import { FeedParser } from "../../../../src/services/feed-parser/feed-parser-class.js";
import { CustomXMLParser } from "../../../../src/services/feed-parser/xml-parser/custom-xml-parser.js";
import type {
  ParsedFeed,
  ParsedItem,
} from "../../../../src/services/feed-parser/types.js";
import { EmptyFeedError } from "../../../../src/services/feed-parser/feed-errors.js";
import {
  ATOM_BASIC,
  ATOM_WITH_LOGO,
  JSON_FEED_BASIC,
  JSON_FEED_EMPTY_ITEMS,
  RSS2_BASIC,
  RSS2_EMPTY,
} from "./fixtures/rss-fixtures.js";

/**
 * Characterization of `FeedParser.parseFeed` (#622, refactor tracked in #436).
 *
 * Every test goes through the public `parseFeed` with `requestUrl` mocked, so
 * the file keeps passing while the method is split into smaller functions.
 * It pins what the code does today, quirks included. Wall-clock time is
 * frozen at NOW so the auto-delete cutoff, `firstSeenMs` and `lastUpdated`
 * are exact.
 */

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;
const FEED_URL = "https://example.com/feed.xml";

// Dates relative to NOW, in the RFC 822 form an RSS feed carries.
const RECENT = "Sun, 14 Jun 2026 00:00:00 GMT";
const WEEK_OLD = "Mon, 08 Jun 2026 00:00:00 GMT";
const OLD = "Mon, 01 Jan 2024 00:00:00 GMT";

const MEDIA_SETTINGS: MediaSettings = {
  autoTagVideos: true,
  rememberPlaybackProgress: true,
  defaultMastodonFolder: "Mastodon",
  defaultYouTubeFolder: "Videos",
  defaultVideoTag: "Video",
  defaultVideoTags: ["Video"],
  defaultYouTubeTag: "Video",
  defaultYouTubeTags: ["Video"],
  defaultPodcastFolder: "Podcasts",
  defaultPodcastTags: ["Podcast"],
  defaultRssFolder: "RSS",
  defaultRssTag: "",
  defaultRssTags: [],
  defaultSmallwebFolder: "Smallweb",
  defaultSmallwebTag: "",
  defaultSmallwebTags: [],
  defaultMastodonTag: "",
  defaultMastodonTags: [],
  openInSplitView: true,
  podcastTheme: "obsidian",
  enableApplePodcastsOpen: false,
  defaultPlaySpeed: 1,
};

interface ItemSpec {
  title?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  description?: string;
  content?: string;
  /** Raw child elements, such as `<enclosure/>` or `<itunes:image/>`. */
  extra?: string;
}

/** An RSS `<item>`; an element is left out when its spec field is undefined. */
function itemXml(spec: ItemSpec): string {
  const parts: string[] = [];
  if (spec.title !== undefined) parts.push(`<title>${spec.title}</title>`);
  if (spec.link !== undefined) parts.push(`<link>${spec.link}</link>`);
  if (spec.guid !== undefined) parts.push(`<guid>${spec.guid}</guid>`);
  if (spec.pubDate !== undefined) {
    parts.push(`<pubDate>${spec.pubDate}</pubDate>`);
  }
  if (spec.description !== undefined) {
    parts.push(`<description><![CDATA[${spec.description}]]></description>`);
  }
  if (spec.content !== undefined) {
    parts.push(
      `<content:encoded><![CDATA[${spec.content}]]></content:encoded>`,
    );
  }
  if (spec.extra) parts.push(spec.extra);
  return `<item>${parts.join("\n")}</item>`;
}

interface ChannelSpec {
  title?: string;
  link?: string;
  /** Raw child elements of `<channel>` before the items. */
  extra?: string;
}

function rssXml(items: ItemSpec[], channel: ChannelSpec = {}): string {
  const head: string[] = [];
  if (channel.title !== undefined) head.push(`<title>${channel.title}</title>`);
  if (channel.link !== undefined) head.push(`<link>${channel.link}</link>`);
  if (channel.extra) head.push(channel.extra);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
${head.join("\n")}
${items.map(itemXml).join("\n")}
</channel>
</rss>`;
}

interface ParseOptions {
  url?: string;
  existing?: Feed | null;
  display?: Partial<DisplaySettings>;
  tags?: Tag[];
  media?: Partial<MediaSettings>;
  folders?: Folder[];
  protections?: FeedRetentionProtections;
  useFirstSeenFallback?: boolean;
  allowEmpty?: boolean;
}

function response(text: string): RequestUrlResponse {
  return {
    status: 200,
    text,
    headers: {},
    arrayBuffer: new ArrayBuffer(0),
    json: null,
  };
}

/** Builds a parser over the given host callbacks and parses one response body. */
async function parse(body: string, opts: ParseOptions = {}): Promise<Feed> {
  vi.spyOn(obsidian, "requestUrl").mockResolvedValue(response(body));
  const parser = new FeedParser(
    { ...DEFAULT_SETTINGS.display, ...opts.display },
    opts.tags ?? [],
    { ...MEDIA_SETTINGS, ...opts.media },
    () => opts.folders ?? [],
    () => true,
    opts.protections
      ? () => opts.protections as FeedRetentionProtections
      : undefined,
    () => opts.useFirstSeenFallback ?? false,
  );
  return parser.parseFeed(opts.url ?? FEED_URL, opts.existing ?? null, {
    allowEmpty: opts.allowEmpty,
  });
}

/** A parser-output item with every required field empty; override what a test needs. */
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

/**
 * Runs `parseFeed` with the XML parser's output supplied directly. The jsdom
 * DOM cannot read namespaced elements such as `<itunes:duration>`, so the
 * itunes and enclosure paths are fed through the parser seam instead; the
 * fetch and everything after the parser still run for real.
 */
async function parseParsed(
  items: ParsedItem[],
  feedProps: Partial<ParsedFeed> = {},
  opts: ParseOptions = {},
): Promise<Feed> {
  vi.spyOn(CustomXMLParser.prototype, "parseString").mockReturnValue({
    title: "Parsed feed",
    items,
    type: "rss",
    feedItunesImage: "",
    feedImageUrl: "",
    ...feedProps,
  });
  return parse("<rss></rss>", opts);
}

function storedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Stored title",
    link: "https://example.com/stored",
    description: "Stored description",
    pubDate: RECENT,
    guid: "https://example.com/stored",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Stored feed",
    feedUrl: FEED_URL,
    coverImage: "",
    saved: false,
    mediaType: "article",
    ...overrides,
  };
}

function storedFeed(items: FeedItem[], overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Stored feed",
    url: FEED_URL,
    folder: "Uncategorized",
    items,
    lastUpdated: 1,
    ...overrides,
  };
}

/** Indexed access that fails loudly, because the test tsconfig checks index bounds. */
function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) {
    throw new Error(`Expected an element at index ${index}`);
  }
  return value;
}

function itemByTitle(feed: Feed, title: string): FeedItem {
  const found = feed.items.find((item) => item.title === title);
  if (!found) throw new Error(`No item titled "${title}"`);
  return found;
}

describe("FeedParser.parseFeed characterization", () => {
  beforeEach(() => {
    // Fake only Date; real timers keep the mocked fetch promises flowing.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("input and errors", () => {
    it("rejects an empty url before any request is made", async () => {
      const requestSpy = vi.spyOn(obsidian, "requestUrl");
      const parser = new FeedParser(DEFAULT_SETTINGS.display, []);

      await expect(parser.parseFeed("", null)).rejects.toThrow(
        "Feed url is required",
      );
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it("propagates a failed request as the thrown error", async () => {
      vi.spyOn(obsidian, "requestUrl").mockRejectedValue(
        new Error("net::ERR_CONNECTION_REFUSED"),
      );
      const parser = new FeedParser(
        DEFAULT_SETTINGS.display,
        [],
        MEDIA_SETTINGS,
        () => [],
        () => false,
      );

      await expect(parser.parseFeed(FEED_URL, null)).rejects.toThrow(
        "net::ERR_CONNECTION_REFUSED",
      );
    });

    it("throws EmptyFeedError for a feed with no items", async () => {
      await expect(parse(RSS2_EMPTY)).rejects.toBeInstanceOf(EmptyFeedError);
    });

    it("returns an empty feed instead of throwing when allowEmpty is set", async () => {
      const feed = await parse(RSS2_EMPTY, { allowEmpty: true });

      expect(feed.items).toEqual([]);
      expect(feed.lastRefreshDiagnostics).toEqual({
        fetchedItemCount: 0,
        mergedItemCountBeforeRetention: 0,
        retainedItemCount: 0,
        retentionRemovedCount: 0,
        skippedByRefreshCutoffCount: 0,
        autoDeleteDurationDays: undefined,
      });
    });

    it("throws EmptyFeedError for a JSON Feed with no items", async () => {
      await expect(parse(JSON_FEED_EMPTY_ITEMS)).rejects.toBeInstanceOf(
        EmptyFeedError,
      );
    });

    it("parses an RSS 2.0 feed", async () => {
      const feed = await parse(RSS2_BASIC);

      expect(feed.title).toBe("Test Feed");
      expect(feed.items.map((item) => item.title)).toEqual([
        "Second Article",
        "First Article",
      ]);
      expect(feed.items.map((item) => item.guid)).toEqual([
        "https://example.com/guid-002",
        "https://example.com/1",
      ]);
    });

    it("parses an Atom feed", async () => {
      const feed = await parse(ATOM_BASIC, {
        url: "https://example.com/atom.xml",
      });

      expect(feed.title).toBe("Atom Feed");
      expect(feed.siteUrl).toBe("https://example.com");
      const entry = at(feed.items, 0);
      expect(entry.title).toBe("Atom Entry");
      expect(entry.link).toBe("https://example.com/atom-entry");
      expect(entry.guid).toBe("https://example.com/atom-entry");
      expect(entry.pubDate).toBe("2024-01-01T00:00:00Z");
      expect(entry.summary).toBe("Entry summary");
    });

    it("parses a JSON Feed", async () => {
      const feed = await parse(JSON_FEED_BASIC, {
        url: "https://example.com/feed.json",
      });

      expect(feed.title).toBe("JSON Feed");
      expect(feed.siteUrl).toBe("https://example.com");
      const entry = at(feed.items, 0);
      expect(entry.title).toBe("JSON Item");
      expect(entry.guid).toBe("https://example.com/json-1");
      expect(entry.description).toBe("Item summary");
      expect(entry.content).toBe("<p>Item content</p>");
      expect(entry.summary).toBe("Item content");
      // A JSON Feed item has no author, where an RSS item gets "".
      expect(entry.author).toBeUndefined();
    });
  });
  describe("feed title, new-feed defaults and site url", () => {
    it("builds a new feed from the url, the parsed title and the Uncategorized folder", async () => {
      const feed = await parse(
        rssXml([{ title: "A", link: "https://example.com/a", guid: "a" }], {
          title: "Parsed title",
          link: "https://example.com",
        }),
      );

      expect(feed.title).toBe("Parsed title");
      expect(feed.url).toBe(FEED_URL);
      expect(feed.folder).toBe("Uncategorized");
      expect(feed.lastUpdated).toBe(NOW);
    });

    it("names a feed whose channel title is empty 'Unnamed feed'", async () => {
      const feed = await parse(
        rssXml([{ title: "A", link: "https://example.com/a" }], {
          title: "",
          link: "https://example.com",
        }),
      );

      expect(feed.title).toBe("Unnamed feed");
      expect(at(feed.items, 0).feedTitle).toBe("Unnamed feed");
    });

    it("uses the unnamed feed default when the channel has no title element", async () => {
      const feed = await parse(
        rssXml([{ title: "First article", link: "https://example.com/a" }], {
          link: "https://example.com",
        }),
      );

      expect(feed.title).toBe("Unnamed feed");
    });

    it("keeps the stored feed title over the parsed one and stamps it on every item", async () => {
      const existing = storedFeed(
        [
          storedItem({
            guid: "https://example.com/a",
            link: "https://example.com/a",
          }),
        ],
        { title: "My renamed feed" },
      );

      const feed = await parse(
        rssXml(
          [
            {
              title: "A",
              link: "https://example.com/a",
              guid: "https://example.com/a",
              pubDate: RECENT,
            },
            {
              title: "B",
              link: "https://example.com/b",
              guid: "https://example.com/b",
              pubDate: RECENT,
            },
          ],
          { title: "Title from the server" },
        ),
        { existing },
      );

      expect(feed.title).toBe("My renamed feed");
      expect(feed.items.map((item) => item.feedTitle)).toEqual([
        "My renamed feed",
        "My renamed feed",
      ]);
    });

    it("returns a copy of the stored feed and updates the stored feed in place", async () => {
      const existing = storedFeed(
        [
          storedItem({
            guid: "https://example.com/gone",
            link: "https://example.com/gone",
            pubDate: RECENT,
          }),
        ],
        {
          folder: "News",
          customTags: ["Research"],
          maxItemsLimit: 50,
          scanInterval: 15,
          feedEncoding: "windows-1251",
          excludeFromRefresh: false,
        },
      );
      const storedItems = existing.items;

      const feed = await parse(
        rssXml(
          [{ title: "A", link: "https://example.com/a", pubDate: RECENT }],
          { link: "https://example.com" },
        ),
        { existing },
      );

      expect(feed).not.toBe(existing);
      expect(feed.items).not.toBe(existing.items);
      // The stored feed is the working object: the merged items, the site url,
      // the timestamp and the diagnostics land on it, but not the media type or icon.
      expect(existing.items).not.toBe(storedItems);
      expect(existing.items).toHaveLength(2);
      expect(existing.siteUrl).toBe("https://example.com");
      expect(existing.lastUpdated).toBe(NOW);
      expect(existing.lastRefreshDiagnostics?.fetchedItemCount).toBe(1);
      expect(existing.mediaType).toBeUndefined();
      expect(existing.iconUrl).toBeUndefined();
      // The copy carries the stored settings and adds the media type and icon.
      expect(feed.folder).toBe("News");
      expect(feed.customTags).toEqual(["Research"]);
      expect(feed.maxItemsLimit).toBe(50);
      expect(feed.scanInterval).toBe(15);
      expect(feed.feedEncoding).toBe("windows-1251");
      expect(feed.excludeFromRefresh).toBe(false);
      expect(feed.mediaType).toBe("article");
      expect(feed.iconUrl).toBe("");
    });

    it("resolves the site url from the channel link and stores it", async () => {
      const feed = await parse(
        rssXml([{ title: "A", link: "https://example.com/a" }], {
          link: "https://blog.example.org/home",
        }),
      );

      expect(feed.siteUrl).toBe("https://blog.example.org/home");
    });

    it("resolves a relative channel link against the feed url", async () => {
      const feed = await parse(
        rssXml([{ title: "A", link: "https://example.com/a" }], {
          link: "/blog/",
        }),
        { url: "https://example.com/rss/feed.xml" },
      );

      expect(feed.siteUrl).toBe("https://example.com/blog/");
    });

    it("keeps the stored site url when the feed has no usable link", async () => {
      const existing = storedFeed([], { siteUrl: "https://old.example.com" });

      const feed = await parse(
        rssXml([{ title: "A", link: "https://example.com/a" }], {
          link: "javascript:alert(1)",
        }),
        { existing },
      );

      expect(feed.siteUrl).toBe("https://old.example.com");
    });

    it("leaves siteUrl unset on a new feed whose channel link is empty", async () => {
      const feed = await parse(
        rssXml([{ title: "A", link: "https://example.com/a" }], { link: "" }),
      );

      expect(feed.siteUrl).toBeUndefined();
    });

    it("leaves the site url unset when the channel has no link element", async () => {
      const feed = await parse(
        rssXml([{ title: "A", link: "https://example.com/a" }], { title: "T" }),
      );

      expect(feed.siteUrl).toBeUndefined();
    });

    it("overwrites the stored site url when the channel link changes", async () => {
      const existing = storedFeed([], { siteUrl: "https://old.example.com" });

      const feed = await parse(
        rssXml([{ title: "A", link: "https://example.com/a" }], {
          link: "https://new.example.com",
        }),
        { existing },
      );

      expect(feed.siteUrl).toBe("https://new.example.com");
    });
  });

  describe("item identity and de-duplication", () => {
    it("uses the guid as the item guid and the link as the item link", async () => {
      const feed = await parse(
        rssXml([
          {
            title: "A",
            link: "https://example.com/a",
            guid: "https://example.com/guid-a",
          },
        ]),
      );

      const item = at(feed.items, 0);
      expect(item.guid).toBe("https://example.com/guid-a");
      expect(item.link).toBe("https://example.com/a");
    });

    it("falls back to the link when an item has no guid", async () => {
      const feed = await parse(
        rssXml([{ title: "A", link: "https://example.com/a" }]),
      );

      expect(at(feed.items, 0).guid).toBe("https://example.com/a");
    });

    it("resolves a plain-text guid against the feed url", async () => {
      const feed = await parse(
        rssXml([
          { title: "A", link: "https://example.com/a", guid: "post-42" },
        ]),
        { url: "https://example.com/blog/feed.xml" },
      );

      expect(at(feed.items, 0).guid).toBe("https://example.com/blog/post-42");
    });

    it("skips an item with neither a guid nor a link", async () => {
      const feed = await parse(
        rssXml([
          { title: "No identity" },
          { title: "Has link", link: "https://example.com/a" },
        ]),
      );

      expect(feed.items.map((item) => item.title)).toEqual(["Has link"]);
      expect(feed.lastRefreshDiagnostics?.fetchedItemCount).toBe(2);
    });

    it("keeps only the first of two items that share a guid", async () => {
      const feed = await parse(
        rssXml([
          {
            title: "First copy",
            link: "https://example.com/a",
            guid: "dup",
            pubDate: RECENT,
          },
          {
            title: "Second copy",
            link: "https://example.com/b",
            guid: "dup",
            pubDate: RECENT,
          },
        ]),
      );

      expect(feed.items.map((item) => item.title)).toEqual(["First copy"]);
    });

    it("treats two guids that differ only by a numeric url fragment as one item", async () => {
      const feed = await parse(
        rssXml([
          {
            title: "First copy",
            link: "https://example.com/a",
            guid: "https://example.com/a#0",
            pubDate: RECENT,
          },
          {
            title: "Second copy",
            link: "https://example.com/a",
            guid: "https://example.com/a#1",
            pubDate: RECENT,
          },
        ]),
      );

      expect(feed.items.map((item) => item.title)).toEqual(["First copy"]);
      expect(at(feed.items, 0).guid).toBe("https://example.com/a");
    });

    it("matches a stored item that has no guid by its link", async () => {
      const existing = storedFeed([
        storedItem({
          guid: "",
          link: "https://example.com/a",
          read: true,
          title: "Stored A",
        }),
      ]);

      const feed = await parse(
        rssXml([
          {
            title: "A",
            link: "https://example.com/a",
            guid: "https://example.com/a",
            pubDate: RECENT,
          },
        ]),
        { existing },
      );

      expect(feed.items).toHaveLength(1);
      expect(at(feed.items, 0).read).toBe(true);
      expect(at(feed.items, 0).guid).toBe("https://example.com/a");
    });

    it("matches a stored item whose guid is relative by resolving it against the feed url", async () => {
      const existing = storedFeed([
        storedItem({ guid: "/a", link: "", read: true }),
      ]);

      const feed = await parse(
        rssXml([
          {
            title: "A",
            link: "https://example.com/a",
            guid: "https://example.com/a",
            pubDate: RECENT,
          },
        ]),
        { existing },
      );

      expect(feed.items).toHaveLength(1);
      expect(at(feed.items, 0).read).toBe(true);
    });

    it("does not match items by title: a new guid with a stored title is a second item", async () => {
      const existing = storedFeed([
        storedItem({
          title: "Same title",
          guid: "https://example.com/old-guid",
          link: "https://example.com/old-guid",
          read: true,
        }),
      ]);

      const feed = await parse(
        rssXml([
          {
            title: "Same title",
            link: "https://example.com/new-guid",
            guid: "https://example.com/new-guid",
            pubDate: RECENT,
          },
        ]),
        { existing },
      );

      expect(feed.items).toHaveLength(2);
      const fresh = feed.items.find(
        (item) => item.guid === "https://example.com/new-guid",
      );
      expect(fresh?.read).toBe(false);
    });

    it("drops a stored item with no guid and no link", async () => {
      const existing = storedFeed([storedItem({ guid: "", link: "" })]);

      const feed = await parse(
        rssXml([
          { title: "A", link: "https://example.com/a", pubDate: RECENT },
        ]),
        { existing },
      );

      expect(feed.items.map((item) => item.title)).toEqual(["A"]);
    });

    it("keeps a stored item that dropped out of the feed", async () => {
      const existing = storedFeed([
        storedItem({
          title: "Dropped out",
          guid: "https://example.com/dropped",
          link: "https://example.com/dropped",
          read: true,
          pubDate: WEEK_OLD,
        }),
      ]);

      const feed = await parse(
        rssXml([
          { title: "A", link: "https://example.com/a", pubDate: RECENT },
        ]),
        { existing },
      );

      expect(feed.items.map((item) => item.title)).toEqual([
        "A",
        "Dropped out",
      ]);
      expect(itemByTitle(feed, "Dropped out").read).toBe(true);
    });
  });
  describe("a new item", () => {
    it("is built with unread defaults and the parsed fields", async () => {
      const feed = await parse(
        rssXml(
          [
            {
              title: "Hello",
              link: "https://example.com/hello",
              guid: "https://example.com/hello",
              pubDate: RECENT,
              description: "<p>Short description</p>",
              content: "<p>Full body text</p>",
              extra:
                "<dc:creator>Jane Writer</dc:creator><category>News</category>",
            },
          ],
          { title: "Blog", link: "https://example.com" },
        ),
      );

      expect(feed.items).toEqual([
        {
          title: "Hello",
          link: "https://example.com/hello",
          description: "<p>Short description</p>",
          content: "<p>Full body text</p>",
          pubDate: RECENT,
          guid: "https://example.com/hello",
          read: false,
          starred: false,
          tags: [],
          feedTitle: "Blog",
          feedUrl: FEED_URL,
          coverImage: "",
          summary: "Full body text",
          author: "Jane Writer",
          saved: false,
          mediaType: "article",
          duration: "",
          explicit: false,
          image: "",
          category: "",
          episodeType: "",
          firstSeenMs: NOW,
        },
      ]);
    });

    it("is titled 'No title' when the feed gives none", async () => {
      const feed = await parse(
        rssXml([{ link: "https://example.com/a", pubDate: RECENT }], {
          title: "T",
        }),
      );

      expect(at(feed.items, 0).title).toBe("No title");
    });

    it("keeps an undated item's pubDate empty on its first fetch", async () => {
      const feed = await parse(
        rssXml([{ title: "Undated", link: "https://example.com/a" }], {
          title: "T",
        }),
      );

      expect(at(feed.items, 0).pubDate).toBe("");
    });

    it("stamps firstSeenMs with the current time on a new item", async () => {
      const feed = await parse(
        rssXml(
          [{ title: "A", link: "https://example.com/a", pubDate: RECENT }],
          {
            title: "T",
          },
        ),
      );

      expect(at(feed.items, 0).firstSeenMs).toBe(NOW);
    });

    it("resolves a relative item link against the feed url", async () => {
      const feed = await parse(
        rssXml(
          [
            {
              title: "A",
              link: "/posts/a",
              guid: "https://example.com/posts/a",
              pubDate: RECENT,
            },
          ],
          {
            title: "T",
          },
        ),
        { url: "https://example.com/rss/feed.xml" },
      );

      expect(at(feed.items, 0).link).toBe("https://example.com/posts/a");
    });

    it("treats a link that contains .mp3 as a podcast episode and synthesizes its enclosure", async () => {
      const feed = await parse(
        rssXml(
          [
            {
              title: "Direct audio",
              link: "https://cdn.example.com/show/ep1.mp3",
              pubDate: RECENT,
            },
          ],
          { title: "Pod" },
        ),
      );

      const episode = at(feed.items, 0);
      expect(episode.mediaType).toBe("podcast");
      expect(episode.audioUrl).toBe("https://cdn.example.com/show/ep1.mp3");
      expect(episode.enclosure).toEqual({
        url: "https://cdn.example.com/show/ep1.mp3",
        type: "audio/mpeg",
        length: "",
      });
    });

    it("keeps a video enclosure as an enclosure without making the item a podcast", async () => {
      const feed = await parse(
        rssXml(
          [
            {
              title: "Clip",
              link: "https://example.com/clip",
              pubDate: RECENT,
              extra:
                '<enclosure url="https://example.com/clip.mp4" type="video/mp4" length="5"/>',
            },
          ],
          { title: "T" },
        ),
      );

      const clip = at(feed.items, 0);
      expect(clip.enclosure?.url).toBe("https://example.com/clip.mp4");
      expect(clip.audioUrl).toBeUndefined();
    });

    it("carries the ieee fields of an item", async () => {
      const feed = await parse(
        rssXml(
          [
            {
              title: "Paper",
              link: "https://example.com/paper",
              pubDate: RECENT,
              extra:
                "<pubYear>2024</pubYear><volume>12</volume><issue>3</issue><startPage>10</startPage><endPage>20</endPage><fileSize>1MB</fileSize><authors>A. One; B. Two</authors>",
            },
          ],
          { title: "T" },
        ),
      );

      const paper = at(feed.items, 0);
      expect(paper.ieee).toEqual({
        pubYear: "2024",
        volume: "12",
        issue: "3",
        startPage: "10",
        endPage: "20",
        fileSize: "1MB",
        authors: "A. One; B. Two",
      });
      // `authors` also wins over the other author elements.
      expect(paper.author).toBe("A. One; B. Two");
    });
  });

  describe("an item that is already stored", () => {
    const GUID = "https://example.com/a";

    function feedWithOneItem(
      spec: ItemSpec,
      channel: ChannelSpec = { title: "Server title" },
    ): string {
      return rssXml([{ link: GUID, guid: GUID, ...spec }], channel);
    }

    it("keeps the reader's state and every field the feed does not own", async () => {
      const existing = storedFeed([
        storedItem({
          guid: GUID,
          link: GUID,
          read: true,
          starred: true,
          saved: true,
          savedFilePath: "Saved/a.md",
          tags: [{ name: "Keep", color: "#123456" }],
          firstSeenMs: 111,
          feedUrl: "https://old.example.com/feed",
          playbackProgress: { position: 30, duration: 60, lastUpdated: 5 },
          videoId: "vid1",
          videoUrl: "https://example.com/v",
          restrictedReason: "paywall",
          starredImportContentState: "unfetched",
          fallbackIconUrl: "https://example.com/old-icon.png",
        }),
      ]);

      const feed = await parse(
        feedWithOneItem({ title: "A", pubDate: RECENT }),
        { existing },
      );

      expect(feed.items).toHaveLength(1);
      const item = at(feed.items, 0);
      expect(item.read).toBe(true);
      expect(item.starred).toBe(true);
      expect(item.saved).toBe(true);
      expect(item.savedFilePath).toBe("Saved/a.md");
      expect(item.tags).toEqual([{ name: "Keep", color: "#123456" }]);
      expect(item.firstSeenMs).toBe(111);
      expect(item.playbackProgress).toEqual({
        position: 30,
        duration: 60,
        lastUpdated: 5,
      });
      expect(item.videoId).toBe("vid1");
      expect(item.videoUrl).toBe("https://example.com/v");
      expect(item.restrictedReason).toBe("paywall");
      expect(item.starredImportContentState).toBe("unfetched");
      // A refresh does not move the item to the new feed url.
      expect(item.feedUrl).toBe("https://old.example.com/feed");
    });

    it("takes the feed's new values for title, link, text, date, author and feed title", async () => {
      const existing = storedFeed([
        storedItem({
          guid: GUID,
          link: "https://example.com/old-link",
          title: "Old title",
          description: "Old description",
          content: "Old content",
          pubDate: WEEK_OLD,
          author: "Old Author",
          summary: "Old summary",
          feedTitle: "Old feed title",
        }),
      ]);

      const feed = await parse(
        feedWithOneItem({
          title: "New title",
          pubDate: RECENT,
          description: "<p>New description</p>",
          content: "<p>New content body</p>",
          extra: "<dc:creator>New Author</dc:creator>",
        }),
        { existing },
      );

      const item = at(feed.items, 0);
      expect(item.title).toBe("New title");
      expect(item.link).toBe(GUID);
      expect(item.description).toBe("<p>New description</p>");
      expect(item.content).toBe("<p>New content body</p>");
      expect(item.pubDate).toBe(RECENT);
      expect(item.author).toBe("New Author");
      expect(item.summary).toBe("New content body");
      expect(item.feedTitle).toBe("Stored feed");
    });

    it("falls back to the stored title, link, date, author and summary when the feed gives none", async () => {
      const existing = storedFeed([
        storedItem({
          guid: GUID,
          link: "https://example.com/stored-link",
          title: "Stored title",
          pubDate: WEEK_OLD,
          author: "Stored Author",
          summary: "Stored summary",
        }),
      ]);

      const feed = await parse(rssXml([{ guid: GUID }], { title: "T" }), {
        existing,
      });

      const item = at(feed.items, 0);
      expect(item.title).toBe("Stored title");
      expect(item.link).toBe("https://example.com/stored-link");
      expect(item.pubDate).toBe(WEEK_OLD);
      expect(item.author).toBe("Stored Author");
      expect(item.summary).toBe("Stored summary");
    });

    it("prefers the item's author, then the channel author, then the stored one", async () => {
      const existing = storedFeed([
        storedItem({ guid: GUID, link: GUID, author: "Stored Author" }),
      ]);

      const withChannelAuthor = await parse(
        feedWithOneItem(
          { title: "A", pubDate: RECENT },
          { title: "T", extra: "<dc:creator>Channel Author</dc:creator>" },
        ),
        { existing },
      );
      expect(at(withChannelAuthor.items, 0).author).toBe("Channel Author");

      const withItemAuthor = await parse(
        feedWithOneItem(
          {
            title: "A",
            pubDate: RECENT,
            extra: "<dc:creator>Item Author</dc:creator>",
          },
          { title: "T", extra: "<dc:creator>Channel Author</dc:creator>" },
        ),
        { existing },
      );
      expect(at(withItemAuthor.items, 0).author).toBe("Item Author");
    });

    it("overwrites the stored description and content with empty text when the feed sends none", async () => {
      const existing = storedFeed([
        storedItem({
          guid: GUID,
          link: GUID,
          description: "Stored description",
          content: "Stored content",
        }),
      ]);

      const feed = await parse(
        feedWithOneItem({ title: "A", pubDate: RECENT }),
        { existing },
      );

      const item = at(feed.items, 0);
      expect(item.description).toBe("");
      expect(item.content).toBe("");
    });

    it("normalizes a stored guid to its canonical form", async () => {
      const existing = storedFeed([
        storedItem({ guid: `${GUID}#3`, link: GUID, read: true }),
      ]);

      const feed = await parse(
        feedWithOneItem({ title: "A", pubDate: RECENT }),
        { existing },
      );

      expect(at(feed.items, 0).guid).toBe(GUID);
      expect(at(feed.items, 0).read).toBe(true);
    });
  });

  describe("ordering, first-seen stamps and diagnostics", () => {
    it("sorts the merged items newest first, breaking ties by guid", async () => {
      const feed = await parse(
        rssXml(
          [
            { title: "Old", link: "https://example.com/old", pubDate: OLD },
            { title: "Tie b", link: "https://example.com/b", pubDate: RECENT },
            {
              title: "Newest",
              link: "https://example.com/new",
              pubDate: "Mon, 15 Jun 2026 06:00:00 GMT",
            },
            { title: "Tie a", link: "https://example.com/a", pubDate: RECENT },
          ],
          { title: "T" },
        ),
      );

      expect(feed.items.map((item) => item.title)).toEqual([
        "Newest",
        "Tie a",
        "Tie b",
        "Old",
      ]);
    });

    it("sorts undated items last", async () => {
      const feed = await parse(
        rssXml(
          [
            { title: "Undated", link: "https://example.com/u" },
            { title: "Dated", link: "https://example.com/d", pubDate: OLD },
          ],
          { title: "T" },
        ),
      );

      expect(feed.items.map((item) => item.title)).toEqual([
        "Dated",
        "Undated",
      ]);
    });

    it("keeps a stored item's first-seen time and stamps the newcomer with now", async () => {
      const existing = storedFeed([
        storedItem({
          guid: "https://example.com/a",
          link: "https://example.com/a",
          firstSeenMs: 555,
          pubDate: RECENT,
        }),
        storedItem({
          title: "Dropped out",
          guid: "https://example.com/dropped",
          link: "https://example.com/dropped",
          pubDate: RECENT,
        }),
      ]);

      const feed = await parse(
        rssXml(
          [
            { title: "A", link: "https://example.com/a", pubDate: RECENT },
            { title: "B", link: "https://example.com/b", pubDate: RECENT },
          ],
          { title: "T" },
        ),
        { existing },
      );

      expect(itemByTitle(feed, "A").firstSeenMs).toBe(555);
      expect(itemByTitle(feed, "B").firstSeenMs).toBe(NOW);
      // A carried-forward item with no first-seen time is stamped on this pass.
      expect(itemByTitle(feed, "Dropped out").firstSeenMs).toBe(NOW);
    });

    it("reports the fetched, merged and retained counts", async () => {
      const existing = storedFeed(
        [
          storedItem({
            guid: "https://example.com/gone",
            link: "https://example.com/gone",
            pubDate: RECENT,
          }),
        ],
        { maxItemsLimit: 2 },
      );

      const feed = await parse(
        rssXml(
          [
            { title: "A", link: "https://example.com/a", pubDate: RECENT },
            { title: "B", link: "https://example.com/b", pubDate: WEEK_OLD },
            { title: "C", link: "https://example.com/c", pubDate: OLD },
          ],
          { title: "T" },
        ),
        { existing },
      );

      expect(feed.lastRefreshDiagnostics).toEqual({
        fetchedItemCount: 3,
        mergedItemCountBeforeRetention: 4,
        retainedItemCount: 2,
        retentionRemovedCount: 2,
        skippedByRefreshCutoffCount: 0,
        autoDeleteDurationDays: undefined,
      });
    });
  });
  describe("authors", () => {
    it("gives a new item the channel author when the item has none", async () => {
      const feed = await parseParsed(
        [
          pitem({
            title: "No byline",
            link: "https://example.com/a",
            pubDate: RECENT,
          }),
          pitem({
            title: "With byline",
            link: "https://example.com/b",
            pubDate: RECENT,
            author: "Item Author",
          }),
        ],
        { author: "Channel Author" },
      );

      expect(itemByTitle(feed, "No byline").author).toBe("Channel Author");
      expect(itemByTitle(feed, "With byline").author).toBe("Item Author");
    });

    it("leaves a new item's author undefined when neither the item nor the channel has one", async () => {
      const feed = await parseParsed([
        pitem({ title: "A", link: "https://example.com/a", pubDate: RECENT }),
      ]);

      expect(at(feed.items, 0).author).toBeUndefined();
    });

    it("does not give an item another item's byline when the channel has no author", async () => {
      const feed = await parse(
        rssXml(
          [
            {
              title: "No byline",
              link: "https://example.com/a",
              pubDate: RECENT,
            },
            {
              title: "With byline",
              link: "https://example.com/b",
              pubDate: RECENT,
              extra: "<author>writer@example.com (Item Author)</author>",
            },
          ],
          { title: "T" },
        ),
      );

      expect(itemByTitle(feed, "No byline").author).toBe("");
      expect(itemByTitle(feed, "With byline").author).toBe(
        "writer@example.com (Item Author)",
      );
    });
  });

  describe("podcast items and itunes fields", () => {
    const EPISODE_URL = "https://example.com/ep";

    function episode(overrides: Partial<ParsedItem> = {}): ParsedItem {
      return pitem({
        title: "Episode",
        link: EPISODE_URL,
        guid: "ep-1",
        pubDate: RECENT,
        enclosure: {
          url: "https://cdn.example.com/ep.m4a",
          type: "audio/x-m4a",
          length: "999",
        },
        itunes: {
          duration: "1:02:03",
          explicit: "yes",
          episodeType: "full",
          season: "2",
          episode: "14",
          category: "Technology",
        },
        ...overrides,
      });
    }

    it("turns an item with an audio enclosure into a podcast episode and the feed into a podcast", async () => {
      const feed = await parseParsed([episode()]);

      const item = at(feed.items, 0);
      expect(feed.mediaType).toBe("podcast");
      expect(item.mediaType).toBe("podcast");
      expect(item.enclosure).toEqual({
        url: "https://cdn.example.com/ep.m4a",
        type: "audio/x-m4a",
        length: "999",
      });
      expect(item.audioUrl).toBe("https://cdn.example.com/ep.m4a");
      expect(item.duration).toBe("1:02:03");
      expect(item.explicit).toBe(true);
      expect(item.episodeType).toBe("full");
      expect(item.season).toBe(2);
      expect(item.episode).toBe(14);
      expect(item.category).toBe("Technology");
    });

    it("resolves a relative enclosure url against the feed for podcast playback", async () => {
      const feed = await parseParsed([
        episode({
          enclosure: { url: "/audio/ep.m4a", type: "audio/x-m4a", length: "1" },
        }),
      ]);

      expect(at(feed.items, 0).audioUrl).toBe(
        "https://example.com/audio/ep.m4a",
      );
      expect(at(feed.items, 0).enclosure?.url).toBe(
        "https://example.com/audio/ep.m4a",
      );
    });

    it("reads itunes:explicit other than 'yes' as not explicit", async () => {
      const feed = await parseParsed([
        episode({ itunes: { explicit: "true" } }),
        episode({
          guid: "ep-2",
          link: "https://example.com/ep2",
          itunes: { explicit: "no" },
        }),
      ]);

      expect(feed.items.map((item) => item.explicit)).toEqual([false, false]);
    });

    it("leaves season and episode undefined when the feed gives none", async () => {
      const feed = await parseParsed([
        episode({ itunes: { duration: "5:00" } }),
      ]);

      const item = at(feed.items, 0);
      expect(item.season).toBeUndefined();
      expect(item.episode).toBeUndefined();
    });

    it("turns a feed with one audio item among articles into a podcast feed and relabels every item", async () => {
      const feed = await parseParsed([
        pitem({
          title: "Article",
          link: "https://example.com/article",
          pubDate: RECENT,
        }),
        episode({ pubDate: WEEK_OLD }),
      ]);

      expect(feed.mediaType).toBe("podcast");
      expect(feed.items.map((item) => item.mediaType)).toEqual([
        "podcast",
        "podcast",
      ]);
    });

    it("updates a stored episode from the feed's itunes fields and enclosure", async () => {
      const existing = storedFeed([
        storedItem({
          guid: "https://example.com/ep-1",
          link: EPISODE_URL,
          duration: "10:00",
          explicit: false,
          category: "Old category",
          episodeType: "bonus",
          season: 1,
          episode: 2,
          audioUrl: "https://cdn.example.com/old.mp3",
          enclosure: {
            url: "https://cdn.example.com/old.mp3",
            type: "audio/mpeg",
            length: "1",
          },
        }),
      ]);

      const feed = await parseParsed(
        [episode({ guid: "https://example.com/ep-1" })],
        {},
        { existing },
      );

      const item = at(feed.items, 0);
      expect(item.duration).toBe("1:02:03");
      expect(item.explicit).toBe(true);
      expect(item.category).toBe("Technology");
      expect(item.episodeType).toBe("full");
      expect(item.season).toBe(2);
      expect(item.episode).toBe(14);
      expect(item.audioUrl).toBe("https://cdn.example.com/ep.m4a");
      expect(item.enclosure?.url).toBe("https://cdn.example.com/ep.m4a");
    });

    it("keeps a stored episode's fields the feed leaves out", async () => {
      const existing = storedFeed([
        storedItem({
          guid: "https://example.com/ep-1",
          link: EPISODE_URL,
          duration: "10:00",
          explicit: true,
          category: "Old category",
          episodeType: "bonus",
          season: 1,
          episode: 2,
          mediaContentType: "audio/mpeg",
          mediaContentMedium: "audio",
          audioUrl: "https://cdn.example.com/old.mp3",
          enclosure: {
            url: "https://cdn.example.com/old.mp3",
            type: "audio/mpeg",
            length: "1",
          },
        }),
      ]);

      const feed = await parseParsed(
        [
          pitem({
            title: "Episode",
            link: EPISODE_URL,
            guid: "https://example.com/ep-1",
            pubDate: RECENT,
          }),
        ],
        {},
        { existing },
      );

      const item = at(feed.items, 0);
      expect(item.duration).toBe("10:00");
      expect(item.explicit).toBe(true);
      expect(item.category).toBe("Old category");
      expect(item.episodeType).toBe("bonus");
      expect(item.season).toBe(1);
      expect(item.episode).toBe(2);
      expect(item.mediaContentType).toBe("audio/mpeg");
      expect(item.mediaContentMedium).toBe("audio");
      // The stored enclosure makes the feed a podcast, whose audio url is the enclosure's.
      expect(item.audioUrl).toBe("https://cdn.example.com/old.mp3");
      expect(item.enclosure?.url).toBe("https://cdn.example.com/old.mp3");
      expect(item.mediaType).toBe("podcast");
    });

    it("never turns a stored explicit flag back off", async () => {
      const existing = storedFeed([
        storedItem({
          guid: "https://example.com/ep-1",
          link: EPISODE_URL,
          explicit: true,
        }),
      ]);

      const feed = await parseParsed(
        [
          episode({
            guid: "https://example.com/ep-1",
            itunes: { explicit: "no" },
          }),
        ],
        {},
        { existing },
      );

      expect(at(feed.items, 0).explicit).toBe(true);
    });

    it("makes a stored article a podcast episode once the feed gives it an audio enclosure", async () => {
      const existing = storedFeed([
        storedItem({
          guid: "https://example.com/ep-1",
          link: EPISODE_URL,
          mediaType: "article",
        }),
      ]);

      const feed = await parseParsed(
        [episode({ guid: "https://example.com/ep-1" })],
        {},
        { existing },
      );

      expect(at(feed.items, 0).mediaType).toBe("podcast");
    });

    it("relabels stored video and podcast items as articles when the refreshed feed has no media", async () => {
      const existing = storedFeed([
        storedItem({
          guid: "https://example.com/v",
          link: "https://example.com/v",
          mediaType: "video",
        }),
        storedItem({
          guid: "https://example.com/p",
          link: "https://example.com/p",
          mediaType: "podcast",
        }),
        storedItem({
          guid: "https://example.com/n",
          link: "https://example.com/n",
          mediaType: undefined,
        }),
      ]);

      const feed = await parseParsed(
        [
          pitem({
            title: "V",
            link: "https://example.com/v",
            guid: "https://example.com/v",
            pubDate: RECENT,
          }),
          pitem({
            title: "P",
            link: "https://example.com/p",
            guid: "https://example.com/p",
            pubDate: RECENT,
          }),
          pitem({
            title: "N",
            link: "https://example.com/n",
            guid: "https://example.com/n",
            pubDate: RECENT,
          }),
        ],
        {},
        { existing },
      );

      expect(feed.items.map((item) => item.mediaType)).toEqual([
        "article",
        "article",
        "article",
      ]);
    });

    it("treats a link containing .mp3 as audio: the enclosure is synthesized and the feed is a podcast", async () => {
      const feed = await parseParsed([
        pitem({
          title: "Direct audio",
          link: "https://cdn.example.com/show/ep1.mp3",
          pubDate: RECENT,
        }),
      ]);

      const item = at(feed.items, 0);
      expect(feed.mediaType).toBe("podcast");
      expect(item.mediaType).toBe("podcast");
      expect(item.audioUrl).toBe("https://cdn.example.com/show/ep1.mp3");
      expect(item.enclosure).toEqual({
        url: "https://cdn.example.com/show/ep1.mp3",
        type: "audio/mpeg",
        length: "",
      });
    });

    it("keeps a video enclosure on the item and marks the feed and item as video", async () => {
      const feed = await parseParsed([
        pitem({
          title: "Clip",
          link: "https://example.com/clip",
          pubDate: RECENT,
          enclosure: {
            url: "https://example.com/clip.mp4",
            type: "video/mp4",
            length: "5",
          },
        }),
      ]);

      const item = at(feed.items, 0);
      expect(feed.mediaType).toBe("video");
      expect(item.mediaType).toBe("video");
      expect(item.videoUrl).toBe("https://example.com/clip.mp4");
      expect(item.audioUrl).toBeUndefined();
    });
  });
  describe("auto-delete cutoff on refresh", () => {
    const CUTOFF_MS = NOW - 30 * DAY_MS;
    const at30DaysExactly = new Date(CUTOFF_MS).toUTCString();
    const justInside = new Date(CUTOFF_MS + 1000).toUTCString();

    function link(name: string): string {
      return `https://example.com/${name}`;
    }

    function parsedArticle(name: string, pubDate: string): ParsedItem {
      return pitem({
        title: name,
        link: link(name),
        guid: link(name),
        pubDate,
      });
    }

    function feedWithAutoDelete(items: FeedItem[], days = 30): Feed {
      return storedFeed(items, { autoDeleteDuration: days });
    }

    it("skips a new item older than the cutoff and counts it", async () => {
      const existing = feedWithAutoDelete([]);

      const feed = await parseParsed(
        [parsedArticle("fresh", RECENT), parsedArticle("ancient", OLD)],
        {},
        { existing },
      );

      expect(feed.items.map((item) => item.title)).toEqual(["fresh"]);
      expect(feed.lastRefreshDiagnostics).toEqual({
        fetchedItemCount: 2,
        mergedItemCountBeforeRetention: 1,
        retainedItemCount: 1,
        retentionRemovedCount: 0,
        skippedByRefreshCutoffCount: 1,
        autoDeleteDurationDays: 30,
      });
    });

    it("skips an item dated exactly at the cutoff and keeps one a second newer", async () => {
      const existing = feedWithAutoDelete([]);

      const feed = await parseParsed(
        [
          parsedArticle("on-the-line", at30DaysExactly),
          parsedArticle("just-inside", justInside),
        ],
        {},
        { existing },
      );

      expect(feed.items.map((item) => item.title)).toEqual(["just-inside"]);
      // Skipped on the way in, not removed later by retention.
      expect(feed.lastRefreshDiagnostics).toMatchObject({
        skippedByRefreshCutoffCount: 1,
        retentionRemovedCount: 0,
      });
    });

    it("skips a stored item dated exactly at the cutoff and keeps one a second newer", async () => {
      const existing = feedWithAutoDelete([
        storedItem({
          title: "on-the-line",
          guid: link("on-the-line"),
          link: link("on-the-line"),
          pubDate: at30DaysExactly,
        }),
        storedItem({
          title: "just-inside",
          guid: link("just-inside"),
          link: link("just-inside"),
          pubDate: justInside,
        }),
      ]);

      const feed = await parseParsed(
        [
          pitem({
            title: "on-the-line",
            link: link("on-the-line"),
            guid: link("on-the-line"),
            pubDate: at30DaysExactly,
          }),
          pitem({
            title: "just-inside",
            link: link("just-inside"),
            guid: link("just-inside"),
            pubDate: justInside,
          }),
        ],
        {},
        { existing },
      );

      expect(feed.items.map((item) => item.title)).toEqual(["just-inside"]);
      expect(feed.lastRefreshDiagnostics).toMatchObject({
        skippedByRefreshCutoffCount: 1,
        retentionRemovedCount: 0,
      });
    });

    it("counts a duplicate of a skipped item once", async () => {
      const existing = feedWithAutoDelete([]);

      const feed = await parseParsed(
        [parsedArticle("ancient", OLD), parsedArticle("ancient", OLD)],
        {},
        { existing },
      );

      expect(feed.lastRefreshDiagnostics?.skippedByRefreshCutoffCount).toBe(1);
    });

    it("does not count an item with no guid and no link as skipped", async () => {
      const existing = feedWithAutoDelete([]);

      const feed = await parseParsed(
        [pitem({ title: "No identity", pubDate: OLD })],
        {},
        { existing },
      );

      expect(feed.lastRefreshDiagnostics?.skippedByRefreshCutoffCount).toBe(0);
    });

    it("ignores an auto-delete duration that is not a number", async () => {
      const existing = storedFeed([], {
        autoDeleteDuration: "30" as unknown as number,
      });

      const feed = await parseParsed(
        [parsedArticle("ancient", OLD)],
        {},
        { existing },
      );

      expect(feed.items.map((item) => item.title)).toEqual(["ancient"]);
      expect(
        feed.lastRefreshDiagnostics?.autoDeleteDurationDays,
      ).toBeUndefined();
    });

    it("keeps a recent stored item whose feed entry has no date", async () => {
      const existing = feedWithAutoDelete([
        storedItem({ guid: link("a"), link: link("a"), pubDate: RECENT }),
      ]);

      const feed = await parseParsed(
        [pitem({ title: "a", link: link("a"), guid: link("a") })],
        {},
        { existing },
      );

      expect(feed.items).toHaveLength(1);
      expect(feed.lastRefreshDiagnostics?.skippedByRefreshCutoffCount).toBe(0);
    });

    it("does not apply a cutoff to a first fetch with no stored feed", async () => {
      const feed = await parseParsed([parsedArticle("ancient", OLD)]);

      expect(feed.items.map((item) => item.title)).toEqual(["ancient"]);
      expect(
        feed.lastRefreshDiagnostics?.autoDeleteDurationDays,
      ).toBeUndefined();
    });

    it("applies no cutoff when the duration is 0 or not a positive number", async () => {
      for (const days of [0, -5]) {
        const existing = feedWithAutoDelete([], days);

        const feed = await parseParsed(
          [parsedArticle("ancient", OLD)],
          {},
          { existing },
        );

        expect(feed.items.map((item) => item.title)).toEqual(["ancient"]);
        expect(
          feed.lastRefreshDiagnostics?.autoDeleteDurationDays,
        ).toBeUndefined();
      }
    });

    it("drops a stored item that re-appears older than the cutoff", async () => {
      const existing = feedWithAutoDelete([
        storedItem({
          guid: link("ancient"),
          link: link("ancient"),
          pubDate: OLD,
          read: true,
        }),
      ]);

      const feed = await parseParsed(
        [parsedArticle("ancient", OLD)],
        {},
        { existing },
      );

      expect(feed.items).toEqual([]);
      expect(feed.lastRefreshDiagnostics?.skippedByRefreshCutoffCount).toBe(1);
    });

    it("dates a stored item by the feed's date, falling back to its stored date", async () => {
      const existing = feedWithAutoDelete([
        storedItem({ guid: link("a"), link: link("a"), pubDate: RECENT }),
        storedItem({ guid: link("b"), link: link("b"), pubDate: OLD }),
      ]);

      const feed = await parseParsed(
        [
          // The feed re-dates "a" to long ago: that date counts, so it is dropped.
          pitem({ title: "a", link: link("a"), guid: link("a"), pubDate: OLD }),
          // The feed gives no date for "b": its stored date counts.
          pitem({ title: "b", link: link("b"), guid: link("b") }),
        ],
        {},
        { existing },
      );

      expect(feed.items).toEqual([]);
      expect(feed.lastRefreshDiagnostics?.skippedByRefreshCutoffCount).toBe(2);
    });

    it("keeps a stored old item that is starred, and updates it from the feed", async () => {
      const existing = feedWithAutoDelete([
        storedItem({
          guid: link("old-star"),
          link: link("old-star"),
          pubDate: OLD,
          starred: true,
        }),
      ]);

      const feed = await parseParsed(
        [
          pitem({
            title: "Renamed",
            link: link("old-star"),
            guid: link("old-star"),
            pubDate: OLD,
          }),
        ],
        {},
        { existing },
      );

      expect(feed.items.map((item) => item.title)).toEqual(["Renamed"]);
      expect(at(feed.items, 0).starred).toBe(true);
      expect(feed.lastRefreshDiagnostics?.skippedByRefreshCutoffCount).toBe(0);
    });

    it("keeps or drops old saved and tagged items according to the protection settings", async () => {
      const stored = (): Feed =>
        feedWithAutoDelete([
          storedItem({
            guid: link("saved"),
            link: link("saved"),
            pubDate: OLD,
            saved: true,
          }),
          storedItem({
            guid: link("tagged"),
            link: link("tagged"),
            pubDate: OLD,
            tags: [{ name: "Keep", color: "#111111" }],
          }),
        ]);
      const parsedItems = (): ParsedItem[] => [
        parsedArticle("saved", OLD),
        parsedArticle("tagged", OLD),
      ];

      const defaults = await parseParsed(
        parsedItems(),
        {},
        { existing: stored() },
      );
      expect(defaults.items.map((item) => item.title)).toEqual(["saved"]);

      const everythingProtected = await parseParsed(
        parsedItems(),
        {},
        {
          existing: stored(),
          protections: {
            protectStarred: true,
            protectSaved: true,
            protectTagged: true,
            protectUnread: false,
          },
        },
      );
      expect(
        everythingProtected.items.map((item) => item.title).sort(),
      ).toEqual(["saved", "tagged"]);

      const nothingProtected = await parseParsed(
        parsedItems(),
        {},
        {
          existing: stored(),
          protections: {
            protectStarred: false,
            protectSaved: false,
            protectTagged: false,
            protectUnread: false,
          },
        },
      );
      expect(nothingProtected.items).toEqual([]);
    });

    it("keeps an old unread item the feed re-sends only when unread items are protected", async () => {
      const unprotected = await parseParsed(
        [parsedArticle("ancient", OLD)],
        {},
        { existing: feedWithAutoDelete([]) },
      );
      expect(unprotected.items).toEqual([]);

      const protectedUnread = await parseParsed(
        [parsedArticle("ancient", OLD)],
        {},
        {
          existing: feedWithAutoDelete([]),
          protections: {
            protectStarred: true,
            protectSaved: true,
            protectTagged: false,
            protectUnread: true,
          },
        },
      );
      expect(protectedUnread.items.map((item) => item.title)).toEqual([
        "ancient",
      ]);
      expect(
        protectedUnread.lastRefreshDiagnostics?.skippedByRefreshCutoffCount,
      ).toBe(0);
    });

    it("skips a new undated item when the first-seen fallback is off", async () => {
      const existing = feedWithAutoDelete([]);

      const feed = await parseParsed(
        [
          pitem({
            title: "undated",
            link: link("undated"),
            guid: link("undated"),
          }),
        ],
        {},
        { existing, useFirstSeenFallback: false },
      );

      expect(feed.items).toEqual([]);
      expect(feed.lastRefreshDiagnostics?.skippedByRefreshCutoffCount).toBe(1);
    });

    it("keeps a new undated item when the first-seen fallback is on", async () => {
      const existing = feedWithAutoDelete([]);

      const feed = await parseParsed(
        [
          pitem({
            title: "undated",
            link: link("undated"),
            guid: link("undated"),
          }),
        ],
        {},
        { existing, useFirstSeenFallback: true },
      );

      expect(feed.items.map((item) => item.title)).toEqual(["undated"]);
      expect(at(feed.items, 0).firstSeenMs).toBe(NOW);
    });

    it("dates a stored undated item by its first-seen time when the fallback is on", async () => {
      const stored = (firstSeenMs: number): Feed =>
        feedWithAutoDelete([
          storedItem({
            guid: link("u"),
            link: link("u"),
            pubDate: "",
            firstSeenMs,
          }),
        ]);
      const parsedUndated = (): ParsedItem[] => [
        pitem({ title: "u", link: link("u"), guid: link("u") }),
      ];

      const seenLongAgo = await parseParsed(
        parsedUndated(),
        {},
        {
          existing: stored(CUTOFF_MS - DAY_MS),
          useFirstSeenFallback: true,
        },
      );
      expect(seenLongAgo.items).toEqual([]);

      const seenRecently = await parseParsed(
        parsedUndated(),
        {},
        {
          existing: stored(NOW - DAY_MS),
          useFirstSeenFallback: true,
        },
      );
      expect(seenRecently.items).toHaveLength(1);

      const fallbackOff = await parseParsed(
        parsedUndated(),
        {},
        {
          existing: stored(NOW - DAY_MS),
          useFirstSeenFallback: false,
        },
      );
      expect(fallbackOff.items).toEqual([]);
    });

    it("drops a carried-forward stored item older than the cutoff but keeps a recent or protected one", async () => {
      const existing = feedWithAutoDelete([
        storedItem({
          title: "stale",
          guid: link("stale"),
          link: link("stale"),
          pubDate: OLD,
        }),
        storedItem({
          title: "stale-starred",
          guid: link("stale-starred"),
          link: link("stale-starred"),
          pubDate: OLD,
          starred: true,
        }),
        storedItem({
          title: "recent",
          guid: link("recent"),
          link: link("recent"),
          pubDate: WEEK_OLD,
        }),
      ]);

      const feed = await parseParsed(
        [parsedArticle("fresh", RECENT)],
        {},
        { existing },
      );

      expect(feed.items.map((item) => item.title).sort()).toEqual([
        "fresh",
        "recent",
        "stale-starred",
      ]);
      // A carried-forward drop is not a refresh-cutoff skip, so it is not counted.
      expect(feed.lastRefreshDiagnostics).toMatchObject({
        fetchedItemCount: 1,
        mergedItemCountBeforeRetention: 3,
        retainedItemCount: 3,
        skippedByRefreshCutoffCount: 0,
      });
    });
  });

  describe("retention limits", () => {
    it("keeps the newest items up to maxItemsLimit and reports what it removed", async () => {
      const existing = storedFeed([], { maxItemsLimit: 2 });

      const feed = await parseParsed(
        [
          pitem({
            title: "newest",
            link: "https://example.com/1",
            pubDate: RECENT,
          }),
          pitem({
            title: "middle",
            link: "https://example.com/2",
            pubDate: WEEK_OLD,
          }),
          pitem({
            title: "oldest",
            link: "https://example.com/3",
            pubDate: OLD,
          }),
        ],
        {},
        { existing },
      );

      expect(feed.items.map((item) => item.title)).toEqual([
        "newest",
        "middle",
      ]);
      expect(feed.lastRefreshDiagnostics).toEqual({
        fetchedItemCount: 3,
        mergedItemCountBeforeRetention: 3,
        retainedItemCount: 2,
        retentionRemovedCount: 1,
        skippedByRefreshCutoffCount: 0,
        autoDeleteDurationDays: undefined,
      });
    });

    it("keeps protected items beyond maxItemsLimit and puts them first before sorting", async () => {
      const existing = storedFeed(
        [
          storedItem({
            title: "old-star",
            guid: "https://example.com/star",
            link: "https://example.com/star",
            pubDate: OLD,
            starred: true,
          }),
        ],
        { maxItemsLimit: 1 },
      );

      const feed = await parseParsed(
        [
          pitem({
            title: "newest",
            link: "https://example.com/1",
            pubDate: RECENT,
          }),
          pitem({
            title: "middle",
            link: "https://example.com/2",
            pubDate: WEEK_OLD,
          }),
        ],
        {},
        { existing },
      );

      expect(feed.items.map((item) => item.title)).toEqual([
        "newest",
        "old-star",
      ]);
    });

    it("does not limit a feed whose maxItemsLimit is 0", async () => {
      const existing = storedFeed([], { maxItemsLimit: 0 });

      const feed = await parseParsed(
        [
          pitem({ title: "a", link: "https://example.com/1", pubDate: RECENT }),
          pitem({
            title: "b",
            link: "https://example.com/2",
            pubDate: WEEK_OLD,
          }),
        ],
        {},
        { existing },
      );

      expect(feed.items).toHaveLength(2);
    });

    it("sorts undated items by first-seen time when the fallback is on", async () => {
      const existing = storedFeed([
        storedItem({
          title: "seen-earlier",
          guid: "https://example.com/e",
          link: "https://example.com/e",
          pubDate: "",
          firstSeenMs: NOW - 5 * DAY_MS,
        }),
      ]);

      const feed = await parseParsed(
        [
          pitem({
            title: "dated",
            link: "https://example.com/d",
            pubDate: new Date(NOW - 2 * DAY_MS).toUTCString(),
          }),
          pitem({ title: "seen-now", link: "https://example.com/n" }),
        ],
        {},
        { existing, useFirstSeenFallback: true },
      );

      expect(feed.items.map((item) => item.title)).toEqual([
        "seen-now",
        "dated",
        "seen-earlier",
      ]);
    });
  });
  describe("article cover and card images", () => {
    const CONTENT_IMG = "https://img.example.com/from-content.jpg";
    const ITUNES_IMG = "https://img.example.com/from-itunes.jpg";
    const ITEM_IMG = "https://img.example.com/from-item.jpg";
    const ENCLOSURE_IMG = "https://img.example.com/from-enclosure.jpg";

    function withImages(overrides: Partial<ParsedItem> = {}): ParsedItem {
      return pitem({
        title: "A",
        link: "https://example.com/a",
        pubDate: RECENT,
        content: `<p>Text</p><img src="${CONTENT_IMG}">`,
        itunes: { image: { href: ITUNES_IMG } },
        image: { url: ITEM_IMG },
        enclosure: { url: ENCLOSURE_IMG, type: "image/jpeg", length: "1" },
        ...overrides,
      });
    }

    async function imagesOf(
      item: ParsedItem,
    ): Promise<{ cover: string; image: string | undefined }> {
      const feed = await parseParsed([item]);
      const parsedItem = at(feed.items, 0);
      return { cover: parsedItem.coverImage, image: parsedItem.image };
    }

    it("takes the cover from the content image and the card image from the itunes image", async () => {
      expect(await imagesOf(withImages())).toEqual({
        cover: CONTENT_IMG,
        image: ITUNES_IMG,
      });
    });

    it("falls through the cover candidates: content, itunes, item image, enclosure", async () => {
      expect(
        (await imagesOf(withImages({ content: "<p>Text</p>" }))).cover,
      ).toBe(ITUNES_IMG);
      expect(
        (
          await imagesOf(
            withImages({ content: "<p>Text</p>", itunes: undefined }),
          )
        ).cover,
      ).toBe(ITEM_IMG);
      expect(
        (
          await imagesOf(
            withImages({
              content: "<p>Text</p>",
              itunes: undefined,
              image: undefined,
            }),
          )
        ).cover,
      ).toBe(ENCLOSURE_IMG);
      expect(
        await imagesOf(
          withImages({
            content: "<p>Text</p>",
            itunes: undefined,
            image: undefined,
            enclosure: undefined,
          }),
        ),
      ).toEqual({ cover: "", image: "" });
    });

    it("falls through the card image candidates: itunes, item image, content, enclosure", async () => {
      expect((await imagesOf(withImages({ itunes: undefined }))).image).toBe(
        ITEM_IMG,
      );
      expect(
        (await imagesOf(withImages({ itunes: undefined, image: undefined })))
          .image,
      ).toBe(CONTENT_IMG);
      expect(
        (
          await imagesOf(
            withImages({
              itunes: undefined,
              image: undefined,
              content: "<p>Text</p>",
            }),
          )
        ).image,
      ).toBe(ENCLOSURE_IMG);
    });

    it("ignores an enclosure that is not an image", async () => {
      const result = await imagesOf(
        pitem({
          title: "A",
          link: "https://example.com/a",
          pubDate: RECENT,
          enclosure: {
            url: "https://example.com/doc.pdf",
            type: "application/pdf",
            length: "1",
          },
        }),
      );

      expect(result).toEqual({ cover: "", image: "" });
    });

    it("makes relative, protocol-relative and app:// image urls absolute against the feed url", async () => {
      const relative = await imagesOf(
        pitem({
          title: "A",
          link: "https://example.com/a",
          pubDate: RECENT,
          itunes: { image: { href: "img/itunes.png" } },
          image: { url: "/img/item.png" },
        }),
      );
      expect(relative).toEqual({
        cover: "https://example.com/img/itunes.png",
        image: "https://example.com/img/itunes.png",
      });

      const protocolRelative = await imagesOf(
        pitem({
          title: "A",
          link: "https://example.com/a",
          pubDate: RECENT,
          image: { url: "//cdn.example.com/p.png" },
        }),
      );
      expect(protocolRelative.cover).toBe("https://cdn.example.com/p.png");

      const appScheme = await imagesOf(
        pitem({
          title: "A",
          link: "https://example.com/a",
          pubDate: RECENT,
          image: { url: "app://cdn.example.com/q.png" },
        }),
      );
      expect(appScheme.cover).toBe("https://cdn.example.com/q.png");
    });

    it("resolves a relative image against the feed's own path", async () => {
      const feed = await parseParsed(
        [
          pitem({
            title: "A",
            link: "https://example.com/a",
            pubDate: RECENT,
            image: { url: "pics/a.png" },
          }),
        ],
        {},
        { url: "https://example.com/rss/feed.xml" },
      );

      expect(at(feed.items, 0).coverImage).toBe(
        "https://example.com/rss/pics/a.png",
      );
    });

    it("rejects image urls that are not http or https", async () => {
      const result = await imagesOf(
        pitem({
          title: "A",
          link: "https://example.com/a",
          pubDate: RECENT,
          image: { url: "data:image/png;base64,AAAA" },
        }),
      );

      expect(result).toEqual({ cover: "", image: "" });
    });

    it("rejects a WordPress LaTeX formula image as a cover or card image", async () => {
      const result = await imagesOf(
        pitem({
          title: "A",
          link: "https://example.com/a",
          pubDate: RECENT,
          image: { url: "https://s0.wp.com/latex.php?latex=x%5E2&bg=ffffff" },
        }),
      );

      expect(result).toEqual({ cover: "", image: "" });
    });

    it("shrinks a supported CDN image url", async () => {
      const result = await imagesOf(
        pitem({
          title: "A",
          link: "https://example.com/a",
          pubDate: RECENT,
          image: {
            url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
          },
        }),
      );

      expect(result.cover).toBe(
        "https://res.cloudinary.com/demo/image/upload/w_600,c_scale/sample.jpg",
      );
    });

    it("prefers an og:image meta tag in the content over its images", async () => {
      const result = await imagesOf(
        pitem({
          title: "A",
          link: "https://example.com/a",
          pubDate: RECENT,
          content:
            '<meta property="og:image" content="https://img.example.com/og.jpg"><img src="https://img.example.com/body.jpg">',
        }),
      );

      expect(result.cover).toBe("https://img.example.com/og.jpg");
    });

    it("resolves a relative content image against the feed url", async () => {
      const result = await imagesOf(
        pitem({
          title: "A",
          link: "https://example.com/a",
          pubDate: RECENT,
          content: '<img src="/uploads/relative.jpg">',
        }),
      );

      expect(result.cover).toBe("https://example.com/uploads/relative.jpg");
    });

    it("skips a tracking pixel and a junk src for the next content image with an image extension", async () => {
      const result = await imagesOf(
        pitem({
          title: "A",
          link: "https://example.com/a",
          pubDate: RECENT,
          content:
            '<img src="https://t.example.com/tracking/pixel.gif"><img src="undefined"><img src="https://img.example.com/real.png">',
        }),
      );

      expect(result.cover).toBe("https://img.example.com/real.png");
    });

    it("finds no cover when the first content image is a tracking pixel and the next has no image-like url", async () => {
      const result = await imagesOf(
        pitem({
          title: "A",
          link: "https://example.com/a",
          pubDate: RECENT,
          content:
            '<img src="https://t.example.com/tracking/pixel.gif"><img src="https://example.com/photo">',
        }),
      );

      expect(result.cover).toBe("");
    });

    it("reads the content image from the description when the item has no content", async () => {
      const result = await imagesOf(
        pitem({
          title: "A",
          link: "https://example.com/a",
          pubDate: RECENT,
          description:
            '<img src="https://img.example.com/from-description.jpg">',
        }),
      );

      expect(result.cover).toBe("https://img.example.com/from-description.jpg");
    });

    it("keeps a stored item's cover and card image when the feed gives none", async () => {
      const existing = storedFeed([
        storedItem({
          guid: "https://example.com/a",
          link: "https://example.com/a",
          coverImage: "https://img.example.com/stored-cover.jpg",
          image: "https://img.example.com/stored-image.jpg",
        }),
      ]);

      const feed = await parseParsed(
        [
          pitem({
            title: "A",
            link: "https://example.com/a",
            guid: "https://example.com/a",
            pubDate: RECENT,
          }),
        ],
        {},
        { existing },
      );

      expect(at(feed.items, 0).coverImage).toBe(
        "https://img.example.com/stored-cover.jpg",
      );
      expect(at(feed.items, 0).image).toBe(
        "https://img.example.com/stored-image.jpg",
      );
    });

    it("replaces a stored item's cover when the feed gives one", async () => {
      const existing = storedFeed([
        storedItem({
          guid: "https://example.com/a",
          link: "https://example.com/a",
          coverImage: "https://img.example.com/stored-cover.jpg",
        }),
      ]);

      const feed = await parseParsed(
        [withImages({ guid: "https://example.com/a" })],
        {},
        { existing },
      );

      expect(at(feed.items, 0).coverImage).toBe(CONTENT_IMG);
    });

    it("drops a stored cover that is not an http url when the feed gives none", async () => {
      const existing = storedFeed([
        storedItem({
          guid: "https://example.com/a",
          link: "https://example.com/a",
          coverImage: "data:image/png;base64,AAAA",
          image: "/relative.png",
        }),
      ]);

      const feed = await parseParsed(
        [
          pitem({
            title: "A",
            link: "https://example.com/a",
            guid: "https://example.com/a",
            pubDate: RECENT,
          }),
        ],
        {},
        { existing },
      );

      expect(at(feed.items, 0).coverImage).toBe("");
      expect(at(feed.items, 0).image).toBe("");
    });
  });

  describe("podcast cover images", () => {
    function episodeWith(overrides: Partial<ParsedItem> = {}): ParsedItem {
      return pitem({
        title: "Episode",
        link: "https://example.com/ep",
        pubDate: RECENT,
        enclosure: {
          url: "https://cdn.example.com/ep.mp3",
          type: "audio/mpeg",
          length: "1",
        },
        ...overrides,
      });
    }

    async function coverOf(
      item: ParsedItem,
      feedProps: Partial<ParsedFeed> = {},
    ): Promise<string> {
      const feed = await parseParsed([item], feedProps);
      return at(feed.items, 0).coverImage;
    }

    it("falls through the episode itunes image, the episode image, the feed image, a content image, the feed itunes image and the feed image url", async () => {
      const feedProps: Partial<ParsedFeed> = {
        image: { url: "https://img.example.com/feed-image.jpg" },
        feedItunesImage: "https://img.example.com/feed-itunes.jpg",
        feedImageUrl: "https://img.example.com/feed-image-url.jpg",
      };
      const full = episodeWith({
        itunes: { image: { href: "https://img.example.com/ep-itunes.jpg" } },
        image: { url: "https://img.example.com/ep-image.jpg" },
        content: '<img src="https://img.example.com/in-content.jpg">',
      });

      expect(await coverOf(full, feedProps)).toBe(
        "https://img.example.com/ep-itunes.jpg",
      );
      expect(await coverOf({ ...full, itunes: undefined }, feedProps)).toBe(
        "https://img.example.com/ep-image.jpg",
      );
      expect(
        await coverOf(
          { ...full, itunes: undefined, image: undefined },
          feedProps,
        ),
      ).toBe("https://img.example.com/feed-image.jpg");
      expect(
        await coverOf(
          { ...full, itunes: undefined, image: undefined },
          { ...feedProps, image: undefined },
        ),
      ).toBe("https://img.example.com/in-content.jpg");
      expect(
        await coverOf(
          { ...full, itunes: undefined, image: undefined, content: "" },
          { ...feedProps, image: undefined },
        ),
      ).toBe("https://img.example.com/feed-itunes.jpg");
      expect(
        await coverOf(
          { ...full, itunes: undefined, image: undefined, content: "" },
          { ...feedProps, image: undefined, feedItunesImage: "" },
        ),
      ).toBe("https://img.example.com/feed-image-url.jpg");
    });

    it("accepts a feed image given as a plain string", async () => {
      const cover = await coverOf(episodeWith(), {
        image: "https://img.example.com/string-image.jpg" as unknown as {
          url: string;
        },
      });

      expect(cover).toBe("https://img.example.com/string-image.jpg");
    });

    it("resolves a relative episode image against the feed url", async () => {
      const cover = await coverOf(
        episodeWith({ image: { url: "/art/ep.jpg" } }),
      );

      expect(cover).toBe("https://example.com/art/ep.jpg");
    });

    it("has no cover when nothing gives an image", async () => {
      expect(await coverOf(episodeWith())).toBe("");
    });

    it("keeps a stored episode's cover when the feed gives no image", async () => {
      const existing = storedFeed([
        storedItem({
          guid: "https://example.com/ep",
          link: "https://example.com/ep",
          coverImage: "https://img.example.com/stored-art.jpg",
        }),
      ]);

      const feed = await parseParsed(
        [episodeWith({ guid: "https://example.com/ep" })],
        {},
        { existing },
      );

      expect(at(feed.items, 0).coverImage).toBe(
        "https://img.example.com/stored-art.jpg",
      );
    });
  });

  describe("covers that duplicate the feed logo", () => {
    const LOGO = "https://img.example.com/logo.png";

    function articlesWithCover(covers: string[]): ParsedItem[] {
      return covers.map((cover, index) =>
        pitem({
          title: `Article ${index}`,
          link: `https://example.com/${index}`,
          pubDate: RECENT,
          image: cover ? { url: cover } : undefined,
        }),
      );
    }

    it("clears a cover shared by at least 80% of the items and at least two", async () => {
      const feed = await parseParsed(
        articlesWithCover([
          LOGO,
          LOGO,
          LOGO,
          LOGO,
          "https://img.example.com/own.jpg",
        ]),
        { feedImageUrl: LOGO },
      );

      expect(feed.items.map((item) => item.coverImage).sort()).toEqual([
        "",
        "",
        "",
        "",
        "https://img.example.com/own.jpg",
      ]);
    });

    it("keeps a logo cover that fewer than 80% of the items share", async () => {
      const feed = await parseParsed(
        articlesWithCover([
          LOGO,
          LOGO,
          LOGO,
          "https://img.example.com/b.jpg",
          "https://img.example.com/c.jpg",
        ]),
        { feedImageUrl: LOGO },
      );

      expect(
        feed.items.filter((item) => item.coverImage === LOGO),
      ).toHaveLength(3);
    });

    it("keeps a logo cover that only one item has", async () => {
      const feed = await parseParsed(articlesWithCover([LOGO]), {
        feedImageUrl: LOGO,
      });

      expect(at(feed.items, 0).coverImage).toBe(LOGO);
    });

    it("matches the itunes feed image and the channel image object as logos too", async () => {
      const viaItunes = await parseParsed(articlesWithCover([LOGO, LOGO]), {
        feedItunesImage: LOGO,
      });
      expect(viaItunes.items.map((item) => item.coverImage)).toEqual(["", ""]);

      const viaImageObject = await parseParsed(
        articlesWithCover([LOGO, LOGO]),
        {
          image: { url: LOGO },
        },
      );
      expect(viaImageObject.items.map((item) => item.coverImage)).toEqual([
        "",
        "",
      ]);
    });

    it("leaves a widely shared cover that is not the feed logo", async () => {
      const shared = "https://img.example.com/shared.jpg";
      const feed = await parseParsed(
        articlesWithCover([shared, shared, shared]),
        {
          feedImageUrl: LOGO,
        },
      );

      expect(feed.items.map((item) => item.coverImage)).toEqual([
        shared,
        shared,
        shared,
      ]);
    });

    it("leaves the card image alone when it clears the cover", async () => {
      const feed = await parseParsed(articlesWithCover([LOGO, LOGO]), {
        feedImageUrl: LOGO,
      });

      expect(feed.items.map((item) => item.image)).toEqual([LOGO, LOGO]);
    });

    it("never clears a podcast episode's cover", async () => {
      const feed = await parseParsed(
        [0, 1].map((index) =>
          pitem({
            title: `Episode ${index}`,
            link: `https://example.com/ep${index}`,
            pubDate: RECENT,
            enclosure: {
              url: `https://cdn.example.com/${index}.mp3`,
              type: "audio/mpeg",
              length: "1",
            },
            image: { url: LOGO },
          }),
        ),
        { feedImageUrl: LOGO },
      );

      expect(feed.items.map((item) => item.coverImage)).toEqual([LOGO, LOGO]);
    });
  });

  describe("summary", () => {
    async function summaryOf(
      overrides: Partial<ParsedItem>,
    ): Promise<string | undefined> {
      const feed = await parseParsed([
        pitem({
          title: "A",
          link: "https://example.com/a",
          pubDate: RECENT,
          ...overrides,
        }),
      ]);
      return at(feed.items, 0).summary;
    }

    it("is the plain text of the content with tags removed and whitespace collapsed", async () => {
      expect(
        await summaryOf({
          content: "<h1>Title</h1>\n\n<p>Some   <b>bold</b>\ttext</p>",
        }),
      ).toBe("Title Some bold text");
    });

    it("prefers the content over the description", async () => {
      expect(
        await summaryOf({
          content: "<p>From content</p>",
          description: "From description",
        }),
      ).toBe("From content");
    });

    it("falls back to the description when there is no content", async () => {
      expect(await summaryOf({ description: "<p>From description</p>" })).toBe(
        "From description",
      );
    });

    it("is empty when there is no content and no description", async () => {
      expect(await summaryOf({})).toBe("");
    });

    it("decodes html entities", async () => {
      expect(
        await summaryOf({
          content: "<p>Fish &amp; chips &quot;to go&quot; &lt;3</p>",
        }),
      ).toBe('Fish & chips "to go" <3');
    });

    it("leaves text of 220 characters whole and cuts a longer one to 220 plus an ellipsis", async () => {
      const exactly = "a".repeat(220);
      expect(await summaryOf({ content: `<p>${exactly}</p>` })).toBe(exactly);

      const longer = "b".repeat(221);
      expect(await summaryOf({ content: `<p>${longer}</p>` })).toBe(
        `${"b".repeat(220)}...`,
      );
    });

    it("replaces a math span with [math]", async () => {
      expect(
        await summaryOf({
          content:
            '<p>Energy is <span class="math inline">E=mc^2</span> here.</p>',
        }),
      ).toBe("Energy is [math] here.");
    });

    it("leaves script and style text out", async () => {
      expect(
        await summaryOf({
          content:
            "<style>.x{color:red}</style><script>var a=1;</script><p>Body</p>",
        }),
      ).toBe("Body");
    });

    it("keeps a stored item's summary when the feed text yields none", async () => {
      const existing = storedFeed([
        storedItem({
          guid: "https://example.com/a",
          link: "https://example.com/a",
          summary: "Stored summary",
        }),
      ]);

      const feed = await parseParsed(
        [
          pitem({
            title: "A",
            link: "https://example.com/a",
            guid: "https://example.com/a",
            pubDate: RECENT,
          }),
        ],
        {},
        { existing },
      );

      expect(at(feed.items, 0).summary).toBe("Stored summary");
    });

    it("replaces a stored item's summary when the feed has text", async () => {
      const existing = storedFeed([
        storedItem({
          guid: "https://example.com/a",
          link: "https://example.com/a",
          summary: "Stored summary",
        }),
      ]);

      const feed = await parseParsed(
        [
          pitem({
            title: "A",
            link: "https://example.com/a",
            guid: "https://example.com/a",
            pubDate: RECENT,
            content: "<p>Fresh text</p>",
          }),
        ],
        {},
        { existing },
      );

      expect(at(feed.items, 0).summary).toBe("Fresh text");
    });
  });

  describe("relative urls in the stored description and content", () => {
    const FEED = "https://example.com/rss/feed.xml";

    async function contentOf(
      html: string,
    ): Promise<{ description: string; content: string }> {
      const feed = await parseParsed(
        [
          pitem({
            title: "A",
            link: "https://example.com/a",
            pubDate: RECENT,
            description: html,
            content: html,
          }),
        ],
        {},
        { url: FEED },
      );
      const item = at(feed.items, 0);
      return { description: item.description, content: item.content ?? "" };
    }

    it("makes image and link urls absolute against the feed url and normalizes the quotes", async () => {
      const result = await contentOf(
        "<p><img src='/img/a.png' alt='x'><a href=\"post/b\">b</a></p>",
      );

      expect(result.content).toBe(
        '<p><img src="https://example.com/img/a.png" alt=\'x\'><a href="https://example.com/rss/post/b">b</a></p>',
      );
      expect(result.description).toBe(result.content);
    });

    it("makes every srcset candidate absolute and keeps its width descriptor", async () => {
      const result = await contentOf(
        '<picture><source srcset="/img/a.jpg 480w, /img/b.jpg 800w" media="(min-width: 600px)"></picture>',
      );

      expect(result.content).toContain(
        'srcset="https://example.com/img/a.jpg 480w, https://example.com/img/b.jpg 800w"',
      );
    });

    it("rewrites app:// urls to https://", async () => {
      const result = await contentOf('<img src="app://cdn.example.com/a.png">');

      expect(result.content).toBe('<img src="https://cdn.example.com/a.png">');
    });

    it("decodes html entities in a url while making it absolute", async () => {
      const result = await contentOf(
        '<img src="/a.png?x=1&amp;y=2"><a href="/p?a=1&amp;b=2">p</a>',
      );

      expect(result.content).toBe(
        '<img src="https://example.com/a.png?x=1&y=2"><a href="https://example.com/p?a=1&b=2">p</a>',
      );
    });

    it("leaves absolute and mailto urls alone", async () => {
      const html =
        '<img src="https://cdn.example.com/a.png"><a href="mailto:me@example.com">m</a>';

      expect((await contentOf(html)).content).toBe(html);
    });

    it("preserves an in-page anchor as a fragment-only link", async () => {
      const result = await contentOf('<a href="#fn1">1</a>');

      expect(result.content).toBe('<a href="#fn1">1</a>');
      expect(result.description).toBe('<a href="#fn1">1</a>');
    });

    it("leaves empty description and content empty", async () => {
      const feed = await parseParsed([
        pitem({ title: "A", link: "https://example.com/a", pubDate: RECENT }),
      ]);

      expect(at(feed.items, 0).description).toBe("");
      expect(at(feed.items, 0).content).toBe("");
    });
  });
  describe("media detection and the default folder", () => {
    const YOUTUBE_URL =
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCWFKCr40YwOZQx8FHU_ZqqQ";

    function article(name = "a"): ParsedItem {
      return pitem({
        title: name,
        link: `https://example.com/${name}`,
        pubDate: RECENT,
      });
    }

    function episode(name = "ep"): ParsedItem {
      return pitem({
        title: name,
        link: `https://example.com/${name}`,
        pubDate: RECENT,
        enclosure: {
          url: `https://cdn.example.com/${name}.mp3`,
          type: "audio/mpeg",
          length: "1",
        },
      });
    }

    function clip(name = "clip"): ParsedItem {
      return pitem({
        title: name,
        link: `https://example.com/${name}`,
        pubDate: RECENT,
        enclosure: {
          url: `https://cdn.example.com/${name}.mp4`,
          type: "video/mp4",
          length: "1",
        },
      });
    }

    it("leaves an article feed in the Uncategorized folder with the article media type", async () => {
      const feed = await parseParsed([article()]);

      expect(feed.folder).toBe("Uncategorized");
      expect(feed.mediaType).toBe("article");
    });

    it("files a new podcast feed under the default podcast folder", async () => {
      const feed = await parseParsed([episode()]);

      expect(feed.mediaType).toBe("podcast");
      expect(feed.folder).toBe("Podcasts");
    });

    it("files a new feed with video items under the default YouTube folder", async () => {
      const feed = await parseParsed([clip()]);

      expect(feed.mediaType).toBe("video");
      expect(feed.folder).toBe("Videos");
    });

    it("treats a YouTube feed url as video even when no item says so", async () => {
      const feed = await parseParsed([article()], {}, { url: YOUTUBE_URL });

      expect(feed.mediaType).toBe("video");
      expect(feed.folder).toBe("Videos");
      expect(at(feed.items, 0).mediaType).toBe("video");
    });

    it("uses the configured default folders", async () => {
      const podcast = await parseParsed(
        [episode()],
        {},
        {
          media: { defaultPodcastFolder: "Shows" },
        },
      );
      expect(podcast.folder).toBe("Shows");

      const video = await parseParsed(
        [clip()],
        {},
        {
          media: { defaultYouTubeFolder: "Watch later" },
        },
      );
      expect(video.folder).toBe("Watch later");
    });

    it("moves a stored feed out of Uncategorized into the media folder", async () => {
      const existing = storedFeed([], { folder: "Uncategorized" });

      const feed = await parseParsed([episode()], {}, { existing });

      expect(feed.folder).toBe("Podcasts");
    });

    it("moves a stored feed whose folder is missing into the media folder", async () => {
      const existing = storedFeed([]);
      (existing as unknown as { folder: string | undefined }).folder =
        undefined;

      const feed = await parseParsed([clip()], {}, { existing });

      expect(feed.folder).toBe("Videos");
    });

    it("keeps a folder the user chose, including an explicit Root", async () => {
      for (const folder of ["News", "Podcasts/Tech", ""]) {
        const existing = storedFeed([], { folder });

        const podcast = await parseParsed([episode()], {}, { existing });
        expect(podcast.folder).toBe(folder);

        const video = await parseParsed(
          [clip()],
          {},
          { existing: storedFeed([], { folder }) },
        );
        expect(video.folder).toBe(folder);
      }
    });

    it("never moves an article feed out of its folder", async () => {
      const feed = await parseParsed(
        [article()],
        {},
        {
          existing: storedFeed([], { folder: "Uncategorized" }),
        },
      );

      expect(feed.folder).toBe("Uncategorized");
    });

    it("sets the media type on the stored feed for video and podcast feeds only", async () => {
      const storedPodcast = storedFeed([]);
      await parseParsed([episode()], {}, { existing: storedPodcast });
      expect(storedPodcast.mediaType).toBe("podcast");

      const storedArticles = storedFeed([]);
      await parseParsed([article()], {}, { existing: storedArticles });
      expect(storedArticles.mediaType).toBeUndefined();
    });
  });

  describe("tags", () => {
    const VIDEO_TAG: Tag = { name: "Video", color: "#d04747" };
    const PODCAST_TAG: Tag = { name: "Podcast", color: "#47a0d0" };
    const RSS_TAG: Tag = { name: "RSS", color: "#ff8800" };
    const NEWS_TAG: Tag = { name: "News", color: "#111111" };
    const TECH_TAG: Tag = { name: "Tech", color: "#222222" };
    const RESEARCH_TAG: Tag = { name: "Research", color: "#333333" };

    function article(name = "a"): ParsedItem {
      return pitem({
        title: name,
        link: `https://example.com/${name}`,
        pubDate: RECENT,
      });
    }

    function tagNames(feed: Feed): string[][] {
      return feed.items.map((item) => (item.tags ?? []).map((tag) => tag.name));
    }

    it("gives items no tags when no tags are defined", async () => {
      const feed = await parseParsed([article()]);

      expect(at(feed.items, 0).tags).toEqual([]);
    });

    it("tags every article of an article feed with the configured default RSS tags", async () => {
      const feed = await parseParsed(
        [article("a"), article("b")],
        {},
        {
          tags: [RSS_TAG],
          media: { defaultRssTags: ["RSS"] },
        },
      );

      expect(tagNames(feed)).toEqual([["RSS"], ["RSS"]]);
    });

    it("tags the episodes of a podcast feed with the default podcast tag", async () => {
      const feed = await parseParsed(
        [
          pitem({
            title: "ep",
            link: "https://example.com/ep",
            pubDate: RECENT,
            enclosure: {
              url: "https://cdn.example.com/ep.mp3",
              type: "audio/mpeg",
              length: "1",
            },
          }),
        ],
        {},
        { tags: [PODCAST_TAG, RSS_TAG], media: { defaultRssTags: ["RSS"] } },
      );

      expect(tagNames(feed)).toEqual([["Podcast"]]);
    });

    it("tags only the video items of a video feed", async () => {
      const feed = await parseParsed(
        [
          pitem({
            title: "clip",
            link: "https://example.com/clip",
            pubDate: RECENT,
            enclosure: {
              url: "https://cdn.example.com/clip.mp4",
              type: "video/mp4",
              length: "1",
            },
          }),
          pitem({
            title: "text",
            link: "https://example.com/text",
            pubDate: WEEK_OLD,
            mediaContentMedium: "image",
          }),
        ],
        {},
        { tags: [VIDEO_TAG] },
      );

      expect(feed.mediaType).toBe("video");
      expect(tagNames(feed)).toEqual([["Video"], []]);
    });

    it("tags a YouTube feed with the default YouTube tag", async () => {
      const feed = await parseParsed(
        [article()],
        {},
        {
          url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCWFKCr40YwOZQx8FHU_ZqqQ",
          tags: [VIDEO_TAG],
        },
      );

      expect(tagNames(feed)).toEqual([["Video"]]);
    });

    it("tags a Mastodon feed with the default Mastodon tag", async () => {
      const feed = await parseParsed(
        [article()],
        {},
        {
          url: "https://mastodon.social/@Gargron.rss",
          tags: [{ name: "Fediverse", color: "#6364ff" }],
          media: { defaultMastodonTags: ["Fediverse"] },
        },
      );

      expect(tagNames(feed)).toEqual([["Fediverse"]]);
    });

    it("tags a feed in the small web folder with the default small web tag", async () => {
      const feed = await parseParsed(
        [article()],
        {},
        {
          existing: storedFeed([], { folder: "Smallweb" }),
          tags: [{ name: "Indie", color: "#00aa00" }],
          media: { defaultSmallwebTags: ["Indie"] },
        },
      );

      expect(tagNames(feed)).toEqual([["Indie"]]);
    });

    it("adds the auto-tags of the feed's folder and its parents, parents first", async () => {
      const folders: Folder[] = [
        {
          name: "News",
          autoTags: [NEWS_TAG],
          subfolders: [{ name: "Tech", autoTags: [TECH_TAG], subfolders: [] }],
        },
      ];

      const feed = await parseParsed(
        [article()],
        {},
        {
          existing: storedFeed([], { folder: "News/Tech" }),
          folders,
        },
      );

      expect(tagNames(feed)).toEqual([["News", "Tech"]]);
    });

    it("reads the folder tree from the host at parse time", async () => {
      const first = await parseParsed(
        [article()],
        {},
        {
          existing: storedFeed([], { folder: "News" }),
          folders: [{ name: "News", autoTags: [NEWS_TAG], subfolders: [] }],
        },
      );
      const second = await parseParsed(
        [article()],
        {},
        {
          existing: storedFeed([], { folder: "News" }),
          folders: [{ name: "News", autoTags: [], subfolders: [] }],
        },
      );

      expect(tagNames(first)).toEqual([["News"]]);
      expect(tagNames(second)).toEqual([[]]);
    });

    it("applies the auto-tags of the default media folder a feed was just filed under", async () => {
      const feed = await parseParsed(
        [
          pitem({
            title: "ep",
            link: "https://example.com/ep",
            pubDate: RECENT,
            enclosure: {
              url: "https://cdn.example.com/ep.mp3",
              type: "audio/mpeg",
              length: "1",
            },
          }),
        ],
        {},
        {
          folders: [{ name: "Podcasts", autoTags: [NEWS_TAG], subfolders: [] }],
        },
      );

      expect(feed.folder).toBe("Podcasts");
      expect(tagNames(feed)).toEqual([["News"]]);
    });

    it("adds the feed's custom tags by name and ignores names that are not defined", async () => {
      const feed = await parseParsed(
        [article()],
        {},
        {
          existing: storedFeed([], { customTags: ["Research", "Missing"] }),
          tags: [RESEARCH_TAG],
        },
      );

      expect(tagNames(feed)).toEqual([["Research"]]);
    });

    it("keeps a stored item's own tags and lets them win on a name clash", async () => {
      const existing = storedFeed(
        [
          storedItem({
            guid: "https://example.com/a",
            link: "https://example.com/a",
            tags: [
              { name: "news", color: "#ffffff" },
              { name: "Mine", color: "#abcdef" },
            ],
          }),
        ],
        { folder: "News" },
      );

      const feed = await parseParsed(
        [
          pitem({
            title: "A",
            link: "https://example.com/a",
            guid: "https://example.com/a",
            pubDate: RECENT,
          }),
        ],
        {},
        {
          existing,
          folders: [{ name: "News", autoTags: [NEWS_TAG], subfolders: [] }],
        },
      );

      expect(at(feed.items, 0).tags).toEqual([
        { name: "news", color: "#ffffff" },
        { name: "Mine", color: "#abcdef" },
      ]);
    });
  });

  describe("feed icon", () => {
    const LOGO = "https://example.com/logo.png";

    function article(): ParsedItem {
      return pitem({
        title: "A",
        link: "https://example.com/a",
        pubDate: RECENT,
      });
    }

    function episode(): ParsedItem {
      return pitem({
        title: "Episode",
        link: "https://example.com/ep",
        pubDate: RECENT,
        enclosure: {
          url: "https://cdn.example.com/ep.mp3",
          type: "audio/mpeg",
          length: "1",
        },
      });
    }

    it("is empty when the feed has no logo", async () => {
      const feed = await parseParsed(
        [article()],
        {},
        { display: { useDomainIconsRss: true } },
      );

      expect(feed.iconUrl).toBe("");
      expect(at(feed.items, 0).fallbackIconUrl).toBeUndefined();
    });

    it("follows the RSS icon setting for an article feed", async () => {
      const on = await parseParsed(
        [article()],
        { feedImageUrl: LOGO },
        { display: { useDomainIconsRss: true } },
      );
      expect(on.iconUrl).toBe(LOGO);

      const off = await parseParsed(
        [article()],
        { feedImageUrl: LOGO },
        { display: { useDomainIconsRss: false } },
      );
      expect(off.iconUrl).toBe("");
    });

    it("follows the podcast icon setting for a podcast feed", async () => {
      const on = await parseParsed(
        [episode()],
        { feedImageUrl: LOGO },
        { display: { useDomainIconsPodcast: true, useDomainIconsRss: false } },
      );
      expect(on.iconUrl).toBe(LOGO);

      const off = await parseParsed(
        [episode()],
        { feedImageUrl: LOGO },
        { display: { useDomainIconsPodcast: false, useDomainIconsRss: true } },
      );
      expect(off.iconUrl).toBe("");
    });

    it("follows the Mastodon icon setting for a Mastodon feed", async () => {
      const url = "https://mastodon.social/@Gargron.rss";
      const on = await parseParsed(
        [article()],
        { feedImageUrl: LOGO },
        {
          url,
          display: { useDomainIconsMastodon: true, useDomainIconsRss: false },
        },
      );
      expect(on.iconUrl).toBe(LOGO);

      const off = await parseParsed(
        [article()],
        { feedImageUrl: LOGO },
        {
          url,
          display: { useDomainIconsMastodon: false, useDomainIconsRss: true },
        },
      );
      expect(off.iconUrl).toBe("");
    });

    it("is always empty for a YouTube or video feed, whatever the settings", async () => {
      const everything: Partial<DisplaySettings> = {
        useDomainIconsRss: true,
        useDomainIconsPodcast: true,
        useDomainIconsMastodon: true,
        useDomainIconsYouTube: true,
      };
      const youtube = await parseParsed(
        [article()],
        { feedImageUrl: LOGO },
        {
          url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCWFKCr40YwOZQx8FHU_ZqqQ",
          display: everything,
        },
      );
      expect(youtube.iconUrl).toBe("");

      const video = await parseParsed(
        [
          pitem({
            title: "Clip",
            link: "https://example.com/clip",
            pubDate: RECENT,
            enclosure: {
              url: "https://cdn.example.com/c.mp4",
              type: "video/mp4",
              length: "1",
            },
          }),
        ],
        { feedImageUrl: LOGO },
        { display: everything },
      );
      expect(video.iconUrl).toBe("");
    });

    it("takes the first of the itunes image, the feed image url, the image object and a string image", async () => {
      const display = { useDomainIconsRss: true };
      const all = await parseParsed(
        [article()],
        {
          feedItunesImage: "https://example.com/itunes.png",
          feedImageUrl: "https://example.com/image-url.png",
          image: { url: "https://example.com/image-object.png" },
        },
        { display },
      );
      expect(all.iconUrl).toBe("https://example.com/itunes.png");

      const noItunes = await parseParsed(
        [article()],
        {
          feedImageUrl: "https://example.com/image-url.png",
          image: { url: "https://example.com/image-object.png" },
        },
        { display },
      );
      expect(noItunes.iconUrl).toBe("https://example.com/image-url.png");

      const objectOnly = await parseParsed(
        [article()],
        {
          image: { url: "https://example.com/image-object.png" },
        },
        { display },
      );
      expect(objectOnly.iconUrl).toBe("https://example.com/image-object.png");

      const stringOnly = await parseParsed(
        [article()],
        {
          image: "https://example.com/image-string.png" as unknown as {
            url: string;
          },
        },
        { display },
      );
      expect(stringOnly.iconUrl).toBe("https://example.com/image-string.png");
    });

    it("makes a relative logo absolute and removes a trailing slash after the extension", async () => {
      const relative = await parseParsed(
        [article()],
        { feedImageUrl: "/img/logo.svg" },
        { display: { useDomainIconsRss: true } },
      );
      expect(relative.iconUrl).toBe("https://example.com/img/logo.svg");

      const protocolRelative = await parseParsed(
        [article()],
        { feedImageUrl: "//cdn.example.com/logo.png" },
        { display: { useDomainIconsRss: true } },
      );
      expect(protocolRelative.iconUrl).toBe("https://cdn.example.com/logo.png");

      const trailingSlash = await parseParsed(
        [article()],
        { feedImageUrl: "https://example.com/logo.png/" },
        { display: { useDomainIconsRss: true } },
      );
      expect(trailingSlash.iconUrl).toBe("https://example.com/logo.png");
    });

    it("gives every item the feed logo as its fallback icon, even when the feed icon setting is off", async () => {
      const feed = await parseParsed(
        [
          article(),
          pitem({
            title: "B",
            link: "https://example.com/b",
            pubDate: WEEK_OLD,
          }),
        ],
        { feedImageUrl: "/img/logo.png/" },
        { display: { useDomainIconsRss: false } },
      );

      expect(feed.iconUrl).toBe("");
      expect(feed.items.map((item) => item.fallbackIconUrl)).toEqual([
        "https://example.com/img/logo.png",
        "https://example.com/img/logo.png",
      ]);
    });

    it("replaces a stored item's fallback icon when the feed has a logo and keeps it when not", async () => {
      const existing = (): Feed =>
        storedFeed([
          storedItem({
            guid: "https://example.com/a",
            link: "https://example.com/a",
            fallbackIconUrl: "https://example.com/old-icon.png",
          }),
        ]);
      const parsed = (): ParsedItem[] => [
        pitem({
          title: "A",
          link: "https://example.com/a",
          guid: "https://example.com/a",
          pubDate: RECENT,
        }),
      ];

      const withLogo = await parseParsed(
        parsed(),
        { feedImageUrl: LOGO },
        { existing: existing() },
      );
      expect(at(withLogo.items, 0).fallbackIconUrl).toBe(LOGO);

      const withoutLogo = await parseParsed(
        parsed(),
        {},
        { existing: existing() },
      );
      expect(at(withoutLogo.items, 0).fallbackIconUrl).toBe(
        "https://example.com/old-icon.png",
      );
    });

    it("clears a stored feed icon when the feed no longer has a logo", async () => {
      const existing = storedFeed([], {
        iconUrl: "https://example.com/old-icon.png",
      });

      const feed = await parseParsed(
        [article()],
        {},
        { existing, display: { useDomainIconsRss: true } },
      );

      expect(feed.iconUrl).toBe("");
    });

    it("keeps the same icon across a refresh of the same feed", async () => {
      const display = { useDomainIconsRss: true };
      const first = await parseParsed(
        [article()],
        { feedImageUrl: LOGO },
        { display },
      );
      const refreshed = await parseParsed(
        [article()],
        { feedImageUrl: LOGO },
        { display, existing: first },
      );

      expect(refreshed.iconUrl).toBe(LOGO);
    });
  });

  describe("request options", () => {
    it("decodes the body as windows-1251 only when the stored feed says so", async () => {
      // "Привет" in windows-1251, in a body that declares no encoding.
      const head = new TextEncoder().encode(
        "<rss><channel><title>T</title><item><link>https://example.com/a</link><title>",
      );
      const tail = new TextEncoder().encode("</title></item></channel></rss>");
      const word = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);
      const bytes = new Uint8Array(head.length + word.length + tail.length);
      bytes.set(head);
      bytes.set(word, head.length);
      bytes.set(tail, head.length + word.length);
      const cp1251Response = (): RequestUrlResponse => ({
        status: 200,
        text: "",
        headers: {},
        arrayBuffer: bytes.buffer,
        json: null,
      });
      const requestSpy = vi.spyOn(obsidian, "requestUrl");
      const parser = new FeedParser(
        DEFAULT_SETTINGS.display,
        [],
        MEDIA_SETTINGS,
      );

      requestSpy.mockResolvedValueOnce(cp1251Response());
      const overridden = await parser.parseFeed(
        FEED_URL,
        storedFeed([], { feedEncoding: "windows-1251" }),
      );
      expect(at(overridden.items, 0).title).toBe("Привет");

      requestSpy.mockResolvedValueOnce(cp1251Response());
      const auto = await parser.parseFeed(
        FEED_URL,
        storedFeed([], { feedEncoding: "auto" }),
      );
      expect(at(auto.items, 0).title).not.toBe("Привет");

      requestSpy.mockResolvedValueOnce(cp1251Response());
      const unset = await parser.parseFeed(FEED_URL, null);
      expect(at(unset.items, 0).title).not.toBe("Привет");
    });

    it("passes the abort signal through and fails an aborted parse", async () => {
      const controller = new AbortController();
      controller.abort();
      vi.spyOn(obsidian, "requestUrl").mockResolvedValue(response(RSS2_BASIC));
      const parser = new FeedParser(
        DEFAULT_SETTINGS.display,
        [],
        MEDIA_SETTINGS,
      );

      await expect(
        parser.parseFeed(FEED_URL, null, { signal: controller.signal }),
      ).rejects.toThrow("Timed out");
    });

    it("keeps the logo of an Atom feed as the fallback icon", async () => {
      const feed = await parse(ATOM_WITH_LOGO, {
        url: "https://example.com/atom.xml",
      });

      expect(at(feed.items, 0).fallbackIconUrl).toBe(
        "https://example.com/logo.png",
      );
    });
  });
  describe("content image scanning", () => {
    async function coverFromContent(html: string): Promise<string> {
      const feed = await parseParsed([
        pitem({
          title: "A",
          link: "https://example.com/a",
          pubDate: RECENT,
          content: html,
        }),
      ]);
      return at(feed.items, 0).coverImage;
    }

    it.each([
      "https://t.example.com/tracking/a.png",
      "https://t.example.com/pixel.gif",
      "https://t.example.com/beacon.png",
      "https://t.example.com/1x1.png",
      "https://t.example.com/track/a.png",
      "https://t.example.com/rss-pixel.png",
    ])("skips the tracking image %s for the next image", async (tracking) => {
      const cover = await coverFromContent(
        `<img src="${tracking}"><img src="https://img.example.com/real.jpg">`,
      );

      expect(cover).toBe("https://img.example.com/real.jpg");
    });

    it.each([
      "https://img.example.com/a.jpg",
      "https://img.example.com/a.jpeg",
      "https://img.example.com/a.png",
      "https://img.example.com/a.gif",
      "https://img.example.com/a.webp",
      "https://img.example.com/image/12345",
    ])("takes the image %s after a tracking pixel", async (wanted) => {
      const cover = await coverFromContent(
        `<img src="https://t.example.com/tracking/x.gif"><img src="${wanted}">`,
      );

      expect(cover).toBe(wanted);
    });

    it("resolves a relative image after a tracking pixel against the feed url", async () => {
      const cover = await coverFromContent(
        '<img src="https://t.example.com/tracking/x.gif"><img src="/uploads/a.png">',
      );

      expect(cover).toBe("https://example.com/uploads/a.png");
    });

    it("skips an image with the latex class for the next one", async () => {
      const cover = await coverFromContent(
        '<img class="latex" src="https://img.example.com/formula.png"><img src="https://img.example.com/real.png">',
      );

      expect(cover).toBe("https://img.example.com/real.png");
    });

    it("does not use an og:image that is a formula image", async () => {
      const cover = await coverFromContent(
        '<meta property="og:image" content="https://s0.wp.com/latex.php?latex=x"><img src="https://img.example.com/real.png">',
      );

      expect(cover).toBe("https://img.example.com/real.png");
    });

    it("resolves a relative og:image against the feed url", async () => {
      const cover = await coverFromContent(
        '<meta property="og:image" content="/og/social.png">',
      );

      expect(cover).toBe("https://example.com/og/social.png");
    });

    it("finds no cover in content without images", async () => {
      expect(await coverFromContent("<p>No pictures here</p>")).toBe("");
    });
  });

  describe("stored items and feeds the refresh touches", () => {
    it("stamps new items with the stored feed's url rather than the requested url", async () => {
      const existing = storedFeed([], {
        url: "https://example.com/stored-url.xml",
      });

      const feed = await parseParsed(
        [pitem({ title: "A", link: "https://example.com/a", pubDate: RECENT })],
        {},
        { existing },
      );

      expect(at(feed.items, 0).feedUrl).toBe(
        "https://example.com/stored-url.xml",
      );
      expect(feed.url).toBe("https://example.com/stored-url.xml");
    });

    it("keeps a stored video item's media type when the feed marks other items as video", async () => {
      const existing = storedFeed([
        storedItem({
          guid: "https://example.com/older",
          link: "https://example.com/older",
          mediaType: "video",
          pubDate: WEEK_OLD,
        }),
      ]);

      const feed = await parseParsed(
        [
          pitem({
            title: "Clip",
            link: "https://example.com/clip",
            pubDate: RECENT,
            enclosure: {
              url: "https://cdn.example.com/c.mp4",
              type: "video/mp4",
              length: "1",
            },
          }),
          pitem({
            title: "Older",
            link: "https://example.com/older",
            guid: "https://example.com/older",
            pubDate: WEEK_OLD,
          }),
        ],
        {},
        { existing },
      );

      expect(feed.mediaType).toBe("video");
      expect(itemByTitle(feed, "Older").mediaType).toBe("video");
    });

    it("gives a new item in a video feed the article type when the feed does not mark it as video", async () => {
      const feed = await parseParsed([
        pitem({
          title: "Clip",
          link: "https://example.com/clip",
          pubDate: RECENT,
          enclosure: {
            url: "https://cdn.example.com/c.mp4",
            type: "video/mp4",
            length: "1",
          },
        }),
        pitem({
          title: "Post",
          link: "https://example.com/post",
          pubDate: WEEK_OLD,
        }),
      ]);

      expect(itemByTitle(feed, "Post").mediaType).toBe("article");
    });

    it("keeps a stored item's tags when it is refreshed in a tagged feed", async () => {
      const existing = storedFeed(
        [
          storedItem({
            guid: "https://example.com/a",
            link: "https://example.com/a",
            tags: [{ name: "Mine", color: "#abcdef" }],
          }),
        ],
        { customTags: ["Research"] },
      );

      const feed = await parseParsed(
        [
          pitem({
            title: "A",
            link: "https://example.com/a",
            guid: "https://example.com/a",
            pubDate: RECENT,
          }),
        ],
        {},
        { existing, tags: [{ name: "Research", color: "#333333" }] },
      );

      expect((at(feed.items, 0).tags ?? []).map((tag) => tag.name)).toEqual([
        "Research",
        "Mine",
      ]);
    });
  });

  describe("fields the media pass leaves alone", () => {
    const GUID = "https://example.com/a";

    function articleFeedItem(overrides: Partial<ParsedItem> = {}): ParsedItem {
      return pitem({
        title: "A",
        link: GUID,
        guid: GUID,
        pubDate: RECENT,
        ...overrides,
      });
    }

    it("carries the media content type and medium of a new item", async () => {
      const feed = await parseParsed([
        articleFeedItem({
          mediaContentType: "image/jpeg",
          mediaContentMedium: "image",
        }),
      ]);

      const item = at(feed.items, 0);
      expect(item.mediaContentType).toBe("image/jpeg");
      expect(item.mediaContentMedium).toBe("image");
    });

    it("keeps a stored item's ieee fields unless the feed sends its own", async () => {
      const existing = (): Feed =>
        storedFeed([
          storedItem({
            guid: GUID,
            link: GUID,
            ieee: { pubYear: "2020", volume: "1" },
          }),
        ]);

      const kept = await parseParsed(
        [articleFeedItem()],
        {},
        { existing: existing() },
      );
      expect(at(kept.items, 0).ieee).toEqual({ pubYear: "2020", volume: "1" });

      const replaced = await parseParsed(
        [articleFeedItem({ ieee: { pubYear: "2024", volume: "9" } })],
        {},
        { existing: existing() },
      );
      expect(at(replaced.items, 0).ieee).toEqual({
        pubYear: "2024",
        volume: "9",
      });
    });

    it("keeps a stored item's audio url in an article feed when the feed gives no enclosure", async () => {
      const existing = storedFeed([
        storedItem({
          guid: GUID,
          link: GUID,
          audioUrl: "https://cdn.example.com/stored.mp3",
        }),
      ]);

      const feed = await parseParsed([articleFeedItem()], {}, { existing });

      expect(feed.mediaType).toBe("article");
      expect(at(feed.items, 0).audioUrl).toBe(
        "https://cdn.example.com/stored.mp3",
      );
    });

    it("resolves an audio enclosure url against the feed url in a feed that is not a podcast", async () => {
      const clip = pitem({
        title: "Clip",
        link: "https://example.com/clip",
        pubDate: RECENT,
        enclosure: {
          url: "https://cdn.example.com/clip.mp4",
          type: "video/mp4",
          length: "1",
        },
      });
      const audio = (): ParsedItem =>
        articleFeedItem({
          link: "https://other.example.com/post",
          enclosure: { url: "/audio/a.mp3", type: "audio/mpeg", length: "1" },
          pubDate: WEEK_OLD,
        });

      const created = await parseParsed([clip, audio()]);

      expect(created.mediaType).toBe("video");
      const audioItem = itemByTitle(created, "A");
      expect(audioItem.mediaType).toBe("podcast");
      expect(audioItem.audioUrl).toBe("https://example.com/audio/a.mp3");

      const refreshed = await parseParsed(
        [clip, audio()],
        {},
        {
          existing: storedFeed([
            storedItem({ guid: GUID, link: GUID, pubDate: WEEK_OLD }),
          ]),
        },
      );

      expect(refreshed.mediaType).toBe("video");
      expect(itemByTitle(refreshed, "A").mediaType).toBe("podcast");
      expect(itemByTitle(refreshed, "A").audioUrl).toBe(
        "https://example.com/audio/a.mp3",
      );
    });

    it("decodes an entity that survives the html text pass in the summary", async () => {
      const feed = await parseParsed([
        articleFeedItem({ content: "<p>Use &amp;lt;b&amp;gt; for bold</p>" }),
      ]);

      expect(at(feed.items, 0).summary).toBe("Use <b> for bold");
    });

    it("clears a cover shared with the second logo candidate as well as the first", async () => {
      const second = "https://img.example.com/second-logo.png";
      const feed = await parseParsed(
        [0, 1].map((index) =>
          pitem({
            title: `Article ${index}`,
            link: `https://example.com/${index}`,
            pubDate: RECENT,
            image: { url: second },
          }),
        ),
        {
          feedItunesImage: "https://img.example.com/first-logo.png",
          feedImageUrl: second,
        },
      );

      expect(feed.items.map((item) => item.coverImage)).toEqual(["", ""]);
    });
  });
});
