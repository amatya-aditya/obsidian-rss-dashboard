import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";
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
    ],
    media: {
      ...(JSON.parse(
        JSON.stringify(DEFAULT_SETTINGS.media),
      ) as RssDashboardSettings["media"]),
      defaultVideoTag: "Video",
      defaultVideoTags: ["Video"],
      defaultYouTubeTag: "Video",
      defaultYouTubeTags: ["Video", "News"],
      defaultRssTag: "Video",
      defaultRssTags: ["Video"],
      defaultSmallwebTag: "Video",
      defaultSmallwebTags: ["Video"],
      defaultMastodonTag: "Video",
      defaultMastodonTags: ["Video"],
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
    expect(settings.media.defaultPodcastTags).toEqual(
      DEFAULT_SETTINGS.media.defaultPodcastTags,
    );
  });
});
