import { describe, it, expect, vi } from "vitest";
import * as obsidian from "obsidian";
import { FeedParserService } from "../../../../src/services/feed-parser/feed-parser-service.js";
import { RSS2_PODCAST_WITH_CHANNEL_ITUNES_IMAGE } from "./fixtures/rss-fixtures.js";

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
