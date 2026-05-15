import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { EditFeedModal } from "../../../src/modals/feed-manager/edit-feed-modal";
import { applyFeedRetentionLimits } from "../../../src/services/feed-parser";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type { Feed } from "../../../src/types/types";

type MockApp = ReturnType<
  (typeof obsidian.App & { createMock(): unknown })["createMock"]
>;

/**
 * Test fixture for article/item objects created by makeArticle().
 * Represents a minimal FeedItem-like structure for test mocking.
 */
type ArticleTestFixture = {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
  feedTitle: string;
  read: boolean;
  saved: boolean;
  starred: boolean;
  tags: unknown[];
  [key: string]: unknown;
};

/**
 * Test fixture for plugin mock objects.
 * Represents the partial plugin interface used in EditFeedModal tests.
 */
type PluginTestFixture = {
  app: MockApp;
  settings: {
    folders: unknown[];
    maxItems: number;
    storageMode?: string;
    corsProxyEnabled: boolean;
    corsProxyUrl: string;
    articleSaving: { savedTemplates: unknown[] };
  };
  getFeedLocalStorageAddress?: (feed: Feed) => unknown;
  ensureFolderExists: (path: string) => Promise<void>;
  saveSettings: () => Promise<void>;
  notifyFiltersUpdated: () => void;
  refreshSelectedFeed?: (feed: Feed) => Promise<void>;
};

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

function getNumberInputBySettingName(
  containerEl: HTMLElement,
  name: string,
): HTMLInputElement {
  const settingEl = getSettingByName(containerEl, name);
  const inputEl = settingEl.querySelector('input[type="number"]');
  if (!(inputEl instanceof HTMLInputElement)) {
    throw new Error(`Number input not found for setting: ${name}`);
  }
  return inputEl;
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

function getLocalStorageStatus(containerEl: HTMLElement): HTMLElement {
  const statusEl = containerEl.querySelector(".rss-edit-feed-storage-status");
  if (!(statusEl instanceof HTMLElement)) {
    throw new Error("Local storage status not found");
  }
  return statusEl;
}

function getLocalStorageFeedId(containerEl: HTMLElement): HTMLElement {
  const feedIdEl = containerEl.querySelector(".rss-edit-feed-storage-feed-id");
  if (!(feedIdEl instanceof HTMLElement)) {
    throw new Error("Local storage feed ID text not found");
  }
  return feedIdEl;
}

function getLocalStorageCopyButton(containerEl: HTMLElement): HTMLElement {
  const buttonEl = containerEl.querySelector(
    ".rss-edit-feed-storage-copy-button",
  );
  if (!(buttonEl instanceof HTMLElement)) {
    throw new Error("Local storage copy button not found");
  }
  return buttonEl;
}

function makeArticle(
  guid: string,
  pubDate: string,
  overrides: Record<string, unknown> = {},
): ArticleTestFixture {
  return {
    title: guid,
    link: `https://example.com/${guid}`,
    description: "",
    pubDate,
    guid,
    feedTitle: "Old title",
    read: false,
    saved: false,
    starred: false,
    tags: [],
    ...overrides,
  } as ArticleTestFixture;
}

const AUTO_DELETE_TEST_NOW_MS = Date.parse("2026-05-01T00:00:00Z");

function makeServerFeedItems() {
  return [
    makeArticle("very-old-read", "2026-03-01T00:00:00Z", { read: true }),
    makeArticle("mid-read", "2026-04-10T00:00:00Z", { read: true }),
    makeArticle("recent-read", "2026-04-28T00:00:00Z", { read: true }),
    makeArticle("recent-unread", "2026-03-01T00:00:00Z", { read: false }),
  ];
}

function getItemsForDuration(duration: number) {
  return applyFeedRetentionLimits(
    {
      title: "Old title",
      url: "https://example.com/old.xml",
      folder: "Tech",
      items: makeServerFeedItems(),
      lastUpdated: 0,
      autoDeleteDuration: duration,
      maxItemsLimit: 0,
    } as Feed,
    { nowMs: AUTO_DELETE_TEST_NOW_MS },
  ).items;
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
  it("renders storage status text and feed ID for shard mode", () => {
    const app = createMockApp();
    const feed: Feed = {
      title: "Old title",
      url: "https://example.com/old.xml",
      folder: "Tech",
      items: [],
      lastUpdated: 0,
      feedId: "feed-123",
    } as unknown as Feed;

    const plugin = {
      app,
      settings: {
        folders: [],
        maxItems: 50,
        storageMode: "vault-shards",
        corsProxyEnabled: false,
        corsProxyUrl: "",
        articleSaving: { savedTemplates: [] },
      },
      getFeedLocalStorageAddress: vi.fn(() => ({
        mode: "vault-shards",
        address: "RSS Data/Feeds/feed-123.json",
      })),
      ensureFolderExists: vi.fn(async () => {}),
      saveSettings: vi.fn(async () => {}),
      notifyFiltersUpdated: vi.fn(),
    };

    const modal = new EditFeedModal(
      app,
      plugin as unknown as PluginTestFixture,
      feed,
      vi.fn(),
    );
    modal.open();

    expect(getLocalStorageStatus(modal.contentEl).textContent).toBe(
      "Stored in shard storage",
    );
    expect(getLocalStorageFeedId(modal.contentEl).textContent).toBe(
      "Feed ID: feed-123",
    );
  });

  it("copies the resolved local storage address when the copy icon is clicked", async () => {
    const app = createMockApp();
    const feed: Feed = {
      title: "Old title",
      url: "https://example.com/old.xml",
      folder: "Tech",
      items: [],
      lastUpdated: 0,
      feedId: "feed-123",
    } as unknown as Feed;
    const writeTextSpy = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextSpy },
      configurable: true,
    });

    const plugin = {
      app,
      settings: {
        folders: [],
        maxItems: 50,
        storageMode: "vault-shards",
        corsProxyEnabled: false,
        corsProxyUrl: "",
        articleSaving: { savedTemplates: [] },
      },
      getFeedLocalStorageAddress: vi.fn(() => ({
        mode: "vault-shards",
        address: "RSS Data/Feeds/feed-123.json",
      })),
      ensureFolderExists: vi.fn(async () => {}),
      saveSettings: vi.fn(async () => {}),
      notifyFiltersUpdated: vi.fn(),
    };

    const modal = new EditFeedModal(
      app,
      plugin as unknown as PluginTestFixture,
      feed,
      vi.fn(),
    );
    modal.open();

    getLocalStorageCopyButton(modal.contentEl).click();
    await flushPromises();

    expect(writeTextSpy).toHaveBeenCalledWith("RSS Data/Feeds/feed-123.json");
  });

  it("opens with the per-feed controls expanded and highlighted when requested", () => {
    const app = createMockApp();
    const feed: Feed = {
      title: "Old title",
      url: "https://example.com/old.xml",
      folder: "Tech",
      items: [],
      lastUpdated: 0,
    } as unknown as Feed;

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
      app,
      plugin as unknown as PluginTestFixture,
      feed,
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
    } as unknown as Feed;

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
      app,
      plugin as unknown as PluginTestFixture,
      feed,
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
    } as unknown as Feed;

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
      app,
      plugin as unknown as PluginTestFixture,
      feed,
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
    } as unknown as Feed;

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
      app,
      plugin as unknown as PluginTestFixture,
      feed,
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

  it("persists auto-delete duration when changing from disabled to a preset", async () => {
    const app = createMockApp();
    const feed: Feed = {
      title: "Old title",
      url: "https://example.com/old.xml",
      folder: "Tech",
      items: [],
      lastUpdated: 0,
      autoDeleteDuration: 0,
    } as unknown as Feed;

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
      app,
      plugin as unknown as PluginTestFixture,
      feed,
      vi.fn(),
    );
    modal.open();

    const autoDeleteSelect = getSelectBySettingName(
      modal.contentEl,
      "Auto delete articles duration",
    );
    autoDeleteSelect.value = "30";
    autoDeleteSelect.dispatchEvent(new Event("change"));

    getButtonByText(modal.contentEl, "Save").click();
    await flushPromises();

    expect(feed.autoDeleteDuration).toBe(30);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("persists auto-delete duration when changing from a preset to disabled", async () => {
    const app = createMockApp();
    const feed: Feed = {
      title: "Old title",
      url: "https://example.com/old.xml",
      folder: "Tech",
      items: [],
      lastUpdated: 0,
      autoDeleteDuration: 30,
    } as unknown as Feed;

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
      app,
      plugin as unknown as PluginTestFixture,
      feed,
      vi.fn(),
    );
    modal.open();

    const autoDeleteSelect = getSelectBySettingName(
      modal.contentEl,
      "Auto delete articles duration",
    );
    autoDeleteSelect.value = "0";
    autoDeleteSelect.dispatchEvent(new Event("change"));

    getButtonByText(modal.contentEl, "Save").click();
    await flushPromises();

    expect(feed.autoDeleteDuration).toBe(0);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("persists the latest preset auto-delete duration after toggling between timeframes", async () => {
    const app = createMockApp();
    const feed: Feed = {
      title: "Old title",
      url: "https://example.com/old.xml",
      folder: "Tech",
      items: [],
      lastUpdated: 0,
      autoDeleteDuration: 30,
    } as unknown as Feed;

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
      app,
      plugin as unknown as PluginTestFixture,
      feed,
      vi.fn(),
    );
    modal.open();

    const autoDeleteSelect = getSelectBySettingName(
      modal.contentEl,
      "Auto delete articles duration",
    );
    autoDeleteSelect.value = "7";
    autoDeleteSelect.dispatchEvent(new Event("change"));
    autoDeleteSelect.value = "30";
    autoDeleteSelect.dispatchEvent(new Event("change"));

    getButtonByText(modal.contentEl, "Save").click();
    await flushPromises();

    expect(feed.autoDeleteDuration).toBe(30);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("persists a custom auto-delete duration on save", async () => {
    const app = createMockApp();
    const feed: Feed = {
      title: "Old title",
      url: "https://example.com/old.xml",
      folder: "Tech",
      items: [],
      lastUpdated: 0,
      autoDeleteDuration: 0,
    } as unknown as Feed;

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
      app,
      plugin as unknown as PluginTestFixture,
      feed,
      vi.fn(),
    );
    modal.open();

    const autoDeleteSelect = getSelectBySettingName(
      modal.contentEl,
      "Auto delete articles duration",
    );
    autoDeleteSelect.value = "custom";
    autoDeleteSelect.dispatchEvent(new Event("change"));

    const customInput = getNumberInputBySettingName(
      modal.contentEl,
      "Auto delete articles duration",
    );
    customInput.value = "45";
    customInput.dispatchEvent(new Event("change"));

    getButtonByText(modal.contentEl, "Save").click();
    await flushPromises();

    expect(feed.autoDeleteDuration).toBe(45);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: "applies a newly enabled 30-day window immediately",
      initialDuration: 0,
      initialItems: getItemsForDuration(0),
      selections: ["30"],
      expectedDuration: 30,
      expectedGuids: ["recent-read", "mid-read", "recent-unread"],
    },
    {
      label: "keeps current items when switching from 30 days to disabled",
      initialDuration: 30,
      initialItems: getItemsForDuration(30),
      selections: ["0"],
      expectedDuration: 0,
      expectedGuids: [
        "recent-read",
        "mid-read",
        "recent-unread",
        "very-old-read",
      ],
    },
    {
      label:
        "prunes additional old read items when tightening from 30 days to 7 days",
      initialDuration: 30,
      initialItems: getItemsForDuration(30),
      selections: ["7"],
      expectedDuration: 7,
      expectedGuids: ["recent-read", "recent-unread"],
    },
    {
      label:
        "does not restore previously retained old items when loosening from 7 days to 30 days",
      initialDuration: 7,
      initialItems: getItemsForDuration(7),
      selections: ["30"],
      expectedDuration: 30,
      expectedGuids: ["recent-read", "mid-read", "recent-unread"],
    },
    {
      label:
        "applies the latest timeframe after toggling from custom to preset",
      initialDuration: 45,
      initialItems: getItemsForDuration(45),
      selections: ["custom", "45", "7"],
      expectedDuration: 7,
      expectedGuids: ["recent-read", "recent-unread"],
    },
  ])(
    "$label",
    async ({
      initialDuration,
      initialItems,
      selections,
      expectedDuration,
      expectedGuids,
    }) => {
      vi.spyOn(Date, "now").mockReturnValue(AUTO_DELETE_TEST_NOW_MS);

      const app = createMockApp();
      const feed: Feed = {
        title: "Old title",
        url: "https://example.com/old.xml",
        folder: "Tech",
        items: initialItems,
        lastUpdated: 0,
        autoDeleteDuration: initialDuration,
        maxItemsLimit: 0,
      } as unknown as Feed;

      const refreshSelectedFeed = vi.fn(async (targetFeed: Feed) => {
        targetFeed.items = getItemsForDuration(
          targetFeed.autoDeleteDuration ?? 0,
        );
      });

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
        refreshSelectedFeed,
        notifyFiltersUpdated: vi.fn(),
      };

      const modal = new EditFeedModal(
        app,
        plugin as unknown as PluginTestFixture,
        feed,
        vi.fn(),
      );
      modal.open();

      const autoDeleteSelect = getSelectBySettingName(
        modal.contentEl,
        "Auto delete articles duration",
      );

      for (const selection of selections) {
        if (selection === "custom") {
          autoDeleteSelect.value = "custom";
          autoDeleteSelect.dispatchEvent(new Event("change"));
          continue;
        }

        const customValue = Number.parseInt(selection, 10);
        if (autoDeleteSelect.value === "custom" && !Number.isNaN(customValue)) {
          const customInput = getNumberInputBySettingName(
            modal.contentEl,
            "Auto delete articles duration",
          );
          customInput.value = selection;
          customInput.dispatchEvent(new Event("change"));
          continue;
        }

        autoDeleteSelect.value = selection;
        autoDeleteSelect.dispatchEvent(new Event("change"));
      }

      getButtonByText(modal.contentEl, "Save").click();
      await flushPromises();

      expect(feed.autoDeleteDuration).toBe(expectedDuration);
      expect(refreshSelectedFeed).toHaveBeenCalledTimes(1);
      expect(feed.items.map((item) => item.guid)).toEqual(expectedGuids);
    },
  );

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
        } as unknown as ArticleTestFixture,
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
      app,
      plugin as unknown as PluginTestFixture,
      feed,
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
    } as unknown as Feed;

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
      app,
      plugin as unknown as PluginTestFixture,
      feed,
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
