import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import {
  FOLDER_SUGGEST_CONTAINER_CLASS,
  FolderSuggest,
  VaultFolderSuggest,
} from "../../../src/components/folder-suggest";
import type { Folder } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type FolderSuggestOption =
  { kind: "folder"; path: string } | { kind: "add-new"; name: string };

type KeyHandler = {
  key: string | null;
  modifiers: unknown;
  func: (evt: KeyboardEvent, ctx: unknown) => unknown;
};

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
    {
      name: "videos",
      subfolders: [],
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

/** The list Obsidian mounts under <body> while a folder field is open. */
function openList(): HTMLElement | null {
  return activeDocument.body.querySelector<HTMLElement>(
    ".suggestion-container",
  );
}

function rowTexts(): string[] {
  return Array.from(
    activeDocument.body.querySelectorAll(
      ".suggestion-container .suggestion-item",
    ),
  ).map((row) => row.textContent ?? "");
}

function selectedRowText(): string | undefined {
  return activeDocument.body.querySelector(
    ".suggestion-container .suggestion-item.is-selected",
  )?.textContent;
}

/** Sends a key to the list the way Obsidian's keymap does while it is open. */
function pressKey(suggest: object, key: string): unknown {
  const handlers = (suggest as { scope: { handlers: KeyHandler[] } }).scope
    .handlers;
  const handler = handlers.find(
    (h) => h.key === key && JSON.stringify(h.modifiers) === "[]",
  );
  return handler?.func(new KeyboardEvent("keydown", { key }), {});
}

function type(inputEl: HTMLInputElement, text: string): void {
  inputEl.value = text;
  inputEl.dispatchEvent(new Event("input", { bubbles: true }));
}

function setup(options?: { showAddNewOption?: boolean; folders?: Folder[] }): {
  inputEl: HTMLInputElement;
  suggest: FolderSuggest;
} {
  const inputEl = activeDocument.body.appendChild(createEl("input"));
  const suggest = new FolderSuggest(
    obsidian.App.createMock(),
    inputEl,
    options?.folders ?? createFolders(),
    options?.showAddNewOption === undefined
      ? undefined
      : { showAddNewOption: options.showAddNewOption },
  );
  return { inputEl, suggest };
}

describe("FolderSuggest", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    activeDocument.body.empty();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    activeDocument.body.empty();
  });

  describe("which folders it offers", () => {
    it("lists every folder for an empty query", () => {
      const { suggest } = setup();

      expect(folderPaths(getSuggestions(suggest, ""))).toEqual([
        "Alpha",
        "Media",
        "Media/YouTube",
        "videos",
      ]);
    });

    it("narrows the list when the query is a full folder name, without an add-new row", () => {
      const { suggest } = setup();

      expect(folderPaths(getSuggestions(suggest, "videos"))).toEqual([
        "videos",
      ]);
      // Case-insensitive, and a parent folder also lists the folders inside it.
      expect(folderPaths(getSuggestions(suggest, "media"))).toEqual([
        "Media",
        "Media/YouTube",
      ]);
    });

    it("offers only the add-new row when the query matches no folder", () => {
      const { suggest } = setup();

      expect(folderPaths(getSuggestions(suggest, "nope"))).toEqual([
        "add-new:nope",
      ]);
    });

    it("names the add-new row after the typed query", () => {
      const { suggest } = setup();

      const options = getSuggestions(suggest, "Projects");
      expect(options[0]).toEqual({ kind: "add-new", name: "Projects" });
      expect(folderPaths(options)).toEqual(["add-new:Projects"]);
    });

    it("hides the add-new row when disabled, even for a non-matching query", () => {
      const { suggest } = setup({ showAddNewOption: false });

      expect(folderPaths(getSuggestions(suggest, ""))).toEqual([
        "Alpha",
        "Media",
        "Media/YouTube",
        "videos",
      ]);
      expect(folderPaths(getSuggestions(suggest, "does-not-exist"))).toEqual(
        [],
      );
    });

    it("offers a folder added through updateFolders", () => {
      const { suggest, inputEl } = setup();

      suggest.updateFolders([{ name: "Newsletters", subfolders: [] }]);
      inputEl.focus();

      expect(rowTexts()).toEqual(["Newsletters"]);
    });
  });

  describe("opening and closing the list", () => {
    it("opens with every folder when the empty field gains focus", () => {
      const { inputEl } = setup();

      inputEl.focus();

      expect(rowTexts()).toEqual(["Alpha", "Media", "Media/YouTube", "videos"]);
    });

    it("lists every folder even when there are more than a hundred", () => {
      const many: Folder[] = Array.from({ length: 150 }, (_, i) => ({
        name: `Folder ${String(i).padStart(3, "0")}`,
        subfolders: [],
      }));
      const { inputEl } = setup({ folders: many });

      inputEl.focus();

      expect(rowTexts()).toHaveLength(150);
    });

    it("narrows the rows as the user types, with an add-new row first", () => {
      const { inputEl } = setup();
      inputEl.focus();

      type(inputEl, "alph");

      expect(rowTexts()).toEqual(['Add "alph"', "Alpha"]);
    });

    it("keeps a typed full folder name narrowed to that folder", () => {
      const { inputEl } = setup();
      inputEl.focus();

      type(inputEl, "videos");

      expect(rowTexts()).toEqual(["videos"]);
    });

    it("closes on Escape and keeps focus in the field", () => {
      const { inputEl, suggest } = setup();
      inputEl.focus();
      expect(openList()).not.toBeNull();

      expect(pressKey(suggest, "Escape")).toBe(false);

      expect(openList()).toBeNull();
      expect(activeDocument.activeElement).toBe(inputEl);
    });

    it("lists every folder again when the user clicks the empty field after Escape", () => {
      const { inputEl, suggest } = setup();
      inputEl.focus();
      pressKey(suggest, "Escape");
      expect(openList()).toBeNull();

      inputEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(rowTexts()).toEqual(["Alpha", "Media", "Media/YouTube", "videos"]);
    });

    it("does not reopen on a click while the field holds text", () => {
      const { inputEl, suggest } = setup();
      inputEl.focus();
      type(inputEl, "alph");
      pressKey(suggest, "Escape");

      inputEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(openList()).toBeNull();
    });

    it("closes when the field loses focus", () => {
      const { inputEl } = setup();
      inputEl.focus();
      expect(openList()).not.toBeNull();

      inputEl.blur();

      expect(openList()).toBeNull();
    });
  });

  describe("where the list lives", () => {
    it("mounts the list under body, outside the field's container, with the plugin class", () => {
      const container = activeDocument.body.appendChild(createDiv());
      const inputEl = container.createEl("input");
      new FolderSuggest(obsidian.App.createMock(), inputEl, createFolders());

      inputEl.focus();

      const list = openList();
      expect(list?.parentElement).toBe(activeDocument.body);
      expect(container.contains(list)).toBe(false);
      expect(list?.classList.contains(FOLDER_SUGGEST_CONTAINER_CLASS)).toBe(
        true,
      );
      expect(FOLDER_SUGGEST_CONTAINER_CLASS).toBe(
        "rss-folder-suggest-container",
      );
    });

    it("leaves the field's container unpositioned, since Obsidian places the list", () => {
      const container = activeDocument.body.appendChild(createDiv());
      const inputEl = container.createEl("input");
      new FolderSuggest(obsidian.App.createMock(), inputEl, createFolders());

      inputEl.focus();

      expect(container.style.position).toBe("");
    });

    it("renders rows as plain text, with the add-new row carrying its icon and tint class", () => {
      const { inputEl } = setup();
      inputEl.focus();

      type(inputEl, "alph");

      const rows = activeDocument.body.querySelectorAll(
        ".suggestion-container .suggestion-item",
      );
      expect(
        rows[0]?.classList.contains("rss-dashboard-add-new-suggestion"),
      ).toBe(true);
      expect(
        rows[0]?.querySelector(".rss-dashboard-add-new-suggestion-icon svg"),
      ).not.toBeNull();
      expect(rows[1]?.textContent).toBe("Alpha");
      expect(rows[1]?.children).toHaveLength(0);
    });
  });

  describe("choosing a folder", () => {
    function recordEvents(inputEl: HTMLInputElement): string[] {
      const events: string[] = [];
      inputEl.addEventListener("input", () => events.push("input"));
      inputEl.addEventListener("change", () => events.push("change"));
      return events;
    }

    it("selects the first row with Enter, sets the value, and fires input then change", () => {
      const { inputEl, suggest } = setup({ showAddNewOption: false });
      inputEl.focus();
      const events = recordEvents(inputEl);

      expect(pressKey(suggest, "Enter")).toBe(false);

      expect(inputEl.value).toBe("Alpha");
      expect(events).toEqual(["input", "change"]);
      expect(openList()).toBeNull();
    });

    it("moves the highlight with the arrow keys before Enter selects", () => {
      const { inputEl, suggest } = setup({ showAddNewOption: false });
      inputEl.focus();
      expect(selectedRowText()).toBe("Alpha");

      pressKey(suggest, "ArrowDown");
      pressKey(suggest, "ArrowDown");
      expect(selectedRowText()).toBe("Media/YouTube");
      pressKey(suggest, "ArrowUp");
      expect(selectedRowText()).toBe("Media");
      pressKey(suggest, "ArrowDown");
      pressKey(suggest, "Enter");

      expect(inputEl.value).toBe("Media/YouTube");
    });

    it("selects the row the user clicks", () => {
      const { inputEl } = setup({ showAddNewOption: false });
      inputEl.focus();
      const events = recordEvents(inputEl);
      const rows = activeDocument.body.querySelectorAll(
        ".suggestion-container .suggestion-item",
      );

      rows[3]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(inputEl.value).toBe("videos");
      expect(events).toEqual(["input", "change"]);
      expect(openList()).toBeNull();
    });

    it("keeps focus in the field after a choice", () => {
      const { inputEl, suggest } = setup();
      inputEl.focus();

      pressKey(suggest, "Enter");

      expect(activeDocument.activeElement).toBe(inputEl);
    });

    it("commits the typed name when the add-new row is chosen", () => {
      const { inputEl, suggest } = setup();
      inputEl.focus();
      type(inputEl, "Custom/Path");
      const events = recordEvents(inputEl);

      pressKey(suggest, "Enter");

      expect(inputEl.value).toBe("Custom/Path");
      expect(events).toEqual(["input", "change"]);
      expect(openList()).toBeNull();
    });

    it("selecting a real folder updates the input and dispatches input/change", () => {
      const { inputEl, suggest } = setup({ showAddNewOption: false });
      const events = recordEvents(inputEl);

      suggest.selectSuggestion(
        { kind: "folder", path: "Media/YouTube" },
        new MouseEvent("click"),
      );

      expect(inputEl.value).toBe("Media/YouTube");
      expect(events).toEqual(["input", "change"]);
    });

    it("strips characters a folder name cannot hold when the add-new row is chosen", () => {
      const { inputEl, suggest } = setup();
      const events = recordEvents(inputEl);

      suggest.selectSuggestion(
        { kind: "add-new", name: 'a\\b:c*d?e"f<g>h|i' },
        new MouseEvent("click"),
      );

      expect(inputEl.value).toBe("abcdefghi");
      expect(events).toEqual(["input", "change"]);
    });

    it("strips those characters as the user types", () => {
      const { inputEl } = setup();
      inputEl.focus();

      type(inputEl, 'my:fol*der?<>|"\\');

      expect(inputEl.value).toBe("myfolder");
    });
  });
});

describe("VaultFolderSuggest", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    activeDocument.body.empty();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    activeDocument.body.empty();
  });

  function setupVault(): {
    inputEl: HTMLInputElement;
    suggest: VaultFolderSuggest;
  } {
    const app = obsidian.App.createMock();
    const makeFolder = (path: string) =>
      new (
        obsidian.TFolder as unknown as new (path: string) => obsidian.TFolder
      )(path);
    const notes = makeFolder("Notes");
    notes.children.push(makeFolder("Notes/Articles"));
    app.vault.getRoot().children.push(notes, makeFolder("Inbox"));
    const inputEl = activeDocument.body.appendChild(createEl("input"));
    return { inputEl, suggest: new VaultFolderSuggest(app, inputEl) };
  }

  it("lists the vault's folders when the field gains focus", () => {
    const { inputEl } = setupVault();

    inputEl.focus();

    expect(rowTexts()).toEqual(["Notes", "Notes/Articles", "Inbox"]);
  });

  it("narrows the folders as the user types", () => {
    const { inputEl } = setupVault();
    inputEl.focus();

    type(inputEl, "art");

    expect(rowTexts()).toEqual(["Notes/Articles"]);
  });

  it("carries the plugin class on its list and mounts it under body", () => {
    const { inputEl } = setupVault();

    inputEl.focus();

    const list = openList();
    expect(list?.parentElement).toBe(activeDocument.body);
    expect(list?.classList.contains(FOLDER_SUGGEST_CONTAINER_CLASS)).toBe(true);
  });

  it("selects with the arrow keys and Enter, setting the value and firing input then change", () => {
    const { inputEl, suggest } = setupVault();
    inputEl.focus();
    const events: string[] = [];
    inputEl.addEventListener("input", () => events.push("input"));
    inputEl.addEventListener("change", () => events.push("change"));

    pressKey(suggest, "ArrowDown");
    pressKey(suggest, "Enter");

    expect(inputEl.value).toBe("Notes/Articles");
    expect(events).toEqual(["input", "change"]);
    expect(openList()).toBeNull();
  });

  it("closes on Escape and lists every folder again on a click in the empty field", () => {
    const { inputEl, suggest } = setupVault();
    inputEl.focus();

    pressKey(suggest, "Escape");
    expect(openList()).toBeNull();
    inputEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(rowTexts()).toEqual(["Notes", "Notes/Articles", "Inbox"]);
  });
});
