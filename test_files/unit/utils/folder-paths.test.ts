import { describe, it, expect } from "vitest";
import type { Folder } from "../../../src/types/types";
import {
  collectFolderPaths,
  findSelectedAncestorFolder,
  trimSurroundingSlashes,
} from "../../../src/utils/folder-paths";

describe("collectFolderPaths()", () => {
  it("collects nested folder paths in traversal order by default", () => {
    const folders: Folder[] = [
      {
        name: "Z",
        createdAt: 0,
        modifiedAt: 0,
        subfolders: [],
      },
      {
        name: "A",
        createdAt: 0,
        modifiedAt: 0,
        subfolders: [
          {
            name: "B",
            createdAt: 0,
            modifiedAt: 0,
            subfolders: [
              { name: "C", createdAt: 0, modifiedAt: 0, subfolders: [] },
            ],
          },
        ],
      },
    ];

    expect(collectFolderPaths(folders)).toEqual(["Z", "A", "A/B", "A/B/C"]);
  });

  it("sorts paths when sort:true is provided", () => {
    const folders: Folder[] = [
      {
        name: "Z",
        createdAt: 0,
        modifiedAt: 0,
        subfolders: [],
      },
      {
        name: "A",
        createdAt: 0,
        modifiedAt: 0,
        subfolders: [
          { name: "B", createdAt: 0, modifiedAt: 0, subfolders: [] },
        ],
      },
    ];

    expect(collectFolderPaths(folders, { sort: true })).toEqual([
      "A",
      "A/B",
      "Z",
    ]);
  });

  it("returns [] for empty input", () => {
    expect(collectFolderPaths([])).toEqual([]);
  });
});

describe("trimSurroundingSlashes()", () => {
  it("removes only leading and trailing slashes", () => {
    expect(trimSurroundingSlashes("//a//b//")).toBe("a//b");
    expect(trimSurroundingSlashes("a")).toBe("a");
    expect(trimSurroundingSlashes("///")).toBe("");
    expect(trimSurroundingSlashes("")).toBe("");
  });
});

describe("findSelectedAncestorFolder()", () => {
  it("returns the folder itself when it is selected", () => {
    expect(findSelectedAncestorFolder("News", ["News"])).toBe("News");
  });

  it("returns the nearest selected ancestor of a nested folder", () => {
    expect(
      findSelectedAncestorFolder("News/Tech/Releases", ["News", "News/Tech"]),
    ).toBe("News/Tech");
  });

  it("returns null when no ancestor is selected or the path is empty", () => {
    expect(findSelectedAncestorFolder("News/Tech", ["Videos"])).toBeNull();
    expect(findSelectedAncestorFolder("", ["News"])).toBeNull();
  });
});
