import { describe, expect, it } from "vitest";
import {
  moveFeedAndInsert,
  moveFeedToFolderAppend,
  moveFolder,
  setFolderFeedSortCustom,
  setFolderSortCustom,
} from "../../../src/services/sidebar-ordering-controller";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type Folder,
  type RssDashboardSettings,
} from "../../../src/types/types";

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeFeed(title: string, url: string, folder: unknown = ""): Feed {
  return { title, url, folder, items: [], lastUpdated: 0 } as Feed;
}

function folder(name: string, subfolders: Folder[] = []): Folder {
  return { name, subfolders };
}

describe("sidebar-ordering-controller helpers", () => {
  it("setFolderFeedSortCustom creates map and normalizes empty folder key", () => {
    const settings = cloneSettings();
    delete settings.folderFeedSortOrders;

    setFolderFeedSortCustom(settings, undefined as unknown as string);
    const updatedSettings = settings as RssDashboardSettings;
    expect(updatedSettings.folderFeedSortOrders).toBeTruthy();
    expect(updatedSettings.folderFeedSortOrders?.[""]?.by).toBe("custom");
  });

  it("setFolderSortCustom switches to custom and preserves ascending", () => {
    const settings = cloneSettings();
    settings.folderSortOrder = { by: "name", ascending: false };
    setFolderSortCustom(settings);
    expect(settings.folderSortOrder).toEqual({ by: "custom", ascending: false });
  });
});

describe("moveFeedAndInsert", () => {
  it("rejects missing urls and no-op drops", () => {
    const settings = cloneSettings();
    settings.feeds = [makeFeed("A", "a", "Work"), makeFeed("B", "b", "Work")];

    expect(
      moveFeedAndInsert(settings, { draggedUrl: "", targetUrl: "b", placement: "before" }),
    ).toEqual({ ok: false, error: "Missing feed urls." });

    expect(
      moveFeedAndInsert(settings, { draggedUrl: "a", targetUrl: "", placement: "before" }),
    ).toEqual({ ok: false, error: "Missing feed urls." });

    expect(
      moveFeedAndInsert(settings, { draggedUrl: "a", targetUrl: "a", placement: "before" }),
    ).toEqual({ ok: false, error: "No-op drop." });
  });

  it("rejects when dragged or target feed is missing", () => {
    const settings = cloneSettings();
    settings.feeds = [makeFeed("A", "a", "Work")];

    expect(
      moveFeedAndInsert(settings, { draggedUrl: "missing", targetUrl: "a", placement: "before" }),
    ).toEqual({ ok: false, error: "Dragged feed not found." });

    expect(
      moveFeedAndInsert(settings, { draggedUrl: "a", targetUrl: "missing", placement: "before" }),
    ).toEqual({ ok: false, error: "Target feed not found." });
  });

  it("moves the dragged feed into the target folder and inserts before/after", () => {
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("A", "a", "Work"),
      makeFeed("B", "b", "Home"),
      makeFeed("C", "c", "Home"),
    ];

    const before = moveFeedAndInsert(settings, {
      draggedUrl: "a",
      targetUrl: "b",
      placement: "before",
    });

    expect(before.ok).toBe(true);
    expect(settings.feeds.map((f) => f.url)).toEqual(["a", "b", "c"]);
    expect(settings.feeds.find((f) => f.url === "a")?.folder).toBe("Home");
    expect(settings.folderFeedSortOrders?.["Home"]?.by).toBe("custom");

    const after = moveFeedAndInsert(settings, {
      draggedUrl: "a",
      targetUrl: "c",
      placement: "after",
    });

    expect(after.ok).toBe(true);
    expect(settings.feeds.map((f) => f.url)).toEqual(["b", "c", "a"]);
  });

  it("normalizes undefined target folder to root (empty string) and writes sort key", () => {
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("Dragged", "d", "SomeFolder"),
      makeFeed("Target", "t", undefined),
    ];

    const result = moveFeedAndInsert(settings, {
      draggedUrl: "d",
      targetUrl: "t",
      placement: "before",
    });

    expect(result.ok).toBe(true);
    expect(settings.feeds.find((f) => f.url === "d")?.folder).toBe("");
    expect(settings.folderFeedSortOrders?.[""]?.by).toBe("custom");
  });
});

describe("moveFeedToFolderAppend", () => {
  it("rejects missing dragged url and missing dragged feed", () => {
    const settings = cloneSettings();
    settings.feeds = [makeFeed("A", "a", "Work")];

    expect(
      moveFeedToFolderAppend(settings, { draggedUrl: "", destinationFolderPath: "Work" }),
    ).toEqual({ ok: false, error: "Missing dragged feed url." });

    expect(
      moveFeedToFolderAppend(settings, { draggedUrl: "missing", destinationFolderPath: "Work" }),
    ).toEqual({ ok: false, error: "Dragged feed not found." });
  });

  it("moves and appends after the last feed in the destination folder", () => {
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("A", "a", "Work"),
      makeFeed("B", "b", "Home"),
      makeFeed("C", "c", "Home"),
      makeFeed("D", "d", "Work"),
    ];

    const result = moveFeedToFolderAppend(settings, {
      draggedUrl: "a",
      destinationFolderPath: "Home",
    });

    expect(result.ok).toBe(true);
    expect(settings.feeds.find((f) => f.url === "a")?.folder).toBe("Home");
    expect(settings.feeds.map((f) => f.url)).toEqual(["b", "c", "a", "d"]);
    expect(settings.folderFeedSortOrders?.["Home"]?.by).toBe("custom");
  });
});

describe("moveFolder", () => {
  it("rejects missing required inputs and invalid nesting", () => {
    const settings = cloneSettings();
    settings.folders = [folder("Alpha", [folder("Child")])];
    settings.feeds = [];

    expect(
      moveFolder(settings, { draggedPath: "", targetPath: "Alpha", placement: "before" }),
    ).toEqual({ ok: false, error: "Missing dragged folder path." });

    expect(
      moveFolder(settings, { draggedPath: "Alpha", targetPath: "", placement: "before" }),
    ).toEqual({ ok: false, error: "Missing target folder path." });

    expect(
      moveFolder(settings, { draggedPath: "Alpha", targetPath: "Alpha/Child", placement: "nest" }),
    ).toEqual({
      ok: false,
      error: "Cannot move a folder into itself or a descendant.",
    });
  });

  it("rejects when dragged or target folder is not found", () => {
    const settings = cloneSettings();
    settings.folders = [folder("Alpha"), folder("Beta")];
    settings.feeds = [];

    expect(
      moveFolder(settings, { draggedPath: "Missing", targetPath: "Beta", placement: "nest" }),
    ).toEqual({ ok: false, error: "Dragged folder not found." });

    expect(
      moveFolder(settings, { draggedPath: "Alpha", targetPath: "Missing", placement: "nest" }),
    ).toEqual({ ok: false, error: "Target folder not found." });
  });

  it("rejects duplicate sibling names at destination", () => {
    const settings = cloneSettings();
    settings.folders = [
      folder("Alpha"),
      folder("Beta", [folder("Alpha")]),
    ];
    settings.feeds = [];

    const result = moveFolder(settings, {
      draggedPath: "Alpha",
      targetPath: "Beta",
      placement: "nest",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('A folder named "Alpha" already exists');
  });

  it("moves within root and adjusts insertion index when moving forward", () => {
    const settings = cloneSettings();
    settings.folders = [folder("A"), folder("B"), folder("C")];
    settings.feeds = [];

    const result = moveFolder(settings, {
      draggedPath: "A",
      targetPath: "C",
      placement: "after",
    });

    expect(result.ok).toBe(true);
    expect(settings.folders.map((f) => f.name)).toEqual(["B", "C", "A"]);
    expect(settings.folderSortOrder?.by).toBe("custom");
    expect(result.newPath).toBe("A");
  });

  it("nests into target and remaps feeds + collapsedFolders + sort keys", () => {
    const settings = cloneSettings();
    settings.folders = [
      folder("Alpha", [folder("Child")]),
      folder("Beta"),
    ];
    settings.feeds = [
      makeFeed("Feed", "f", "Alpha/Child"),
      makeFeed("Other", "o", "Beta"),
    ];
    settings.collapsedFolders = ["Alpha", "Alpha/Child"];
    settings.folderFeedSortOrders = {
      "Alpha/Child": { by: "name", ascending: true },
    };

    const result = moveFolder(settings, {
      draggedPath: "Alpha",
      targetPath: "Beta",
      placement: "nest",
    });

    expect(result.ok).toBe(true);
    expect(result.newPath).toBe("Beta/Alpha");
    expect(settings.feeds.find((f) => f.url === "f")?.folder).toBe("Beta/Alpha/Child");
    expect(settings.collapsedFolders).toEqual(["Beta/Alpha", "Beta/Alpha/Child"]);
    expect(settings.folderFeedSortOrders?.["Beta/Alpha/Child"]?.by).toBe("name");
    expect(settings.folderFeedSortOrders?.["Alpha/Child"]).toBeUndefined();
    expect(settings.folderSortOrder?.by).toBe("custom");
  });
});

