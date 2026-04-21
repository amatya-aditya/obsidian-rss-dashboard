import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { FeedManagerModal } from "../../../src/modals/feed-manager/feed-manager-modal";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function cloneSettings(): typeof DEFAULT_SETTINGS {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  Object.defineProperty(window, "innerWidth", { value: 1400, configurable: true });
  vi.restoreAllMocks();
});

describe("FeedManagerModal", () => {
  it("renders existing feeds in the list", () => {
    const app = obsidian.App.createMock();
    const settings = cloneSettings();
    settings.feeds = [
      {
        title: "Feed A",
        url: "https://example.com/a.xml",
        folder: "Tech",
        items: [],
        lastUpdated: 0,
      },
      {
        title: "Feed B",
        url: "https://example.com/b.xml",
        folder: "",
        items: [],
        lastUpdated: 0,
      },
    ];

    const plugin = {
      app,
      settings,
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      exportOpml: vi.fn(),
      addFeed: vi.fn(async () => true),
    };

    const modal = new FeedManagerModal(app as any, plugin as any);
    modal.open();

    const titles = Array.from(modal.contentEl.querySelectorAll(".feed-manager-title")).map(
      (el) => el.textContent,
    );
    expect(titles).toContain("Feed A");
    expect(titles).toContain("Feed B");
  });

  it("deleteFeed removes a feed and persists once", async () => {
    const app = obsidian.App.createMock();
    const settings = cloneSettings();
    settings.feeds = [
      {
        title: "Feed A",
        url: "https://example.com/a.xml",
        folder: "",
        items: [],
        lastUpdated: 0,
      },
    ];

    const plugin = {
      app,
      settings,
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      exportOpml: vi.fn(),
      addFeed: vi.fn(async () => true),
    };

    const modal = new FeedManagerModal(app as any, plugin as any);
    modal.open();

    await (modal as any).deleteFeed(settings.feeds[0]);
    await flushPromises();

    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.settings.feeds).toHaveLength(0);
  });
});

