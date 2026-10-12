import { describe, expect, it } from "vitest";
import type { RssDashboardSettings } from "../../../src/types/types";
import { getFolderAutoTags } from "../../../src/utils/tag-utils";
import { deleteTagFromSettings } from "../../../src/utils/tag-settings";

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
