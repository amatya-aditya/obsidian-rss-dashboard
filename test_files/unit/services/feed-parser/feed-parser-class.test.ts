import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Feed, FeedItem } from "../../../../src/types/types";
import * as obsidian from "obsidian";
import { FeedParser } from "../../../../src/services/feed-parser/feed-parser-class.js";
import {
  RSS2_BASIC,
  RSS2_WITH_CDATA,
  RSS2_WITH_CONTENT_ENCODED,
  RSS2_WITH_AUTHOR,
  RSS2_WITH_ENCLOSURE,
  RSS2_PODCAST_WITH_CHANNEL_ITUNES_IMAGE,
  RSS2_WITH_IMAGE,
  RSS2_MASTODON_PROFILE_IMAGE,
  RSS2_WITH_MEDIA_CONTENT_IMAGE,
  RSS2_WITH_MEDIA_CONTENT_VIDEO,
  RSS2_WITH_MEDIA_CONTENT_MEDIUM_ONLY,
  RSS2_EMPTY,
  SUBSTACK_RSS,
  ASTRAL_CODEX_BROKEN_SUBSTACK_CONTENT,
  BLOOMBERG_VIDEO_IMAGE_FIRST_RSS,
  ATOM_BASIC,
  ATOM_WITH_AUTHOR,
  ATOM_WITH_LOGO,
  JSON_FEED_BASIC,
  JSON_FEED_EMPTY_ITEMS,
} from "./fixtures/rss-fixtures.js";

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
    useDomainIconsMastodon: true,
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
        useDomainIconsMastodon: false,
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
        useDomainIconsMastodon: true,
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
        useDomainIconsMastodon: true,
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
    const parserOff = new FeedParser(
      { ...mediaSettings, useDomainIconsRss: false },
      [],
    );
    const parsedOff = await parserOff.parseFeed(feedUrl, null);
    expect(parsedOff.iconUrl).toBe("");

    // 2. When useDomainIconsRss is true
    const parserOn = new FeedParser(
      { ...mediaSettings, useDomainIconsRss: true },
      [],
    );
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
    const parserOff = new FeedParser(
      { ...mediaSettings, useDomainIconsPodcast: false },
      [],
    );
    const parsedOff = await parserOff.parseFeed(feedUrl, null);
    expect(parsedOff.iconUrl).toBe("");

    // 2. When useDomainIconsPodcast is true
    const parserOn = new FeedParser(
      { ...mediaSettings, useDomainIconsPodcast: true },
      [],
    );
    const parsedOn = await parserOn.parseFeed(feedUrl, null);
    expect(parsedOn.iconUrl).toBe(
      "https://lexfridman.com/wordpress/wp-content/uploads/powerpress/artwork_3000-230.png",
    );

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
    const parserOff = new FeedParser(
      { ...mediaSettings, useDomainIconsTwitter: false },
      [],
    );
    const parsedOff = await parserOff.parseFeed(feedUrl, null);
    expect(parsedOff.iconUrl).toBe("");

    // 2. When useDomainIconsTwitter is true
    const parserOn = new FeedParser(
      { ...mediaSettings, useDomainIconsTwitter: true },
      [],
    );
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
