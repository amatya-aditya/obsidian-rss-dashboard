import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { EditFeedModal } from "../../../src/modals/feed-manager/edit-feed-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type { Feed } from "../../../src/types/types";

type MockApp = ReturnType<
  (typeof obsidian.App & { createMock(): unknown })["createMock"]
>;

function createMockApp(): MockApp {
  return (
    obsidian.App as typeof obsidian.App & { createMock(): MockApp }
  ).createMock();
}

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

function getSelectBySettingName(
  containerEl: HTMLElement,
  name: string,
): HTMLSelectElement {
  const settingEl = getSettingByName(containerEl, name);
  const selectEl = settingEl.querySelector("select");
  if (!(selectEl instanceof HTMLSelectElement)) {
    throw new Error(`Select not found for setting: ${name}`);
  }
  return selectEl;
}

function getButtonByText(
  containerEl: HTMLElement,
  label: string,
): HTMLButtonElement {
  const buttonEl = Array.from(containerEl.querySelectorAll("button")).find(
    (button) => button.textContent === label,
  );
  if (!(buttonEl instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  return buttonEl;
}

function getToggleBySettingName(
  containerEl: HTMLElement,
  name: string,
): HTMLInputElement {
  const settingEl = getSettingByName(containerEl, name);
  const toggleEl = settingEl.querySelector('input[type="checkbox"]');
  if (!(toggleEl instanceof HTMLInputElement)) {
    throw new Error(`Toggle not found for setting: ${name}`);
  }
  return toggleEl;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  Object.defineProperty(window, "innerWidth", {
    value: 1400,
    configurable: true,
  });
  vi.restoreAllMocks();
});

describe("EditFeedModal", () => {
  it("opens with the per-feed controls expanded and highlighted when requested", () => {
    const app = createMockApp();
    const feed: Feed = {
      title: "Old title",
      url: "https://example.com/old.xml",
      folder: "Tech",
      items: [],
      lastUpdated: 0,
    } as any;

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

    const modal = new EditFeedModal(
      app as any,
      plugin as any,
      feed as any,
      vi.fn(),
      { expandSection: "per-feed", highlightSection: "per-feed" },
    );
    modal.open();

    const details = modal.contentEl.querySelector(
      ".rss-per-feed-controls-details",
    ) as HTMLDetailsElement;
    const autoDeleteSetting = getSettingByName(
      modal.contentEl,
      "Auto delete articles duration",
    );

    expect(details.open).toBe(true);
    expect(details.classList.contains("rss-per-feed-controls-highlight")).toBe(
      true,
    );
    expect(
      autoDeleteSetting.classList.contains(
        "rss-per-feed-auto-delete-highlight",
      ),
    ).toBe(true);
  });

  it("pre-selects explicit Off and persists -1 on Save", async () => {
    const app = createMockApp();
    const feed: Feed = {
      title: "Old title",
      url: "https://example.com/old.xml",
      folder: "Tech",
      items: [],
      lastUpdated: 0,
      scanInterval: -1,
    } as any;

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

    const modal = new EditFeedModal(
      app as any,
      plugin as any,
      feed as any,
      vi.fn(),
    );
    modal.open();

    const scanIntervalSelect = getSelectBySettingName(
      modal.contentEl,
      "Auto-refresh interval",
    );
    expect(scanIntervalSelect.value).toBe("-1");

    getButtonByText(modal.contentEl, "Save").click();
    await flushPromises();

    expect(feed.scanInterval).toBe(-1);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("persists inherited auto-refresh as 0 on Save", async () => {
    const app = createMockApp();
    const feed: Feed = {
      title: "Old title",
      url: "https://example.com/old.xml",
      folder: "Tech",
      items: [],
      lastUpdated: 0,
      scanInterval: 15,
    } as any;

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

    const modal = new EditFeedModal(
      app as any,
      plugin as any,
      feed as any,
      vi.fn(),
    );
    modal.open();

    const scanIntervalSelect = getSelectBySettingName(
      modal.contentEl,
      "Auto-refresh interval",
    );
    scanIntervalSelect.value = "0";
    scanIntervalSelect.dispatchEvent(new Event("change"));

    getButtonByText(modal.contentEl, "Save").click();
    await flushPromises();

    expect(feed.scanInterval).toBe(0);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("persists exclude-from-refresh when enabled", async () => {
    const app = createMockApp();
    const feed: Feed = {
      title: "Old title",
      url: "https://example.com/old.xml",
      folder: "Tech",
      items: [],
      lastUpdated: 0,
      excludeFromRefresh: false,
    } as any;

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

    const modal = new EditFeedModal(
      app as any,
      plugin as any,
      feed as any,
      vi.fn(),
    );
    modal.open();

    const excludeToggle = getToggleBySettingName(
      modal.contentEl,
      "Exclude from refresh",
    );
    excludeToggle.checked = true;
    excludeToggle.dispatchEvent(new Event("change"));

    getButtonByText(modal.contentEl, "Save").click();
    await flushPromises();

    expect(feed.excludeFromRefresh).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("pre-fills values and persists updates on Save", async () => {
    const app = createMockApp();
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
    const modal = new EditFeedModal(
      app as any,
      plugin as any,
      feed as any,
      onSave,
    );
    const closeSpy = vi.spyOn(modal, "close");
    modal.open();

    const urlSetting = getSettingByName(modal.contentEl, "Feed URL");
    const urlInput = urlSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    expect(urlInput.value).toBe("https://example.com/old.xml");

    const titleSetting = getSettingByName(modal.contentEl, "Title");
    const titleInput = titleSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    titleInput.value = "New title";
    titleInput.dispatchEvent(new Event("input"));

    const saveBtn = getButtonByText(modal.contentEl, "Save");
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
    const app = createMockApp();
    const feed: Feed = {
      title: "T",
      url: "u",
      folder: "",
      items: [],
      lastUpdated: 0,
    } as any;

    const plugin = {
      app,
      settings: {
        folders: [],
        maxItems: 50,
        articleSaving: { savedTemplates: [] },
      },
      ensureFolderExists: vi.fn(async () => {}),
      saveSettings: vi.fn(async () => {}),
      notifyFiltersUpdated: vi.fn(),
    };

    const modal = new EditFeedModal(
      app as any,
      plugin as any,
      feed as any,
      vi.fn(),
    );
    const closeSpy = vi.spyOn(modal, "close");
    modal.open();

    const cancelBtn = getButtonByText(modal.contentEl, "Cancel");
    cancelBtn.click();
    await flushPromises();

    expect(plugin.saveSettings).toHaveBeenCalledTimes(0);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
