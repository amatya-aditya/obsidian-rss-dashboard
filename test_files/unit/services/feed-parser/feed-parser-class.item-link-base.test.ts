import { afterEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { type RequestUrlResponse } from "obsidian";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
} from "../../../../src/types/types.js";
import { FeedParser } from "../../../../src/services/feed-parser/feed-parser-class.js";

/**
 * Regression tests for #1337.
 *
 * A publisher that serves its feed from a host other than its site (HBR's
 * feeds.harvardbusiness.org, FeedBurner, FeedPress, a CDN) publishes
 * root-relative item links that belong to the site. Resolving them against the
 * feed's own host turned every article link into a 404. The feed's declared
 * home page — the feed-level `<link rel="alternate">` in Atom, `<channel><link>`
 * in RSS 2.0 — is the base that was meant, and it is plain http in HBR's feed,
 * so the resolved link is upgraded to https. A feed served from the same host
 * as its site keeps the feed document as its base, exactly as before.
 */

const FEED_HOST_URL = "https://feeds.hbr.example.com/harvardbusiness/";
const SITE_URL = "https://hbr.example.com";
/** HBR's guid form: a `tag:` URI, so link resolution never rewrites identity. */
const TAG_GUID = "tag:blogs.harvardbusiness.org,2007-03-31:999.435735";
const PUBLISHED = "Fri, 16 Oct 2026 05:05:04 GMT";

/** An Atom feed whose feed-level alternate is the site link; `null` omits it. */
function atomFeed(
  entryLink: string,
  siteLink: string | null = SITE_URL,
): string {
  const siteElement =
    siteLink === null
      ? ""
      : `<link href="${siteLink}" rel="alternate" type="text/html"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>HBR</title>
  ${siteElement}
  <entry>
    <title>An article</title>
    <link href="${entryLink}" rel="alternate" type="text/html"/>
    <id>${TAG_GUID}</id>
    <published>2026-10-16T05:05:04Z</published>
    <summary>Article summary</summary>
  </entry>
</feed>`;
}

/** The RSS 2.0 shape of the same feed: `<channel><link>` is the site link. */
function rssFeed(
  itemLink: string,
  siteLink: string | null = SITE_URL,
  extraItem = "",
): string {
  const siteElement = siteLink === null ? "" : `<link>${siteLink}</link>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>HBR</title>
    ${siteElement}
    <item>
      <title>An article</title>
      <link>${itemLink}</link>
      <guid>${TAG_GUID}</guid>
      <pubDate>${PUBLISHED}</pubDate>
      ${extraItem}
    </item>
  </channel>
</rss>`;
}

/** A feed an earlier version stored: its item link points at the feed host. */
function storedFeed(): Feed {
  const item: FeedItem = {
    title: "An article",
    link: "https://feeds.hbr.example.com/2026/10/story",
    description: "",
    pubDate: PUBLISHED,
    guid: TAG_GUID,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "HBR",
    feedUrl: FEED_HOST_URL,
    coverImage: "",
    saved: false,
    mediaType: "article",
  };
  return {
    title: "HBR",
    url: FEED_HOST_URL,
    folder: "Uncategorized",
    items: [item],
    lastUpdated: 1,
  };
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

/** Parses one mocked response through the public entry point, as a refresh does. */
async function parseFeed(
  xml: string,
  existing: Feed | null = null,
  feedUrl: string = FEED_HOST_URL,
): Promise<Feed> {
  vi.spyOn(obsidian, "requestUrl").mockResolvedValue(response(xml));
  const parser = new FeedParser(DEFAULT_SETTINGS.display, []);
  return parser.parseFeed(feedUrl, existing);
}

function only(feed: Feed): FeedItem {
  const item = feed.items[0];
  if (!item) throw new Error("Expected the parsed feed to hold one item");
  return item;
}

describe("FeedParser.parseFeed: the base a relative item link resolves against", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves an Atom entry link against the site the feed declares, not the feed host", async () => {
    const feed = await parseFeed(atomFeed("/2026/10/story"));

    expect(only(feed).link).toBe(`${SITE_URL}/2026/10/story`);
  });

  it("resolves an RSS item link against the channel link, not the feed host", async () => {
    const feed = await parseFeed(rssFeed("/2026/10/story"));

    expect(only(feed).link).toBe(`${SITE_URL}/2026/10/story`);
  });

  it("upgrades a plain-http home page, which is how HBR publishes it", async () => {
    const feed = await parseFeed(
      atomFeed("/2026/10/story", "http://hbr.example.com"),
      null,
      "http://feeds.harvardbusiness.org/harvardbusiness/",
    );

    expect(only(feed).link).toBe("https://hbr.example.com/2026/10/story");
  });

  it("keeps the feed url as the base when the feed and its site share a host", async () => {
    const feed = await parseFeed(
      rssFeed("/2026/10/story", "http://example.com"),
      null,
      "http://example.com/feed.xml",
    );

    expect(only(feed).link).toBe("http://example.com/2026/10/story");
  });

  it("keeps the feed document as the base for a same-host feed's non-root relative link", async () => {
    const feed = await parseFeed(
      rssFeed("2026/10/story", "https://example.com/blog"),
      null,
      "https://example.com/blog/feed.xml",
    );

    expect(only(feed).link).toBe("https://example.com/blog/2026/10/story");
  });

  it("keeps an absolute item link exactly as the feed published it", async () => {
    const feed = await parseFeed(atomFeed("https://cdn.example.org/story"));

    expect(only(feed).link).toBe("https://cdn.example.org/story");
  });

  it("keeps a protocol-relative item link on its own host", async () => {
    const feed = await parseFeed(rssFeed("//cdn.example.org/story"));

    expect(only(feed).link).toBe("https://cdn.example.org/story");
  });

  it("resolves a site-relative link with no leading slash against the home page", async () => {
    const feed = await parseFeed(rssFeed("2026/10/story"));

    expect(only(feed).link).toBe(`${SITE_URL}/2026/10/story`);
  });

  it("resolves against the feed url when the feed declares no home page", async () => {
    const feed = await parseFeed(rssFeed("/2026/10/story", null));

    expect(only(feed).link).toBe("https://feeds.hbr.example.com/2026/10/story");
  });

  it("resolves against the feed url when the declared home page is not http(s)", async () => {
    const feed = await parseFeed(
      rssFeed("/2026/10/story", "mailto:tips@hbr.example.com"),
    );

    expect(only(feed).link).toBe("https://feeds.hbr.example.com/2026/10/story");
  });

  it("leaves the guid, and with it item identity, as the feed published it", async () => {
    const feed = await parseFeed(atomFeed("/2026/10/story"));

    expect(only(feed).guid).toBe(TAG_GUID);
  });

  it("corrects a stored feed-host link on refresh instead of storing a duplicate", async () => {
    const feed = await parseFeed(atomFeed("/2026/10/story"), storedFeed());

    expect(feed.items).toHaveLength(1);
    expect(only(feed).link).toBe(`${SITE_URL}/2026/10/story`);
  });

  it("keeps the description's relative urls resolving against the feed url", async () => {
    const feed = await parseFeed(
      rssFeed(
        "/2026/10/story",
        SITE_URL,
        '<description><![CDATA[<img src="/img/body.jpg">]]></description>',
      ),
    );

    expect(only(feed).description).toContain(
      'src="https://feeds.hbr.example.com/img/body.jpg"',
    );
  });
});
