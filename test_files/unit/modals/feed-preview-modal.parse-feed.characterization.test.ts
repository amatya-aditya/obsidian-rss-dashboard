import { describe, expect, it } from "vitest";
import * as obsidian from "obsidian";
import { FeedPreviewModal } from "../../../src/modals/feed-preview-modal";
import type { FeedMetadata } from "../../../src/types/discover-types";

interface ParsedArticle {
  title: string;
  image?: string;
}

function parseFeedXml(xml: string): ParsedArticle[] {
  const modal = new FeedPreviewModal(
    obsidian.App.createMock() as unknown as obsidian.App,
    {} as unknown as FeedMetadata,
  );
  return (
    modal as unknown as { parseFeedXml(x: string): ParsedArticle[] }
  ).parseFeedXml(xml);
}

describe("FeedPreviewModal feed parsing", () => {
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
});
