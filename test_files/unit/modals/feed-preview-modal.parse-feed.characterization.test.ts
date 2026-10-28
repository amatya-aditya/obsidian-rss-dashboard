import { beforeEach, describe, expect, it } from "vitest";
import * as obsidian from "obsidian";
import type { FeedMetadata } from "../../../src/types/discover-types";
import { FeedPreviewModal } from "../../../src/modals/feed-preview-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

interface ParsedPreviewArticle {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  author?: string;
  image?: string;
}

const baseFeed = {
  id: "test-feed",
  title: "Example Feed",
  url: "https://example.com/feed.xml",
  imageUrl: "",
  summary: "A short summary",
  type: "Blog",
  domain: ["Tech"],
  subdomain: [],
  area: [],
  topic: [],
  tags: ["AI"],
};

function parseFeedXml(xml: string): ParsedPreviewArticle[] {
  const modal = new FeedPreviewModal(
    obsidian.App.createMock() as unknown as obsidian.App,
    baseFeed as unknown as FeedMetadata,
  );
  const parser = modal as unknown as {
    parseFeedXml(input: string): ParsedPreviewArticle[];
  };
  return parser.parseFeedXml(xml);
}

describe("FeedPreviewModal feed parsing", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("reads direct RSS fields, sanitizes descriptions, and preserves order", () => {
    const articles = parseFeedXml(`
      <rss>
        <channel>
          <item>
            <title> First </title>
            <link> https://example.com/1 </link>
            <description><![CDATA[<p>Hello &amp; <b>world</b></p>]]></description>
            <pubDate> 2026-03-20 </pubDate>
            <author> Jane </author>
            <nested><title>Not the item title</title></nested>
          </item>
          <item><title>Second</title><link>https://example.com/2</link></item>
        </channel>
      </rss>
    `);

    expect(articles).toEqual([
      {
        title: "First",
        link: "https://example.com/1",
        description: "Hello & world",
        pubDate: "2026-03-20",
        author: "Jane",
        image: "",
      },
      {
        title: "Second",
        link: "https://example.com/2",
        description: "",
        pubDate: "",
        author: "",
        image: "",
      },
    ]);
  });

  it("reads image enclosures and ignores non-image enclosures", () => {
    const articles = parseFeedXml(`
      <rss>
        <channel>
          <item>
            <title>Image enclosure</title>
            <enclosure type="image/jpeg" url="https://example.com/enclosure.jpg" />
          </item>
          <item>
            <title>Non-image enclosure</title>
            <enclosure type="audio/mpeg" url="https://example.com/audio.mp3" />
          </item>
        </channel>
      </rss>
    `);

    expect(articles.map(({ title, image }) => [title, image])).toEqual([
      ["Image enclosure", "https://example.com/enclosure.jpg"],
      ["Non-image enclosure", ""],
    ]);
  });

  it("picks preview images from content:encoded, then media:content, then image enclosures", () => {
    const articles = parseFeedXml(`
      <rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <item>
            <title>All sources</title>
            <description>Plain description</description>
            <content:encoded><![CDATA[<p><img src="https://example.com/content.jpg"></p>]]></content:encoded>
            <media:content url="https://example.com/media.jpg" />
            <enclosure type="image/jpeg" url="https://example.com/enclosure.jpg" />
          </item>
          <item>
            <title>Media only</title>
            <media:content url="https://example.com/media-only.jpg" />
          </item>
          <item>
            <title>Media without url</title>
            <media:content medium="image" />
            <enclosure type="image/jpeg" url="https://example.com/fallback.jpg" />
          </item>
          <item>
            <title>Audio media</title>
            <media:content url="https://example.com/audio.mp3" type="audio/mpeg" />
            <enclosure type="image/jpeg" url="https://example.com/cover.jpg" />
          </item>
          <item>
            <title>Video medium</title>
            <media:content url="https://example.com/clip.mp4" medium="video" />
            <enclosure type="image/jpeg" url="https://example.com/poster.jpg" />
          </item>
          <item>
            <title>Content without image</title>
            <content:encoded><![CDATA[<p>No image here</p>]]></content:encoded>
            <media:content url="https://example.com/media-second.jpg" />
          </item>
        </channel>
      </rss>
    `);

    expect(articles.map(({ title, image }) => [title, image])).toEqual([
      ["All sources", "https://example.com/content.jpg"],
      ["Media only", "https://example.com/media-only.jpg"],
      ["Media without url", "https://example.com/fallback.jpg"],
      ["Audio media", "https://example.com/cover.jpg"],
      ["Video medium", "https://example.com/poster.jpg"],
      ["Content without image", "https://example.com/media-second.jpg"],
    ]);
  });

  it("reads Atom fallback fields and limits results to ten entries", () => {
    const entries = Array.from(
      { length: 11 },
      (_, index) => `
        <entry>
          <title> Entry ${index + 1} </title>
          <link href="https://example.com/${index + 1}" />
          <content>Content ${index + 1}</content>
          <updated>2026-03-${String(index + 1).padStart(2, "0")}</updated>
          <author><name>Author ${index + 1}</name></author>
        </entry>
      `,
    ).join("");
    const articles = parseFeedXml(`<feed>${entries}</feed>`);

    expect(articles).toHaveLength(10);
    expect(articles[0]).toEqual({
      title: "Entry 1",
      link: "https://example.com/1",
      description: "Content 1",
      pubDate: "2026-03-01",
      author: "Author 1",
    });
    expect(articles[9]?.title).toBe("Entry 10");
  });

  it("returns an empty list for empty or malformed feeds", () => {
    expect(parseFeedXml("<rss><channel /></rss>")).toEqual([]);
    expect(parseFeedXml("<rss><channel><item>")).toEqual([]);
  });
});
