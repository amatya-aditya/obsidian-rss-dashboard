import { describe, it, expect } from "vitest";
import type { Folder } from "../../../src/types/types";
import { removeFolderByPath } from "../../../src/utils/folder-tree";

function folder(name: string, subfolders: Folder[] = []): Folder {
  return { name, createdAt: 0, modifiedAt: 0, subfolders };
}

describe("removeFolderByPath()", () => {
  it("removes a deep leaf (A/B/C) and preserves siblings", () => {
    const input: Folder[] = [
      folder("A", [folder("B", [folder("C"), folder("C2")]), folder("D")]),
      folder("X"),
    ];

    const result = removeFolderByPath(input, "A/B/C");

    expect(result).toEqual([
      folder("A", [folder("B", [folder("C2")]), folder("D")]),
      folder("X"),
    ]);
  });

  it("removes a mid node (A/B) and its subtree", () => {
    const input: Folder[] = [
      folder("A", [folder("B", [folder("C")]), folder("D")]),
      folder("X"),
    ];

    const result = removeFolderByPath(input, "A/B");

    expect(result).toEqual([folder("A", [folder("D")]), folder("X")]);
  });

  it("removes a top-level folder (A)", () => {
    const input: Folder[] = [folder("A", [folder("B")]), folder("X")];
    expect(removeFolderByPath(input, "A")).toEqual([folder("X")]);
  });

  it("returns the original structure when path is not found", () => {
    const input: Folder[] = [folder("A", [folder("B")]), folder("X")];
    expect(removeFolderByPath(input, "A/Z")).toEqual(input);
  });
});

