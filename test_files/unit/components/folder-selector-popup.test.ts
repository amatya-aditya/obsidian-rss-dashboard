import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { FolderSelectorPopup } from "../../../src/components/folder-selector-popup";
import { DEFAULT_SETTINGS, type Folder, type RssDashboardSettings } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type TestPlugin = ConstructorParameters<typeof FolderSelectorPopup>[0];

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function createFolders(): Folder[] {
  return [
    { name: "Alpha", subfolders: [] },
    {
      name: "Zeta",
      subfolders: [{ name: "Child", subfolders: [] }],
    },
  ];
}

type TestPluginWithMocks = TestPlugin & {
  ensureFolderExists: ReturnType<typeof vi.fn>;
};

function createPluginStub(
  folders: Folder[] = createFolders(),
): TestPluginWithMocks {
  const settings = cloneSettings();
  settings.folders = folders;
  return {
    settings,
    app: {},
    // Mirrors the real FolderService.ensureFolderExists closely enough for
    // these tests: adds a missing top-level folder to settings.folders.
    ensureFolderExists: vi.fn(async (folderPath: string) => {
      if (!folderPath || settings.folders.some((f) => f.name === folderPath)) {
        return false;
      }
      settings.folders.push({ name: folderPath, subfolders: [] });
      return true;
    }),
  } as unknown as TestPluginWithMocks;
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  setViewport(800, 600);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("FolderSelectorPopup", () => {
  it("positions below the anchor by default", () => {
    const anchorEl = createDiv();
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 10,
      bottom: 30,
      right: 110,
      width: 100,
      height: 20,
    } as DOMRect);

    new FolderSelectorPopup(createPluginStub(), {
      anchorEl,
      onSelect: () => {},
    });

    const popup = document.body.querySelector(
      ".rss-folder-selector-popup",
    );
    expect(popup).not.toBeNull();
    expect((popup as HTMLElement).style.left).toBe("10px");
    expect((popup as HTMLElement).style.top).toBe("34px");
    expect((popup as HTMLElement).classList.contains("rss-folder-selector-popup-above")).toBe(
      false,
    );
  });

  it("clamps left and flips above when near viewport edges", () => {
    setViewport(300, 220);

    const anchorEl = createDiv();
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue({
      left: 200,
      top: 180,
      bottom: 200,
      right: 260,
      width: 60,
      height: 20,
    } as DOMRect);

    new FolderSelectorPopup(createPluginStub(), {
      anchorEl,
      onSelect: () => {},
    });

    const popup = document.body.querySelector(
      ".rss-folder-selector-popup",
    ) as HTMLElement;
    // width=240, margin=16 => maxLeft = 300 - 240 - 16 = 44
    expect(popup.style.left).toBe("44px");
    // flipped above => top = rect.top - 4
    expect(popup.style.top).toBe("176px");
    expect(popup.classList.contains("rss-folder-selector-popup-above")).toBe(
      true,
    );
  });

  it("prioritizes defaultFolder to the top when it exists (case-insensitive)", () => {
    const anchorEl = createDiv();
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
    } as DOMRect);

    new FolderSelectorPopup(createPluginStub(), {
      anchorEl,
      defaultFolder: "zeta",
      onSelect: () => {},
    });

    const firstItemText = document.body.querySelector(
      ".rss-folder-selector-item .rss-folder-selector-text",
    )?.textContent;
    expect(firstItemText).toBe("Zeta");
  });

  it("filters folders and toggles the clear button on input", () => {
    const anchorEl = createDiv();
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
    } as DOMRect);

    new FolderSelectorPopup(createPluginStub(), {
      anchorEl,
      onSelect: () => {},
    });

    const input = document.body.querySelector(
      ".rss-folder-selector-input",
    ) as HTMLInputElement;
    const clearBtn = document.body.querySelector(
      ".rss-folder-selector-clear",
    ) as HTMLElement;

    expect(clearBtn.classList.contains("is-hidden")).toBe(true);

    input.value = "child";
    input.dispatchEvent(new Event("input"));

    expect(clearBtn.classList.contains("is-hidden")).toBe(false);
    const items = Array.from(
      document.body.querySelectorAll(".rss-folder-selector-item"),
    );
    // Create option + 1 matching item (Zeta/Child)
    expect(items.length).toBe(2);
    expect(items[1].textContent).toContain("Zeta/Child");

    // Clear via button resets filter + hides button
    clearBtn.click();
    expect(input.value).toBe("");
    expect(clearBtn.classList.contains("is-hidden")).toBe(true);
    expect(
      document.body.querySelectorAll(".rss-folder-selector-item").length,
    ).toBeGreaterThan(1);
  });

  it("sanitizes forbidden characters in real-time and removes invalid highlight after timeout", () => {
    vi.useFakeTimers();

    const anchorEl = createDiv();
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
    } as DOMRect);

    new FolderSelectorPopup(createPluginStub(), {
      anchorEl,
      onSelect: () => {},
    });

    const input = document.body.querySelector(
      ".rss-folder-selector-input",
    ) as HTMLInputElement;

    input.value = '  ..A*B?C|  ';
    input.dispatchEvent(new Event("input"));

    expect(input.value).toBe("ABC");
    expect(
      input.classList.contains("rss-folder-selector-input-invalid"),
    ).toBe(true);

    vi.advanceTimersByTime(500);
    expect(
      input.classList.contains("rss-folder-selector-input-invalid"),
    ).toBe(false);
  });

  it("creates a new folder option for a non-matching query and selects sanitized text", () => {
    const anchorEl = createDiv();
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
    } as DOMRect);

    const onSelect = vi.fn();
    const onClose = vi.fn();
    new FolderSelectorPopup(createPluginStub(), {
      anchorEl,
      onSelect,
      onClose,
    });

    const input = document.body.querySelector(
      ".rss-folder-selector-input",
    ) as HTMLInputElement;
    input.value = "  ..New:Folder..  ";
    input.dispatchEvent(new Event("input"));

    const createItem = document.body.querySelector(
      ".rss-folder-selector-item.rss-folder-selector-create",
    ) as HTMLElement;
    expect(createItem).not.toBeNull();

    createItem.click();
    expect(onSelect).toHaveBeenCalledWith("NewFolder");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      document.body.querySelector(".rss-folder-selector-popup"),
    ).toBeNull();
  });

  it("supports keyboard navigation and Enter selects the highlighted folder", () => {
    const anchorEl = createDiv();
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
    } as DOMRect);

    const onSelect = vi.fn();
    new FolderSelectorPopup(createPluginStub(), {
      anchorEl,
      onSelect,
    });

    const items = () =>
      Array.from(
        document.body.querySelectorAll(".rss-folder-selector-item"),
      );

    // Down selects second item
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(items()[1].classList.contains("is-selected")).toBe(true);

    // Up wraps back to first
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    expect(items()[0].classList.contains("is-selected")).toBe(true);

    // Enter selects current
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onSelect).toHaveBeenCalledWith("Alpha");
  });

  it("closes on Escape/Tab and on outside click", () => {
    vi.useFakeTimers();

    const anchorEl = createDiv();
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
    } as DOMRect);

    const onClose = vi.fn();
    new FolderSelectorPopup(createPluginStub(), {
      anchorEl,
      onSelect: () => {},
      onClose,
    });

    // register click-outside handler
    vi.runAllTimers();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      document.body.querySelector(".rss-folder-selector-popup"),
    ).toBeNull();

    // reopen and test outside click
    onClose.mockClear();
    new FolderSelectorPopup(createPluginStub(), {
      anchorEl,
      onSelect: () => {},
      onClose,
    });
    vi.runAllTimers();

    const outside = createDiv();
    document.body.appendChild(outside);
    outside.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      document.body.querySelector(".rss-folder-selector-popup"),
    ).toBeNull();

    // reopen and test Tab closes too
    onClose.mockClear();
    new FolderSelectorPopup(createPluginStub(), {
      anchorEl,
      onSelect: () => {},
      onClose,
    });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("listOnly mode renders without input and does not show create option", () => {
    const anchorEl = createDiv();
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
    } as DOMRect);

    const onSelect = vi.fn();
    new FolderSelectorPopup(createPluginStub(), {
      anchorEl,
      onSelect,
      listOnly: true,
    });

    expect(document.body.querySelector(".rss-folder-selector-input")).toBeNull();
    expect(
      document.body.querySelector(".rss-folder-selector-create"),
    ).toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onSelect).toHaveBeenCalledWith("Alpha");
  });

  it("listOnly mode with zero folders offers a way forward instead of a dead end", () => {
    const anchorEl = createDiv();
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
    } as DOMRect);

    const onSelect = vi.fn();
    new FolderSelectorPopup(createPluginStub([]), {
      anchorEl,
      onSelect,
      listOnly: true,
    });

    // The empty state must not be a dead end: there must be at least one
    // clickable action (e.g. "Root (no folder)" and/or "Add new folder").
    const actionable = document.body.querySelectorAll(
      ".rss-folder-selector-item:not(.rss-folder-selector-empty)",
    );
    expect(actionable.length).toBeGreaterThan(0);
  });

  it("listOnly mode: clicking Root (no folder) selects an empty folder name", () => {
    const anchorEl = createDiv();
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
    } as DOMRect);

    const onSelect = vi.fn();
    const onClose = vi.fn();
    new FolderSelectorPopup(createPluginStub([]), {
      anchorEl,
      onSelect,
      onClose,
      listOnly: true,
    });

    const rootItem = document.body.querySelector(
      ".rss-folder-selector-root",
    ) as HTMLElement;
    expect(rootItem).not.toBeNull();

    rootItem.click();
    expect(onSelect).toHaveBeenCalledWith("");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      document.body.querySelector(".rss-folder-selector-popup"),
    ).toBeNull();
  });

  // GH: "Add new folder" must create the folder AND assign the feed this
  // popup was opened for to it in one step — that's the entire point of
  // reaching for it while adding a feed. Folder creation itself still
  // happens downstream (the caller's onSelect handler calls
  // plugin.ensureFolderExists before adding the feed) — the popup's own job
  // is just to hand back the chosen name and get out of the way.
  it("listOnly mode: Add new folder assigns the feed to the newly named folder and closes", async () => {
    vi.useFakeTimers();

    const anchorEl = createDiv();
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
    } as DOMRect);

    const onSelect = vi.fn();
    const plugin = createPluginStub([]);
    new FolderSelectorPopup(plugin, {
      anchorEl,
      onSelect,
      listOnly: true,
    });
    vi.runAllTimers();

    const addNewItem = document.body.querySelector(
      ".rss-folder-selector-add-new",
    ) as HTMLElement;
    expect(addNewItem).not.toBeNull();
    addNewItem.click();

    const modalInput = document.body.querySelector(
      ".rss-folder-name-modal-input",
    ) as HTMLInputElement;
    expect(modalInput).not.toBeNull();
    modalInput.value = "New Category";

    const okButton = document.body.querySelector(
      ".rss-folder-name-modal-ok",
    ) as HTMLElement;
    okButton.click();

    vi.useRealTimers();
    await Promise.resolve();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("New Category");
    expect(
      document.body.querySelector(".rss-folder-selector-popup"),
    ).toBeNull();
    // The popup itself never creates the folder — that's the caller's job
    // once it receives the name via onSelect.
    expect(plugin.ensureFolderExists).not.toHaveBeenCalled();
  });

  // GH: submitting or cancelling the create-folder modal via a real mouse
  // click (as opposed to pressing Enter in the input) closed the folder
  // popup underneath it — the modal's own click bubbles past its
  // (now-removed) content all the way to document, tripping the popup's
  // outside-click handler.
  it("listOnly mode: cancelling Add new folder via a real Cancel-button click leaves the still-open popup usable", async () => {
    vi.useFakeTimers();

    const anchorEl = createDiv();
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
    } as DOMRect);

    const onSelect = vi.fn();
    const plugin = createPluginStub([]);
    new FolderSelectorPopup(plugin, {
      anchorEl,
      onSelect,
      listOnly: true,
    });
    vi.runAllTimers();

    const addNewItem = document.body.querySelector(
      ".rss-folder-selector-add-new",
    ) as HTMLElement;
    addNewItem.click();

    const cancelButton = document.body.querySelector(
      ".rss-folder-name-modal-cancel",
    ) as HTMLElement;
    expect(cancelButton).not.toBeNull();
    cancelButton.click();

    vi.useRealTimers();
    await Promise.resolve();

    expect(onSelect).not.toHaveBeenCalled();
    const popup = document.body.querySelector(".rss-folder-selector-popup");
    expect(popup).not.toBeNull();

    // Not just present in the DOM — actually usable again: clicking Root
    // must still work.
    const rootItem = document.body.querySelector(
      ".rss-folder-selector-root",
    ) as HTMLElement;
    rootItem.click();
    expect(onSelect).toHaveBeenCalledWith("");
  });

  // New bug: while the create-folder modal is open, the folder list behind
  // it (rendered by this same popup) was still fully clickable — z-index
  // alone doesn't stop real Obsidian's modal backdrop from being defeated by
  // this popup's own very high stacking order.
  it("listOnly mode: the popup's own items are not interactable while the create-folder modal is open", async () => {
    vi.useFakeTimers();

    const anchorEl = createDiv();
    vi.spyOn(anchorEl, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
    } as DOMRect);

    const onSelect = vi.fn();
    new FolderSelectorPopup(createPluginStub(), {
      anchorEl,
      onSelect,
      listOnly: true,
    });
    vi.runAllTimers();

    const addNewItem = document.body.querySelector(
      ".rss-folder-selector-add-new",
    ) as HTMLElement;
    addNewItem.click();

    // The modal is now open on top. The popup underneath must visibly and
    // functionally be inert: clicking straight through to an existing
    // folder item must not fire onSelect.
    const popup = document.body.querySelector(
      ".rss-folder-selector-popup",
    ) as HTMLElement;
    expect(popup.classList.contains("rss-folder-selector-popup-inert")).toBe(
      true,
    );

    const rootItem = document.body.querySelector(
      ".rss-folder-selector-root",
    ) as HTMLElement;
    rootItem.click();
    expect(onSelect).not.toHaveBeenCalled();

    // Cancelling restores interactivity.
    const cancelButton = document.body.querySelector(
      ".rss-folder-name-modal-cancel",
    ) as HTMLElement;
    cancelButton.click();
    vi.useRealTimers();
    await Promise.resolve();

    expect(
      popup.classList.contains("rss-folder-selector-popup-inert"),
    ).toBe(false);
    rootItem.click();
    expect(onSelect).toHaveBeenCalledWith("");
  });
});

