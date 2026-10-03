import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { FolderSuggest } from "../../../src/components/folder-suggest";
import type { Folder } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type FolderSuggestOption =
  | { kind: "folder"; path: string }
  | { kind: "add-new"; name: string };

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
): FolderSuggestOption[] {
  return (
    suggest as unknown as {
      getSuggestions: (query: string) => FolderSuggestOption[];
    }
  ).getSuggestions(query);
}

function folderPaths(options: FolderSuggestOption[]): string[] {
  return options.map((option) =>
    option.kind === "folder" ? option.path : `add-new:${option.name}`,
  );
}

describe("FolderSuggest", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.restoreAllMocks();
  });

  it("omits the add-new row when the query is empty or matches an existing folder", () => {
    const inputEl = document.body.appendChild(createEl("input"));
    const suggest = new FolderSuggest(
      obsidian.App.createMock(),
      inputEl,
      createFolders(),
    );

    expect(folderPaths(getSuggestions(suggest, ""))).toEqual([
      "Alpha",
      "Media",
      "Media/YouTube",
    ]);
    expect(folderPaths(getSuggestions(suggest, "media"))).toEqual([
      "Alpha",
      "Media",
      "Media/YouTube",
    ]);
  });

  it("includes a dynamic add-new row named after the typed query when it matches no existing folder", () => {
    const inputEl = document.body.appendChild(createEl("input"));
    const suggest = new FolderSuggest(
      obsidian.App.createMock(),
      inputEl,
      createFolders(),
    );

    const options = getSuggestions(suggest, "Projects");
    expect(options[0]).toEqual({ kind: "add-new", name: "Projects" });
    expect(folderPaths(options)).toEqual(["add-new:Projects"]);
  });

  it("hides the add-new row when disabled, even for a non-matching query", () => {
    const inputEl = document.body.appendChild(createEl("input"));
    const suggest = new FolderSuggest(
      obsidian.App.createMock(),
      inputEl,
      createFolders(),
      { showAddNewOption: false },
    );

    expect(folderPaths(getSuggestions(suggest, ""))).toEqual([
      "Alpha",
      "Media",
      "Media/YouTube",
    ]);
    expect(folderPaths(getSuggestions(suggest, "does-not-exist"))).toEqual([]);
  });

  it("renders matching suggestions without the newer Obsidian suggester API", () => {
    const inputEl = document.body.appendChild(createEl("input"));
    new FolderSuggest(obsidian.App.createMock(), inputEl, createFolders());

    inputEl.value = "alph";
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));

    const suggestEl = inputEl.nextElementSibling as HTMLElement;
    const options = suggestEl.querySelectorAll("[role=option]");
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toBe('Add "alph"');
    expect(options[1].textContent).toBe("Alpha");
  });

  it("anchors its dropdown to the input container", () => {
    const container = document.body.appendChild(createDiv());
    const inputEl = container.createEl("input");
    new FolderSuggest(obsidian.App.createMock(), inputEl, createFolders());

    expect(container.style.position).toBe("relative");
    expect(
      inputEl.nextElementSibling?.classList.contains(
        "rss-dashboard-folder-suggestion-container",
      ),
    ).toBe(true);
  });

  it("selecting a real folder updates the input and dispatches input/change", () => {
    const inputEl = document.body.appendChild(createEl("input"));
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

    suggest.selectSuggestion(
      { kind: "folder", path: "Media/YouTube" },
      new MouseEvent("click"),
    );

    expect(inputEl.value).toBe("Media/YouTube");
    expect(inputSpy).toHaveBeenCalledTimes(1);
    expect(changeSpy).toHaveBeenCalledTimes(1);
  });

  it("selecting the add-new row commits the typed name and dispatches input/change, same as a real folder", () => {
    const inputEl = document.body.appendChild(createEl("input"));

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

    suggest.selectSuggestion(
      { kind: "add-new", name: "Custom/Path" },
      new MouseEvent("click"),
    );

    expect(inputEl.value).toBe("Custom/Path");
    expect(inputSpy).toHaveBeenCalledTimes(1);
    expect(changeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
