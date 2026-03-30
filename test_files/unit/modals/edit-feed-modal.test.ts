import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { EditFeedModal } from "../../../src/modals/feed-manager/edit-feed-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type { Feed } from "../../../src/types/types";

function getSettingByName(containerEl: HTMLElement, name: string): HTMLElement {
  const settingEls = Array.from(containerEl.querySelectorAll(".setting-item"));
  const match = settingEls.find((el) => {
    const nameEl = el.querySelector(".setting-item-name");
    return nameEl?.textContent === name;
  });
  if (!match) {
    throw new Error(`Setting not found: ${name}`);
  }
  return match as HTMLElement;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  Object.defineProperty(window, "innerWidth", { value: 1400, configurable: true });
  vi.restoreAllMocks();
});

describe("EditFeedModal", () => {
  it("pre-fills values and persists updates on Save", async () => {
    const app = obsidian.App.createMock();
    const feed: Feed = {
      title: "Old title",
      url: "https://example.com/old.xml",
      folder: "Tech",
      items: [
        {
          title: "Item",
          link: "https://example.com",
          pubDate: "2020-01-01",
          feedTitle: "Old title",
        } as any,
      ],
      lastUpdated: 0,
    };

    const plugin = {
      app,
      settings: {
        folders: [],
        maxItems: 50,
        corsProxyEnabled: false,
        corsProxyUrl: "",
        articleSaving: { savedTemplates: [] },
      },
      ensureFolderExists: vi.fn(async () => {}),
      saveSettings: vi.fn(async () => {}),
      notifyFiltersUpdated: vi.fn(),
    };

    const onSave = vi.fn();
    const modal = new EditFeedModal(app as any, plugin as any, feed as any, onSave);
    const closeSpy = vi.spyOn(modal, "close");
    modal.open();

    const urlSetting = getSettingByName(modal.contentEl, "Feed URL");
    const urlInput = urlSetting.querySelector('input[type="text"]') as HTMLInputElement;
    expect(urlInput.value).toBe("https://example.com/old.xml");

    const titleSetting = getSettingByName(modal.contentEl, "Title");
    const titleInput = titleSetting.querySelector('input[type="text"]') as HTMLInputElement;
    titleInput.value = "New title";
    titleInput.dispatchEvent(new Event("input"));

    const saveBtn = Array.from(modal.contentEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Save",
    ) as HTMLButtonElement;
    saveBtn.click();
    await flushPromises();

    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.notifyFiltersUpdated).toHaveBeenCalledTimes(1);
    expect(feed.title).toBe("New title");
    expect(feed.items[0].feedTitle).toBe("New title");
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("Cancel closes without persisting", async () => {
    const app = obsidian.App.createMock();
    const feed: Feed = {
      title: "T",
      url: "u",
      folder: "",
      items: [],
      lastUpdated: 0,
    } as any;

    const plugin = {
      app,
      settings: { folders: [], maxItems: 50, articleSaving: { savedTemplates: [] } },
      ensureFolderExists: vi.fn(async () => {}),
      saveSettings: vi.fn(async () => {}),
      notifyFiltersUpdated: vi.fn(),
    };

    const modal = new EditFeedModal(app as any, plugin as any, feed as any, vi.fn());
    const closeSpy = vi.spyOn(modal, "close");
    modal.open();

    const cancelBtn = Array.from(modal.contentEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel",
    ) as HTMLButtonElement;
    cancelBtn.click();
    await flushPromises();

    expect(plugin.saveSettings).toHaveBeenCalledTimes(0);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
