import { describe, it, expect } from "vitest";
import type { Feed, Folder } from "../../../src/types/types";
import { OpmlImportPreviewModel } from "../../../src/services/opml-import-preview-model";

function makeFeed(args: { title: string; url: string; folder: string }): Feed {
  return {
    title: args.title,
    url: args.url,
    folder: args.folder,
    items: [],
    lastUpdated: 0,
  };
}

describe("OpmlImportPreviewModel", () => {
  it("builds a folder tree, defaults selection to all feeds, and tracks duplicates in update mode", () => {
    const feeds: Feed[] = [
      makeFeed({ title: "AI", url: "u1", folder: "Tech/AI" }),
      makeFeed({ title: "Tech News", url: "u2", folder: "Tech" }),
      makeFeed({ title: "Misc", url: "u3", folder: "" }),
    ];

    const folders: Folder[] = [
      { name: "Tech", subfolders: [{ name: "AI", subfolders: [] }] },
    ];

    const model = new OpmlImportPreviewModel({
      feeds,
      folders,
      importMode: "update",
      existingUrls: new Set(["u2"]),
    });

    const stats = model.getStats();
    expect(stats.totalFeeds).toBe(3);
    expect(stats.duplicateFeeds).toBe(1);
    expect(stats.selectedFeeds).toBe(3);
    expect(stats.selectedImportableFeeds).toBe(2);
    expect(stats.hasBlockingErrors).toBe(false);

    const techState = model.getFolderSelectionState("Tech");
    expect(techState.checked).toBe(true);
    expect(techState.indeterminate).toBe(false);

    model.toggleFolder("Tech", false);
    const afterToggle = model.getStats();
    expect(afterToggle.selectedFeeds).toBe(1);
    expect(afterToggle.selectedImportableFeeds).toBe(1);
  });

  it("blocks import only when invalid names are selected+importable", () => {
    const feeds: Feed[] = [
      makeFeed({ title: "AI", url: "u1", folder: "Te:ch/AI" }),
      makeFeed({ title: "Ok", url: "u2", folder: "Ok" }),
    ];

    const model = new OpmlImportPreviewModel({
      feeds,
      folders: [],
      importMode: "overwrite",
      existingUrls: new Set(),
    });

    // Invalid folder segment should block while selected
    expect(model.getStats().hasBlockingErrors).toBe(true);

    model.toggleFeed("u1", false);
    expect(model.getStats().hasBlockingErrors).toBe(false);
  });

  it("renaming a folder segment updates descendant feed folder paths and merges on collision", () => {
    const feeds: Feed[] = [
      makeFeed({ title: "A1", url: "u1", folder: "A" }),
      makeFeed({ title: "B1", url: "u2", folder: "B" }),
    ];

    const model = new OpmlImportPreviewModel({
      feeds,
      folders: [],
      importMode: "overwrite",
      existingUrls: new Set(),
    });

    model.renameFolderSegment("A", "B");

    const f1 = model.getFeed("u1");
    const f2 = model.getFeed("u2");
    expect(f1.folder).toBe("B");
    expect(f2.folder).toBe("B");

    const derivedFolders = model.getDerivedFoldersForSelectedFeeds();
    expect(derivedFolders).toHaveLength(1);
    expect(derivedFolders[0].name).toBe("B");
  });

  it("auto-fix sanitizes invalid folder names and invalid feed titles (empty/dot)", () => {
    const feeds: Feed[] = [
      makeFeed({ title: ".bad", url: "u1", folder: "Te:ch" }),
      makeFeed({ title: "Ok", url: "u2", folder: "Ok" }),
    ];

    const model = new OpmlImportPreviewModel({
      feeds,
      folders: [],
      importMode: "overwrite",
      existingUrls: new Set(),
    });

    expect(model.getStats().hasBlockingErrors).toBe(true);

    model.autoFixInvalidNames();

    const fixed = model.getFeed("u1");
    expect(fixed.folder).toBe("Te_ch");
    expect(fixed.title.startsWith(".")).toBe(false);
    expect(model.getStats().hasBlockingErrors).toBe(false);
  });
});

