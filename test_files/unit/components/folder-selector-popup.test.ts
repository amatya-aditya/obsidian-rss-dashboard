import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { FolderSelectorPopup } from "../../../src/components/folder-selector-popup";
import { DEFAULT_SETTINGS, type Folder, type RssDashboardSettings } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

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

function createPluginStub(folders: Folder[] = createFolders()): any {
  const settings = cloneSettings();
  settings.folders = folders;
  return { settings };
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
    const anchorEl = document.body.createDiv();
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
    ) as HTMLElement | null;
    expect(popup).not.toBeNull();
    expect(popup!.style.left).toBe("10px");
    expect(popup!.style.top).toBe("34px");
    expect(popup!.classList.contains("rss-folder-selector-popup-above")).toBe(
      false,
    );
  });

  it("clamps left and flips above when near viewport edges", () => {
    setViewport(300, 220);

    const anchorEl = document.body.createDiv();
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
    const anchorEl = document.body.createDiv();
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
    const anchorEl = document.body.createDiv();
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

    const anchorEl = document.body.createDiv();
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
    const anchorEl = document.body.createDiv();
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
    const anchorEl = document.body.createDiv();
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
      ) as HTMLElement[];

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

    const anchorEl = document.body.createDiv();
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

    const outside = document.body.createDiv();
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
    const anchorEl = document.body.createDiv();
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
});

