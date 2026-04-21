import { describe, it, expect } from "vitest";
import {
  moveFolder,
  moveFeedAndInsert,
  moveFeedToFolderAppend,
} from "../../../src/services/sidebar-ordering-controller";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
  type Feed,
  type Folder,
} from "../../../src/types/types";

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

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeFeed(title: string, url: string, folder = ""): Feed {
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

describe("Sidebar feed ordering helpers (TDD)", () => {
  it("reorders within the same folder and switches that folder to custom", () => {
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("A", "a", "Work"),
      makeFeed("B", "b", "Work"),
      makeFeed("C", "c", "Work"),
    ];

    const result = moveFeedAndInsert(settings, {
      draggedUrl: "c",
      targetUrl: "a",
      placement: "before",
    });

    expect(result.ok).toBe(true);
    expect(settings.feeds.map((f) => f.url)).toEqual(["c", "a", "b"]);
    expect(settings.folderFeedSortOrders?.["Work"]?.by).toBe("custom");
  });

  it("moves into another folder and appends, switching destination to custom", () => {
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("A", "a", "Work"),
      makeFeed("B", "b", "Home"),
      makeFeed("C", "c", "Home"),
    ];

    const result = moveFeedToFolderAppend(settings, {
      draggedUrl: "a",
      destinationFolderPath: "Home",
    });

    expect(result.ok).toBe(true);
    expect(settings.feeds.find((f) => f.url === "a")?.folder).toBe("Home");
    expect(settings.folderFeedSortOrders?.["Home"]?.by).toBe("custom");
  });
});
