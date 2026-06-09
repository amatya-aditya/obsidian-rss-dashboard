import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import {
  type RssDashboardSettings,
  type Feed,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { renderSidebarSettingsTab } from "../../../src/settings/tabs/sidebar-settings-tab";
import {
  DomainIconToggleConfirmModal,
  collectDomainFeeds,
  fetchDomainFeedIcons,
} from "../../../src/utils/domain-icon-helpers";
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

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("renderSidebarSettingsTab() - domain icon toggles", () => {
  it("renders and persists the RSS site icons toggle", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.display.useDomainIconsRss = false;
    settings.display.useDomainIconsPodcast = false;
    settings.display.useDomainIconsTwitter = false;
    settings.display.useDomainIconsMastodon = false;

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
      getActiveDashboardView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderSidebarSettingsTab(containerEl, plugin, vi.fn());

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

    expect(plugin.settings.display.useDomainIconsRss).toBe(true);
    expect(plugin.settings.display.useDomainIconsPodcast).toBe(true);
    expect(plugin.settings.display.useDomainIconsTwitter).toBe(true);
    expect(plugin.settings.display.useDomainIconsMastodon).toBe(true);
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

    renderSidebarSettingsTab(containerEl, plugin, vi.fn());

    const setting = getSettingByName(containerEl, "YouTube profile images");
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

    settings.display.useDomainIconsPodcast = false;
    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
      getActiveDashboardView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderSidebarSettingsTab(containerEl, plugin, vi.fn());

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

    expect(plugin.settings.display.useDomainIconsPodcast).toBe(true);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(2);
  });

  it("renders and persists the Twitter profile images toggle", async () => {
    const containerEl = document.body.appendChild(
      document.createElement("div"),
    );
    const settings = cloneSettings();
    settings.media.defaultTwitterFolder = "Custom/Twitter";
    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      clearPlaybackProgress: vi.fn(async () => 0),
      getActiveDashboardView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderSidebarSettingsTab(containerEl, plugin, vi.fn());

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

    expect(plugin.settings.display.useDomainIconsTwitter).toBe(true);
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
    feedParserSpy.mockImplementation(async (feed) => ({
      ...feed,
      iconUrl: "https://newicon.png",
    }));

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

    await fetchDomainFeedIcons(
      entries,
      DEFAULT_SETTINGS.display,
      [],
      DEFAULT_SETTINGS.media,
    );

    expect(feedParserSpy).toHaveBeenCalledTimes(1);
    expect(entries[0].feed.iconUrl).toBe("https://newicon.png");
    expect(entries[1].feed.iconUrl).toBe("");

    feedParserSpy.mockRestore();
  });
});

describe("Sidebar display settings - domain icon fields", () => {
  it("defines the domain icon toggle fields in DisplaySettings and check defaults", () => {
    expect(DEFAULT_SETTINGS.display.useDomainIconsRss).toBe(false);
    expect(DEFAULT_SETTINGS.display.useDomainIconsPodcast).toBe(false);
    expect(DEFAULT_SETTINGS.display.useDomainIconsTwitter).toBe(false);
    expect(DEFAULT_SETTINGS.display.useDomainIconsMastodon).toBe(false);

    const settingsCopy = JSON.parse(
      JSON.stringify(DEFAULT_SETTINGS),
    ) as typeof DEFAULT_SETTINGS;
    settingsCopy.display.useDomainIconsRss = true;
    settingsCopy.display.useDomainIconsPodcast = true;
    settingsCopy.display.useDomainIconsTwitter = true;

    expect(settingsCopy.display.useDomainIconsRss).toBe(true);
    expect(settingsCopy.display.useDomainIconsPodcast).toBe(true);
    expect(settingsCopy.display.useDomainIconsTwitter).toBe(true);
  });
});
