import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, type MediaSettings } from "../../../../src/types/types.js";
import { FeedParser } from "../../../../src/services/feed-parser/feed-parser-class.js";

describe("FeedParser trailing slashes on icons", () => {
  const mediaSettings: MediaSettings = {
    autoTagVideos: true,
    rememberPlaybackProgress: true,
    defaultTwitterFolder: "Twitter",
    defaultMastodonFolder: "Mastodon",
    defaultYouTubeFolder: "Videos",
    defaultVideoTag: "Video",
    defaultVideoTags: ["Video"],
    defaultYouTubeTag: "Video",
    defaultYouTubeTags: ["Video"],
    defaultPodcastFolder: "Podcast",
    defaultPodcastTags: ["Podcast"],
    defaultRssFolder: "RSS",
    defaultRssTag: "",
    defaultRssTags: [],
    defaultSmallwebFolder: "Smallweb",
    defaultSmallwebTag: "",
    defaultSmallwebTags: [],
    defaultTwitterTag: "",
    defaultTwitterTags: [],
    defaultMastodonTag: "",
    defaultMastodonTags: [],
    openInSplitView: true,
    podcastTheme: "obsidian",
    enableApplePodcastsOpen: false,
    defaultPlaySpeed: 1,
  };

  it("should strip trailing slashes from image URLs in resolveFeedIconUrl", () => {
    // We can test this by exposing the private method via any casting
    const parser = new FeedParser({
      ...DEFAULT_SETTINGS.display,
      useDomainIconsRss: true,
    }, [], mediaSettings);
    
    type ParserWithPrivate = { resolveFeedIconUrl: (icons: string[], feedUrl: string) => string };
    const resolveIcon = (parser as unknown as ParserWithPrivate).resolveFeedIconUrl.bind(parser);

    const testUrl1 = "https://www.redditstatic.com/icon.png/";
    const testUrl2 = "https://example.com/logo.jpg//";
    const testUrl3 = "https://example.com/logo.jpeg/";
    const testUrl4 = "https://example.com/icon.png";

    expect(resolveIcon([testUrl1], "https://example.com")).toBe("https://www.redditstatic.com/icon.png");
    expect(resolveIcon([testUrl2], "https://example.com")).toBe("https://example.com/logo.jpg");
    expect(resolveIcon([testUrl3], "https://example.com")).toBe("https://example.com/logo.jpeg");
    expect(resolveIcon([testUrl4], "https://example.com")).toBe("https://example.com/icon.png");
  });
});
