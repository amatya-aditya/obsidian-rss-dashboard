import { describe, expect, it } from "vitest";
import { MediaService } from "../../../src/services/media-service";
import type { Feed, Tag } from "../../../src/types/types";

const availableTags: Tag[] = [
  { name: "RSS", color: "#111111" },
  { name: "smallweb", color: "#222222" },
  { name: "Video", color: "#333333" },
  { name: "Podcast", color: "#444444" },
  { name: "Podcasts", color: "#555555" },
  { name: "Mastodon", color: "#666666" },
];

type FeedShape = Pick<Feed, "url" | "folder" | "mediaType">;

const feeds: Record<string, FeedShape> = {
  rss: { url: "https://example.com/feed.xml", folder: "News" },
  smallweb: { url: "https://example.com/feed.xml", folder: "Smallweb" },
  video: {
    url: "https://example.com/video.xml",
    folder: "News",
    mediaType: "video",
  },
  youtube: {
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=abc",
    folder: "Videos",
    mediaType: "video",
  },
  podcast: {
    url: "https://example.com/pod.xml",
    folder: "Podcasts",
    mediaType: "podcast",
  },
  mastodon: { url: "https://mastodon.social/@alice.rss", folder: "Mastodon" },
};

const legacyAndArrays = {
  defaultSmallwebFolder: "Smallweb",
  defaultRssTag: "RSS",
  defaultSmallwebTag: "smallweb",
  defaultVideoTag: "Video",
  defaultYouTubeTag: "Video",
  defaultMastodonTag: "Mastodon",
};

const names = (feed: FeedShape, media: object): string[] =>
  MediaService.getInheritedTagsAndCategory(feed, availableTags, media).tags.map(
    (t) => t.name,
  );

describe("default tags set to None (#930)", () => {
  const cleared = {
    ...legacyAndArrays,
    defaultRssTags: [],
    defaultSmallwebTags: [],
    defaultVideoTags: [],
    defaultYouTubeTags: [],
    defaultPodcastTags: [],
    defaultMastodonTags: [],
  };

  it.each(Object.keys(feeds))(
    "applies no default tag to %s feeds when the list is empty",
    (kind) => {
      expect(names(feeds[kind], cleared)).toEqual([]);
    },
  );
});

describe("default tags left untouched (#930)", () => {
  it("still applies configured arrays", () => {
    const media = {
      ...legacyAndArrays,
      defaultRssTags: ["RSS"],
      defaultSmallwebTags: ["smallweb"],
      defaultVideoTags: ["Video"],
      defaultYouTubeTags: ["Video"],
      defaultPodcastTags: ["Podcast"],
      defaultMastodonTags: ["Mastodon"],
    };
    expect(names(feeds.rss, media)).toEqual(["RSS"]);
    expect(names(feeds.smallweb, media)).toEqual(["smallweb"]);
    expect(names(feeds.video, media)).toEqual(["Video"]);
    expect(names(feeds.youtube, media)).toEqual(["Video"]);
    expect(names(feeds.podcast, media)).toEqual(["Podcast"]);
    expect(names(feeds.mastodon, media)).toEqual(["Mastodon"]);
  });

  it("falls back to legacy values and built-in names when arrays are absent", () => {
    expect(names(feeds.rss, legacyAndArrays)).toEqual(["RSS"]);
    expect(names(feeds.smallweb, legacyAndArrays)).toEqual(["smallweb"]);
    expect(names(feeds.video, legacyAndArrays)).toEqual(["Video"]);
    expect(names(feeds.youtube, legacyAndArrays)).toEqual(["Video"]);
    expect(names(feeds.podcast, {})).toEqual(["Podcast", "Podcasts"]);
  });
});
