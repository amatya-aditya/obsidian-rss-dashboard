import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import {
  type RssDashboardSettings,
  type PodcastTheme,
  type Folder,
  type Feed,
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

function sampleFolders(): Folder[] {
  return [
    {
      name: "Twitter",
      subfolders: [{ name: "Lists", subfolders: [] }],
    },
    { name: "YouTube", subfolders: [] },
    { name: "Podcast", subfolders: [] },
  ];
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("renderMediaSettingsTab()", () => {
  it("renders playback settings first and persists toggle changes", async () => {
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

    expect(names[0]).toBe("Playback progress");
    expect(names).toContain("Remember playback progress");
    expect(names).not.toContain("Tag for video articles");

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

  it("persists media folders and normalizes paths", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.media.defaultTwitterFolder = "Twitter";
    settings.media.defaultYouTubeFolder = "YouTube";
    settings.media.defaultSmallwebFolder = "Smallweb";

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

    const twitterInput = getSettingByName(
      containerEl,
      "Default Twitter folder",
    ).querySelector('input[type="text"]') as HTMLInputElement;
    twitterInput.value = "Social/Twitter";
    twitterInput.dispatchEvent(new Event("input"));

    const youtubeInput = getSettingByName(
      containerEl,
      "Default YouTube folder",
    ).querySelector('input[type="text"]') as HTMLInputElement;
    youtubeInput.value = "Media/YouTube";
    youtubeInput.dispatchEvent(new Event("input"));
    const smallwebInput = getSettingByName(
      containerEl,
      "Default smallweb folder",
    ).querySelector('input[type="text"]') as HTMLInputElement;
    smallwebInput.value = "Web/Smallweb";
    smallwebInput.dispatchEvent(new Event("input"));

    await flushPromises();

    expect(plugin.settings.media.defaultTwitterFolder).toBe(
      "norm:Social/Twitter",
    );
    expect(plugin.settings.media.defaultYouTubeFolder).toBe(
      "norm:Media/YouTube",
    );
    expect(plugin.settings.media.defaultSmallwebFolder).toBe(
      "norm:Web/Smallweb",
    );
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(3);
  });


  it("wires media folder settings with the shared folder suggester defaults", async () => {
    vi.resetModules();

    const capturedOptions: Array<{ showAddNewOption?: boolean } | undefined> =
      [];

    vi.doMock("../../../src/components/folder-suggest", async () => {
      const actual = await vi.importActual<
        typeof import("../../../src/components/folder-suggest")
      >("../../../src/components/folder-suggest");

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

    const { renderMediaSettingsTab: renderWithMock } =
      await import("../../../src/settings/tabs/media-settings-tab");

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

    const { FolderSuggest } =
      await import("../../../src/components/folder-suggest");
    const suggest = new FolderSuggest(
      plugin.app,
      input,
      plugin.settings.folders,
    );

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

    const { FolderSuggest } =
      await import("../../../src/components/folder-suggest");
    const suggest = new FolderSuggest(
      plugin.app,
      input,
      plugin.settings.folders,
    );

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
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.media.useDomainIconsRss = false;
    settings.media.useDomainIconsPodcast = false;
    settings.media.useDomainIconsTwitter = false;
    settings.media.useDomainIconsMastodon = false;

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
      getActiveDashboardView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const toggleNames = [
      "Use site icons/favicons for RSS feeds",
      "Use album/show artwork for Podcast feeds",
      "Use profile images for Twitter/Nitter feeds",
      "Use profile images for Mastodon feeds",
    ];

    for (const name of toggleNames) {
      const toggle = getSettingByName(containerEl, name).querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement;
      expect(toggle.checked).toBe(false);
      toggle.click();
      await flushPromises();
    }

    expect(plugin.settings.media.useDomainIconsRss).toBe(true);
    expect(plugin.settings.media.useDomainIconsPodcast).toBe(true);
    expect(plugin.settings.media.useDomainIconsTwitter).toBe(true);
    expect(plugin.settings.media.useDomainIconsMastodon).toBe(true);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(8);
  });

  it("renders the YouTube info message", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
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
    expect(
      setting.querySelector(".setting-item-description")?.textContent,
    ).toContain("YouTube RSS feeds do not provide channel profile images");
  });

  it("renders and persists the Podcast artwork toggle", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.media.defaultTwitterFolder = "Custom/Twitter";
    settings.media.defaultMastodonFolder = "Custom/Mastodon";
    settings.media.defaultYouTubeFolder = "Custom/YouTube";
    settings.media.defaultPodcastFolder = "Custom/Podcast";
    settings.media.defaultRssFolder = "Custom/RSS";
    settings.media.defaultSmallwebFolder = "Custom/Smallweb";

    settings.media.useDomainIconsPodcast = false;
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
      "Use album/show artwork for Podcast feeds",
    );
    const toggle = toggleSetting.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    toggle.click();
    await flushPromises();

    expect(plugin.settings.media.useDomainIconsPodcast).toBe(true);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(2);
  });

  it("renders and persists the Twitter profile images toggle", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
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

    const resetSetting = getSettingByName(containerEl, "Reset folder names");
    const button = resetSetting.querySelector("button") as HTMLButtonElement;
    button.click();
    const toggleSetting = getSettingByName(
      containerEl,
      "Use profile images for Twitter/Nitter feeds",
    );
    const toggle = toggleSetting.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    toggle.click();
    await flushPromises();

    expect(plugin.settings.media.defaultTwitterFolder).toBe(
      DEFAULT_SETTINGS.media.defaultTwitterFolder,
    );
    expect(plugin.settings.media.defaultMastodonFolder).toBe(
      DEFAULT_SETTINGS.media.defaultMastodonFolder,
    );
    expect(plugin.settings.media.defaultYouTubeFolder).toBe(
      DEFAULT_SETTINGS.media.defaultYouTubeFolder,
    );
    expect(plugin.settings.media.defaultPodcastFolder).toBe(
      DEFAULT_SETTINGS.media.defaultPodcastFolder,
    );
    expect(plugin.settings.media.defaultRssFolder).toBe(
      DEFAULT_SETTINGS.media.defaultRssFolder,
    );
    expect(plugin.settings.media.defaultSmallwebFolder).toBe(
      DEFAULT_SETTINGS.media.defaultSmallwebFolder,
    );
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalled();
  });
});

describe("DomainIconToggleConfirmModal", () => {
  it("renders heading and description text correctly with domain substitution", () => {
    const app = obsidian.App.createMock();
    const modal = new DomainIconToggleConfirmModal(app, {
      domainName: "RSS",
      heading: "Clear RSS icons?",
      description: "Are you sure about RSS?",
      cancelLabel: "Cancel",
      confirmLabel: "Confirm",
    });
    modal.open();

    expect(modal.contentEl.querySelector("h2")?.textContent).toBe(
      "Clear RSS icons?",
    );
    expect(modal.contentEl.querySelector("p")?.textContent).toBe(
      "Are you sure about RSS?",
    );
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

  it("resolves false when closed without clicking buttons", async () => {
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
    expect(DEFAULT_SETTINGS.media.useDomainIconsMastodon).toBe(false);

    const settingsCopy = JSON.parse(
      JSON.stringify(DEFAULT_SETTINGS),
    ) as typeof DEFAULT_SETTINGS;
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

    const matchesDomain = (feed: { url: string }) =>
      feed.url.includes("youtube.com");
    const result = collectDomainFeeds(
      feeds as unknown as Feed[],
      matchesDomain,
    );

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
        feed: {
          url: "https://youtube.com/123",
          title: "YT Feed",
          iconUrl: "",
          items: [],
        },
        needsRefresh: true,
      },
      {
        feed: {
          url: "https://other.com",
          title: "Other Feed",
          iconUrl: "",
          items: [],
        },
        needsRefresh: false,
      },
    ];

    await fetchDomainFeedIcons(entries, DEFAULT_SETTINGS.media, []);

    expect(feedParserSpy).toHaveBeenCalledTimes(1);
    expect(entries[0].feed.iconUrl).toBe("https://newicon.png");
    expect(entries[1].feed.iconUrl).toBe("");

    feedParserSpy.mockRestore();
  });
});

describe("Media settings default playback speed", () => {
  it("renders and persists default play speed setting", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    // @ts-ignore
    settings.media.defaultPlaySpeed = 1;

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
      getActiveReaderView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderMediaSettingsTab(containerEl, plugin);

    const speedSetting = getSettingByName(containerEl, "Default play speed");
    expect(speedSetting).not.toBeNull();

    const select = speedSetting.querySelector("select") as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.value).toBe("1");

    select.value = "1.5";
    select.dispatchEvent(new Event("change"));
    await flushPromises();

    // @ts-ignore
    expect(plugin.settings.media.defaultPlaySpeed).toBe(1.5);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
  });
});
