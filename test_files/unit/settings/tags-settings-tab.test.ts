import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { renderTagsSettingsTab } from "../../../src/settings/tabs/tags-settings-tab";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

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

function cloneSettings(): typeof DEFAULT_SETTINGS {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("renderTagsSettingsTab()", () => {
  it("persists color changes and re-renders dashboard when a view is active", async () => {
    const containerEl = document.body.createDiv();
    const settings = cloneSettings();
    settings.availableTags = [{ name: "tag1", color: "#000000" }];

    const revealLeaf = vi.fn(async () => {});
    (settings as any).display = settings.display ?? {};

    const view = { leaf: {}, render: vi.fn() };
    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => view),
    };

    (plugin.app.workspace as any).revealLeaf = revealLeaf;

    renderTagsSettingsTab(containerEl, plugin as any, vi.fn());

    const tagSetting = getSettingByName(containerEl, "tag1");
    const picker = tagSetting.querySelector('input[type="color"]') as HTMLInputElement;
    picker.value = "#ff0000";
    picker.dispatchEvent(new Event("input"));
    await flushPromises();

    expect(plugin.settings.availableTags[0].color).toBe("#ff0000");
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(revealLeaf).toHaveBeenCalledTimes(1);
    expect(view.render).toHaveBeenCalledTimes(1);
  });

  it("deletes an existing tag and refreshes", async () => {
    const containerEl = document.body.createDiv();
    const settings = cloneSettings();
    settings.availableTags = [{ name: "tag1", color: "#000000" }];
    const onRefresh = vi.fn();

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
    };

    renderTagsSettingsTab(containerEl, plugin as any, onRefresh);

    const deleteBtn = containerEl.querySelector(
      'button[data-icon="trash"]',
    ) as HTMLButtonElement;
    deleteBtn.click();
    await flushPromises();

    expect(plugin.settings.availableTags).toHaveLength(0);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("adds a new tag and refreshes", async () => {
    const containerEl = document.body.createDiv();
    const settings = cloneSettings();
    settings.availableTags = [];
    const onRefresh = vi.fn();

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
    };

    renderTagsSettingsTab(containerEl, plugin as any, onRefresh);

    const tagNameSetting = getSettingByName(containerEl, "Tag name");
    const nameInput = tagNameSetting.querySelector('input[type="text"]') as HTMLInputElement;
    nameInput.value = "newTag";
    nameInput.dispatchEvent(new Event("input"));

    const tagColorSetting = getSettingByName(containerEl, "Tag color");
    const colorInput = tagColorSetting.querySelector('input[type="color"]') as HTMLInputElement;
    colorInput.value = "#123456";
    colorInput.dispatchEvent(new Event("input"));

    const addBtn = Array.from(containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Add tag",
    ) as HTMLButtonElement;
    addBtn.click();
    await flushPromises();

    expect(plugin.settings.availableTags).toHaveLength(1);
    expect(plugin.settings.availableTags[0]).toEqual({ name: "newTag", color: "#123456" });
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

