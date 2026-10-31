import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import type { Feed, RssDashboardSettings } from "../../../src/types/types";
import { renderSidebarSettingsTab } from "../../../src/settings/tabs/sidebar-settings-tab";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { setToggle } from "../test-toggle-helpers";
import type RssDashboardPlugin from "../../../main";

vi.mock("../../../src/utils/domain-icon-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/utils/domain-icon-helpers")
  >("../../../src/utils/domain-icon-helpers");
  return {
    ...actual,
    showDomainIconToggleConfirm: vi.fn(
      async (_app: unknown, params: { onConfirm: () => void }) => {
        params.onConfirm();
        return true;
      },
    ),
  };
});

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeFeed(url: string, iconUrl: string, mediaType?: string): Feed {
  return {
    url,
    title: url,
    iconUrl,
    mediaType,
    items: [],
    folder: "",
  } as unknown as Feed;
}

function toggleOff(containerEl: HTMLElement, name: string): void {
  const row = Array.from(
    containerEl.querySelectorAll<HTMLElement>(".setting-item"),
  ).find((el) => el.querySelector(".setting-item-name")?.textContent === name);
  const toggle = row?.querySelector('input[type="checkbox"]');
  if (!toggle) throw new Error(`Missing toggle: ${name}`);
  setToggle(toggle as HTMLInputElement, false);
}

function render(
  feeds: Feed[],
  key: "useDomainIconsRss" | "useDomainIconsPodcast",
) {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.display[key] = true;
  settings.feeds = feeds;
  const plugin = {
    app: obsidian.App.createMock(),
    settings,
    saveSettings: vi.fn(async () => {}),
    clearPlaybackProgress: vi.fn(async () => 0),
    getActiveDashboardView: vi.fn(async () => null),
  } as unknown as RssDashboardPlugin;
  const containerEl = document.body.appendChild(createDiv());
  renderSidebarSettingsTab(containerEl, plugin, vi.fn());
  return { containerEl, feeds };
}

describe("Sidebar settings: clearing cached icons when a toggle is turned off", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.innerHTML = "";
  });

  it("clears only RSS feeds' icons when the RSS toggle is confirmed off", async () => {
    const { containerEl, feeds } = render(
      [
        makeFeed("https://a.example/feed.xml", "icon.png"),
        makeFeed("https://c.example/pod.xml", "art.png", "podcast"),
        makeFeed(
          "https://www.youtube.com/feeds/videos.xml?channel_id=x",
          "yt.png",
        ),
      ],
      "useDomainIconsRss",
    );

    toggleOff(containerEl, "Use site icons/favicons for RSS feeds");
    await flushPromises();

    expect(feeds.map((f) => f.iconUrl)).toEqual(["", "art.png", "yt.png"]);
  });

  it("clears only podcast feeds' icons when the Podcast toggle is confirmed off", async () => {
    const { containerEl, feeds } = render(
      [
        makeFeed("https://a.example/feed.xml", "icon.png"),
        makeFeed("https://c.example/pod.xml", "art.png", "podcast"),
      ],
      "useDomainIconsPodcast",
    );

    toggleOff(containerEl, "Use album/show artwork for Podcast feeds");
    await flushPromises();

    expect(feeds.map((f) => f.iconUrl)).toEqual(["icon.png", ""]);
  });
});
