import { describe, expect, it } from "vitest";
import { MediaService } from "../../../src/services/media-service";
import type { Feed, FeedItem, MediaSettings } from "../../../src/types/types";

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

  it("auto-applies Video tag to non-YouTube video feeds", () => {
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
      { defaultVideoTag: "Video" },
    );

    const item = tagged.items[0];
    expect(item.tags.map((tag) => tag.name.toLowerCase())).toContain("video");
  });

  it("auto-applies existing Videos tag to non-YouTube video feeds", () => {
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
      { defaultVideoTag: "Video" },
    );

    const item = tagged.items[0];
    expect(item.tags.map((tag) => tag.name.toLowerCase())).toContain("videos");
  });

  it("does not apply Video tag to non-YouTube video feeds when defaultVideoTag is not set", () => {
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
      { defaultVideoTag: "" },
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
      { defaultVideoTag: "Video" },
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
      { defaultVideoTag: "Video" },
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
      { defaultVideoTag: "Video" },
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
      { defaultVideoTag: "Video" },
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
      { defaultVideoTag: "Video" },
    );

    const item = tagged.items[0];
    expect(item.tags.map((tag) => tag.name.toLowerCase())).toContain("video");
    expect(item.tags.map((tag) => tag.name.toLowerCase())).not.toContain(
      "youtube",
    );
  });

  it("applies defaultYouTubeTag to YouTube feeds independently of the video-tag setting", () => {
    const ytFeed = createFeed([
      createItem({
        guid: "yt-no-videotag",
        link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
    ]);
    ytFeed.url =
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw";

    const detected = MediaService.detectAndProcessFeed(ytFeed);

    const tagged = MediaService.applyMediaTags(
      detected,
      [{ name: "MyYouTube", color: "#d04747" }],
      { defaultVideoTag: "", defaultYouTubeTag: "MyYouTube" },
    );

    const item = tagged.items[0];
    expect(item.tags.map((t) => t.name.toLowerCase())).toContain("myyoutube");
    expect(item.tags.map((t) => t.name.toLowerCase())).not.toContain("video");
  });

  it("applies all configured defaultYouTubeTags to YouTube feeds", () => {
    const ytFeed = createFeed([
      createItem({
        guid: "yt-multi-tag",
        link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
    ]);
    ytFeed.url =
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw";

    const tagged = MediaService.applyMediaTags(
      MediaService.detectAndProcessFeed(ytFeed),
      [
        { name: "Video", color: "#d04747" },
        { name: "News", color: "#3498db" },
        { name: "Tech", color: "#2ecc71" },
        { name: "Learning", color: "#f1c40f" },
      ],
      {
        defaultVideoTag: "",
        defaultYouTubeTag: "Video",
        defaultYouTubeTags: ["News", "Tech", "Learning", "Video"],
      },
    );

    expect(tagged.items[0].tags.map((tag) => tag.name)).toEqual([
      "Video",
      "News",
      "Tech",
      "Learning",
    ]);
  });

  it("falls back to legacy defaultYouTubeTag when defaultYouTubeTags is empty", () => {
    const ytFeed = createFeed([
      createItem({
        guid: "yt-legacy-fallback",
        link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
    ]);
    ytFeed.url =
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw";

    const tagged = MediaService.applyMediaTags(
      MediaService.detectAndProcessFeed(ytFeed),
      [{ name: "Legacy YouTube", color: "#d04747" }],
      {
        defaultVideoTag: "",
        defaultYouTubeTag: "Legacy YouTube",
        defaultYouTubeTags: [],
      },
    );

    expect(tagged.items[0].tags.map((tag) => tag.name)).toEqual([
      "Legacy YouTube",
    ]);
  });

  it("ignores unknown configured media tags and dedupes repeated names", () => {
    const ytFeed = createFeed([
      createItem({
        guid: "yt-ignore-unknown",
        link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        tags: [{ name: "Video", color: "#d04747" }],
      }),
    ]);
    ytFeed.url =
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw";

    const tagged = MediaService.applyMediaTags(
      MediaService.detectAndProcessFeed(ytFeed),
      [
        { name: "Video", color: "#d04747" },
        { name: "Tech", color: "#2ecc71" },
      ],
      {
        defaultVideoTag: "",
        defaultYouTubeTag: "Video",
        defaultYouTubeTags: ["Video", "Missing", "Tech", "Tech"],
      },
    );

    expect(tagged.items[0].tags.map((tag) => tag.name)).toEqual([
      "Video",
      "Tech",
    ]);
  });

  it("applies the default 'video' tag to YouTube feeds when defaultYouTubeTag is not set", () => {
    const ytFeed = createFeed([
      createItem({
        guid: "yt-no-setting",
        link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
    ]);
    ytFeed.url =
      "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw";

    const tagged = MediaService.applyMediaTags(
      MediaService.detectAndProcessFeed(ytFeed),
      [{ name: "Video", color: "#d04747" }],
      { defaultVideoTag: "", defaultYouTubeTag: undefined },
    );

    expect(tagged.items[0].tags.map((t) => t.name.toLowerCase())).toContain(
      "video",
    );
  });

  it("does not tag non-YouTube video feeds when defaultVideoTag is not set", () => {
    const detected = MediaService.detectAndProcessFeed(
      createFeed([
        createItem({
          guid: "non-yt-novideotag",
          link: "https://www.bloomberg.com/news/videos/2026-05-12/video-story",
        }),
      ]),
    );

    const tagged = MediaService.applyMediaTags(
      detected,
      [{ name: "Video", color: "#d04747" }],
      { defaultVideoTag: "" },
    );

    expect(tagged.items[0].tags.map((t) => t.name.toLowerCase())).not.toContain(
      "video",
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
        { defaultVideoTag: "" },
      ),
    ).not.toThrow();

    const tagged = MediaService.applyMediaTags(
      detected,
      null as unknown as Array<{ name: string; color: string }>,
      { defaultVideoTag: "" },
    );

    expect(tagged.items[0].tags).toEqual([]);
  });

  it("auto-applies configured defaultPodcastTag to podcast feeds", () => {
    const podcastFeed = createFeed([
      createItem({
        guid: "podcast-1",
        link: "https://example.com/episode.mp3",
        enclosure: {
          url: "https://example.com/episode.mp3",
          type: "audio/mpeg",
          length: "100",
        },
      }),
    ]);

    const detected = MediaService.detectAndProcessFeed(podcastFeed);

    const tagged = MediaService.applyMediaTags(
      detected,
      [{ name: "MyPod", color: "#8e44ad" }],
      { defaultPodcastTag: "MyPod" },
    );

    const item = tagged.items[0];
    expect(item.tags.map((tag) => tag.name.toLowerCase())).toContain("mypod");
  });

  it("falls back to 'podcast' if defaultPodcastTag is empty", () => {
    const podcastFeed = createFeed([
      createItem({
        guid: "podcast-2",
        link: "https://example.com/episode2.mp3",
        enclosure: {
          url: "https://example.com/episode2.mp3",
          type: "audio/mpeg",
          length: "100",
        },
      }),
    ]);

    const detected = MediaService.detectAndProcessFeed(podcastFeed);

    const tagged = MediaService.applyMediaTags(
      detected,
      [{ name: "Podcast", color: "#8e44ad" }],
      { defaultPodcastTag: "" },
    );

    const item = tagged.items[0];
    expect(item.tags.map((tag) => tag.name.toLowerCase())).toContain("podcast");
  });

  it("auto-applies configured defaultTwitterTag to Twitter feeds", () => {
    const twitterFeed = createFeed([
      createItem({
        guid: "tweet-1",
        link: "https://nitter.net/user/status/123",
      }),
    ]);
    twitterFeed.url = "https://nitter.net/user/rss";

    const tagged = MediaService.applyMediaTags(
      twitterFeed,
      [{ name: "TwitterTag", color: "#1da1f2" }],
      { defaultTwitterTag: "TwitterTag" },
    );

    const item = tagged.items[0];
    expect(item.tags.map((tag) => tag.name.toLowerCase())).toContain(
      "twittertag",
    );
  });

  it("does not tag Twitter feeds if defaultTwitterTag is empty", () => {
    const twitterFeed = createFeed([
      createItem({
        guid: "tweet-2",
        link: "https://nitter.net/user/status/456",
      }),
    ]);
    twitterFeed.url = "https://nitter.net/user/rss";

    const tagged = MediaService.applyMediaTags(
      twitterFeed,
      [{ name: "TwitterTag", color: "#1da1f2" }],
      { defaultTwitterTag: "" },
    );

    const item = tagged.items[0];
    expect(item.tags).toEqual([]);
  });

  it("auto-applies configured defaultMastodonTag to Mastodon feeds", () => {
    const mastodonFeed = createFeed([
      createItem({
        guid: "toot-1",
        link: "https://mastodon.social/@user/123",
      }),
    ]);
    mastodonFeed.url = "https://mastodon.social/@user.rss";

    const tagged = MediaService.applyMediaTags(
      mastodonFeed,
      [{ name: "MastodonTag", color: "#2b90d9" }],
      { defaultMastodonTag: "MastodonTag" },
    );

    const item = tagged.items[0];
    expect(item.tags.map((tag) => tag.name.toLowerCase())).toContain(
      "mastodontag",
    );
  });

  it("does not tag Mastodon feeds if defaultMastodonTag is empty", () => {
    const mastodonFeed = createFeed([
      createItem({
        guid: "toot-2",
        link: "https://mastodon.social/@user/456",
      }),
    ]);
    mastodonFeed.url = "https://mastodon.social/@user.rss";

    const tagged = MediaService.applyMediaTags(
      mastodonFeed,
      [{ name: "MastodonTag", color: "#2b90d9" }],
      { defaultMastodonTag: "" },
    );

    const item = tagged.items[0];
    expect(item.tags).toEqual([]);
  });
});

describe("MediaService.shouldShowFeedIcon", () => {
  const defaultMediaSettings = (
    overrides: Partial<MediaSettings> = {},
  ): MediaSettings => ({
    defaultVideoTag: "Video",
    rememberPlaybackProgress: true,
    defaultTwitterFolder: "Twitter",
    defaultMastodonFolder: "Mastodon",
    defaultYouTubeFolder: "Videos",
    defaultYouTubeTag: "Video",
    defaultPodcastFolder: "Podcast",
    defaultPodcastTag: "podcast",
    defaultRssFolder: "RSS",
    defaultRssTag: "RSS",
    defaultSmallwebFolder: "Smallweb",
    defaultSmallwebTag: "smallweb",
    useDomainIconsMastodon: false,
    useDomainIconsRss: false,
    useDomainIconsPodcast: false,
    useDomainIconsTwitter: false,
    useDomainIconsYouTube: false,
    openInSplitView: true,
    podcastTheme: "obsidian",
    ...overrides,
  });

  const createMockFeedWithIcon = (
    url: string,
    mediaType: "article" | "video" | "podcast" = "article",
  ): Feed => ({
    title: "Mock Feed",
    url,
    folder: "RSS",
    items: [],
    lastUpdated: 0,
    mediaType,
    iconUrl: "https://example.com/icon.png",
  });

  it("handles YouTube/Video feeds correctly", () => {
    const feedYt = createMockFeedWithIcon(
      "https://www.youtube.com/feeds/videos.xml?channel_id=123",
      "video",
    );
    expect(
      MediaService.shouldShowFeedIcon(feedYt, defaultMediaSettings({})),
    ).toBe(false);
  });

  it("handles Podcast feeds correctly", () => {
    const feedPodcast = createMockFeedWithIcon(
      "https://example.com/podcast.xml",
      "podcast",
    );
    expect(
      MediaService.shouldShowFeedIcon(
        feedPodcast,
        defaultMediaSettings({ useDomainIconsPodcast: false }),
      ),
    ).toBe(false);
    expect(
      MediaService.shouldShowFeedIcon(
        feedPodcast,
        defaultMediaSettings({ useDomainIconsPodcast: true }),
      ),
    ).toBe(true);
  });

  it("handles Mastodon feeds correctly", () => {
    const feedMastodon = createMockFeedWithIcon(
      "https://mastodon.social/@username.rss",
    );
    expect(
      MediaService.shouldShowFeedIcon(
        feedMastodon,
        defaultMediaSettings({ useDomainIconsMastodon: false }),
      ),
    ).toBe(false);
    expect(
      MediaService.shouldShowFeedIcon(
        feedMastodon,
        defaultMediaSettings({ useDomainIconsMastodon: true }),
      ),
    ).toBe(true);
  });

  it("handles Twitter/Nitter feeds correctly", () => {
    const feedTwitter = createMockFeedWithIcon(
      "https://nitter.net/username/rss",
    );
    expect(
      MediaService.shouldShowFeedIcon(
        feedTwitter,
        defaultMediaSettings({ useDomainIconsTwitter: false }),
      ),
    ).toBe(false);
    expect(
      MediaService.shouldShowFeedIcon(
        feedTwitter,
        defaultMediaSettings({ useDomainIconsTwitter: true }),
      ),
    ).toBe(true);
  });

  it("handles standard RSS feeds correctly", () => {
    const feedRss = createMockFeedWithIcon("https://example.com/rss.xml");
    expect(
      MediaService.shouldShowFeedIcon(
        feedRss,
        defaultMediaSettings({ useDomainIconsRss: false }),
      ),
    ).toBe(false);
    expect(
      MediaService.shouldShowFeedIcon(
        feedRss,
        defaultMediaSettings({ useDomainIconsRss: true }),
      ),
    ).toBe(true);
  });

  it("returns false if feed has no iconUrl", () => {
    const feedNoIcon = {
      ...createMockFeedWithIcon("https://example.com/rss.xml"),
      iconUrl: undefined,
    };
    expect(
      MediaService.shouldShowFeedIcon(
        feedNoIcon,
        defaultMediaSettings({ useDomainIconsRss: true }),
      ),
    ).toBe(false);
  });
});
