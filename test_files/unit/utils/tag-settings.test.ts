import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { MediaService } from "../../../src/services/media-service";
import { getFolderAutoTags } from "../../../src/utils/tag-utils";
import {
  deleteTagFromSettings,
  updateTagInSettings,
} from "../../../src/utils/tag-settings";

function makeSettings(): RssDashboardSettings {
  return {
    availableTags: [
      { name: "Video", color: "#d04747" },
      { name: "News", color: "#3498db" },
    ],
    feeds: [
      {
        url: "https://a.example/feed",
        customTags: ["Video", "News"],
        items: [
          {
            title: "a",
            tags: [
              { name: "Video", color: "#d04747" },
              { name: "News", color: "#3498db" },
            ],
          },
        ],
      },
      {
        url: "https://b.example/feed",
        customTags: ["News"],
        items: [],
      },
    ],
    media: {
      ...(JSON.parse(
        JSON.stringify(DEFAULT_SETTINGS.media),
      ) as RssDashboardSettings["media"]),
      defaultVideoTag: "Video",
      defaultVideoTags: ["Video"],
      defaultYouTubeTag: "Video",
      defaultYouTubeTags: ["Video", "News"],
      defaultPodcastTags: ["Video"],
      defaultRssTag: "Video",
      defaultRssTags: ["Video"],
      defaultSmallwebTag: "Video",
      defaultSmallwebTags: ["Video"],
      defaultMastodonTag: "Video",
      defaultMastodonTags: ["Video"],
    },
    dashboardMultiFilters: {
      statusFilters: [],
      tagFilters: ["Video", "News"],
      logic: "AND",
    },
    folders: [
      {
        name: "Tech",
        autoTags: [
          { name: "Video", color: "#d04747" },
          { name: "News", color: "#3498db" },
        ],
        subfolders: [
          {
            name: "Web",
            autoTags: [{ name: "Video", color: "#d04747" }],
            subfolders: [],
          },
        ],
      },
    ],
  } as unknown as RssDashboardSettings;
}

function makeItem(): FeedItem {
  return {
    title: "New article",
    link: "https://a.example/new",
    guid: "new",
    description: "",
    pubDate: "",
    feedTitle: "Feed",
    feedUrl: "https://a.example/feed",
    coverImage: "",
    tags: [],
  } as FeedItem;
}

describe("deleteTagFromSettings", () => {
  it("removes the definition and every article assignment", () => {
    const settings = makeSettings();

    deleteTagFromSettings(settings, "Video");

    expect(settings.availableTags.map((tag) => tag.name)).toEqual(["News"]);
    expect(settings.feeds[0].items[0].tags).toEqual([
      { name: "News", color: "#3498db" },
    ]);
  });

  it("strips the tag from folder auto-tags, including nested folders", () => {
    const settings = makeSettings();

    deleteTagFromSettings(settings, "Video");

    expect(settings.folders[0].autoTags).toEqual([
      { name: "News", color: "#3498db" },
    ]);
    expect(settings.folders[0].subfolders[0].autoTags).toEqual([]);
  });

  it("keeps a deleted tag from returning through a folder rule", () => {
    const settings = makeSettings();
    const beforeDelete = getFolderAutoTags("Tech/Web", settings.folders);
    expect(beforeDelete.map((tag) => tag.name)).toContain("Video");

    deleteTagFromSettings(settings, "Video");

    const afterDelete = getFolderAutoTags("Tech/Web", settings.folders);
    expect(afterDelete.map((tag) => tag.name)).not.toContain("Video");
  });

  it("leaves unrelated tags and folders untouched", () => {
    const settings = makeSettings();

    deleteTagFromSettings(settings, "News");

    expect(settings.folders[0].autoTags).toEqual([
      { name: "Video", color: "#d04747" },
    ]);
    expect(settings.folders[0].subfolders[0].autoTags).toEqual([
      { name: "Video", color: "#d04747" },
    ]);
  });
});

describe("updateTagInSettings", () => {
  it("renames the definition, article assignments, and folder rules at every depth", () => {
    const settings = makeSettings();

    updateTagInSettings(
      settings,
      { name: "Video", color: "#d04747" },
      { name: "Videos", color: "#00ff00" },
    );

    expect(settings.availableTags).toEqual([
      { name: "Videos", color: "#00ff00" },
      { name: "News", color: "#3498db" },
    ]);
    expect(settings.folders[0].autoTags).toEqual([
      { name: "Videos", color: "#00ff00" },
      { name: "News", color: "#3498db" },
    ]);
    expect(settings.folders[0].subfolders[0].autoTags).toEqual([
      { name: "Videos", color: "#00ff00" },
    ]);
    expect(settings.feeds[0].customTags).toEqual(["Videos", "News"]);
    expect(settings.feeds[1].customTags).toEqual(["News"]);
    expect(settings.dashboardMultiFilters.tagFilters).toEqual(["News"]);
  });

  it("keeps a renamed folder rule applying to the same tag", () => {
    const settings = makeSettings();

    updateTagInSettings(
      settings,
      { name: "Video", color: "#d04747" },
      { name: "Videos", color: "#d04747" },
    );

    expect(
      getFolderAutoTags("Tech/Web", settings.folders).map((tag) => tag.name),
    ).toEqual(["Videos", "News"]);
  });

  it("renames every Auto tagging default tag list and legacy single value", () => {
    const settings = makeSettings();

    updateTagInSettings(
      settings,
      { name: "Video", color: "#d04747" },
      { name: "Videos", color: "#00ff00" },
    );

    expect(settings.media.defaultVideoTag).toBe("Videos");
    expect(settings.media.defaultVideoTags).toEqual(["Videos"]);
    expect(settings.media.defaultYouTubeTag).toBe("Videos");
    expect(settings.media.defaultYouTubeTags).toEqual(["Videos", "News"]);
    expect(settings.media.defaultPodcastTags).toEqual(["Videos"]);
    expect(settings.media.defaultRssTag).toBe("Videos");
    expect(settings.media.defaultRssTags).toEqual(["Videos"]);
    expect(settings.media.defaultSmallwebTag).toBe("Videos");
    expect(settings.media.defaultSmallwebTags).toEqual(["Videos"]);
    expect(settings.media.defaultMastodonTag).toBe("Videos");
    expect(settings.media.defaultMastodonTags).toEqual(["Videos"]);
  });

  it("recolors folder rules without renaming them when only the color changes", () => {
    const settings = makeSettings();

    updateTagInSettings(
      settings,
      { name: "Video", color: "#d04747" },
      { color: "#00ff00" },
    );

    expect(settings.folders[0].autoTags).toEqual([
      { name: "Video", color: "#00ff00" },
      { name: "News", color: "#3498db" },
    ]);
    expect(settings.folders[0].subfolders[0].autoTags).toEqual([
      { name: "Video", color: "#00ff00" },
    ]);
    expect(settings.media.defaultVideoTag).toBe("Video");
    expect(settings.media.defaultVideoTags).toEqual(["Video"]);
    expect(settings.feeds[0].customTags).toEqual(["Video", "News"]);
    expect(settings.dashboardMultiFilters.tagFilters).toEqual([
      "Video",
      "News",
    ]);
  });

  it("leaves other tags, folder rules, and default lists untouched", () => {
    const settings = makeSettings();

    updateTagInSettings(
      settings,
      { name: "Video", color: "#d04747" },
      { name: "Videos", color: "#00ff00" },
    );

    expect(settings.folders[0].autoTags?.[1]).toEqual({
      name: "News",
      color: "#3498db",
    });
    expect(settings.media.defaultYouTubeTags).toEqual(["Videos", "News"]);
    expect(settings.feeds[1].customTags).toEqual(["News"]);
  });

  it("applies a renamed folder rule to new articles on the next parse", () => {
    const settings = makeSettings();

    updateTagInSettings(
      settings,
      { name: "Video", color: "#d04747" },
      { name: "Videos", color: "#d04747" },
    );
    settings.media.defaultRssTag = "";
    settings.media.defaultRssTags = [];

    const parsed = MediaService.applyMediaTags(
      {
        url: "https://a.example/feed",
        folder: "Tech",
        customTags: [],
        items: [makeItem()],
      } as unknown as Feed,
      settings.availableTags,
      settings.media,
      settings.folders,
    );
    const names = (parsed.items[0].tags ?? []).map((tag) => tag.name);

    expect(names).toContain("Videos");
    expect(names).not.toContain("Video");
  });

  it("keeps a renamed per-feed custom tag applying on the next parse", () => {
    const settings = makeSettings();

    updateTagInSettings(
      settings,
      { name: "Video", color: "#d04747" },
      { name: "Videos", color: "#d04747" },
    );
    settings.media.defaultRssTag = "";
    settings.media.defaultRssTags = [];

    const parsed = MediaService.applyMediaTags(
      {
        url: "https://a.example/feed",
        folder: "",
        customTags: settings.feeds[0].customTags,
        items: [makeItem()],
      } as unknown as Feed,
      settings.availableTags,
      settings.media,
      settings.folders,
    );
    const names = (parsed.items[0].tags ?? []).map((tag) => tag.name);

    expect(names).toContain("Videos");
    expect(names).not.toContain("Video");
  });

  it("trims the new name everywhere it is stored", () => {
    const settings = makeSettings();

    updateTagInSettings(
      settings,
      { name: "Video", color: "#d04747" },
      { name: "  Videos  " },
    );

    expect(settings.availableTags[0].name).toBe("Videos");
    expect(settings.feeds[0].items[0].tags?.[0].name).toBe("Videos");
    expect(settings.folders[0].autoTags?.[0].name).toBe("Videos");
    expect(settings.feeds[0].customTags?.[0]).toBe("Videos");
    expect(settings.media.defaultVideoTag).toBe("Videos");
  });
});
