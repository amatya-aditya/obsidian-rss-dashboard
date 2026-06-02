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

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("renderTagsSettingsTab()", () => {
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
      getActiveDashboardView: vi.fn(async () => null),
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
      getActiveDashboardView: vi.fn(async () => null),
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
