/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { type RssDashboardSettings, type PodcastTheme, DEFAULT_SETTINGS } from "../../../src/types/types";
import { renderMediaSettingsTab } from "../../../src/settings/tabs/media-settings-tab";
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

describe("renderMediaSettingsTab()", () => {
  it("renders auto-tag videos as the first media option and persists toggle changes", async () => {
    const containerEl = document.body.appendChild(document.createElement("div"));
    const settings = cloneSettings();
    settings.media.autoTagVideos = true;

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      getActiveReaderView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const names = Array.from(
      containerEl.querySelectorAll(".setting-item-name"),
    ).map((el) => el.textContent?.trim());

    expect(names[0]).toBe("Auto-tag videos");

    const autoTagSetting = getSettingByName(containerEl, "Auto-tag videos");
    const toggle = autoTagSetting.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    toggle.click();
    await flushPromises();

    expect(plugin.settings.media.autoTagVideos).toBe(false);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
  });

  it("persists default media folders and normalizes paths", async () => {
    const containerEl = document.body.appendChild(document.createElement("div"));
    const settings = cloneSettings();
    settings.media.defaultYouTubeFolder = "YouTube";

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    vi.spyOn(obsidian, "normalizePath").mockImplementation((p: string) => `norm:${p}`);

    renderMediaSettingsTab(containerEl, plugin);

    const youtubeSetting = getSettingByName(containerEl, "Default YouTube folder");
    const input = youtubeSetting.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe("YouTube");

    input.value = "Media/YouTube";
    input.dispatchEvent(new Event("input"));
    await flushPromises();

    expect(plugin.settings.media.defaultYouTubeFolder).toBe("norm:Media/YouTube");
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
  });

  it("updates podcast theme and refreshes reader view when available", async () => {
    const containerEl = document.body.appendChild(document.createElement("div"));
    const settings = cloneSettings();
    settings.media.podcastTheme = "obsidian" as PodcastTheme;

    const updatePodcastTheme = vi.fn();
    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      getActiveReaderView: vi.fn(async () => ({ updatePodcastTheme })),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const themeSetting = getSettingByName(containerEl, "Player theme");
    const select = themeSetting.querySelector("select") as HTMLSelectElement;
    select.value = "nord";
    select.dispatchEvent(new Event("change"));
    await flushPromises();

    expect(plugin.settings.media.podcastTheme).toBe("nord");
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
    expect(updatePodcastTheme).toHaveBeenCalledWith("nord");
  });
});


