/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import {
  type RssDashboardSettings,
  type PodcastTheme,
  type Folder,
  Feed,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import {
  renderMediaSettingsTab,
  DomainIconToggleConfirmModal,
  collectDomainFeeds,
  fetchDomainFeedIcons,
} from "../../../src/settings/tabs/media-settings-tab";
import { FeedParser } from "../../../src/services/feed-parser";
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
  const menu = document.body.querySelector(".rss-dashboard-tag-multi-select-menu");
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

    expect(names[0]).toBe("Tag for video articles");
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

  it("renders and persists the default Mastodon folder", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.media.defaultMastodonFolder = "Mastodon";

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

    const mastodonHeading = getSettingByName(containerEl, "Mastodon");
    expect(mastodonHeading).toBeDefined();

    const mastodonSetting = getSettingByName(
      containerEl,
      "Default Mastodon folder",
    );
    const input = mastodonSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;

    expect(input.value).toBe("Mastodon");

    input.value = "Social/Mastodon";
    input.dispatchEvent(new Event("input"));
    await flushPromises();

    expect(plugin.settings.media.defaultMastodonFolder).toBe(
      "norm:Social/Mastodon",
    );
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
  });

  it("renders YouTube tag as a dropdown multi-select and persists array changes", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.availableTags = [
      { name: "MyVideo", color: "#f00" },
      { name: "MyPodcast", color: "#00f" },
    ];
    settings.media.defaultYouTubeTags = ["MyVideo"];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const trigger = getTagTrigger(
      getSettingByName(containerEl, "Default YouTube tag"),
    );
    expect(trigger.textContent).toContain("MyVideo");

    trigger.click();
    expect(getTagOption("MyVideo").getAttribute("aria-pressed")).toBe("true");
    expect(getTagOption("MyPodcast").getAttribute("aria-pressed")).toBe("false");

    getTagOption("MyVideo").click();
    await flushPromises();

    expect(plugin.settings.media.defaultYouTubeTags).toEqual([]);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
    expect(trigger.textContent).toContain("None");
  });

  it("renders Twitter and Mastodon tags as dropdown multi-selects and persists array changes", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.availableTags = [
      { name: "MyTwitter", color: "#1da1f2" },
      { name: "MyMastodon", color: "#2b90d9" },
    ];
    settings.media.defaultTwitterTags = ["MyTwitter"];
    settings.media.defaultMastodonTags = ["MyMastodon"];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const twitterTrigger = getTagTrigger(
      getSettingByName(containerEl, "Default Twitter tag"),
    );
    const mastodonTrigger = getTagTrigger(
      getSettingByName(containerEl, "Default Mastodon tag"),
    );

    expect(twitterTrigger.textContent).toContain("MyTwitter");
    expect(mastodonTrigger.textContent).toContain("MyMastodon");

    twitterTrigger.click();
    getTagOption("MyTwitter").click();
    await flushPromises();

    expect(plugin.settings.media.defaultTwitterTags).toEqual([]);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
    expect(twitterTrigger.textContent).toContain("None");

    mastodonTrigger.click();
    getTagOption("MyMastodon").click();
    await flushPromises();

    expect(plugin.settings.media.defaultMastodonTags).toEqual([]);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(2);
    expect(mastodonTrigger.textContent).toContain("None");
  });

  it("renders and persists the Mastodon profile image toggle", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    settings.media.useMastodonProfileImages = false;

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
      getActiveDashboardView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const toggleSetting = getSettingByName(
      containerEl,
      "Use profile images for Mastodon feeds",
    );
    const toggle = toggleSetting.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;

    expect(toggle.checked).toBe(false);

    toggle.click();
    await flushPromises();

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    expect(plugin.settings.media.useMastodonProfileImages).toBe(true);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(2);
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

  it("renders and persists the RSS site icons toggle", async () => {
    const containerEl = document.body.appendChild(document.createElement("div"));
    const settings = cloneSettings();
    settings.media.useDomainIconsRss = false;
    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
      getActiveDashboardView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const toggleSetting = getSettingByName(containerEl, "Use site icons/favicons for RSS feeds");
    const toggle = toggleSetting.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    toggle.click();
    await flushPromises();

    expect(plugin.settings.media.useDomainIconsRss).toBe(true);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(2);
  });

  it("renders the YouTube info message", async () => {
    const containerEl = document.body.appendChild(document.createElement("div"));
    const settings = cloneSettings();
    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
      getActiveDashboardView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const setting = getSettingByName(containerEl, "Channel profile images");
    expect(setting).toBeDefined();
    expect(setting.querySelector(".setting-item-description")?.textContent).toContain("YouTube RSS feeds do not provide channel profile images");
  });

  it("renders and persists the Podcast artwork toggle", async () => {
    const containerEl = document.body.appendChild(document.createElement("div"));
    const settings = cloneSettings();
    settings.media.useDomainIconsPodcast = false;
    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
      getActiveDashboardView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const toggleSetting = getSettingByName(containerEl, "Use album/show artwork for Podcast feeds");
    const toggle = toggleSetting.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    toggle.click();
    await flushPromises();

    expect(plugin.settings.media.useDomainIconsPodcast).toBe(true);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(2);
  });

  it("renders and persists the Twitter profile images toggle", async () => {
    const containerEl = document.body.appendChild(document.createElement("div"));
    const settings = cloneSettings();
    settings.media.useDomainIconsTwitter = false;
    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
      getActiveDashboardView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const toggleSetting = getSettingByName(containerEl, "Use profile images for Twitter/Nitter feeds");
    const toggle = toggleSetting.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    toggle.click();
    await flushPromises();

    expect(plugin.settings.media.useDomainIconsTwitter).toBe(true);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(2);
  });

  it("displays tag rows as dropdown multi-select triggers instead of inline chip lists", () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.availableTags = [
      { name: "MyVideo", color: "#f00" },
      { name: "MyPodcast", color: "#00f" },
    ];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const tagSettingNames = [
      "Tag for video articles",
      "Default Twitter tag",
      "Default Mastodon tag",
      "Default YouTube tag",
      "Default podcast tag",
      "Default RSS tag",
      "Default smallweb tag",
    ];

    for (const name of tagSettingNames) {
      const setting = getSettingByName(containerEl, name);
      const hasSelect = !!setting.querySelector("select");
      const trigger = setting.querySelector(".rss-dashboard-tag-multi-select-trigger");
      expect(hasSelect).toBe(false, `"${name}" should not have a <select> element`);
      expect(trigger).not.toBeNull(`"${name}" should have a tag dropdown trigger`);
    }
  });

  it("renders trigger summaries from array defaults", () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.availableTags = [
      { name: "Important", color: "#e74c3c" },
      { name: "Video", color: "#d04747" },
      { name: "Podcast", color: "#8e44ad" },
    ];
    settings.media.defaultYouTubeTags = ["Important", "Video"];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const setting = getSettingByName(containerEl, "Default YouTube tag");
    const trigger = getTagTrigger(setting);

    expect(trigger.textContent).toContain("2 tags selected");
  });

  it("renders menu options with aria-pressed true for selected and false for unselected", () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.availableTags = [
      { name: "A", color: "#e74c3c" },
      { name: "B", color: "#3498db" },
      { name: "C", color: "#2ecc71" },
    ];
    settings.media.defaultVideoTags = ["B"];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const setting = getSettingByName(containerEl, "Tag for video articles");
    const trigger = getTagTrigger(setting);
    trigger.click();

    const options = getOpenTagMenu().querySelectorAll<HTMLElement>(
      ".rss-dashboard-tag-multi-select-menu-option",
    );
    expect(options.length).toBe(3);

    for (const option of Array.from(options)) {
      const pressed = option.getAttribute("aria-pressed");
      expect(["true", "false"]).toContain(pressed);
    }

    expect(getTagOption("B").getAttribute("aria-pressed")).toBe("true");
    expect(getTagOption("A").getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles a tag option and persists the cumulative string array", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.availableTags = [
      { name: "X", color: "#e74c3c" },
      { name: "Y", color: "#3498db" },
      { name: "Z", color: "#2ecc71" },
    ];
    settings.media.defaultVideoTags = ["X"];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
      getActiveReaderView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const setting = getSettingByName(containerEl, "Tag for video articles");
    const trigger = getTagTrigger(setting);
    trigger.click();
    getTagOption("Y").click();
    await flushPromises();

    expect(plugin.settings.media.defaultVideoTags).toEqual(["X", "Y"]);
    expect(trigger.textContent).toContain("2 tags selected");
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
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
      clearPlaybackProgress: vi.fn(async () => 0),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const tagSetting = getSettingByName(
      containerEl,
      "Tag for video articles",
    );
    const wrapper = tagSetting.querySelector(".rss-dashboard-tag-multi-select");
    const trigger = getTagTrigger(tagSetting);
    expect(wrapper).not.toBeNull();
    expect(
      wrapper?.classList.contains("rss-dashboard-tag-multi-select--empty"),
    ).toBe(true);
    expect(trigger.disabled).toBe(true);
    expect(trigger.textContent?.toLowerCase()).toContain("none");
  });

  it("restores defaultVideoTags to ['Video'] on reset tag names button click", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.availableTags = [{ name: "Custom", color: "#123456" }];
    settings.media.defaultVideoTags = ["Custom"];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
      getActiveDashboardView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const trigger = getTagTrigger(
      getSettingByName(containerEl, "Tag for video articles"),
    );
    expect(trigger.textContent).toContain("Custom");

    const resetSetting = getSettingByName(containerEl, "Reset tag names");
    const resetButton = resetSetting.querySelector(
      "button",
    ) as HTMLButtonElement;
    resetButton.click();
    await flushPromises();

    expect(plugin.settings.media.defaultVideoTags).toEqual(["Video"]);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalled();
  });
});

describe("DomainIconToggleConfirmModal", () => {
  it("renders heading and description text correctly with domain substitution", () => {
    const app = obsidian.App.createMock();
    const modal = new DomainIconToggleConfirmModal(app, {
      domainName: "RSS",
      heading: "Clear {domainName} icons?",
      description: "Are you sure about {domainName}?",
      cancelLabel: "Cancel",
      confirmLabel: "Confirm",
    });
    modal.open();
    
    expect(modal.contentEl.querySelector("h2")?.textContent).toBe("Clear RSS icons?");
    expect(modal.contentEl.querySelector("p")?.textContent).toBe("Are you sure about RSS?");
  });

  it("renders Cancel and Confirm buttons with correct labels", () => {
    const app = obsidian.App.createMock();
    const modal = new DomainIconToggleConfirmModal(app, {
      domainName: "YouTube",
      heading: "Heading",
      description: "Description",
      cancelLabel: "Nah",
      confirmLabel: "Yeah",
    });
    modal.open();
    
    const buttons = Array.from(modal.contentEl.querySelectorAll("button"));
    expect(buttons[0].textContent).toBe("Nah");
    expect(buttons[1].textContent).toBe("Yeah");
  });

  it("calls optional onConfirm callback when confirmed", async () => {
    const app = obsidian.App.createMock();
    const onConfirm = vi.fn();
    const modal = new DomainIconToggleConfirmModal(app, {
      domainName: "RSS",
      heading: "H",
      description: "D",
      cancelLabel: "C",
      confirmLabel: "K",
      onConfirm,
    });
    modal.open();
    
    const promise = modal.waitForClose();
    const buttons = Array.from(modal.contentEl.querySelectorAll("button"));
    buttons[1].click(); // Confirm
    
    await promise;
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("resolves false when Cancel is clicked", async () => {
    const app = obsidian.App.createMock();
    const modal = new DomainIconToggleConfirmModal(app, {
      domainName: "RSS",
      heading: "H",
      description: "D",
      cancelLabel: "Cancel",
      confirmLabel: "Confirm",
    });
    modal.open();
    
    const promise = modal.waitForClose();
    const buttons = Array.from(modal.contentEl.querySelectorAll("button"));
    buttons[0].click(); // Cancel
    
    const result = await promise;
    expect(result).toBe(false);
  });

  it("resolves true when Confirm is clicked", async () => {
    const app = obsidian.App.createMock();
    const modal = new DomainIconToggleConfirmModal(app, {
      domainName: "RSS",
      heading: "H",
      description: "D",
      cancelLabel: "Cancel",
      confirmLabel: "Confirm",
    });
    modal.open();
    
    const promise = modal.waitForClose();
    const buttons = Array.from(modal.contentEl.querySelectorAll("button"));
    buttons[1].click(); // Confirm
    
    const result = await promise;
    expect(result).toBe(true);
  });

  it("resolves false when closed without clicking buttons (backdrop/escape)", async () => {
    const app = obsidian.App.createMock();
    const modal = new DomainIconToggleConfirmModal(app, {
      domainName: "RSS",
      heading: "H",
      description: "D",
      cancelLabel: "Cancel",
      confirmLabel: "Confirm",
    });
    modal.open();
    
    const promise = modal.waitForClose();
    modal.close(); // simulate clicking backdrop or escape which calls close()
    
    const result = await promise;
    expect(result).toBe(false);
  });
});

describe("MediaSettings Types", () => {
  it("defines the domain icon toggle fields and check defaults", () => {
    expect(DEFAULT_SETTINGS.media.useDomainIconsRss).toBe(false);
    expect(DEFAULT_SETTINGS.media.useDomainIconsPodcast).toBe(false);
    expect(DEFAULT_SETTINGS.media.useDomainIconsTwitter).toBe(false);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    expect(DEFAULT_SETTINGS.media.useMastodonProfileImages).toBe(false);

    const settingsCopy = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
    settingsCopy.media.useDomainIconsRss = true;
    settingsCopy.media.useDomainIconsPodcast = true;
    settingsCopy.media.useDomainIconsTwitter = true;

    expect(settingsCopy.media.useDomainIconsRss).toBe(true);
    expect(settingsCopy.media.useDomainIconsPodcast).toBe(true);
    expect(settingsCopy.media.useDomainIconsTwitter).toBe(true);
  });
});

describe("Icon refresh helpers", () => {
  it("collectDomainFeeds correctly filters feeds matching matchesDomain", () => {
    const feeds = [
      { url: "https://example.com/rss", title: "Feed 1", items: [] },
      { url: "https://youtube.com/channel/123", title: "Feed 2", items: [] },
      { url: "https://example.com/podcast", title: "Feed 3", items: [] },
    ];

    const matchesDomain = (feed: { url: string }) => feed.url.includes("youtube.com");
    const result = collectDomainFeeds(feeds as unknown as Feed[], matchesDomain);

    expect(result).toHaveLength(3);
    expect(result[0].needsRefresh).toBe(false);
    expect(result[1].needsRefresh).toBe(true);
    expect(result[2].needsRefresh).toBe(false);
  });

  it("fetchDomainFeedIcons refreshes feeds using FeedParser", async () => {
    const feedParserSpy = vi.spyOn(FeedParser.prototype, "refreshFeed");
    feedParserSpy.mockImplementation(async (feed) => {
      return { ...feed, iconUrl: "https://newicon.png" } as unknown as Feed;
    });

    const entries = [
      {
        feed: { url: "https://youtube.com/123", title: "YT Feed", iconUrl: "", items: [] },
        needsRefresh: true,
      },
      {
        feed: { url: "https://other.com", title: "Other Feed", iconUrl: "", items: [] },
        needsRefresh: false,
      },
    ];

    const mediaSettings = DEFAULT_SETTINGS.media;
    await fetchDomainFeedIcons(entries, mediaSettings, []);

    expect(feedParserSpy).toHaveBeenCalledTimes(1);
    expect(entries[0].feed.iconUrl).toBe("https://newicon.png");
    expect(entries[1].feed.iconUrl).toBe("");

    feedParserSpy.mockRestore();
  });
});

