import { describe, it, expect } from "vitest";
import { moveFolder } from "../../src/services/sidebar-ordering-controller";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
  type Feed,
  type Folder,
} from "../../src/types/types";

function makeSettings(
  folders: Folder[],
  feeds: Feed[],
  collapsedFolders: string[] = [],
): RssDashboardSettings {
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
  settings.folders = folders;
  settings.feeds = feeds;
  settings.collapsedFolders = collapsedFolders;
  settings.folderFeedSortOrders = {
    "Alpha/Child": { by: "name", ascending: true },
  };
  return settings;
}

function makeFeed(title: string, url: string, folder: string): Feed {
  return { title, url, folder, items: [], lastUpdated: 0 };
}

describe("Sidebar folder ordering helpers (TDD)", () => {
  it("nests a folder into another and remaps feed folders + collapsed + sort keys", () => {
    const folders: Folder[] = [
      { name: "Alpha", subfolders: [{ name: "Child", subfolders: [] }] },
      { name: "Beta", subfolders: [] },
    ];
    const feeds: Feed[] = [
      makeFeed("Feed", "f", "Alpha/Child"),
      makeFeed("Other", "o", "Beta"),
    ];
    const settings = makeSettings(folders, feeds, ["Alpha", "Alpha/Child"]);

    const result = moveFolder(settings, {
      draggedPath: "Alpha",
      targetPath: "Beta",
      placement: "nest",
    });

    expect(result.ok).toBe(true);
    expect(settings.feeds.find((f) => f.url === "f")?.folder).toBe(
      "Beta/Alpha/Child",
    );
    expect(settings.collapsedFolders).toEqual(["Beta/Alpha", "Beta/Alpha/Child"]);
    expect(settings.folderFeedSortOrders?.["Beta/Alpha/Child"]?.by).toBe("name");
    expect(settings.folderSortOrder?.by).toBe("custom");
  });

  it("rejects nesting a folder into its own descendant", () => {
    const folders: Folder[] = [
      { name: "Alpha", subfolders: [{ name: "Child", subfolders: [] }] },
    ];
    const settings = makeSettings(folders, []);

    const result = moveFolder(settings, {
      draggedPath: "Alpha",
      targetPath: "Alpha/Child",
      placement: "nest",
    });

    expect(result.ok).toBe(false);
  });
});
