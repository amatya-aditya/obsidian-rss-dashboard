export const RSS2_BASIC = `<?xml version="1.0" encoding="UTF-8"?>
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

export const RSS2_WITH_CDATA = `<?xml version="1.0" encoding="UTF-8"?>
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

export const RSS2_WITH_CONTENT_ENCODED = `<?xml version="1.0" encoding="UTF-8"?>
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

export const RSS2_WITH_AUTHOR = `<?xml version="1.0" encoding="UTF-8"?>
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

export const RSS2_WITH_ENCLOSURE = `<?xml version="1.0" encoding="UTF-8"?>
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

export const RSS2_PODCAST_WITH_CHANNEL_ITUNES_IMAGE = `<?xml version="1.0" encoding="UTF-8"?>
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

export const RSS2_WITH_IMAGE = `<?xml version="1.0" encoding="UTF-8"?>
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

export const RSS2_MASTODON_PROFILE_IMAGE = `<?xml version="1.0" encoding="UTF-8"?>
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

export const RSS2_WITH_MEDIA_CONTENT_IMAGE = `<?xml version="1.0" encoding="UTF-8"?>
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

export const RSS2_WITH_MEDIA_CONTENT_VIDEO = `<?xml version="1.0" encoding="UTF-8"?>
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

export const RSS2_WITH_MEDIA_CONTENT_MEDIUM_ONLY = `<?xml version="1.0" encoding="UTF-8"?>
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

export const RSS2_EMPTY = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Empty Feed</title>
    <description>No items</description>
    <link>https://example.com</link>
  </channel>
</rss>`;

export const SUBSTACK_RSS = `<?xml version="1.0" encoding="UTF-8"?>
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

export const ASTRAL_CODEX_BROKEN_SUBSTACK_CONTENT = `
  <p>Intro paragraph.</p>
  <figure>
    <img src="https://substackcdn.com/image/fetch/$s_!YDr_!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png" />
  </figure>
  <p>Outro paragraph.</p>
`;

export const BLOOMBERG_VIDEO_IMAGE_FIRST_RSS = `<?xml version="1.0" encoding="UTF-8"?>
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

export const ATOM_BASIC = `<?xml version="1.0" encoding="UTF-8"?>
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

export const ATOM_WITH_AUTHOR = `<?xml version="1.0" encoding="UTF-8"?>
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

export const ATOM_WITH_LOGO = `<?xml version="1.0" encoding="UTF-8"?>
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

export const JSON_FEED_BASIC = JSON.stringify({
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

export const JSON_FEED_EMPTY_ITEMS = JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  title: "Empty JSON Feed",
  items: [],
});

export const RSS2_SUBSTACK_QUOTED_ATTRS = `<?xml version="1.0" encoding="UTF-8"?>
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
