/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import {
  type RssDashboardSettings,
  type PodcastTheme,
  type Folder,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
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

function sampleFolders(): Folder[] {
  return [
    {
      name: "Twitter",
      subfolders: [
        {
          name: "Lists",
          subfolders: [],
        },
      ],
    },
    {
      name: "YouTube",
      subfolders: [],
    },
    {
      name: "Podcast",
      subfolders: [],
    },
  ];
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("renderMediaSettingsTab()", () => {
  it("renders auto-tag videos before playback progress and persists toggle changes", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.media.rememberPlaybackProgress = true;

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
      getActiveReaderView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const names = Array.from(
      containerEl.querySelectorAll(".setting-item-name"),
    ).map((el) => el.textContent?.trim());

    expect(names[0]).toBe("Auto-tag videos");
    expect(names).toContain("Playback progress");
    expect(names).toContain("Remember playback progress");

    const playbackHeadingIndex = names.indexOf("Playback progress");
    const rememberProgressIndex = names.indexOf("Remember playback progress");
    expect(playbackHeadingIndex).toBeGreaterThan(-1);
    expect(rememberProgressIndex).toBeGreaterThan(playbackHeadingIndex);

    const progressSetting = getSettingByName(
      containerEl,
      "Remember playback progress",
    );
    const toggle = progressSetting.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    toggle.click();
    await flushPromises();

    expect(plugin.settings.media.rememberPlaybackProgress).toBe(false);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
  });

  it("runs the clear playback progress action", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 3),
      getActiveReaderView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const clearSetting = getSettingByName(
      containerEl,
      "Clear saved playback progress",
    );
    const button = clearSetting.querySelector("button") as HTMLButtonElement;
    button.click();
    await flushPromises();

    expect(vi.mocked(plugin.clearPlaybackProgress)).toHaveBeenCalledTimes(1);
  });

  it("persists default media folders and normalizes paths", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.media.defaultYouTubeFolder = "YouTube";

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
    } as unknown as RssDashboardPlugin;

    vi.spyOn(obsidian, "normalizePath").mockImplementation(
      (p: string) => `norm:${p}`,
    );

    renderMediaSettingsTab(containerEl, plugin);

    const youtubeSetting = getSettingByName(
      containerEl,
      "Default YouTube folder",
    );
    const input = youtubeSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    expect(input.value).toBe("YouTube");

    input.value = "Media/YouTube";
    input.dispatchEvent(new Event("input"));
    await flushPromises();

    expect(plugin.settings.media.defaultYouTubeFolder).toBe(
      "norm:Media/YouTube",
    );
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
  });

  it("renders and persists the default Twitter folder", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.media.defaultTwitterFolder = "Twitter";

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
    } as unknown as RssDashboardPlugin;

    vi.spyOn(obsidian, "normalizePath").mockImplementation(
      (p: string) => `norm:${p}`,
    );

    renderMediaSettingsTab(containerEl, plugin);

    const twitterSetting = getSettingByName(
      containerEl,
      "Default Twitter folder",
    );
    const input = twitterSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;

    expect(input.value).toBe("Twitter");

    input.value = "Social/Twitter";
    input.dispatchEvent(new Event("input"));
    await flushPromises();

    expect(plugin.settings.media.defaultTwitterFolder).toBe(
      "norm:Social/Twitter",
    );
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
  });

  it("wires media folder settings with the shared folder suggester defaults", async () => {
    vi.resetModules();

    const capturedOptions: Array<{ showAddNewOption?: boolean } | undefined> =
      [];

    vi.doMock("../../../src/components/folder-suggest", async () => {
      const actual =
        await vi.importActual<typeof import("../../../src/components/folder-suggest")>(
          "../../../src/components/folder-suggest",
        );

      return {
        ...actual,
        FolderSuggest: class extends actual.FolderSuggest {
          constructor(
            app: obsidian.App,
            inputEl: HTMLInputElement,
            folders: Folder[],
            options?: { showAddNewOption?: boolean },
          ) {
            capturedOptions.push(options);
            super(app, inputEl, folders, options);
          }
        },
      };
    });

    const { renderMediaSettingsTab: renderWithMock } = await import(
      "../../../src/settings/tabs/media-settings-tab"
    );

    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.folders = sampleFolders();

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
    } as unknown as RssDashboardPlugin;

    renderWithMock(containerEl, plugin);

    expect(capturedOptions).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("persists an existing folder selected from media settings suggestions", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.folders = sampleFolders();
    settings.media.defaultTwitterFolder = "Twitter";

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
    } as unknown as RssDashboardPlugin;

    vi.spyOn(obsidian, "normalizePath").mockImplementation(
      (p: string) => `norm:${p}`,
    );

    renderMediaSettingsTab(containerEl, plugin);

    const twitterSetting = getSettingByName(
      containerEl,
      "Default Twitter folder",
    );
    const input = twitterSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;

    const { FolderSuggest } = await import(
      "../../../src/components/folder-suggest"
    );
    const suggest = new FolderSuggest(plugin.app, input, plugin.settings.folders);

    suggest.selectSuggestion("Twitter/Lists", new MouseEvent("click"));
    await flushPromises();

    expect(input.value).toBe("Twitter/Lists");
    expect(plugin.settings.media.defaultTwitterFolder).toBe(
      "norm:Twitter/Lists",
    );
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
  });

  it("keeps manually entered text when add new folder is chosen from settings suggestions", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.folders = sampleFolders();
    settings.media.defaultTwitterFolder = "";

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const twitterSetting = getSettingByName(
      containerEl,
      "Default Twitter folder",
    );
    const input = twitterSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    input.value = "Social/Custom";

    const { FolderSuggest } = await import(
      "../../../src/components/folder-suggest"
    );
    const suggest = new FolderSuggest(plugin.app, input, plugin.settings.folders);

    suggest.selectSuggestion("Add new folder...", new MouseEvent("click"));
    await flushPromises();

    expect(input.value).toBe("Social/Custom");
    expect(plugin.settings.media.defaultTwitterFolder).toBe("");
    expect(vi.mocked(plugin.saveSettings)).not.toHaveBeenCalled();
  });

  it("updates podcast theme and refreshes reader view when available", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.media.podcastTheme = "obsidian" as PodcastTheme;

    const updatePodcastTheme = vi.fn();
    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
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
