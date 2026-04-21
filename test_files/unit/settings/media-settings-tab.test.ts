import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { renderMediaSettingsTab } from "../../../src/settings/tabs/media-settings-tab";
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

describe("renderMediaSettingsTab()", () => {
  it("persists default media folders and normalizes paths", async () => {
    const containerEl = document.body.createDiv();
    const settings = cloneSettings();
    settings.media.defaultYouTubeFolder = "YouTube";

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
    };

    vi.spyOn(obsidian, "normalizePath").mockImplementation((p: string) => `norm:${p}`);

    renderMediaSettingsTab(containerEl, plugin as any);

    const youtubeSetting = getSettingByName(containerEl, "Default YouTube folder");
    const input = youtubeSetting.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe("YouTube");

    input.value = "Media/YouTube";
    input.dispatchEvent(new Event("input"));
    await flushPromises();

    expect(plugin.settings.media.defaultYouTubeFolder).toBe("norm:Media/YouTube");
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("updates podcast theme and refreshes reader view when available", async () => {
    const containerEl = document.body.createDiv();
    const settings = cloneSettings();
    settings.media.podcastTheme = "obsidian" as any;

    const updatePodcastTheme = vi.fn();
    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      getActiveReaderView: vi.fn(async () => ({ updatePodcastTheme })),
    };

    renderMediaSettingsTab(containerEl, plugin as any);

    const themeSetting = getSettingByName(containerEl, "Player theme");
    const select = themeSetting.querySelector("select") as HTMLSelectElement;
    select.value = "nord";
    select.dispatchEvent(new Event("change"));
    await flushPromises();

    expect(plugin.settings.media.podcastTheme).toBe("nord");
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(updatePodcastTheme).toHaveBeenCalledWith("nord");
  });
});

