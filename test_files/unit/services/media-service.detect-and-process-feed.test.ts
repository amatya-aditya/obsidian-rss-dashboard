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
  it("classifies Bloomberg-style video routes as video when media metadata is missing", () => {
    const feed = createFeed([
      createItem({
        link: "https://www.bloomberg.com/news/videos/2026-05-12/sample-video",
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
      }),
      createItem({
        guid: "article-1",
        link: "https://www.bloomberg.com/news/articles/2026-05-12/article-story",
      }),
    ]);

    const result = MediaService.detectAndProcessFeed(feed);

    expect(result.mediaType).toBe("video");
    expect(
      result.items.find((item) => item.guid === "video-1")?.mediaType,
    ).toBe("video");
    expect(
      result.items.find((item) => item.guid === "article-1")?.mediaType,
    ).toBe("article");
  });

  it("auto-applies Video tag to non-YouTube video feeds when enabled", () => {
    const detected = MediaService.detectAndProcessFeed(
      createFeed([
        createItem({
          guid: "video-tag-1",
          link: "https://www.bloomberg.com/news/videos/2026-05-12/video-story",
        }),
      ]),
    );

    const tagged = MediaService.applyMediaTags(
      detected,
      [{ name: "Video", color: "#d04747" }],
      { autoTagVideos: true },
    );

    const item = tagged.items[0];
    expect(item.tags.map((tag) => tag.name.toLowerCase())).toContain("video");
  });

  it("auto-applies existing Videos tag to non-YouTube video feeds when enabled", () => {
    const detected = MediaService.detectAndProcessFeed(
      createFeed([
        createItem({
          guid: "video-tag-plural-1",
          link: "https://www.bloomberg.com/news/videos/2026-05-12/video-story",
        }),
      ]),
    );

    const tagged = MediaService.applyMediaTags(
      detected,
      [{ name: "Videos", color: "#d04747" }],
      { autoTagVideos: true },
    );

    const item = tagged.items[0];
    expect(item.tags.map((tag) => tag.name.toLowerCase())).toContain("videos");
  });

  it("does not auto-apply Video tag to non-YouTube video feeds when disabled", () => {
    const detected = MediaService.detectAndProcessFeed(
      createFeed([
        createItem({
          guid: "video-tag-2",
          link: "https://www.bloomberg.com/news/videos/2026-05-12/video-story",
        }),
      ]),
    );

    const tagged = MediaService.applyMediaTags(
      detected,
      [{ name: "Video", color: "#d04747" }],
      { autoTagVideos: false },
    );

    const item = tagged.items[0];
    expect(item.tags.map((tag) => tag.name.toLowerCase())).not.toContain(
      "video",
    );
  });

  it("tags only video items in mixed feeds", () => {
    const detected = MediaService.detectAndProcessFeed(
      createFeed([
        createItem({
          guid: "video-mixed-1",
          link: "https://www.bloomberg.com/news/videos/2026-05-12/video-story",
        }),
        createItem({
          guid: "article-mixed-1",
          link: "https://www.bloomberg.com/news/articles/2026-05-12/article-story",
          mediaContentType: "image/jpeg",
        }),
      ]),
    );

    expect(detected.mediaType).toBe("video");
    expect(
      detected.items.find((item) => item.guid === "video-mixed-1")?.mediaType,
    ).toBe("video");
    expect(
      detected.items.find((item) => item.guid === "article-mixed-1")?.mediaType,
    ).toBe("article");

    const tagged = MediaService.applyMediaTags(
      detected,
      [{ name: "Video", color: "#d04747" }],
      { autoTagVideos: true },
    );

    const videoItem = tagged.items.find(
      (item) => item.guid === "video-mixed-1",
    );
    const articleItem = tagged.items.find(
      (item) => item.guid === "article-mixed-1",
    );

    expect(videoItem?.tags.map((tag) => tag.name.toLowerCase())).toContain(
      "video",
    );
    expect(
      articleItem?.tags.map((tag) => tag.name.toLowerCase()),
    ).not.toContain("video");
  });

  it("does not classify explicit image media as video even when URL matches video route", () => {
    const feed = createFeed([
      createItem({
        guid: "ars-image-item",
        link: "https://arstechnica.com/tech-policy/2026/05/story-about-video-games/",
        mediaContentType: "image/jpeg",
      }),
    ]);

    const result = MediaService.detectAndProcessFeed(feed);

    expect(result.mediaType).toBe("article");
    expect(result.items[0].mediaType).toBe("article");
  });

  it("does not classify explicit image medium as video when URL matches video route", () => {
    const feed = createFeed([
      createItem({
        guid: "ars-image-medium-item",
        link: "https://arstechnica.com/tech-policy/2026/05/story-about-video-games/",
        mediaContentMedium: "image",
      }),
    ]);

    const result = MediaService.detectAndProcessFeed(feed);

    expect(result.mediaType).toBe("article");
    expect(result.items[0].mediaType).toBe("article");
  });

  it("classifies explicit video medium as video even without media content type", () => {
    const feed = createFeed([
      createItem({
        guid: "video-medium-item",
        link: "https://example.com/story/not-a-video-route",
        mediaContentMedium: "video",
      }),
    ]);

    const result = MediaService.detectAndProcessFeed(feed);

    expect(result.mediaType).toBe("video");
    expect(result.items[0].mediaType).toBe("video");
  });

  it("classifies Bloomberg-style video routes as video when media content is image and auto-tags Video", () => {
    const detected = MediaService.detectAndProcessFeed(
      createFeed([
        createItem({
          guid: "bloomberg-video-image-content",
          link: "https://www.bloomberg.com/news/videos/2026-05-13/henry-wang-on-us-china-summit-expectations-video",
          mediaContentType: "image/jpeg",
        }),
      ]),
    );

    expect(detected.mediaType).toBe("video");
    expect(detected.items[0].mediaType).toBe("video");

    const tagged = MediaService.applyMediaTags(
      detected,
      [{ name: "Video", color: "#d04747" }],
      { autoTagVideos: true },
    );

    expect(tagged.items[0].tags.map((tag) => tag.name.toLowerCase())).toContain(
      "video",
    );
  });

  it("classifies Bloomberg-style video routes as video when media content is image and auto-tags existing Videos tag", () => {
    const detected = MediaService.detectAndProcessFeed(
      createFeed([
        createItem({
          guid: "bloomberg-video-image-content-plural",
          link: "https://www.bloomberg.com/news/videos/2026-05-13/henry-wang-on-us-china-summit-expectations-video",
          mediaContentType: "image/jpeg",
        }),
      ]),
    );

    expect(detected.mediaType).toBe("video");
    expect(detected.items[0].mediaType).toBe("video");

    const tagged = MediaService.applyMediaTags(
      detected,
      [{ name: "Videos", color: "#d04747" }],
      { autoTagVideos: true },
    );

    expect(tagged.items[0].tags.map((tag) => tag.name.toLowerCase())).toContain(
      "videos",
    );
  });

  it("classifies Bloomberg-style video routes as video when media medium is image and auto-tags Video", () => {
    const detected = MediaService.detectAndProcessFeed(
      createFeed([
        createItem({
          guid: "bloomberg-video-image-medium",
          link: "https://www.bloomberg.com/news/videos/2026-05-13/henry-wang-on-us-china-summit-expectations-video",
          mediaContentMedium: "image",
        }),
      ]),
    );

    expect(detected.mediaType).toBe("video");
    expect(detected.items[0].mediaType).toBe("video");

    const tagged = MediaService.applyMediaTags(
      detected,
      [{ name: "Video", color: "#d04747" }],
      { autoTagVideos: true },
    );

    expect(tagged.items[0].tags.map((tag) => tag.name.toLowerCase())).toContain(
      "video",
    );
  });

  it("auto-applies Video tag to YouTube feeds when enabled", () => {
    const youtubeFeed = createFeed([
      createItem({
        guid: "yt-video-1",
        link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
    ]);
    youtubeFeed.url =
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw";

    const detected = MediaService.detectAndProcessFeed(youtubeFeed);

    const tagged = MediaService.applyMediaTags(
      detected,
      [{ name: "Video", color: "#d04747" }],
      { autoTagVideos: true },
    );

    const item = tagged.items[0];
    expect(item.tags.map((tag) => tag.name.toLowerCase())).toContain("video");
    expect(item.tags.map((tag) => tag.name.toLowerCase())).not.toContain(
      "youtube",
    );
  });

  it("does not throw when availableTags is invalid during video tagging", () => {
    const youtubeFeed = createFeed([
      createItem({
        guid: "yt-video-invalid-tags",
        link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
    ]);
    youtubeFeed.url =
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw";

    const detected = MediaService.detectAndProcessFeed(youtubeFeed);

    expect(() =>
      MediaService.applyMediaTags(
        detected,
        null as unknown as Array<{ name: string; color: string }>,
        { autoTagVideos: true },
      ),
    ).not.toThrow();

    const tagged = MediaService.applyMediaTags(
      detected,
      null as unknown as Array<{ name: string; color: string }>,
      { autoTagVideos: true },
    );

    expect(tagged.items[0].tags).toEqual([]);
  });
});
