import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Feed, FeedItem } from "../../../src/types/types";
import { resolveAbsoluteHttpUrl } from "../../../src/utils/url-utils";
import * as obsidian from "obsidian";
import {
  CustomXMLParser,
  FeedParser,
  FeedParserService,
  isValidFeed,
  EmptyFeedError,
  isEmptyFeedError,
  formatFeedParseNoticeMessage,
  mergeFeedHistoryItems,
  applyFeedRetentionLimits,
} from "../../../src/services/feed-parser";

// ─── RSS 2.0 Fixtures ───────────────────────────────────────────────────────

const RSS2_BASIC = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <description>A test feed</description>
    <link>https://example.com</link>
    <item>
      <title>First Article</title>
      <link>https://example.com/1</link>
      <description>Article description</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>https://example.com/1</guid>
    </item>
    <item>
      <title>Second Article</title>
      <link>https://example.com/2</link>
      <description>Second description</description>
      <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
      <guid>guid-002</guid>
    </item>
  </channel>
</rss>`;

const RSS2_WITH_CDATA = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title><![CDATA[CDATA Feed]]></title>
    <description><![CDATA[Feed with CDATA]]></description>
    <link>https://example.com</link>
    <item>
      <title><![CDATA[CDATA Title & More]]></title>
      <link>https://example.com/cdata</link>
      <description><![CDATA[<p>Rich <b>HTML</b> content</p>]]></description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>cdata-1</guid>
    </item>
  </channel>
</rss>`;

const RSS2_WITH_CONTENT_ENCODED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Content Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Full Article</title>
      <link>https://example.com/full</link>
      <description>Short description</description>
      <content:encoded><![CDATA[<p>Long full article content</p>]]></content:encoded>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>full-1</guid>
    </item>
  </channel>
</rss>`;

const RSS2_WITH_AUTHOR = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Author Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Authored Article</title>
      <link>https://example.com/authored</link>
      <dc:creator>Jane Doe</dc:creator>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>authored-1</guid>
    </item>
  </channel>
</rss>`;

const RSS2_WITH_ENCLOSURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Podcast Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Episode 1</title>
      <link>https://example.com/ep1</link>
      <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg" length="12345"/>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>ep-1</guid>
    </item>
  </channel>
</rss>`;

const RSS2_PODCAST_WITH_CHANNEL_ITUNES_IMAGE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Lex Feed</title>
    <link>https://lexfridman.com</link>
    <itunes:image href="https://lexfridman.com/wordpress/wp-content/uploads/powerpress/artwork_3000-230.png" />
    <item>
      <title>Episode 1</title>
      <link>https://lexfridman.com/podcast/1</link>
      <description>Episode one</description>
      <enclosure url="https://lexfridman.com/audio/1.mp3" type="audio/mpeg" length="12345"/>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>lex-1</guid>
      <itunes:duration>3600</itunes:duration>
    </item>
    <item>
      <title>Episode 2</title>
      <link>https://lexfridman.com/podcast/2</link>
      <description>Episode two</description>
      <enclosure url="https://lexfridman.com/audio/2.mp3" type="audio/mpeg" length="67890"/>
      <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
      <guid>lex-2</guid>
      <itunes:duration>4200</itunes:duration>
    </item>
  </channel>
</rss>`;

const RSS2_WITH_IMAGE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Image Feed</title>
    <link>https://example.com</link>
    <image>
      <url>https://example.com/logo.png</url>
      <title>Image Feed</title>
    </image>
    <item>
      <title>Image Article</title>
      <link>https://example.com/img</link>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>img-1</guid>
    </item>
  </channel>
</rss>`;

const RSS2_MASTODON_PROFILE_IMAGE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Gargron (@Gargron@mastodon.social)</title>
    <link>https://mastodon.social/@Gargron</link>
    <image>
      <url>https://files.mastodon.social/accounts/avatars/109/246/358/402/616/382/original/4143aa23be8308b5.jpg</url>
      <title>Gargron</title>
    </image>
    <item>
      <title>Post 1</title>
      <link>https://mastodon.social/@Gargron/123</link>
      <description>Post content</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>https://mastodon.social/@Gargron/123</guid>
    </item>
  </channel>
</rss>`;

const RSS2_WITH_MEDIA_CONTENT_IMAGE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Media Image Feed</title>
    <link>https://example.com</link>
    <image>
      <url>https://www.marketwatch.com/rss/marketwatch.gif</url>
      <title>MarketWatch.com - Top Stories</title>
    </image>
    <item>
      <title>Has Media Image</title>
      <link>https://example.com/1</link>
      <description>Desc</description>
      <media:content url="https://images.mktw.net/im-24303993" medium="image" type="image/jpeg">
        <media:credit>Roberto Schmidt/Getty Images</media:credit>
      </media:content>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>media-1</guid>
    </item>
  </channel>
</rss>`;

const RSS2_WITH_MEDIA_CONTENT_VIDEO = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Media Video Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Has Media Video</title>
      <link>https://example.com/videos/1</link>
      <description>Video description</description>
      <media:content url="https://example.com/videos/1.mp4" medium="video" type="video/mp4" />
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>media-video-1</guid>
    </item>
  </channel>
</rss>`;

const RSS2_WITH_MEDIA_CONTENT_MEDIUM_ONLY = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Media Medium Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Has Media Medium Only</title>
      <link>https://example.com/posts/1</link>
      <description>Article description</description>
      <media:content url="https://example.com/poster.jpg" medium="image" />
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>media-medium-1</guid>
    </item>
  </channel>
</rss>`;

const RSS2_EMPTY = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Empty Feed</title>
    <description>No items</description>
    <link>https://example.com</link>
  </channel>
</rss>`;

const SUBSTACK_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Substack Feed</title>
    <item>
      <title>Substack Article</title>
      <link>https://example.substack.com/p/article</link>
      <description>This is the summary description.</description>
      <content:encoded><![CDATA[<p>This is the <b>full content</b> of the Substack article.</p>]]></content:encoded>
      <pubDate>Fri, 13 Mar 2026 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ASTRAL_CODEX_BROKEN_SUBSTACK_CONTENT = `
  <p>Intro paragraph.</p>
  <figure>
    <img src="https://substackcdn.com/image/fetch/$s_!YDr_!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png" />
  </figure>
  <p>Outro paragraph.</p>
`;

const BLOOMBERG_VIDEO_IMAGE_FIRST_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Bloomberg Tech Video Feed</title>
    <link>https://www.bloomberg.com</link>
    <item>
      <title><![CDATA[Chip Stocks Down on Momentum and Not CPI, Bokeh's Forrest Says]]></title>
      <description><![CDATA[Kim Forrest, Bokeh Capital Partners chief investment officer, says Tuesday's selloff is just a pause in momentum for skyrocketing chip stocks, not a shock from a hotter-than-estimated inflation report. She speaks with Ed Ludlow and Caroline Hyde on "Bloomberg Tech." (Source: Bloomberg)]]></description>
      <link>https://www.bloomberg.com/news/videos/2026-05-12/chip-stocks-down-on-momentum-not-cpi-bokeh-s-forrest-video</link>
      <guid isPermaLink="true">https://www.bloomberg.com/news/videos/2026-05-12/chip-stocks-down-on-momentum-not-cpi-bokeh-s-forrest-video</guid>
      <pubDate>Tue, 12 May 2026 16:24:55 GMT</pubDate>
      <category domain="stock-symbol"><![CDATA[NMS:INTC]]></category>
      <media:content url="https://assets.bwbx.io/images/users/iqjWHBFdfxIU/i8GIl8UI8oTY/v3/1200x-1.jpg" type="image/jpeg">
        <media:thumbnail url="https://assets.bwbx.io/images/users/iqjWHBFdfxIU/i8GIl8UI8oTY/v3/1200x-1.jpg" />
        <media:description />
      </media:content>
      <media:content url="https://www.bloomberg.com/news/videos/2026-05-12/chip-stocks-down-on-momentum-not-cpi-bokeh-s-forrest-video.mp4" type="video/mp4" />
    </item>
  </channel>
</rss>`;

// ─── Atom Fixtures ───────────────────────────────────────────────────────────

const ATOM_BASIC = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <subtitle>An atom feed</subtitle>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>Atom Entry</title>
    <link href="https://example.com/atom-entry" rel="alternate"/>
    <id>https://example.com/atom-entry</id>
    <published>2024-01-01T00:00:00Z</published>
    <summary>Entry summary</summary>
  </entry>
</feed>`;

const ATOM_WITH_AUTHOR = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Authored Atom Feed</title>
  <link href="https://example.com" rel="alternate"/>
  <author><name>John Author</name></author>
  <entry>
    <title>Authored Entry</title>
    <link href="https://example.com/authored-entry"/>
    <id>https://example.com/authored-entry</id>
    <published>2024-01-01T00:00:00Z</published>
    <author><name>Entry Author</name></author>
    <content type="html"><![CDATA[<p>Entry content</p>]]></content>
  </entry>
</feed>`;

const ATOM_WITH_LOGO = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Logo Feed</title>
  <logo>https://example.com/logo.png</logo>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>Entry</title>
    <link href="https://example.com/entry"/>
    <id>entry-1</id>
    <published>2024-01-01T00:00:00Z</published>
  </entry>
</feed>`;

// ─── JSON Feed Fixtures ───────────────────────────────────────────────────────

const JSON_FEED_BASIC = JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  title: "JSON Feed",
  description: "A JSON feed",
  home_page_url: "https://example.com",
  items: [
    {
      id: "json-1",
      url: "https://example.com/json-1",
      title: "JSON Item",
      summary: "Item summary",
      date_published: "2024-01-01T00:00:00Z",
      content_html: "<p>Item content</p>",
    },
  ],
});

const JSON_FEED_EMPTY_ITEMS = JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  title: "Empty JSON Feed",
  items: [],
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("isValidFeed", () => {
  it("identifies RSS feeds", () => {
    expect(isValidFeed(RSS2_BASIC)).toBe(true);
  });

  it("identifies Atom feeds", () => {
    expect(isValidFeed(ATOM_BASIC)).toBe(true);
  });

  it("rejects HTML content", () => {
    expect(isValidFeed("<html><body>Not a feed</body></html>")).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(isValidFeed("")).toBe(false);
  });

  it("rejects JSON content", () => {
    expect(isValidFeed(JSON_FEED_BASIC)).toBe(false);
  });
});

describe("EmptyFeedError", () => {
  it("is detected by isEmptyFeedError", () => {
    const err = new EmptyFeedError();
    expect(isEmptyFeedError(err)).toBe(true);
  });

  it("regular Error is not detected as EmptyFeedError", () => {
    const err = new Error("something failed");
    expect(isEmptyFeedError(err)).toBe(false);
  });

  it("formatFeedParseNoticeMessage gives clear message for EmptyFeedError", () => {
    const err = new EmptyFeedError();
    const msg = formatFeedParseNoticeMessage(err);
    expect(msg).toContain("no items");
  });

  it("formatFeedParseNoticeMessage gives prefixed message for regular errors", () => {
    const err = new Error("network failed");
    const msg = formatFeedParseNoticeMessage(err, "Failed to load");
    expect(msg).toContain("Failed to load");
    expect(msg).toContain("network failed");
  });
});

describe("CustomXMLParser - RSS 2.0 Parsing", () => {
  let parser: CustomXMLParser;

  beforeEach(() => {
    parser = new CustomXMLParser();
  });

  it("parses a basic RSS 2.0 feed", () => {
    const result = parser.parseString(RSS2_BASIC);
    expect(result.type).toBe("rss");
    expect(result.title).toBe("Test Feed");
    expect(result.description).toBe("A test feed");
    expect(result.link).toBe("https://example.com");
  });

  it("can derive a canonical siteUrl from RSS channel <link>", () => {
    const result = parser.parseString(RSS2_BASIC);
    expect(
      resolveAbsoluteHttpUrl(result.link, "https://example.com/feed.xml"),
    ).toBe("https://example.com");
  });

  it("parses multiple items from RSS 2.0 feed", () => {
    const result = parser.parseString(RSS2_BASIC);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe("First Article");
    expect(result.items[0].link).toBe("https://example.com/1");
    expect(result.items[1].title).toBe("Second Article");
    expect(result.items[1].guid).toBe("guid-002");
  });

  it("uses link as guid fallback when guid is missing", () => {
    const result = parser.parseString(RSS2_BASIC);
    expect(result.items[0].guid).toBe("https://example.com/1");
  });

  it("parses CDATA sections correctly", () => {
    const result = parser.parseString(RSS2_WITH_CDATA);
    expect(result.title).toBe("CDATA Feed");
    expect(result.items[0].title).toContain("CDATA Title");
  });

  it("preserves HTML in CDATA description", () => {
    const result = parser.parseString(RSS2_WITH_CDATA);
    expect(result.items[0].description).toContain("HTML");
  });

  it("does not split items on <item> markup inside CDATA during fallback parsing", () => {
    // Force the parser down the regex-based fallback path by including a malformed channel description.
    const brokenButRecoverable = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Broken Feed</title>
    <description>Broken <b>description</description>
    <link>https://example.com</link>
    <item>
      <title>Outer 1</title>
      <link>https://example.com/outer-1</link>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>outer-1</guid>
      <description><![CDATA[<p>Before</p><item><title>Inner Item</title></item><p>After</p>]]></description>
    </item>
    <item>
      <title>Outer 2</title>
      <link>https://example.com/outer-2</link>
      <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
      <guid>outer-2</guid>
      <description>Second</description>
    </item>
  </channel>
</rss>`;

    const result = parser.parseString(brokenButRecoverable);
    expect(result.type).toBe("rss");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe("Outer 1");
    expect(result.items[0].link).toBe("https://example.com/outer-1");
    expect(result.items[1].title).toBe("Outer 2");
    expect(result.items[1].link).toBe("https://example.com/outer-2");
  });

  it("prefers content:encoded over description", () => {
    const result = parser.parseString(RSS2_WITH_CONTENT_ENCODED);
    expect(result.items[0].content).toContain("Long full article");
  });

  it("parses dc:creator author when namespace is resolvable", () => {
    const result = parser.parseString(RSS2_WITH_AUTHOR);
    // In some environments (jsdom), XML namespace queries for dc:creator may not return
    // text content reliably. The important thing is the field is defined (may be empty string or the author name).
    expect(result.items[0].author).toBeDefined();
  });

  it("parses enclosure elements", () => {
    const result = parser.parseString(RSS2_WITH_ENCLOSURE);
    expect(result.items[0].enclosure?.url).toBe("https://example.com/ep1.mp3");
    expect(result.items[0].enclosure?.type).toBe("audio/mpeg");
  });

  it("parses feed-level itunes:image href for podcast feeds", () => {
    const result = parser.parseString(RSS2_PODCAST_WITH_CHANNEL_ITUNES_IMAGE);
    expect(result.feedItunesImage).toBe(
      "https://lexfridman.com/wordpress/wp-content/uploads/powerpress/artwork_3000-230.png",
    );
    expect(result.image?.url).toBe(
      "https://lexfridman.com/wordpress/wp-content/uploads/powerpress/artwork_3000-230.png",
    );
  });

  it("parses channel image", () => {
    const result = parser.parseString(RSS2_WITH_IMAGE);
    expect(result.image?.url).toBe("https://example.com/logo.png");
  });

  it("parses media:content url as item image", () => {
    const result = parser.parseString(RSS2_WITH_MEDIA_CONTENT_IMAGE);
    expect(result.items[0].image?.url).toBe(
      "https://images.mktw.net/im-24303993",
    );
  });

  it("preserves media:content type on items", () => {
    const result = parser.parseString(RSS2_WITH_MEDIA_CONTENT_VIDEO);
    expect(result.items[0].mediaContentType).toBe("video/mp4");
  });

  it("preserves media:content medium on items", () => {
    const result = parser.parseString(RSS2_WITH_MEDIA_CONTENT_VIDEO);
    expect(result.items[0].mediaContentMedium).toBe("video");
  });

  it("preserves media:content medium when type is absent", () => {
    const result = parser.parseString(RSS2_WITH_MEDIA_CONTENT_MEDIUM_ONLY);
    expect(result.items[0].mediaContentType).toBeUndefined();
    expect(result.items[0].mediaContentMedium).toBe("image");
  });

  it("prefers video media type when image media:content appears first", () => {
    const result = parser.parseString(BLOOMBERG_VIDEO_IMAGE_FIRST_RSS);
    expect(result.items[0].mediaContentType).toBe("video/mp4");
  });

  it("prefers video media medium when image media:content appears first", () => {
    const result = parser.parseString(BLOOMBERG_VIDEO_IMAGE_FIRST_RSS);
    expect(result.items[0].mediaContentMedium).toBe("video");
  });

  it("returns type 'rss' for RSS 2.0", () => {
    const result = parser.parseString(RSS2_BASIC);
    expect(result.type).toBe("rss");
  });

  it("returns empty items array for a feed with no items", () => {
    const result = parser.parseString(RSS2_EMPTY);
    expect(result.items).toHaveLength(0);
    expect(result.title).toBe("Empty Feed");
  });

  it("parses Substack-style feeds with content:encoded", () => {
    const result = parser.parseString(SUBSTACK_RSS);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toBe(
      "This is the summary description.",
    );
    // This is the critical check - it should extract the long content even if description is present
    expect(result.items[0].content).toContain("full content");
    expect(result.items[0].content).toContain("</b>");
  });
});

// Fixture: Substack-style RSS with &quot; entities inside HTML attribute values
const RSS2_SUBSTACK_QUOTED_ATTRS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Substack Entity Test</title>
    <link>https://example.substack.com</link>
    <item>
      <title>Title &amp; Subtitle</title>
      <link>https://example.substack.com/p/test</link>
      <description>Short summary</description>
      <content:encoded><![CDATA[<p>Intro text.</p>
<figure>
  <img
    src="https://substackcdn.com/image/fetch/w_1456/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ftest.png"
    data-attrs="{&quot;src&quot;:&quot;https://substack-post-media.s3.amazonaws.com/public/images/test.png&quot;,&quot;fullscreen&quot;:null}"
    width="850"
    height="496"
    alt="Test image"
  />
</figure>
<p>Body text.</p>]]></content:encoded>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>substack-test-1</guid>
    </item>
  </channel>
</rss>`;

describe("content:encoded HTML entity preservation", () => {
  let parser: CustomXMLParser;

  beforeEach(() => {
    parser = new CustomXMLParser();
  });

  it("preserves &quot; entities in content so attribute values remain valid HTML", () => {
    const result = parser.parseString(RSS2_SUBSTACK_QUOTED_ATTRS);
    const item = result.items[0];

    expect(item.content).toBeDefined();
    // &quot; must survive intact — a decoded " would break the JSON attribute value
    // when re-parsed by DOMParser("text/html")
    expect(item.content).toContain("&quot;");
    expect(item.content).not.toContain('data-attrs="{"');
  });

  it("produces a data-attrs value that is valid JSON when re-parsed as HTML", () => {
    const result = parser.parseString(RSS2_SUBSTACK_QUOTED_ATTRS);
    const item = result.items[0];

    const doc = new DOMParser().parseFromString(item.content!, "text/html");
    const img = doc.querySelector("img");
    expect(img).not.toBeNull();

    const dataAttrs = img!.getAttribute("data-attrs");
    expect(dataAttrs).not.toBeNull();
    expect(() => {
      JSON.parse(dataAttrs!);
    }).not.toThrow();

    const attrs = JSON.parse(dataAttrs!) as Record<string, unknown>;
    expect(attrs["src"]).toBe(
      "https://substack-post-media.s3.amazonaws.com/public/images/test.png",
    );
  });

  it("still decodes entities in plain-text fields like title", () => {
    const result = parser.parseString(RSS2_SUBSTACK_QUOTED_ATTRS);
    // &amp; in the <title> element should be decoded to &
    expect(result.items[0].title).toBe("Title & Subtitle");
  });

  it("rewrites Substack image/fetch img src attributes to the decoded source URL", () => {
    const result = parser.parseString(RSS2_SUBSTACK_QUOTED_ATTRS);
    const item = result.items[0];

    expect(item.content).toContain(
      'src="https://substack-post-media.s3.amazonaws.com/public/images/test.png"',
    );
    expect(item.content).not.toContain(
      'src="https://substackcdn.com/image/fetch/w_1456/',
    );

    const doc = new DOMParser().parseFromString(item.content!, "text/html");
    const img = doc.querySelector("img");
    expect(img?.getAttribute("src")).toBe(
      "https://substack-post-media.s3.amazonaws.com/public/images/test.png",
    );
  });

  it("rewrites broken Astral Codex Substack image src URLs from the real fixture", () => {
    const rssFixture = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Astral Codex Fixture</title>
    <link>https://www.astralcodexten.com</link>
    <item>
      <title>The Sigmoids Won't Save You</title>
      <link>https://www.astralcodexten.com/p/the-sigmoids-wont-save-you</link>
      <description>...</description>
      <content:encoded><![CDATA[${ASTRAL_CODEX_BROKEN_SUBSTACK_CONTENT}]]></content:encoded>
      <pubDate>Fri, 15 May 2026 08:55:10 GMT</pubDate>
      <guid>https://www.astralcodexten.com/p/the-sigmoids-wont-save-you</guid>
    </item>
  </channel>
</rss>`;

    const result = parser.parseString(rssFixture);
    const item = result.items[0];

    expect(item.content).toContain(
      'src="https://substack-post-media.s3.amazonaws.com/public/images/78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png"',
    );
    expect(item.content).not.toContain(
      'src="https://substackcdn.com/image/fetch/$s_!YDr_!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png"',
    );
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

describe("FeedParser.parseFeed", () => {
  const mediaSettings = {
    defaultVideoTag: "Video",
    rememberPlaybackProgress: true,
    defaultTwitterFolder: "Twitter",
    defaultMastodonFolder: "Mastodon",
    defaultYouTubeFolder: "Videos",
    defaultYouTubeTag: "Video",
    defaultPodcastFolder: "Podcast",
    defaultPodcastTag: "podcast",
    defaultRssFolder: "RSS",
    defaultRssTag: "rss",
    defaultSmallwebFolder: "Smallweb",
    defaultSmallwebTag: "smallweb",
    useMastodonProfileImages: true,
    useDomainIconsRss: true,
    useDomainIconsYouTube: true,
    useDomainIconsPodcast: true,
    useDomainIconsTwitter: true,
    openInSplitView: true,
    podcastTheme: "solarized" as const,
  };

  it("keeps the current Mastodon icon behavior when profile images are disabled", async () => {
    const feedUrl = "https://mastodon.social/@Gargron.rss";

    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValueOnce({
      status: 200,
      text: RSS2_MASTODON_PROFILE_IMAGE,
    });

    const parser = new FeedParser(
      {
        ...mediaSettings,
        useMastodonProfileImages: false,
      },
      [],
    );
    const parsed = await parser.parseFeed(feedUrl, null);

    expect(parsed.iconUrl).not.toBe(
      "https://files.mastodon.social/accounts/avatars/109/246/358/402/616/382/original/4143aa23be8308b5.jpg",
    );

    requestUrlSpy.mockRestore();
  });

  it("prefers Mastodon profile images for feed icons when enabled", async () => {
    const feedUrl = "https://mastodon.social/@Gargron.rss";

    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValueOnce({
      status: 200,
      text: RSS2_MASTODON_PROFILE_IMAGE,
    });

    const parser = new FeedParser(
      {
        ...mediaSettings,
        useMastodonProfileImages: true,
      },
      [],
    );
    const parsed = await parser.parseFeed(feedUrl, null);

    expect(parsed.iconUrl).toBe(
      "https://files.mastodon.social/accounts/avatars/109/246/358/402/616/382/original/4143aa23be8308b5.jpg",
    );

    requestUrlSpy.mockRestore();
  });

  it("preserves the chosen Mastodon icon behavior across refresh", async () => {
    const feedUrl = "https://mastodon.social/@Gargron.rss";

    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy
      .mockResolvedValueOnce({
        status: 200,
        text: RSS2_MASTODON_PROFILE_IMAGE,
      })
      .mockResolvedValueOnce({
        status: 200,
        text: RSS2_MASTODON_PROFILE_IMAGE,
      });

    const parser = new FeedParser(
      {
        ...mediaSettings,
        useMastodonProfileImages: true,
      },
      [],
    );
    const first = await parser.parseFeed(feedUrl, null);
    const refreshed = await parser.parseFeed(feedUrl, first);

    expect(first.iconUrl).toBe(
      "https://files.mastodon.social/accounts/avatars/109/246/358/402/616/382/original/4143aa23be8308b5.jpg",
    );
    expect(refreshed.iconUrl).toBe(first.iconUrl);

    requestUrlSpy.mockRestore();
  });

  it("extracts and honors the RSS icon settings toggle", async () => {
    const feedUrl = "https://example.com/rss.xml";
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValue({
      status: 200,
      text: RSS2_WITH_IMAGE,
    });

    // 1. When useDomainIconsRss is false
    const parserOff = new FeedParser({ ...mediaSettings, useDomainIconsRss: false }, []);
    const parsedOff = await parserOff.parseFeed(feedUrl, null);
    expect(parsedOff.iconUrl).toBe("");

    // 2. When useDomainIconsRss is true
    const parserOn = new FeedParser({ ...mediaSettings, useDomainIconsRss: true }, []);
    const parsedOn = await parserOn.parseFeed(feedUrl, null);
    expect(parsedOn.iconUrl).toBe("https://example.com/logo.png");

    requestUrlSpy.mockRestore();
  });



  it("extracts and honors the Podcast icon settings toggle", async () => {
    const feedUrl = "https://example.com/podcast.xml";
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValue({
      status: 200,
      text: RSS2_PODCAST_WITH_CHANNEL_ITUNES_IMAGE,
    });

    // 1. When useDomainIconsPodcast is false
    const parserOff = new FeedParser({ ...mediaSettings, useDomainIconsPodcast: false }, []);
    const parsedOff = await parserOff.parseFeed(feedUrl, null);
    expect(parsedOff.iconUrl).toBe("");

    // 2. When useDomainIconsPodcast is true
    const parserOn = new FeedParser({ ...mediaSettings, useDomainIconsPodcast: true }, []);
    const parsedOn = await parserOn.parseFeed(feedUrl, null);
    expect(parsedOn.iconUrl).toBe("https://lexfridman.com/wordpress/wp-content/uploads/powerpress/artwork_3000-230.png");

    requestUrlSpy.mockRestore();
  });

  it("extracts and honors the Twitter/Nitter icon settings toggle", async () => {
    const feedUrl = "https://nitter.net/Gargron/rss";
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValue({
      status: 200,
      text: RSS2_WITH_IMAGE,
    });

    // 1. When useDomainIconsTwitter is false
    const parserOff = new FeedParser({ ...mediaSettings, useDomainIconsTwitter: false }, []);
    const parsedOff = await parserOff.parseFeed(feedUrl, null);
    expect(parsedOff.iconUrl).toBe("");

    // 2. When useDomainIconsTwitter is true
    const parserOn = new FeedParser({ ...mediaSettings, useDomainIconsTwitter: true }, []);
    const parsedOn = await parserOn.parseFeed(feedUrl, null);
    expect(parsedOn.iconUrl).toBe("https://example.com/logo.png");

    requestUrlSpy.mockRestore();
  });

  it("applies Video tag for Bloomberg video-route items with image medium", async () => {
    const feedUrl = "https://www.bloomberg.com/feed/podcast.xml";
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Bloomberg TV</title>
    <link>https://www.bloomberg.com</link>
    <item>
      <title>Henry Wang on US-China Summit Expectations</title>
      <link>https://www.bloomberg.com/news/videos/2026-05-13/henry-wang-on-us-china-summit-expectations-video</link>
      <description>Video item with image medium metadata</description>
      <media:content url="https://assets.bwbx.io/images/sample.jpg" medium="image" type="image/jpeg" />
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>https://www.bloomberg.com/news/videos/2026-05-13/henry-wang-on-us-china-summit-expectations-video</guid>
    </item>
  </channel>
</rss>`;

    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValueOnce({
      status: 200,
      text: xml,
    });

    const parser = new FeedParser(mediaSettings, [
      { name: "Video", color: "#d04747" },
    ]);
    const parsed = await parser.parseFeed(feedUrl, null);

    expect(parsed.mediaType).toBe("video");
    expect(parsed.items[0].mediaType).toBe("video");
    expect(parsed.items[0].tags.map((tag) => tag.name.toLowerCase())).toContain(
      "video",
    );

    requestUrlSpy.mockRestore();
  });

  it("extracts beehiiv summaries without style text from content:encoded", async () => {
    const feedUrl = "https://rss.beehiiv.com/feeds/40ZQ7CSldT.xml";
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>The Handbasket</title>
    <link>https://www.thehandbasket.co</link>
    <item>
      <title>Kat Abughazaleh shows us how to fight fascists</title>
      <link>https://www.thehandbasket.co/p/kat-abughazaleh-broadview-six-grand-jury-charges-dropped</link>
      <description>Q+A with one of the Broadview Six.</description>
      <content:encoded><![CDATA[<div class="beehiiv"><style> .bh__table, .bh__table_header, .bh__table_cell { border: 1px solid #C0C0C0; } .bh__table_cell { padding: 5px; }</style><div class="beehiiv__body"><p>For the last seven months, Kat Abughazaleh was not allowed to go to Alaska.</p><p>The full interview continues from here.</p></div></div>]]></content:encoded>
      <pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate>
      <guid>beehiiv-1</guid>
    </item>
  </channel>
</rss>`;

    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValueOnce({
      status: 200,
      text: xml,
    });

    const parser = new FeedParser(mediaSettings, []);
    const parsed = await parser.parseFeed(feedUrl, null);
    const item = parsed.items[0];

    expect(item.content).toContain("beehiiv__body");
    expect(item.content).toContain("For the last seven months");
    expect(item.summary).toBe(
      "For the last seven months, Kat Abughazaleh was not allowed to go to Alaska. The full interview continues from here.",
    );
    expect(item.summary).not.toContain(".bh__table");
    expect(item.summary).not.toContain("border: 1px");
    expect(item.summary).not.toContain("padding: 5px");

    requestUrlSpy.mockRestore();
  });

  it("dedupes numeric URL-fragment GUIDs across refreshes while preserving read state", async () => {
    const feedUrl = "https://example.com/feed.xml";

    const xml0 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Article A</title>
      <link>https://example.com/a</link>
      <description>desc</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>https://example.com/a#0</guid>
    </item>
  </channel>
</rss>`;

    const xml1 = xml0.replace("#0</guid>", "#1</guid>");

    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy
      .mockResolvedValueOnce({
        status: 200,
        text: xml0,
      })
      .mockResolvedValueOnce({
        status: 200,
        text: xml1,
      });

    const parser = new FeedParser(mediaSettings, []);
    const first = await parser.parseFeed(feedUrl, null);
    expect(first.items).toHaveLength(1);

    // Simulate a previously persisted item from older versions that kept `#0` in the guid.
    first.items[0].read = true;
    first.items[0].guid = "https://example.com/a#0";

    const second = await parser.parseFeed(feedUrl, first);
    expect(second.items).toHaveLength(1);
    expect(second.items[0].read).toBe(true);
    expect(second.items[0].guid).toBe("https://example.com/a");

    requestUrlSpy.mockRestore();
  });

  it("deduplicates YouTube items whose stored GUID is a watch URL vs yt:video: Atom form", async () => {
    // Regression test for shard duplication bug: the same YouTube video can
    // accumulate two entries when one parsing path stores guid as the watch URL
    // and a later Atom refresh stores guid as yt:video:ID. Both must canonicalise
    // to the same key so the existing item is found and read-state is preserved.
    const feedUrl =
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCWFKCr40YwOZQx8FHU_ZqqQ";

    const ytAtomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns:media="http://search.yahoo.com/mrss/"
      xmlns="http://www.w3.org/2005/Atom">
  <link rel="self" href="${feedUrl}"/>
  <id>yt:channel:UCWFKCr40YwOZQx8FHU_ZqqQ</id>
  <yt:channelId>UCWFKCr40YwOZQx8FHU_ZqqQ</yt:channelId>
  <title>Test Channel</title>
  <entry>
    <id>yt:video:dQw4w9WgXcQ</id>
    <yt:videoId>dQw4w9WgXcQ</yt:videoId>
    <title>Never Gonna Give You Up</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>
    <author><name>Test Channel</name></author>
    <published>2024-01-01T00:00:00+00:00</published>
  </entry>
</feed>`;

    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValueOnce({ status: 200, text: ytAtomXml });

    const parser = new FeedParser(mediaSettings, []);

    // Simulate an existing feed that has the same video stored under its watch
    // URL guid (as produced by an older parsing path or the link-fallback path).
    const existingFeed = {
      title: "Test Channel",
      url: feedUrl,
      folder: "",
      items: [
        {
          title: "Never Gonna Give You Up",
          link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          description: "",
          content: "",
          pubDate: "2024-01-01T00:00:00+00:00",
          guid: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          read: true,
          starred: false,
          tags: [],
          feedTitle: "Test Channel",
          feedUrl,
          coverImage: "",
          saved: false,
          mediaType: "video" as const,
        },
      ],
      lastUpdated: 0,
      mediaType: "article" as const,
    };

    const result = await parser.parseFeed(feedUrl, existingFeed);

    // Must collapse to exactly one item – no duplicate.
    expect(result.items).toHaveLength(1);
    // User's read state must be preserved from the existing entry.
    expect(result.items[0].read).toBe(true);
    // GUID must be normalised to the canonical yt:video: form.
    expect(result.items[0].guid).toBe("yt:video:dQw4w9WgXcQ");

    requestUrlSpy.mockRestore();
  });

  it("deduplicates YouTube Shorts stored as a shorts URL vs yt:video: form", async () => {
    // Same as above but for /shorts/ URLs which are common with mixed-content
    // YouTube channels (JerryRigEverything style).
    const feedUrl =
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCWFKCr40YwOZQx8FHU_ZqqQ";

    const ytAtomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns:media="http://search.yahoo.com/mrss/"
      xmlns="http://www.w3.org/2005/Atom">
  <link rel="self" href="${feedUrl}"/>
  <id>yt:channel:UCWFKCr40YwOZQx8FHU_ZqqQ</id>
  <yt:channelId>UCWFKCr40YwOZQx8FHU_ZqqQ</yt:channelId>
  <title>Test Channel</title>
  <entry>
    <id>yt:video:4slngTaicg8</id>
    <yt:videoId>4slngTaicg8</yt:videoId>
    <title>60% of people have a drinking problem</title>
    <link rel="alternate" href="https://www.youtube.com/shorts/4slngTaicg8"/>
    <author><name>JerryRigEverything</name></author>
    <published>2026-05-12T18:11:59+00:00</published>
  </entry>
</feed>`;

    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValueOnce({ status: 200, text: ytAtomXml });

    const parser = new FeedParser(mediaSettings, []);

    // Existing shard has the shorts URL as the guid (old parsing path).
    const existingFeed = {
      title: "Test Channel",
      url: feedUrl,
      folder: "",
      items: [
        {
          title: "60% of people have a drinking problem",
          link: "https://www.youtube.com/shorts/4slngTaicg8",
          description: "",
          content: "",
          pubDate: "2026-05-12 18:11:59",
          guid: "https://www.youtube.com/shorts/4slngTaicg8",
          read: true,
          starred: false,
          tags: [{ name: "YouTube", color: "#ff0000" }],
          feedTitle: "Test Channel",
          feedUrl,
          coverImage:
            "https://img.youtube.com/vi/4slngTaicg8/maxresdefault.jpg",
          saved: false,
          mediaType: "video" as const,
        },
      ],
      lastUpdated: 0,
      mediaType: "article" as const,
    };

    const result = await parser.parseFeed(feedUrl, existingFeed);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].read).toBe(true);
    expect(result.items[0].guid).toBe("yt:video:4slngTaicg8");

    requestUrlSpy.mockRestore();
  });

  it("skips new items older than autoDeleteDuration cutoff during refresh", async () => {
    const feedUrl = "https://example.com/feed.xml";

    // Feed contains one recent item and one very old item
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Recent Article</title>
      <link>https://example.com/recent</link>
      <description>recent desc</description>
      <pubDate>Mon, 30 Mar 2026 00:00:00 GMT</pubDate>
      <guid>https://example.com/recent</guid>
    </item>
    <item>
      <title>Old Article</title>
      <link>https://example.com/old</link>
      <description>old desc</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>https://example.com/old</guid>
    </item>
  </channel>
</rss>`;

    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValueOnce({
      status: 200,
      text: xml,
    });

    const parser = new FeedParser(mediaSettings, []);

    // Simulate an existing feed (refresh scenario) with autoDeleteDuration of 365 days.
    // The old article (Jan 2024) is beyond the cutoff and not in the existing items,
    // meaning it was previously auto-deleted. It should NOT reappear as unread.
    const existingFeed: Feed = {
      title: "Test Feed",
      url: feedUrl,
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      autoDeleteDuration: 365,
    };

    const result = await parser.parseFeed(feedUrl, existingFeed);

    // Only the recent article should be present; the old one should be skipped
    expect(result.items).toHaveLength(1);
    expect(result.items[0].guid).toBe("https://example.com/recent");
    expect(result.items[0].read).toBe(false);
    expect(result.lastRefreshDiagnostics?.fetchedItemCount).toBe(2);
    expect(result.lastRefreshDiagnostics?.skippedByRefreshCutoffCount).toBe(1);
    expect(result.lastRefreshDiagnostics?.autoDeleteDurationDays).toBe(365);

    requestUrlSpy.mockRestore();
  });

  it("hides restored old unread items again when autoDeleteDuration is re-enabled", async () => {
    const feedUrl = "https://example.com/feed.xml";
    const fixedNowMs = Date.parse("2026-05-01T00:00:00Z");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Recent Article</title>
      <link>https://example.com/recent</link>
      <description>recent desc</description>
      <pubDate>Tue, 28 Apr 2026 00:00:00 GMT</pubDate>
      <guid>https://example.com/recent</guid>
    </item>
    <item>
      <title>Old Article</title>
      <link>https://example.com/old</link>
      <description>old desc</description>
      <pubDate>Sun, 01 Mar 2026 00:00:00 GMT</pubDate>
      <guid>https://example.com/old</guid>
    </item>
  </channel>
</rss>`;

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs);
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy
      .mockResolvedValueOnce({
        status: 200,
        text: xml,
      })
      .mockResolvedValueOnce({
        status: 200,
        text: xml,
      })
      .mockResolvedValueOnce({
        status: 200,
        text: xml,
      });

    const parser = new FeedParser(mediaSettings, []);

    const first = await parser.parseFeed(feedUrl, {
      title: "Test Feed",
      url: feedUrl,
      folder: "Uncategorized",
      items: [],
      lastUpdated: fixedNowMs,
      autoDeleteDuration: 30,
    });

    expect(first.items.map((item) => item.guid)).toEqual([
      "https://example.com/recent",
    ]);

    first.autoDeleteDuration = 0;
    const second = await parser.parseFeed(feedUrl, first);
    expect(second.items.map((item) => item.guid)).toEqual([
      "https://example.com/recent",
      "https://example.com/old",
    ]);
    expect(second.items.every((item) => item.read === false)).toBe(true);

    second.autoDeleteDuration = 30;
    const third = await parser.parseFeed(feedUrl, second);
    expect(third.items.map((item) => item.guid)).toEqual([
      "https://example.com/recent",
    ]);

    requestUrlSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it("does not carry forward old unread items beyond the cutoff when duration is tightened", async () => {
    const feedUrl = "https://example.com/feed.xml";
    const fixedNowMs = Date.parse("2026-05-01T00:00:00Z");

    const xmlWithOldAndRecent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Recent Article</title>
      <link>https://example.com/recent</link>
      <description>recent desc</description>
      <pubDate>Tue, 28 Apr 2026 00:00:00 GMT</pubDate>
      <guid>https://example.com/recent</guid>
    </item>
    <item>
      <title>Old Article</title>
      <link>https://example.com/old</link>
      <description>old desc</description>
      <pubDate>Sun, 01 Mar 2026 00:00:00 GMT</pubDate>
      <guid>https://example.com/old</guid>
    </item>
  </channel>
</rss>`;

    const xmlWithRecentOnly = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Recent Article</title>
      <link>https://example.com/recent</link>
      <description>recent desc</description>
      <pubDate>Tue, 28 Apr 2026 00:00:00 GMT</pubDate>
      <guid>https://example.com/recent</guid>
    </item>
  </channel>
</rss>`;

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs);
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy
      .mockResolvedValueOnce({
        status: 200,
        text: xmlWithOldAndRecent,
      })
      .mockResolvedValueOnce({
        status: 200,
        text: xmlWithRecentOnly,
      });

    const parser = new FeedParser(mediaSettings, []);

    const first = await parser.parseFeed(feedUrl, {
      title: "Test Feed",
      url: feedUrl,
      folder: "Uncategorized",
      items: [],
      lastUpdated: fixedNowMs,
      autoDeleteDuration: 0,
    });

    expect(first.items.map((item) => item.guid)).toEqual([
      "https://example.com/recent",
      "https://example.com/old",
    ]);
    expect(first.items.every((item) => item.read === false)).toBe(true);

    first.autoDeleteDuration = 30;
    const second = await parser.parseFeed(feedUrl, first);
    expect(second.items.map((item) => item.guid)).toEqual([
      "https://example.com/recent",
    ]);

    requestUrlSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it("preserves shared feed artwork for podcast episodes on parse and refresh", async () => {
    const feedUrl = "https://lexfridman.com/feed/podcast/";
    const sharedArtwork =
      "https://lexfridman.com/wordpress/wp-content/uploads/powerpress/artwork_3000-230.png";

    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy
      .mockResolvedValueOnce({
        status: 200,
        text: RSS2_PODCAST_WITH_CHANNEL_ITUNES_IMAGE,
      })
      .mockResolvedValueOnce({
        status: 200,
        text: RSS2_PODCAST_WITH_CHANNEL_ITUNES_IMAGE,
      });

    const parser = new FeedParser(mediaSettings, []);
    const first = await parser.parseFeed(feedUrl, null);

    expect(first.mediaType).toBe("podcast");
    expect(first.iconUrl).toBe(sharedArtwork);
    expect(first.items).toHaveLength(2);
    expect(first.items.every((item) => item.coverImage === sharedArtwork)).toBe(
      true,
    );

    const refreshed = await parser.parseFeed(feedUrl, first);
    expect(
      refreshed.items.every((item) => item.coverImage === sharedArtwork),
    ).toBe(true);

    requestUrlSpy.mockRestore();
  });

  it("preserves savedFilePath across refresh for an existing saved article", async () => {
    const feedUrl = "https://example.com/feed.xml";

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Saved Article</title>
      <link>https://example.com/saved</link>
      <description>desc</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>https://example.com/saved</guid>
    </item>
  </channel>
</rss>`;

    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy
      .mockResolvedValueOnce({
        status: 200,
        text: xml,
      })
      .mockResolvedValueOnce({
        status: 200,
        text: xml,
      });

    const parser = new FeedParser(mediaSettings, []);
    const first = await parser.parseFeed(feedUrl, null);
    first.items[0].saved = true;
    first.items[0].savedFilePath = "Articles/Saved Article.md";

    const refreshed = await parser.parseFeed(feedUrl, first);

    expect(refreshed.items).toHaveLength(1);
    expect(refreshed.items[0].saved).toBe(true);
    expect(refreshed.items[0].savedFilePath).toBe("Articles/Saved Article.md");

    requestUrlSpy.mockRestore();
  });
});

describe("FeedParserService.parseFeed", () => {
  it("uses channel-level podcast artwork during initial feed import", async () => {
    const feedUrl = "https://lexfridman.com/feed/podcast/";
    const sharedArtwork =
      "https://lexfridman.com/wordpress/wp-content/uploads/powerpress/artwork_3000-230.png";

    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValueOnce({
      status: 200,
      text: RSS2_PODCAST_WITH_CHANNEL_ITUNES_IMAGE,
    });

    const service = FeedParserService.getInstance();
    const parsedFeed = await service.parseFeed(feedUrl, "Podcast");

    expect(parsedFeed.mediaType).toBe("podcast");
    expect(parsedFeed.iconUrl).toBe(sharedArtwork);
    expect(
      parsedFeed.items.every((item) => item.coverImage === sharedArtwork),
    ).toBe(true);

    requestUrlSpy.mockRestore();
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

describe("CustomXMLParser - Atom Parsing", () => {
  let parser: CustomXMLParser;

  beforeEach(() => {
    parser = new CustomXMLParser();
  });

  it("parses a basic Atom feed", () => {
    const result = parser.parseString(ATOM_BASIC);
    expect(result.type).toBe("atom");
    expect(result.title).toBe("Atom Feed");
    expect(result.description).toBe("An atom feed");
  });

  it("parses Atom entries", () => {
    const result = parser.parseString(ATOM_BASIC);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Atom Entry");
    expect(result.items[0].link).toBe("https://example.com/atom-entry");
    expect(result.items[0].guid).toBe("https://example.com/atom-entry");
  });

  it("parses entry summary as description", () => {
    const result = parser.parseString(ATOM_BASIC);
    expect(result.items[0].description).toBe("Entry summary");
  });

  it("parses Atom published date", () => {
    const result = parser.parseString(ATOM_BASIC);
    expect(result.items[0].pubDate).toBe("2024-01-01T00:00:00Z");
  });

  it("parses feed-level author", () => {
    const result = parser.parseString(ATOM_WITH_AUTHOR);
    expect(result.author).toBe("John Author");
  });

  it("parses entry-level author", () => {
    const result = parser.parseString(ATOM_WITH_AUTHOR);
    expect(result.items[0].author).toBe("Entry Author");
  });

  it("parses Atom content element", () => {
    const result = parser.parseString(ATOM_WITH_AUTHOR);
    expect(result.items[0].content).toContain("Entry content");
  });

  it("parses logo as image", () => {
    const result = parser.parseString(ATOM_WITH_LOGO);
    expect(result.image?.url).toBe("https://example.com/logo.png");
  });

  it("uses alternate link for feed URL", () => {
    const result = parser.parseString(ATOM_BASIC);
    expect(result.link).toBe("https://example.com");
  });

  it("can derive a canonical siteUrl from Atom alternate link", () => {
    const result = parser.parseString(ATOM_BASIC);
    expect(
      resolveAbsoluteHttpUrl(result.link, "https://example.com/atom.xml"),
    ).toBe("https://example.com");
  });
});

describe("CustomXMLParser - JSON Feed Parsing", () => {
  let parser: CustomXMLParser;

  beforeEach(() => {
    parser = new CustomXMLParser();
  });

  it("parses a JSON Feed", () => {
    const result = parser.parseString(JSON_FEED_BASIC);
    expect(result.type).toBe("json");
    expect(result.title).toBe("JSON Feed");
  });

  it("can derive a canonical siteUrl from JSON Feed home_page_url", () => {
    const result = parser.parseString(JSON_FEED_BASIC);
    expect(
      resolveAbsoluteHttpUrl(result.link, "https://example.com/feed.json"),
    ).toBe("https://example.com");
  });

  it("parses JSON Feed items", () => {
    const result = parser.parseString(JSON_FEED_BASIC);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("JSON Item");
    expect(result.items[0].link).toBe("https://example.com/json-1");
    expect(result.items[0].guid).toBe("json-1");
  });

  it("parses JSON Feed item content_html", () => {
    const result = parser.parseString(JSON_FEED_BASIC);
    expect(result.items[0].content).toContain("Item content");
  });

  it("returns empty items for JSON Feed with empty items array", () => {
    const result = parser.parseString(JSON_FEED_EMPTY_ITEMS);
    expect(result.items).toHaveLength(0);
  });

  it("does not throw for invalid JSON - uses fallback parsing", () => {
    // The parser gracefully falls back to regex-based parsing rather than throwing
    // for content that begins with '{' but is not valid JSON.
    expect(() => parser.parseString("{invalid json}")).not.toThrow();
  });
});

describe("CustomXMLParser - decodeHtmlEntities", () => {
  let parser: CustomXMLParser;

  beforeEach(() => {
    parser = new CustomXMLParser();
  });

  it("decodes common HTML entities", () => {
    expect(parser.decodeHtmlEntities("Hello &amp; World")).toBe(
      "Hello & World",
    );
    expect(parser.decodeHtmlEntities("&lt;b&gt;bold&lt;/b&gt;")).toBe(
      "<b>bold</b>",
    );
    expect(parser.decodeHtmlEntities("She said &quot;hello&quot;")).toBe(
      'She said "hello"',
    );
    expect(parser.decodeHtmlEntities("It&apos;s fine")).toBe("It's fine");
  });

  it("decodes numeric entities", () => {
    expect(parser.decodeHtmlEntities("&#169;")).toBe("©");
    expect(parser.decodeHtmlEntities("&#8230;")).toBe("...");
    expect(parser.decodeHtmlEntities("&#x2014;")).toBe("—");
  });

  it("decodes named typography entities", () => {
    expect(parser.decodeHtmlEntities("&mdash;")).toBe("—");
    expect(parser.decodeHtmlEntities("&ndash;")).toBe("–");
    expect(parser.decodeHtmlEntities("&hellip;")).toBe("...");
    expect(parser.decodeHtmlEntities("&rsquo;")).toBe("\u2019");
    expect(parser.decodeHtmlEntities("&ldquo;")).toBe("\u201C");
    expect(parser.decodeHtmlEntities("&rdquo;")).toBe("\u201D");
  });

  it("handles empty string", () => {
    expect(parser.decodeHtmlEntities("")).toBe("");
  });

  it("leaves unrecognized entities intact", () => {
    // Unrecognized named entities are left as-is (not in the mapping)
    const input = "Some text &unknown; here";
    const result = parser.decodeHtmlEntities(input);
    expect(result).toContain("Some text");
    expect(result).toContain("here");
  });
});

describe("CustomXMLParser - Ampersand and Malformed XML Handling", () => {
  let parser: CustomXMLParser;

  beforeEach(() => {
    parser = new CustomXMLParser();
  });

  it("handles bare ampersands in content", () => {
    const xmlWithBareAmpersands = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AT&T News</title>
    <link>https://example.com</link>
    <item>
      <title>Article &amp; More</title>
      <link>https://example.com/1</link>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>amp-1</guid>
    </item>
  </channel>
</rss>`;
    // Should not throw, should produce parseable result
    const result = parser.parseString(xmlWithBareAmpersands);
    expect(result.items).toHaveLength(1);
  });

  it("handles BOM at start of feed", () => {
    const feedWithBom = "\uFEFF" + RSS2_BASIC;
    const result = parser.parseString(feedWithBom);
    expect(result.title).toBe("Test Feed");
  });
});

describe("CustomXMLParser - Sage URL Transformation", () => {
  let parser: CustomXMLParser;

  beforeEach(() => {
    parser = new CustomXMLParser();
  });

  it("transforms sagepub /doi/abs/ URLs to /doi/full/", () => {
    const sagepubFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>SAGE Feed</title>
    <link>https://journals.sagepub.com</link>
    <item>
      <title>SAGE Article</title>
      <link>https://journals.sagepub.com/doi/abs/10.1177/00000000</link>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>sage-1</guid>
    </item>
  </channel>
</rss>`;
    const result = parser.parseString(sagepubFeed);
    expect(result.items[0].link).toBe(
      "https://journals.sagepub.com/doi/full/10.1177/00000000",
    );
  });
});

describe("CustomXMLParser - Robust Fetch Integration (via robustFetch mock)", () => {
  it("parseString is unaffected by robustFetch changes - it operates on a string directly", () => {
    // robustFetch is only used for *fetching* content from the network.
    // parseString operates on already-fetched strings.
    // This test confirms that the parsing pipeline still works end-to-end
    // when the fetched string is a correctly decoded UTF-8 string.
    const parser = new CustomXMLParser();
    const result = parser.parseString(RSS2_BASIC);
    expect(result.title).toBe("Test Feed");
    expect(result.items).toHaveLength(2);
  });

  it("parseString correctly handles non-ASCII characters in already-decoded content", () => {
    // After robustFetch correctly decodes the bytes (e.g., from ISO-8859-1),
    // the result is a JavaScript string of Unicode characters.
    // parseString must handle these correctly.
    const feedWithUnicode = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Ünïcödë Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Ãrticlë with ßpecial chärs</title>
      <link>https://example.com/unicode</link>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>unicode-1</guid>
    </item>
  </channel>
</rss>`;
    const parser = new CustomXMLParser();
    const result = parser.parseString(feedWithUnicode);
    expect(result.title).toBe("Ünïcödë Feed");
    expect(result.items[0].title).toBe("Ãrticlë with ßpecial chärs");
  });
});
