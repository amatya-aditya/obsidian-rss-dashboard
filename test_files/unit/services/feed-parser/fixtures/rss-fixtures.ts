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

export const RSS2_WITHOUT_PUBDATE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Undated Feed</title>
    <description>A feed whose items have no pubDate</description>
    <link>https://example.com</link>
    <item>
      <title>Undated Article</title>
      <link>https://example.com/undated</link>
      <description>Article with no pubDate</description>
      <guid>https://example.com/undated</guid>
    </item>
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

// ─── Namespace-prefixed feeds (#1338) ─────────────────────────────────────────
// A feed may bind the Atom, RSS 2.0 or RSS 1.0 namespace to any prefix. The
// prefix carries no meaning, so `<ns6:entry>` is the same element as `<entry>`
// and these fixtures must parse exactly like their unprefixed siblings.

export const ATOM_PREFIXED = `<?xml version="1.0" encoding="UTF-8"?>
<ns6:feed xmlns:ns6="http://www.w3.org/2005/Atom">
  <ns6:title>Prefixed Atom Feed</ns6:title>
  <ns6:subtitle>An atom feed with a namespace prefix</ns6:subtitle>
  <ns6:link href="https://example.com" rel="alternate"/>
  <ns6:entry>
    <ns6:title>Prefixed Atom Entry</ns6:title>
    <ns6:link href="https://example.com/prefixed-entry" rel="alternate"/>
    <ns6:id>https://example.com/prefixed-entry</ns6:id>
    <ns6:published>2024-01-01T00:00:00Z</ns6:published>
    <ns6:summary>Prefixed entry summary</ns6:summary>
    <ns6:author><ns6:name>Ada Lovelace</ns6:name></ns6:author>
  </ns6:entry>
</ns6:feed>`;

export const RSS2_PREFIXED = `<?xml version="1.0" encoding="UTF-8"?>
<ns6:rss version="2.0" xmlns:ns6="http://backend.userland.com/rss2">
  <ns6:channel>
    <ns6:title>Prefixed RSS Feed</ns6:title>
    <ns6:description>A prefixed RSS 2.0 feed</ns6:description>
    <ns6:link>https://example.com</ns6:link>
    <ns6:image>
      <ns6:url>https://example.com/logo.png</ns6:url>
    </ns6:image>
    <ns6:item>
      <ns6:title>Prefixed Item</ns6:title>
      <ns6:link>https://example.com/prefixed-1</ns6:link>
      <ns6:description>Prefixed item body</ns6:description>
      <ns6:pubDate>Mon, 01 Jan 2024 00:00:00 GMT</ns6:pubDate>
      <ns6:guid>prefixed-1</ns6:guid>
      <ns6:author>Ada Lovelace</ns6:author>
      <ns6:category>News</ns6:category>
    </ns6:item>
  </ns6:channel>
</ns6:rss>`;

export const RSS1_PREFIXED = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:ns6="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <ns6:channel rdf:about="https://example.com">
    <ns6:title>Prefixed RSS 1.0 Feed</ns6:title>
    <ns6:description>A prefixed RSS 1.0 feed</ns6:description>
    <ns6:link>https://example.com</ns6:link>
    <ns6:image rdf:resource="https://example.com/logo.png"/>
  </ns6:channel>
  <ns6:item rdf:about="https://example.com/prefixed-rdf-1">
    <ns6:title>Prefixed RDF Item</ns6:title>
    <ns6:link>https://example.com/prefixed-rdf-1</ns6:link>
    <ns6:description>RDF item body</ns6:description>
    <dc:date>2024-01-01T00:00:00Z</dc:date>
    <dc:creator>Grace Hopper</dc:creator>
  </ns6:item>
</rdf:RDF>`;

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

export const JSON_FEED_WITHOUT_DATE = JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  title: "Undated JSON Feed",
  home_page_url: "https://example.com",
  items: [
    {
      id: "json-undated",
      url: "https://example.com/json-undated",
      title: "Undated JSON Item",
      summary: "Item summary with no date_published",
      content_html: "<p>Item content</p>",
    },
  ],
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

export const RSS2_WORDPRESS_LATEX_IMAGES = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>WordPress Math Feed</title>
    <link>https://math.example.com</link>
    <item>
      <title>Formula-only article</title>
      <link>https://math.example.com/formula-only</link>
      <description>Formula-only summary</description>
      <content:encoded><![CDATA[
        <p>A function <img src="https://s0.wp.com/latex.php?latex=%7Bf%28t%29%7D&#038;bg=ffffff&#038;fg=000000" srcset="https://s0.wp.com/latex.php?latex=%7Bf%28t%29%7D&#038;bg=ffffff 1x, https://s0.wp.com/latex.php?latex=%7Bf%28t%29%7D&#038;bg=ffffff&#038;zoom=4.5 4x" alt="{f(t)}" class="latex" /> remains inline.</p>
      ]]></content:encoded>
      <pubDate>Thu, 06 Aug 2026 18:26:54 GMT</pubDate>
      <guid>wordpress-formula-only</guid>
    </item>
    <item>
      <title>Formula followed by a photo</title>
      <link>https://math.example.com/formula-and-photo</link>
      <description>Formula and photo summary</description>
      <content:encoded><![CDATA[
        <p><img class="latex" src="https://s0.wp.com/latex.php?latex=%7Bx%7D&#038;bg=ffffff" alt="{x}" /></p>
        <figure><img src="https://math.example.com/article-photo.jpg" alt="Article photo" /></figure>
      ]]></content:encoded>
      <pubDate>Wed, 05 Aug 2026 18:26:54 GMT</pubDate>
      <guid>wordpress-formula-and-photo</guid>
    </item>
  </channel>
</rss>`;
