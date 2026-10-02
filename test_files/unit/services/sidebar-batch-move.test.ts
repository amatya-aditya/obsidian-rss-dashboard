import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BATCH_MOVE_SKIPPED_NOTICE,
  batchMoveFeedsAndFolders,
  describeBatchMove,
  describeRefusedFolders,
} from "../../../src/services/sidebar-batch-move";
import type { Feed, Folder, RssDashboardSettings } from "../../../src/types/types";

const NOW = 1_700_000_000_000;

function findFolderIn(settings: RssDashboardSettings) {
  return (path: string): Folder | null => {
    let list = settings.folders;
    let found: Folder | null = null;
    for (const name of path.split("/")) {
      found = list.find((f) => f.name === name) ?? null;
      if (!found) return null;
      list = found.subfolders;
    }
    return found;
  };
}

function makeSettings(): RssDashboardSettings {
  return {
    feeds: [
      { title: "A", url: "a", folder: "One", items: [], lastUpdated: 0 },
      { title: "B", url: "b", folder: "", items: [], lastUpdated: 0 },
    ] as Feed[],
    folders: [
      { name: "One", subfolders: [{ name: "Inner", subfolders: [] }], modifiedAt: 1 },
      { name: "Two", subfolders: [], modifiedAt: 1 },
    ] as Folder[],
    collapsedFolders: [],
  } as unknown as RssDashboardSettings;
}

describe("batchMoveFeedsAndFolders", () => {
  let settings: RssDashboardSettings;

  beforeEach(() => {
    settings = makeSettings();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function run(destination: string, feedUrls: string[], folderPaths: string[] = []) {
    return batchMoveFeedsAndFolders(settings, {
      destinationFolderPath: destination,
      feedUrls,
      folderPaths,
      findFolder: findFolderIn(settings),
    });
  }

  it("moves feeds and folders and reports the counts", () => {
    const result = run("Two", ["a", "b"], ["One"]);

    expect(result).toEqual({
      movedFeeds: 2,
      movedFolders: 1,
      folders: [{ oldPath: "One", newPath: "Two/One", error: null }],
      feedMoveError: null,
    });
    expect(settings.folders.map((f) => f.name)).toEqual(["Two"]);
    expect(settings.feeds.map((f) => f.folder)).toEqual(["Two", "Two"]);
  });

  it("skips a folder dropped on itself or a descendant but moves the rest", () => {
    const result = run("One/Inner", ["b"], ["One"]);

    expect(result.folders).toEqual([
      { oldPath: "One", newPath: null, error: BATCH_MOVE_SKIPPED_NOTICE },
    ]);
    expect(result.movedFolders).toBe(0);
    expect(result.movedFeeds).toBe(1);
    expect(settings.folders.map((f) => f.name)).toEqual(["One", "Two"]);
  });

  it("records a refused folder with moveFolder's own reason (#610)", () => {
    // A root "Inner" collides with One/Inner when moved into One.
    settings.folders.push({ name: "Inner", subfolders: [], modifiedAt: 1 } as Folder);

    const result = run("One", [], ["Inner", "Ghost", "Two"]);

    expect(result.folders).toEqual([
      {
        oldPath: "Inner",
        newPath: null,
        error: 'A folder named "Inner" already exists at the destination level.',
      },
      { oldPath: "Ghost", newPath: null, error: "Dragged folder not found." },
      { oldPath: "Two", newPath: "One/Two", error: null },
    ]);
    expect(result.movedFolders).toBe(1);
  });

  it("records a subfolder dragged after its parent as moved with it, not refused", () => {
    const result = run("Two", [], ["One", "One/Inner"]);

    expect(result.folders).toEqual([
      { oldPath: "One", newPath: "Two/One", error: null },
      { oldPath: "One/Inner", newPath: "Two/One/Inner", error: null },
    ]);
    expect(result.movedFolders).toBe(1);
    expect(findFolderIn(settings)("Two/One/Inner")).not.toBeNull();
  });

  it("does not count feeds already in the destination", () => {
    const result = run("One", ["a"]);

    expect(result.movedFeeds).toBe(0);
    expect(result.feedMoveError).toBeNull();
  });

  it("stamps the folders the feeds left and the destination", () => {
    run("Two", ["a"]);

    expect(findFolderIn(settings)("One")?.modifiedAt).toBe(NOW);
    expect(findFolderIn(settings)("Two")?.modifiedAt).toBe(NOW);
  });

  it("stamps nothing for the root destination except the folders left", () => {
    run("", ["a"]);

    expect(findFolderIn(settings)("One")?.modifiedAt).toBe(NOW);
    expect(findFolderIn(settings)("Two")?.modifiedAt).toBe(1);
  });
});

describe("describeBatchMove", () => {
  it("returns null when nothing moved", () => {
    expect(describeBatchMove({ movedFeeds: 0, movedFolders: 0 }, "X")).toBeNull();
  });

  it("pluralises each count and lists feeds before folders", () => {
    expect(describeBatchMove({ movedFeeds: 1, movedFolders: 0 }, "X")).toBe(
      'Moved 1 feed to "X"',
    );
    expect(describeBatchMove({ movedFeeds: 2, movedFolders: 1 }, "A/B")).toBe(
      'Moved 2 feeds and 1 folder to "A/B"',
    );
    expect(describeBatchMove({ movedFeeds: 0, movedFolders: 3 }, "X")).toBe(
      'Moved 3 folders to "X"',
    );
  });

  it("calls the root destination 'root'", () => {
    expect(describeBatchMove({ movedFeeds: 1, movedFolders: 0 }, "")).toBe(
      "Moved 1 feed to root",
    );
  });
});

describe("describeRefusedFolders", () => {
  it("lists each distinct reason once, in the order the folders were dragged", () => {
    expect(
      describeRefusedFolders({
        folders: [
          { oldPath: "A", newPath: null, error: "Dragged folder not found." },
          { oldPath: "B", newPath: "X/B", error: null },
          { oldPath: "X", newPath: null, error: BATCH_MOVE_SKIPPED_NOTICE },
          { oldPath: "C", newPath: null, error: "Dragged folder not found." },
          { oldPath: "X/Y", newPath: null, error: BATCH_MOVE_SKIPPED_NOTICE },
        ],
      }),
    ).toEqual(["Dragged folder not found.", BATCH_MOVE_SKIPPED_NOTICE]);
  });

  it("is empty when every folder moved", () => {
    expect(
      describeRefusedFolders({
        folders: [{ oldPath: "A", newPath: "X/A", error: null }],
      }),
    ).toEqual([]);
  });
});
