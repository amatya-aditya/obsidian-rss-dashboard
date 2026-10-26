import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FolderSelectorPopup } from "../../../src/components/folder-selector-popup";
import {
  DEFAULT_SETTINGS,
  type Folder,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type TestPlugin = ConstructorParameters<typeof FolderSelectorPopup>[0];

function createPlugin(folders: Folder[] = []): TestPlugin {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.folders = folders;
  return { settings, app: {} } as unknown as TestPlugin;
}

function createPopup(
  options: {
    folders?: Folder[];
    listOnly?: boolean;
    onSelect?: (folderName: string) => void;
    onClose?: () => void;
  } = {},
): FolderSelectorPopup {
  const popup = new FolderSelectorPopup(createPlugin(options.folders), {
    anchorEl: document.body.createDiv(),
    onSelect: options.onSelect ?? vi.fn(),
    onClose: options.onClose,
    listOnly: options.listOnly,
  });
  vi.runAllTimers();
  return popup;
}

function keydown(key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.empty();
});

describe("FolderSelectorPopup keyboard behavior before extraction", () => {
  it("wraps arrow navigation and leaves Tab unprevented while closing", () => {
    const onClose = vi.fn();
    const popup = createPopup({
      folders: [
        { name: "Alpha", subfolders: [] },
        { name: "Beta", subfolders: [] },
      ],
      onClose,
    });
    const items = () =>
      Array.from(document.querySelectorAll(".rss-folder-selector-item"));

    const up = keydown("ArrowUp");
    expect(up.defaultPrevented).toBe(true);
    expect(items()[1].classList.contains("is-selected")).toBe(true);

    const down = keydown("ArrowDown");
    expect(down.defaultPrevented).toBe(true);
    expect(items()[0].classList.contains("is-selected")).toBe(true);

    const tab = keydown("Tab");
    expect(tab.defaultPrevented).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".rss-folder-selector-popup")).toBeNull();
    popup.close();
  });

  it("uses Enter to choose the typed create option and Escape to close", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const popup = createPopup({
      folders: [{ name: "Alpha", subfolders: [] }],
      onSelect,
      onClose,
    });
    const input = document.querySelector<HTMLInputElement>(
      ".rss-folder-selector-input",
    )!;
    input.value = "New Folder";
    input.dispatchEvent(new Event("input"));

    const enter = keydown("Enter");
    expect(enter.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledWith("New Folder");
    expect(onClose).toHaveBeenCalledTimes(1);

    const secondPopup = createPopup({ onClose });
    const escape = keydown("Escape");
    expect(escape.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(document.querySelector(".rss-folder-selector-popup")).toBeNull();
    secondPopup.close();
    popup.close();
  });

  it("opens Add new folder from the list with Enter and ignores keys while inert", () => {
    const onSelect = vi.fn();
    const popup = createPopup({ listOnly: true, onSelect });

    keydown("ArrowDown");
    keydown("ArrowDown");
    const enter = keydown("Enter");
    expect(enter.defaultPrevented).toBe(true);
    expect(
      document.querySelector(".rss-folder-name-modal-input"),
    ).not.toBeNull();
    expect(
      document
        .querySelector(".rss-folder-selector-popup")
        ?.classList.contains("rss-folder-selector-popup-inert"),
    ).toBe(true);

    const escape = keydown("Escape");
    expect(escape.defaultPrevented).toBe(false);
    expect(
      document.querySelector(".rss-folder-name-modal-input"),
    ).not.toBeNull();

    document
      .querySelector<HTMLElement>(".rss-folder-name-modal-cancel")!
      .click();
    expect(
      document
        .querySelector(".rss-folder-selector-popup")
        ?.classList.contains("rss-folder-selector-popup-inert"),
    ).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
    popup.close();
  });
});
