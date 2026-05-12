import { describe, expect, it } from "vitest";
import { MediaService } from "../../../src/services/media-service";
import type { Feed, FeedItem } from "../../../src/types/types";

function createItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Item",
    link: "https://example.com/article",
    description: "desc",
    pubDate: "2026-05-12T00:00:00.000Z",
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    mediaType: "article",
    ...overrides,
  };
}

function createFeed(items: FeedItem[]): Feed {
  return {
    title: "Test Feed",
    url: "https://example.com/feed.xml",
    folder: "RSS",
    items,
    lastUpdated: 0,
    mediaType: "article",
  };
}

describe("MediaService.detectAndProcessFeed", () => {
  it("classifies Bloomberg-style video routes as video when explicit enclosure is missing", () => {
    const feed = createFeed([
      createItem({
        link: "https://www.bloomberg.com/news/videos/2026-05-12/sample-video",
        mediaContentType: "image/jpeg",
      }),
    ]);

    const result = MediaService.detectAndProcessFeed(feed);

    expect(result.mediaType).toBe("video");
    expect(result.items[0].mediaType).toBe("video");
  });

  it("marks only matching video-route items as video in mixed feeds", () => {
    const feed = createFeed([
      createItem({
        guid: "video-1",
        link: "https://www.bloomberg.com/news/videos/2026-05-12/video-story",
        mediaContentType: "image/jpeg",
      }),
      createItem({
        guid: "article-1",
        link: "https://www.bloomberg.com/news/articles/2026-05-12/article-story",
      }),
    ]);

    const result = MediaService.detectAndProcessFeed(feed);

    expect(result.mediaType).toBe("video");
    expect(result.items.find((item) => item.guid === "video-1")?.mediaType).toBe(
      "video",
    );
    expect(
      result.items.find((item) => item.guid === "article-1")?.mediaType,
    ).toBe("article");
  });
});