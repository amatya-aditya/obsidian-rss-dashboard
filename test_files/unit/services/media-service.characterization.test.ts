import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { MediaService } from "../../../src/services/media-service";
import type { Feed, Tag } from "../../../src/types/types";

/**
 * Characterization tests for the two over-limit statics on `MediaService`,
 * pinned before they are split into sibling modules (#1155):
 * `getYouTubeRssFeed` (C35) and `getInheritedTagsAndCategory` (C25).
 *
 * They drive the public statics directly, so they stay valid across the
 * extraction. `requestUrl` is stubbed through the Obsidian stub; its failure
 * shape is what the moved code turns into a Notice.
 */

const CHANNEL_ID = "UCsBjURrPoezykLs9EqgamOA";
const CHANNEL_ID_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
// Since #1162 the resolver sends the page Accept and no User-Agent when it
// fetches a channel page, so Obsidian identifies itself.
const CHANNEL_PAGE_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

/** HTML whose meta itemprop is the third probe `extractChannelIdFromHtml` tries. */
const CHANNEL_PAGE_HTML = `<meta itemprop="channelId" content="${CHANNEL_ID}">`;

let requestUrlSpy: ReturnType<typeof vi.spyOn>;
let debugSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

/** The `[Stub Notice]` messages logged during the current test. */
function notices(): string[] {
  return (debugSpy.mock.calls as unknown[][])
    .filter((call) => call[0] === "[Stub Notice]")
    .map((call) => String(call[1]));
}

beforeEach(() => {
  requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
  debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  // The resolver logs the caught error before showing its Notice.
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MediaService.getYouTubeRssFeed (characterization)", () => {
  beforeEach(() => {
    requestUrlSpy.mockResolvedValue({
      status: 200,
      headers: {},
      text: CHANNEL_PAGE_HTML,
    });
  });

  it("returns null for empty input without a request or Notice", async () => {
    await expect(MediaService.getYouTubeRssFeed("")).resolves.toBeNull();
    expect(requestUrlSpy).not.toHaveBeenCalled();
    expect(notices()).toEqual([]);
  });

  it("turns a raw UC channel id into the channel_id feed URL", async () => {
    await expect(MediaService.getYouTubeRssFeed(CHANNEL_ID)).resolves.toBe(
      CHANNEL_ID_URL,
    );
    expect(requestUrlSpy).not.toHaveBeenCalled();
  });

  it("turns a youtube.com/channel/ URL into the channel_id feed URL", async () => {
    await expect(
      MediaService.getYouTubeRssFeed(
        `https://www.youtube.com/channel/${CHANNEL_ID}`,
      ),
    ).resolves.toBe(CHANNEL_ID_URL);
    expect(requestUrlSpy).not.toHaveBeenCalled();
  });

  it("returns null for a youtube.com/channel/ URL without a UC id", async () => {
    await expect(
      MediaService.getYouTubeRssFeed("https://www.youtube.com/channel/foo"),
    ).resolves.toBeNull();
    expect(requestUrlSpy).not.toHaveBeenCalled();
    expect(notices()).toEqual([]);
  });

  it("resolves a bare @handle by fetching the channel page", async () => {
    await expect(MediaService.getYouTubeRssFeed("@Fireship")).resolves.toBe(
      CHANNEL_ID_URL,
    );
    expect(requestUrlSpy).toHaveBeenCalledWith({
      url: "https://www.youtube.com/@Fireship",
      method: "GET",
      headers: CHANNEL_PAGE_HEADERS,
    });
  });

  it("resolves a youtube.com/@handle URL by fetching the channel page", async () => {
    await expect(
      MediaService.getYouTubeRssFeed("https://www.youtube.com/@Fireship"),
    ).resolves.toBe(CHANNEL_ID_URL);
    expect(requestUrlSpy).toHaveBeenCalledWith({
      url: "https://www.youtube.com/@Fireship",
      method: "GET",
      headers: CHANNEL_PAGE_HEADERS,
    });
  });

  it("returns null for a bare @ with no handle", async () => {
    await expect(MediaService.getYouTubeRssFeed("@")).resolves.toBeNull();
    expect(requestUrlSpy).not.toHaveBeenCalled();
  });

  it("turns a youtube.com/user/ URL into the user feed URL without a request", async () => {
    await expect(
      MediaService.getYouTubeRssFeed("https://www.youtube.com/user/Fireship"),
    ).resolves.toBe("https://www.youtube.com/feeds/videos.xml?user=Fireship");
    expect(requestUrlSpy).not.toHaveBeenCalled();
  });

  it("resolves a youtube.com/c/ URL by fetching the channel page", async () => {
    await expect(
      MediaService.getYouTubeRssFeed("https://www.youtube.com/c/Fireship"),
    ).resolves.toBe(CHANNEL_ID_URL);
    expect(requestUrlSpy).toHaveBeenCalledWith({
      url: "https://www.youtube.com/c/Fireship",
      method: "GET",
      headers: CHANNEL_PAGE_HEADERS,
    });
  });

  it("treats a bare username as the user feed URL without a request", async () => {
    await expect(MediaService.getYouTubeRssFeed("Fireship")).resolves.toBe(
      "https://www.youtube.com/feeds/videos.xml?user=Fireship",
    );
    expect(requestUrlSpy).not.toHaveBeenCalled();
  });

  it("returns null for input containing whitespace", async () => {
    await expect(
      MediaService.getYouTubeRssFeed("some name"),
    ).resolves.toBeNull();
    expect(requestUrlSpy).not.toHaveBeenCalled();
  });

  it("returns null when the channel page has no channel id", async () => {
    requestUrlSpy.mockResolvedValue({
      status: 200,
      headers: {},
      text: "<html><body>no channel id here</body></html>",
    });

    await expect(
      MediaService.getYouTubeRssFeed("https://www.youtube.com/@Fireship"),
    ).resolves.toBeNull();
    expect(notices()).toEqual([]);
  });

  it("shows one Notice and returns null on an empty channel-page response", async () => {
    requestUrlSpy.mockResolvedValue({ status: 200, headers: {}, text: "" });

    await expect(
      MediaService.getYouTubeRssFeed("https://www.youtube.com/@Fireship"),
    ).resolves.toBeNull();
    expect(notices()).toEqual([
      "Error fetching YouTube channel: Empty response from YouTube",
    ]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("shows one Notice and returns null when the channel-page request fails", async () => {
    requestUrlSpy.mockRejectedValue(new Error("Request failed, status 500"));

    await expect(
      MediaService.getYouTubeRssFeed("https://www.youtube.com/c/Fireship"),
    ).resolves.toBeNull();
    expect(notices()).toEqual([
      "Error fetching YouTube channel: Request failed, status 500",
    ]);
    expect(errorSpy).toHaveBeenCalled();
  });
});

const availableTags: Tag[] = [
  { name: "RSS", color: "#111111" },
  { name: "smallweb", color: "#222222" },
  { name: "Video", color: "#333333" },
  { name: "Podcast", color: "#444444" },
  { name: "Podcasts", color: "#555555" },
  { name: "Mastodon", color: "#666666" },
];

const taggedSettings = {
  defaultSmallwebFolder: "Smallweb",
  defaultRssTags: ["RSS"],
  defaultSmallwebTags: ["smallweb"],
  defaultVideoTags: ["Video"],
  defaultYouTubeTags: ["Video"],
  defaultPodcastTags: ["Podcast"],
  defaultMastodonTags: ["Mastodon"],
};

type FeedShape = Pick<Feed, "url" | "folder" | "mediaType">;

const plainFeed: FeedShape = {
  url: "https://example.com/feed.xml",
  folder: "News",
};
const articleFeed: FeedShape = {
  url: "https://example.com/feed.xml",
  folder: "News",
  mediaType: "article",
};
const videoFeed: FeedShape = {
  url: "https://example.com/video.xml",
  folder: "News",
  mediaType: "video",
};
const youtubeFeed: FeedShape = {
  url: CHANNEL_ID_URL,
  folder: "Videos",
  mediaType: "video",
};
const podcastFeed: FeedShape = {
  url: "https://example.com/pod.xml",
  folder: "Podcasts",
  mediaType: "podcast",
};
const mastodonFeed: FeedShape = {
  url: "https://mastodon.social/@alice.rss",
  folder: "Mastodon",
};
const smallwebFeed: FeedShape = {
  url: "https://example.com/feed.xml",
  folder: "Smallweb",
};

describe("MediaService.getInheritedTagsAndCategory (characterization)", () => {
  it("returns no tags and no category when there are no available tags", () => {
    const result = MediaService.getInheritedTagsAndCategory(
      videoFeed,
      [],
      taggedSettings,
    );
    expect(result).toEqual({ tags: [] });
    expect(result.category).toBeUndefined();
  });

  it("returns no tags when availableTags is not an array", () => {
    const result = MediaService.getInheritedTagsAndCategory(
      videoFeed,
      undefined as unknown as Tag[],
      taggedSettings,
    );
    expect(result).toEqual({ tags: [] });
  });

  it("tags a YouTube video feed from defaultYouTubeTags", () => {
    const result = MediaService.getInheritedTagsAndCategory(
      youtubeFeed,
      availableTags,
      taggedSettings,
    );
    expect(result.category).toBe("video");
    expect(result.tags.map((tag) => tag.name)).toEqual(["Video"]);
  });

  it("tags a non-YouTube video feed from defaultVideoTags", () => {
    const result = MediaService.getInheritedTagsAndCategory(
      videoFeed,
      availableTags,
      {
        ...taggedSettings,
        defaultYouTubeTags: [],
        defaultVideoTags: ["Video"],
      },
    );
    expect(result.category).toBe("video");
    expect(result.tags.map((tag) => tag.name)).toEqual(["Video"]);
  });

  it("tags a podcast feed from defaultPodcastTags", () => {
    const result = MediaService.getInheritedTagsAndCategory(
      podcastFeed,
      availableTags,
      taggedSettings,
    );
    expect(result.category).toBe("podcast");
    expect(result.tags.map((tag) => tag.name)).toEqual(["Podcast"]);
  });

  it("tags a mastodon feed from defaultMastodonTags", () => {
    const result = MediaService.getInheritedTagsAndCategory(
      mastodonFeed,
      availableTags,
      taggedSettings,
    );
    expect(result.category).toBe("mastodon");
    expect(result.tags.map((tag) => tag.name)).toEqual(["Mastodon"]);
  });

  it("tags a smallweb feed from defaultSmallwebTags", () => {
    const result = MediaService.getInheritedTagsAndCategory(
      smallwebFeed,
      availableTags,
      taggedSettings,
    );
    expect(result.category).toBe("smallweb");
    expect(result.tags.map((tag) => tag.name)).toEqual(["smallweb"]);
  });

  it("tags a plain feed as rss from defaultRssTags", () => {
    const result = MediaService.getInheritedTagsAndCategory(
      plainFeed,
      availableTags,
      taggedSettings,
    );
    expect(result.category).toBe("rss");
    expect(result.tags.map((tag) => tag.name)).toEqual(["RSS"]);
  });

  it("treats an article mediaType as rss", () => {
    const result = MediaService.getInheritedTagsAndCategory(
      articleFeed,
      availableTags,
      taggedSettings,
    );
    expect(result.category).toBe("rss");
    expect(result.tags.map((tag) => tag.name)).toEqual(["RSS"]);
  });

  it("prefers the video category over the mastodon URL shape", () => {
    const result = MediaService.getInheritedTagsAndCategory(
      { ...mastodonFeed, mediaType: "video" },
      availableTags,
      taggedSettings,
    );
    expect(result.category).toBe("video");
  });

  it("applies no default tag when the configured array is empty", () => {
    const result = MediaService.getInheritedTagsAndCategory(
      plainFeed,
      availableTags,
      { ...taggedSettings, defaultRssTags: [] },
    );
    expect(result.category).toBe("rss");
    expect(result.tags).toEqual([]);
  });

  it("falls back to the legacy tag and built-in names when arrays are absent", () => {
    const podcast = MediaService.getInheritedTagsAndCategory(
      podcastFeed,
      availableTags,
      {},
    );
    expect(podcast.tags.map((tag) => tag.name)).toEqual([
      "Podcast",
      "Podcasts",
    ]);

    const rss = MediaService.getInheritedTagsAndCategory(
      plainFeed,
      availableTags,
      {
        defaultRssTag: "RSS",
      },
    );
    expect(rss.tags.map((tag) => tag.name)).toEqual(["RSS"]);
  });
});
