import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { FolderSuggest } from "../../../src/components/folder-suggest";
import type { Folder } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function createFolders(): Folder[] {
  return [
    {
      name: "Alpha",
      subfolders: [],
    },
    {
      name: "Media",
      subfolders: [
        {
          name: "YouTube",
          subfolders: [],
        },
      ],
    },
  ];
}

function getSuggestions(
  suggest: FolderSuggest,
  query: string,
): string[] {
  return (suggest as unknown as { getSuggestions: (query: string) => string[] })
    .getSuggestions(query);
}

describe("FolderSuggest", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.restoreAllMocks();
  });

  it("includes the add-new row by default", () => {
    const inputEl = document.body.appendChild(document.createElement("input"));
    const suggest = new FolderSuggest(
      obsidian.App.createMock(),
      inputEl,
      createFolders(),
    );

    expect(getSuggestions(suggest, "")).toEqual([
      "Add new folder...",
      "Alpha",
      "Media",
      "Media/YouTube",
    ]);
    expect(getSuggestions(suggest, "media")).toEqual([
      "Add new folder...",
      "Alpha",
      "Media",
      "Media/YouTube",
    ]);
  });

  it("includes the add-new row when explicitly enabled", () => {
    const inputEl = document.body.appendChild(document.createElement("input"));
    const suggest = new FolderSuggest(
      obsidian.App.createMock(),
      inputEl,
      createFolders(),
      { showAddNewOption: true },
    );

    expect(getSuggestions(suggest, "alpha")[0]).toBe("Add new folder...");
  });

  it("hides the add-new row when disabled", () => {
    const inputEl = document.body.appendChild(document.createElement("input"));
    const suggest = new FolderSuggest(
      obsidian.App.createMock(),
      inputEl,
      createFolders(),
      { showAddNewOption: false },
    );

    expect(getSuggestions(suggest, "")).toEqual(["Alpha", "Media", "Media/YouTube"]);
    expect(getSuggestions(suggest, "media")).toEqual(["Alpha", "Media", "Media/YouTube"]);
    expect(getSuggestions(suggest, "does-not-exist")).toEqual([]);
  });

  it("selecting a real folder updates the input and dispatches input/change", () => {
    const inputEl = document.body.appendChild(document.createElement("input"));
    const suggest = new FolderSuggest(
      obsidian.App.createMock(),
      inputEl,
      createFolders(),
      { showAddNewOption: false },
    );

    const inputSpy = vi.fn();
    const changeSpy = vi.fn();

    inputEl.addEventListener("input", inputSpy);
    inputEl.addEventListener("change", changeSpy);

    suggest.selectSuggestion("Media/YouTube", new MouseEvent("click"));

    expect(inputEl.value).toBe("Media/YouTube");
    expect(inputSpy).toHaveBeenCalledTimes(1);
    expect(changeSpy).toHaveBeenCalledTimes(1);
  });

  it("selecting add new folder closes the menu without clearing typed input", () => {
    const inputEl = document.body.appendChild(document.createElement("input"));
    inputEl.value = "Custom/Path";

    const suggest = new FolderSuggest(
      obsidian.App.createMock(),
      inputEl,
      createFolders(),
    );

    const inputSpy = vi.fn();
    const changeSpy = vi.fn();
    const closeSpy = vi.spyOn(suggest, "close");

    inputEl.addEventListener("input", inputSpy);
    inputEl.addEventListener("change", changeSpy);

    suggest.selectSuggestion("Add new folder...", new MouseEvent("click"));

    expect(inputEl.value).toBe("Custom/Path");
    expect(inputSpy).not.toHaveBeenCalled();
    expect(changeSpy).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
