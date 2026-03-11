import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, Feed, Tag } from "../../src/types/types";
import { MediaService } from "../../src/services/media-service";

const baseTags: Tag[] = [
  { name: "youtube", color: "#ff0000" },
  { name: "Favorite", color: "#f1c40f" },
];

describe("youtube shorts detection", () => {
  it("defaults the feature to disabled", () => {
    expect(DEFAULT_SETTINGS.media.detectYouTubeShorts).toBe(false);
  });

  it("detects short links only for YouTube feeds when enabled", () => {
    expect(
      MediaService.shouldDetectYouTubeShort(
        "https://www.youtube.com/feeds/videos.xml?channel_id=test",
        "https://www.youtube.com/shorts/abc123",
        true,
      ),
    ).toBe(true);

    expect(
      MediaService.shouldDetectYouTubeShort(
        "https://www.youtube.com/feeds/videos.xml?channel_id=test",
        "https://www.youtube.com/watch?v=abc123",
        true,
      ),
    ).toBe(false);

    expect(
      MediaService.shouldDetectYouTubeShort(
        "https://example.com/feed.xml",
        "https://www.youtube.com/shorts/abc123",
        true,
      ),
    ).toBe(false);

    expect(
      MediaService.shouldDetectYouTubeShort(
        "https://www.youtube.com/feeds/videos.xml?channel_id=test",
        "https://www.youtube.com/shorts/abc123",
        false,
      ),
    ).toBe(false);
  });

  it("registers the Youtube short tag and applies it to new short items", () => {
    const availableTags = [...baseTags];
    const shortTags = MediaService.updateYouTubeShortTags(
      [],
      true,
      availableTags,
    );

    expect(shortTags.map((tag) => tag.name)).toEqual(["Youtube short"]);
    expect(
      availableTags.some((tag) => tag.name === "Youtube short"),
    ).toBe(true);
  });

  it("reuses an existing Youtube short tag instead of duplicating it", () => {
    const availableTags = [
      ...baseTags,
      {
        name: "Youtube short",
        color: MediaService.YOUTUBE_SHORT_TAG_COLOR,
      },
    ];
    const shortTags = MediaService.updateYouTubeShortTags(
      [],
      true,
      availableTags,
    );

    expect(shortTags.map((tag) => tag.name)).toEqual(["Youtube short"]);
    expect(
      availableTags.filter((tag) => tag.name === "Youtube short"),
    ).toHaveLength(1);
  });

  it("preserves unrelated tags and removes stale Youtube short tags on refresh", () => {
    const refreshedTags = MediaService.updateYouTubeShortTags(
      [
        { name: "Youtube short", color: "#ff0000" },
        { name: "Favorite", color: "#f1c40f" },
      ],
      false,
      [
        ...baseTags,
        {
          name: "Youtube short",
          color: MediaService.YOUTUBE_SHORT_TAG_COLOR,
        },
      ],
    );

    expect(refreshedTags.map((tag) => tag.name)).toEqual(["Favorite"]);
  });

  it("keeps regular media tagging unchanged so shorts receive both tags", () => {
    const feed: Feed = {
      title: "Test Channel",
      url: "https://www.youtube.com/feeds/videos.xml?channel_id=test",
      folder: "Videos",
      lastUpdated: 0,
      mediaType: "video",
      items: [
        {
          title: "Short video",
          link: "https://www.youtube.com/shorts/abc123",
          description: "",
          pubDate: "2026-03-05T17:00:09+00:00",
          guid: "abc123",
          read: false,
          starred: false,
          tags: [{ name: "Youtube short", color: "#ff0000" }],
          feedTitle: "Test Channel",
          feedUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=test",
          coverImage: "",
          saved: false,
          mediaType: "video",
        },
      ],
    };

    const taggedFeed = MediaService.applyMediaTags(feed, [
      ...baseTags,
      {
        name: "Youtube short",
        color: MediaService.YOUTUBE_SHORT_TAG_COLOR,
      },
    ]);

    expect(taggedFeed.items[0].tags.map((tag) => tag.name)).toEqual([
      "Youtube short",
      "youtube",
    ]);
  });
});
