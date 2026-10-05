import { describe, it, expect } from "vitest";
import {
  getFeedDropPlacement,
  getFolderDropPlacement,
  isFeedInSelectedFolder,
  remapPathPrefix,
  resolveMovedCurrentFolder,
  toggleFolderInSelection,
} from "../../../src/utils/sidebar-row-interactions";

const box = { top: 100, height: 40 };

describe("isFeedInSelectedFolder", () => {
  it("is true when the feed's own folder is selected", () => {
    expect(isFeedInSelectedFolder("News", ["News"])).toBe(true);
  });

  it("is true when any ancestor of the feed's folder is selected", () => {
    expect(isFeedInSelectedFolder("News/Tech/Releases", ["News"])).toBe(true);
    expect(isFeedInSelectedFolder("News/Tech/Releases", ["News/Tech"])).toBe(
      true,
    );
  });

  it("is false for a descendant, a sibling or a folder that only shares a prefix", () => {
    expect(isFeedInSelectedFolder("News", ["News/Tech"])).toBe(false);
    expect(isFeedInSelectedFolder("News/Tech", ["News/Other"])).toBe(false);
    expect(isFeedInSelectedFolder("Newsletters", ["News"])).toBe(false);
  });

  it("is false for a feed in no folder, or with nothing selected", () => {
    expect(isFeedInSelectedFolder("", ["News"])).toBe(false);
    expect(isFeedInSelectedFolder(undefined, ["News"])).toBe(false);
    expect(isFeedInSelectedFolder("News", [])).toBe(false);
    expect(isFeedInSelectedFolder("News", undefined)).toBe(false);
  });
});

describe("toggleFolderInSelection", () => {
  it("adds an unselected folder after the selected ones", () => {
    expect(toggleFolderInSelection(["A"], null, "B")).toEqual(["A", "B"]);
  });

  it("removes a selected folder and keeps the others in order", () => {
    expect(toggleFolderInSelection(["A", "B", "C"], null, "B")).toEqual([
      "A",
      "C",
    ]);
  });

  it("starts from the open folder when no folder is selected", () => {
    expect(toggleFolderInSelection([], "Open", "B")).toEqual(["Open", "B"]);
    expect(toggleFolderInSelection(undefined, "Open", "Open")).toEqual([]);
  });

  it("ignores the open folder once a folder is selected", () => {
    expect(toggleFolderInSelection(["A"], "Open", "B")).toEqual(["A", "B"]);
  });

  it("starts from nothing when no folder is selected or open", () => {
    expect(toggleFolderInSelection([], null, "B")).toEqual(["B"]);
  });

  it("returns a new array and leaves its input alone", () => {
    const selected = ["A"];
    const result = toggleFolderInSelection(selected, null, "B");
    expect(result).not.toBe(selected);
    expect(selected).toEqual(["A"]);
  });
});

describe("getFolderDropPlacement", () => {
  it("puts the top quarter before, the bottom quarter after and the rest in the middle", () => {
    expect(getFolderDropPlacement(105, box)).toBe("before");
    expect(getFolderDropPlacement(135, box)).toBe("after");
    expect(getFolderDropPlacement(120, box)).toBe("nest");
  });

  it("counts the exact quarter lines as the middle", () => {
    expect(getFolderDropPlacement(110, box)).toBe("nest");
    expect(getFolderDropPlacement(130, box)).toBe("nest");
  });

  it("counts a header with no height as the middle", () => {
    expect(getFolderDropPlacement(100, { top: 100, height: 0 })).toBe("nest");
  });
});

describe("getFeedDropPlacement", () => {
  it("puts the upper half before and the lower half after", () => {
    expect(getFeedDropPlacement(110, box)).toBe("before");
    expect(getFeedDropPlacement(130, box)).toBe("after");
  });

  it("counts the exact midpoint as after", () => {
    expect(getFeedDropPlacement(120, box)).toBe("after");
  });
});

describe("remapPathPrefix", () => {
  it("rewrites the base itself and paths inside it", () => {
    expect(remapPathPrefix("A", "A", "X/A")).toBe("X/A");
    expect(remapPathPrefix("A/B/C", "A", "X/A")).toBe("X/A/B/C");
  });

  it("leaves other paths alone, including ones that only share a prefix", () => {
    expect(remapPathPrefix("AB", "A", "X/A")).toBe("AB");
    expect(remapPathPrefix("B/A", "A", "X/A")).toBe("B/A");
  });
});

describe("resolveMovedCurrentFolder", () => {
  it("remaps the open folder when it is the moved folder or inside it", () => {
    expect(resolveMovedCurrentFolder("Videos", "Videos", "News/Videos")).toBe(
      "News/Videos",
    );
    expect(
      resolveMovedCurrentFolder("Videos/Clips", "Videos", "News/Videos"),
    ).toBe("News/Videos/Clips");
  });

  it("returns null when the open folder keeps the same path", () => {
    expect(
      resolveMovedCurrentFolder("News/Tech", "News/Tech", "News/Tech"),
    ).toBe(null);
    expect(resolveMovedCurrentFolder("News/Tech/Deep", "News", "News")).toBe(
      null,
    );
  });

  it("returns null when the open folder is unaffected, or there is none", () => {
    expect(resolveMovedCurrentFolder("Videos2", "Videos", "News/Videos")).toBe(
      null,
    );
    expect(resolveMovedCurrentFolder("News", "Videos", "News/Videos")).toBe(
      null,
    );
    expect(resolveMovedCurrentFolder(null, "Videos", "News/Videos")).toBe(null);
  });
});
