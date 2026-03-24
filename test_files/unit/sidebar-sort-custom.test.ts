import { describe, it, expect } from "vitest";
import { applyFeedSortOrder } from "../../src/utils/sidebar-sort-utils";
import { applyFolderSortOrder } from "../../src/utils/sidebar-folder-sort-utils";
import type { Feed, Folder } from "../../src/types/types";

function makeFeed(title: string, folder = ""): Feed {
  return {
    title,
    url: `https://example.com/${encodeURIComponent(title)}`,
    folder,
    items: [],
    lastUpdated: 0,
  };
}

describe("Sidebar Custom sort mode (TDD)", () => {
  it("keeps feed order when by=custom", () => {
    const a = makeFeed("A");
    const b = makeFeed("B");
    const c = makeFeed("C");
    const input = [a, b, c];

    const sorted = applyFeedSortOrder(input, { by: "custom", ascending: true });
    expect(sorted.map((f) => f.title)).toEqual(["A", "B", "C"]);
  });

  it("keeps folder sibling order when by=custom, while still rendering pinned first", () => {
    const folders: Folder[] = [
      { name: "Unpinned-1", subfolders: [] },
      { name: "Pinned-1", subfolders: [], pinned: true },
      { name: "Pinned-2", subfolders: [], pinned: true },
      { name: "Unpinned-2", subfolders: [] },
    ];

    const result = applyFolderSortOrder(folders, {
      by: "custom",
      ascending: true,
    });

    expect(result.map((f) => f.name)).toEqual([
      "Pinned-1",
      "Pinned-2",
      "Unpinned-1",
      "Unpinned-2",
    ]);
  });
});

