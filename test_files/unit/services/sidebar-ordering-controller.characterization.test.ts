import { describe, expect, it } from "vitest";
import { moveFolder } from "../../../src/services/sidebar-ordering-controller";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type Folder,
  type RssDashboardSettings,
} from "../../../src/types/types";

/**
 * Characterization tests for `moveFolder`, pinned before extracting it into
 * `src/services/sidebar-folder-move.ts` (#1163). They describe the observable
 * result: the returned `OperationResult`/`newPath`, the mutated folder tree,
 * and the feed / collapsed-folder / per-folder sort-order remapping.
 */

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeFeed(title: string, url: string, folder = ""): Feed {
  return { title, url, folder, items: [], lastUpdated: 0 };
}

function makeFolder(name: string, subfolders: Folder[] = []): Folder {
  return { name, subfolders };
}

/** A folder whose `subfolders` is absent at runtime, as legacy data can be. */
function folderWithoutSubfolders(name: string): Folder {
  return { name } as Folder;
}

function settingsWith(opts: {
  folders?: Folder[];
  feeds?: Feed[];
  collapsedFolders?: string[];
  folderFeedSortOrders?: RssDashboardSettings["folderFeedSortOrders"];
}): RssDashboardSettings {
  const settings = cloneSettings();
  settings.folders = opts.folders ?? [];
  settings.feeds = opts.feeds ?? [];
  settings.collapsedFolders = opts.collapsedFolders ?? [];
  if ("folderFeedSortOrders" in opts) {
    settings.folderFeedSortOrders = opts.folderFeedSortOrders;
  }
  return settings;
}

function folderNames(folders: Folder[] | undefined): string[] {
  return (folders ?? []).map((f) => f.name);
}

describe("moveFolder guards", () => {
  it("rejects a drop with no dragged folder path", () => {
    const settings = settingsWith({ folders: [makeFolder("A", [])] });

    const result = moveFolder(settings, {
      draggedPath: "",
      targetPath: "A",
      placement: "before",
    });

    expect(result).toEqual({
      ok: false,
      error: "Missing dragged folder path.",
    });
  });

  it("rejects a non-rootAppend drop with no target folder path", () => {
    const settings = settingsWith({
      folders: [makeFolder("A", []), makeFolder("B", [])],
    });

    const result = moveFolder(settings, {
      draggedPath: "A",
      targetPath: "",
      placement: "nest",
    });

    expect(result).toEqual({ ok: false, error: "Missing target folder path." });
  });

  it("rejects moving a folder into itself", () => {
    const settings = settingsWith({
      folders: [makeFolder("A", []), makeFolder("B", [])],
    });

    const result = moveFolder(settings, {
      draggedPath: "A",
      targetPath: "A",
      placement: "nest",
    });

    expect(result).toEqual({
      ok: false,
      error: "Cannot move a folder into itself or a descendant.",
    });
  });

  it("rejects moving a folder into its own descendant", () => {
    const settings = settingsWith({
      folders: [makeFolder("A", [makeFolder("X", [])])],
    });

    const result = moveFolder(settings, {
      draggedPath: "A",
      targetPath: "A/X",
      placement: "nest",
    });

    expect(result).toEqual({
      ok: false,
      error: "Cannot move a folder into itself or a descendant.",
    });
  });

  it("rejects an unknown dragged folder", () => {
    const settings = settingsWith({ folders: [makeFolder("A", [])] });

    const result = moveFolder(settings, {
      draggedPath: "Z",
      targetPath: "A",
      placement: "after",
    });

    expect(result).toEqual({ ok: false, error: "Dragged folder not found." });
  });

  it("rejects an unknown target folder", () => {
    const settings = settingsWith({ folders: [makeFolder("A", [])] });

    const result = moveFolder(settings, {
      draggedPath: "A",
      targetPath: "Z",
      placement: "before",
    });

    expect(result).toEqual({ ok: false, error: "Target folder not found." });
  });

  it("rejects a duplicate sibling name at the destination, leaving the tree untouched", () => {
    const folders = [
      makeFolder("A", []),
      makeFolder("B", [makeFolder("A", [])]),
    ];
    const settings = settingsWith({ folders });
    const before = JSON.parse(JSON.stringify(folders)) as Folder[];

    const result = moveFolder(settings, {
      draggedPath: "A",
      targetPath: "B",
      placement: "nest",
    });

    expect(result).toEqual({
      ok: false,
      error: 'A folder named "A" already exists at the destination level.',
    });
    expect(settings.folders).toEqual(before);
  });

  it("does not treat the dragged folder itself as a duplicate", () => {
    const settings = settingsWith({
      folders: [makeFolder("A", []), makeFolder("B", [])],
    });

    const result = moveFolder(settings, {
      draggedPath: "A",
      targetPath: "B",
      placement: "before",
    });

    expect(result).toEqual({ ok: true, newPath: "A" });
    expect(folderNames(settings.folders)).toEqual(["A", "B"]);
  });
});

describe("moveFolder placement", () => {
  it("appends to the root and keeps the path when it does not change", () => {
    const settings = settingsWith({
      folders: [makeFolder("A", [makeFolder("X", [])]), makeFolder("B", [])],
      feeds: [
        makeFeed("one", "f1", "A"),
        makeFeed("two", "f2", "A/X"),
        makeFeed("three", "f3", "B"),
      ],
      collapsedFolders: ["A", "A/X"],
      folderFeedSortOrders: {
        "A/X": { by: "name", ascending: true },
      },
    });

    const result = moveFolder(settings, {
      draggedPath: "A",
      targetPath: "",
      placement: "rootAppend",
    });

    expect(result).toEqual({ ok: true, newPath: "A" });
    expect(folderNames(settings.folders)).toEqual(["B", "A"]);
    expect(settings.feeds.map((f) => f.folder)).toEqual(["A", "A/X", "B"]);
    expect(settings.collapsedFolders).toEqual(["A", "A/X"]);
    expect(settings.folderFeedSortOrders).toEqual({
      "A/X": { by: "name", ascending: true },
    });
    expect(settings.folderSortOrder?.by).toBe("custom");
  });

  it("nests into a target that already has subfolders", () => {
    const settings = settingsWith({
      folders: [makeFolder("A", []), makeFolder("B", [makeFolder("X", [])])],
    });

    const result = moveFolder(settings, {
      draggedPath: "A",
      targetPath: "B",
      placement: "nest",
    });

    expect(result).toEqual({ ok: true, newPath: "B/A" });
    expect(folderNames(settings.folders)).toEqual(["B"]);
    expect(folderNames(settings.folders[0]?.subfolders)).toEqual(["X", "A"]);
  });

  it("creates a subfolders array when the nest target has none", () => {
    const settings = settingsWith({
      folders: [makeFolder("A", []), folderWithoutSubfolders("B")],
    });

    const result = moveFolder(settings, {
      draggedPath: "A",
      targetPath: "B",
      placement: "nest",
    });

    expect(result).toEqual({ ok: true, newPath: "B/A" });
    expect(folderNames(settings.folders)).toEqual(["B"]);
    const nested = settings.folders[0]?.subfolders;
    expect(folderNames(nested)).toEqual(["A"]);
    expect(Array.isArray(nested)).toBe(true);
  });

  it("inserts before a sibling in the same parent", () => {
    const settings = settingsWith({
      folders: [makeFolder("A", []), makeFolder("B", []), makeFolder("C", [])],
    });

    const result = moveFolder(settings, {
      draggedPath: "C",
      targetPath: "A",
      placement: "before",
    });

    expect(result).toEqual({ ok: true, newPath: "C" });
    expect(folderNames(settings.folders)).toEqual(["C", "A", "B"]);
  });

  it("shifts the insert index when inserting after a sibling in the same parent", () => {
    const settings = settingsWith({
      folders: [makeFolder("A", []), makeFolder("B", []), makeFolder("C", [])],
    });

    const result = moveFolder(settings, {
      draggedPath: "A",
      targetPath: "B",
      placement: "after",
    });

    expect(result).toEqual({ ok: true, newPath: "A" });
    expect(folderNames(settings.folders)).toEqual(["B", "A", "C"]);
  });

  it("moves a nested folder out to a different parent", () => {
    const settings = settingsWith({
      folders: [makeFolder("A", [makeFolder("X", [])]), makeFolder("B", [])],
    });

    const result = moveFolder(settings, {
      draggedPath: "A/X",
      targetPath: "B",
      placement: "before",
    });

    expect(result).toEqual({ ok: true, newPath: "X" });
    expect(folderNames(settings.folders)).toEqual(["A", "X", "B"]);
    expect(folderNames(settings.folders[0]?.subfolders)).toEqual([]);
  });

  it("switches the folder sort order to custom, preserving the previous direction", () => {
    const settings = settingsWith({
      folders: [makeFolder("A", []), makeFolder("B", [])],
    });
    settings.folderSortOrder = { by: "name", ascending: false };

    moveFolder(settings, {
      draggedPath: "A",
      targetPath: "B",
      placement: "before",
    });

    expect(settings.folderSortOrder).toEqual({
      by: "custom",
      ascending: false,
    });
  });

  it("nests a folder into a non-root target", () => {
    const settings = settingsWith({
      folders: [makeFolder("A", [makeFolder("X", []), makeFolder("Y", [])])],
    });

    const result = moveFolder(settings, {
      draggedPath: "A/Y",
      targetPath: "A/X",
      placement: "nest",
    });

    expect(result).toEqual({ ok: true, newPath: "A/X/Y" });
    expect(folderNames(settings.folders[0]?.subfolders)).toEqual(["X"]);
    expect(
      folderNames(settings.folders[0]?.subfolders?.[0]?.subfolders),
    ).toEqual(["Y"]);
  });
});

describe("moveFolder path remapping", () => {
  it("remaps feeds, collapsed folders and sort-order keys when the path changes", () => {
    const settings = settingsWith({
      folders: [
        makeFolder("A", [makeFolder("X", [makeFolder("Y", [])])]),
        makeFolder("B", []),
      ],
      feeds: [
        makeFeed("a", "f-a", "A"),
        makeFeed("x", "f-x", "A/X"),
        makeFeed("y", "f-y", "A/X/Y"),
        makeFeed("other", "f-other", "Other"),
        makeFeed("root", "f-root", ""),
      ],
      collapsedFolders: ["A", "A/X", "Z"],
      folderFeedSortOrders: {
        "A/X/Y": { by: "name", ascending: true },
        Other: { by: "created", ascending: false },
      },
    });

    const result = moveFolder(settings, {
      draggedPath: "A",
      targetPath: "B",
      placement: "nest",
    });

    expect(result).toEqual({ ok: true, newPath: "B/A" });
    expect(folderNames(settings.folders)).toEqual(["B"]);
    expect(folderNames(settings.folders[0]?.subfolders)).toEqual(["A"]);
    expect(settings.feeds.map((f) => f.folder)).toEqual([
      "B/A",
      "B/A/X",
      "B/A/X/Y",
      "Other",
      "",
    ]);
    expect(settings.collapsedFolders).toEqual(["B/A", "B/A/X", "Z"]);
    expect(settings.folderFeedSortOrders).toEqual({
      "B/A/X/Y": { by: "name", ascending: true },
      Other: { by: "created", ascending: false },
    });
    expect(settings.folderSortOrder?.by).toBe("custom");
  });

  it("remaps feed folders in place, preserving the feed object identity", () => {
    const feed = makeFeed("x", "f-x", "A/X");
    const settings = settingsWith({
      folders: [makeFolder("A", [makeFolder("X", [])]), makeFolder("B", [])],
      feeds: [feed],
    });

    moveFolder(settings, {
      draggedPath: "A",
      targetPath: "B",
      placement: "nest",
    });

    expect(settings.feeds[0]).toBe(feed);
    expect(feed.folder).toBe("B/A/X");
  });

  it("leaves collapsedFolders as an empty array when it was absent", () => {
    const settings = settingsWith({
      folders: [makeFolder("A", []), makeFolder("B", [])],
    });
    settings.collapsedFolders = undefined as unknown as string[];

    moveFolder(settings, {
      draggedPath: "A",
      targetPath: "B",
      placement: "nest",
    });

    expect(settings.collapsedFolders).toEqual([]);
  });

  it("leaves folderFeedSortOrders untouched when it is absent", () => {
    const settings = settingsWith({
      folders: [makeFolder("A", []), makeFolder("B", [])],
    });
    settings.folderFeedSortOrders = undefined;

    moveFolder(settings, {
      draggedPath: "A",
      targetPath: "B",
      placement: "nest",
    });

    expect(settings.folderFeedSortOrders).toBeUndefined();
  });

  it("moves a nested folder after a root sibling and drops its old prefix", () => {
    const settings = settingsWith({
      folders: [
        makeFolder("A", [makeFolder("X", [])]),
        makeFolder("B", []),
        makeFolder("C", []),
      ],
      feeds: [makeFeed("x", "f-x", "A/X")],
      collapsedFolders: ["A/X"],
      folderFeedSortOrders: {
        "A/X": { by: "name", ascending: true },
      },
    });

    const result = moveFolder(settings, {
      draggedPath: "A/X",
      targetPath: "C",
      placement: "after",
    });

    expect(result).toEqual({ ok: true, newPath: "X" });
    expect(folderNames(settings.folders)).toEqual(["A", "B", "C", "X"]);
    expect(folderNames(settings.folders[0]?.subfolders)).toEqual([]);
    expect(settings.feeds.map((f) => f.folder)).toEqual(["X"]);
    expect(settings.collapsedFolders).toEqual(["X"]);
    expect(settings.folderFeedSortOrders).toEqual({
      X: { by: "name", ascending: true },
    });
  });

  it("appends a nested folder to the root, dropping its old prefix", () => {
    const settings = settingsWith({
      folders: [makeFolder("A", [makeFolder("X", [])]), makeFolder("B", [])],
      feeds: [makeFeed("x", "f-x", "A/X")],
      collapsedFolders: ["A/X"],
    });

    const result = moveFolder(settings, {
      draggedPath: "A/X",
      targetPath: "",
      placement: "rootAppend",
    });

    expect(result).toEqual({ ok: true, newPath: "X" });
    expect(folderNames(settings.folders)).toEqual(["A", "B", "X"]);
    expect(settings.feeds.map((f) => f.folder)).toEqual(["X"]);
    expect(settings.collapsedFolders).toEqual(["X"]);
  });
});
