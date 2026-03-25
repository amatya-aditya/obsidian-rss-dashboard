import { describe, it, expect } from "vitest";
import type { Folder } from "../../../src/types/types";
import { collectFolderPaths } from "../../../src/utils/folder-paths";

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
        subfolders: [{ name: "B", createdAt: 0, modifiedAt: 0, subfolders: [] }],
      },
    ];

    expect(collectFolderPaths(folders, { sort: true })).toEqual(["A", "A/B", "Z"]);
  });

  it("returns [] for empty input", () => {
    expect(collectFolderPaths([])).toEqual([]);
  });
});

