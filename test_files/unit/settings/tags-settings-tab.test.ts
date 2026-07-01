import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import {
  type RssDashboardSettings,
  type Feed,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { renderTagsSettingsTab } from "../../../src/settings/tabs/tags-settings-tab";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type RssDashboardPlugin from "../../../main";

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function getTagTrigger(settingEl: HTMLElement): HTMLButtonElement {
  const trigger = settingEl.querySelector(
    ".rss-dashboard-tag-multi-select-trigger",
  );
  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error("Tag trigger not found");
  }
  return trigger;
}

function getOpenTagMenu(): HTMLElement {
  const menu = document.body.querySelector(
    ".rss-dashboard-tag-multi-select-menu",
  );
  if (!(menu instanceof HTMLElement)) {
    throw new Error("Tag menu not found");
  }
  return menu;
}

function getTagOption(name: string): HTMLButtonElement {
  const option = Array.from(
    getOpenTagMenu().querySelectorAll<HTMLButtonElement>(
      ".rss-dashboard-tag-multi-select-menu-option",
    ),
  ).find((el) => el.getAttribute("data-tag-name") === name);
  if (!(option instanceof HTMLButtonElement)) {
    throw new Error(`Tag option not found: ${name}`);
  }
  return option;
}

const autoTagRows = [
  "Tag for video articles",
  "Default Twitter tag",
  "Default Mastodon tag",
  "Default YouTube tag",
  "Default podcast tag",
  "Default RSS tag",
  "Default smallweb tag",
] as const;

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("renderTagsSettingsTab()", () => {
  it("renders Auto Tagging before the tag list and add-tag section", () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.availableTags = [{ name: "Video", color: "#d04747" }];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    const names = Array.from(
      containerEl.querySelectorAll(".setting-item-name"),
    ).map((el) => el.textContent?.trim());

    expect(names[0]).toBe("Auto tagging");
    expect(names.slice(1, 8)).toEqual(autoTagRows);
    expect(names.indexOf("Add new tag")).toBeGreaterThan(
      names.indexOf("Reset tag names"),
    );
  });

  it("renders all auto-tag rows as tag multi-select triggers instead of native selects", () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.availableTags = [
      { name: "Video", color: "#d04747" },
      { name: "News", color: "#3498db" },
    ];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    for (const name of autoTagRows) {
      const setting = getSettingByName(containerEl, name);
      expect(setting.querySelector("select")).toBeNull();
      expect(
        setting.querySelector(".rss-dashboard-tag-multi-select-trigger"),
      ).not.toBeNull();
    }
  });

  it("renders selected summaries for single, multiple, and empty selections", () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.availableTags = [
      { name: "Video", color: "#d04747" },
      { name: "News", color: "#3498db" },
      { name: "Tech", color: "#2ecc71" },
    ];
    settings.media.defaultVideoTags = ["Video"];
    settings.media.defaultYouTubeTags = ["Video", "News"];
    settings.media.defaultRssTags = [];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    expect(
      getTagTrigger(getSettingByName(containerEl, "Tag for video articles"))
        .textContent,
    ).toContain("Video");
    expect(
      getTagTrigger(getSettingByName(containerEl, "Default YouTube tag"))
        .textContent,
    ).toContain("2 tags selected");
    expect(
      getTagTrigger(getSettingByName(containerEl, "Default RSS tag"))
        .textContent,
    ).toContain("None");
  });

  it("toggles auto-tag selections, persists array settings, and updates aria state", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.availableTags = [
      { name: "Video", color: "#d04747" },
      { name: "News", color: "#3498db" },
      { name: "Tech", color: "#2ecc71" },
    ];
    settings.media.defaultVideoTags = ["Video"];
    settings.media.defaultYouTubeTags = ["Video", "News"];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    const videoTrigger = getTagTrigger(
      getSettingByName(containerEl, "Tag for video articles"),
    );
    videoTrigger.click();
    expect(getTagOption("Video").getAttribute("aria-pressed")).toBe("true");
    expect(getTagOption("News").getAttribute("aria-pressed")).toBe("false");

    getTagOption("News").click();
    await flushPromises();

    expect(plugin.settings.media.defaultVideoTags).toEqual(["Video", "News"]);
    expect(videoTrigger.textContent).toContain("2 tags selected");

    const youtubeTrigger = getTagTrigger(
      getSettingByName(containerEl, "Default YouTube tag"),
    );
    youtubeTrigger.click();
    getTagOption("Video").click();
    await flushPromises();

    expect(plugin.settings.media.defaultYouTubeTags).toEqual(["News"]);
    expect(youtubeTrigger.textContent).toContain("News");
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(2);
  });

  it("shows a disabled empty-state trigger when availableTags is empty", () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.availableTags = [];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    const tagSetting = getSettingByName(containerEl, "Tag for video articles");
    const wrapper = tagSetting.querySelector(".rss-dashboard-tag-multi-select");
    const trigger = getTagTrigger(tagSetting);

    expect(wrapper).not.toBeNull();
    expect(
      wrapper?.classList.contains("rss-dashboard-tag-multi-select--empty"),
    ).toBe(true);
    expect(trigger.disabled).toBe(true);
    expect(trigger.textContent?.toLowerCase()).toContain("none");
  });

  it("restores default tag arrays on reset and refreshes the tab", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.availableTags = [{ name: "Custom", color: "#123456" }];
    settings.media.defaultVideoTag = "Custom";
    settings.media.defaultVideoTags = ["Custom"];
    settings.media.defaultYouTubeTags = ["Custom"];
    const onRefresh = vi.fn();

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, onRefresh);

    const resetSetting = getSettingByName(containerEl, "Reset tag names");
    const resetButton = resetSetting.querySelector(
      "button",
    ) as HTMLButtonElement;
    resetButton.click();
    await flushPromises();

    expect(plugin.settings.media.defaultVideoTag).toBe("Video");
    expect(plugin.settings.media.defaultVideoTags).toEqual(["Video"]);
    expect(plugin.settings.media.defaultYouTubeTags).toEqual(["Video"]);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("persists color changes, updates applied tags, and refreshes open tag views", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.availableTags = [{ name: "tag1", color: "#000000" }];
    settings.feeds = [
      {
        name: "Feed 1",
        url: "https://example.com/feed.xml",
        folder: "",
        items: [
          {
            title: "Article 1",
            link: "https://example.com/article-1",
            pubDate: new Date().toISOString(),
            content: "",
            description: "",
            guid: "article-1",
            read: false,
            feedUrl: "https://example.com/feed.xml",
            feedTitle: "Feed 1",
            tags: [{ name: "tag1", color: "#000000" }],
            saved: false,
            starred: false,
          },
        ],
      } as unknown as Feed,
    ];

    const trigger = vi.fn();
    const mockApp = obsidian.App.createMock();
    (mockApp.workspace as unknown as { trigger: typeof trigger }).trigger =
      trigger;

    const plugin = {
      app: mockApp,
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    const tagSetting = getSettingByName(containerEl, "tag1");
    const picker = tagSetting.querySelector(
      'input[type="color"]',
    ) as HTMLInputElement;
    picker.value = "#ff0000";
    picker.dispatchEvent(new Event("input"));
    await flushPromises();

    expect(plugin.settings.availableTags[0].color).toBe("#ff0000");
    expect(plugin.settings.feeds[0].items[0].tags?.[0].color).toBe("#ff0000");
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(plugin.refreshOpenTagColorViews)).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledWith("rss-dashboard:tags-mutated");
  });

  it("deletes an existing tag and refreshes", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.availableTags = [{ name: "tag1", color: "#000000" }];
    const onRefresh = vi.fn();

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, onRefresh);

    const deleteBtn = containerEl.querySelector(
      'button[data-icon="trash"]',
    ) as HTMLButtonElement;
    deleteBtn.click();
    await flushPromises();

    expect(plugin.settings.availableTags).toHaveLength(0);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("adds a new tag and refreshes", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.availableTags = [];
    const onRefresh = vi.fn();

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, onRefresh);

    const tagNameSetting = getSettingByName(containerEl, "Tag name");
    const nameInput = tagNameSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    nameInput.value = "newTag";
    nameInput.dispatchEvent(new Event("input"));

    const tagColorSetting = getSettingByName(containerEl, "Tag color");
    const colorInput = tagColorSetting.querySelector(
      'input[type="color"]',
    ) as HTMLInputElement;
    colorInput.value = "#123456";
    colorInput.dispatchEvent(new Event("input"));

    const addBtn = Array.from(containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Add tag",
    ) as HTMLButtonElement;
    addBtn.click();
    await flushPromises();

    expect(plugin.settings.availableTags).toHaveLength(1);
    expect(plugin.settings.availableTags[0]).toEqual({
      name: "newTag",
      color: "#123456",
    });
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
