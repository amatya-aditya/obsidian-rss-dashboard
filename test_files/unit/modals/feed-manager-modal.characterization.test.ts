import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { FeedManagerModal } from "../../../src/modals/feed-manager/feed-manager-modal";
import {
  DEFAULT_SETTINGS,
  type Folder,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type RssDashboardPlugin from "../../../main";

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("FeedManagerModal current behavior", () => {
  it("renders the existing primary and destructive actions in order", () => {
    const app = obsidian.App.createMock();
    const plugin = {
      app,
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getImageCacheSizeBytes: vi.fn(() => 0),
      clearImageCache: vi.fn(async () => ({ cleared: 0, failed: 0 })),
      getActiveDashboardView: vi.fn(async () => null),
      exportOpml: vi.fn(),
      addFeed: vi.fn(async () => true),
    };
    const modal = new FeedManagerModal(
      app as unknown as obsidian.App,
      plugin as unknown as RssDashboardPlugin,
    );

    modal.open();

    expect(modal.contentEl.textContent).toContain("Manage feeds");
    expect(
      Array.from(
        modal.contentEl.querySelectorAll(".feed-manager-button-row button"),
      ).map((button) => button.textContent?.trim()),
    ).toEqual([
      "Add new feed...",
      "Import OPML/XML",
      "Export OPML",
      "Import starred articles",
      "Delete all feeds",
      "Delete feeds + folders",
    ]);
  });

  it("leaves feeds and folders untouched on cancel and saves before cache cleanup on confirm", async () => {
    const app = obsidian.App.createMock();
    const settings = cloneSettings();
    settings.feeds = [
      {
        title: "Fixture feed",
        url: "https://example.com/feed.xml",
        folder: "Inbox",
        items: [],
        lastUpdated: 0,
        mediaType: "article",
      },
    ];
    settings.folders = [
      { name: "News", subfolders: [{ name: "Tech", subfolders: [] }] },
    ] satisfies Folder[];
    const events: string[] = [];
    const plugin = {
      app,
      settings,
      saveSettings: vi.fn(async () => {
        events.push("save");
      }),
      getImageCacheSizeBytes: vi.fn(() => 1_024),
      clearImageCache: vi.fn(async () => {
        events.push("clear-cache");
        return { cleared: 1, failed: 0 };
      }),
      getActiveDashboardView: vi.fn(async () => ({
        refresh: () => events.push("refresh-dashboard"),
      })),
      exportOpml: vi.fn(),
      addFeed: vi.fn(async () => true),
    };
    const modal = new FeedManagerModal(
      app as unknown as obsidian.App,
      plugin as unknown as RssDashboardPlugin,
    );
    const closeSpy = vi.spyOn(modal, "close");

    modal.open();
    modal.contentEl
      .querySelector<HTMLButtonElement>(
        ".feed-manager-delete-feeds-folders-button",
      )!
      .click();

    let confirmation = document.querySelector<HTMLElement>(
      ".rss-dashboard-confirm-modal",
    )!;
    expect(confirmation.textContent).toContain("1 feeds");
    expect(confirmation.textContent).toContain("2 folders");
    expect(confirmation.textContent).toContain("1.0 KB");
    confirmation.querySelectorAll("button")[0]?.click();
    expect(settings.feeds).toHaveLength(1);
    expect(settings.folders).toHaveLength(1);
    expect(plugin.saveSettings).not.toHaveBeenCalled();

    modal.contentEl
      .querySelector<HTMLButtonElement>(
        ".feed-manager-delete-feeds-folders-button",
      )!
      .click();
    confirmation = document.querySelector<HTMLElement>(
      ".rss-dashboard-confirm-modal",
    )!;
    Array.from(confirmation.querySelectorAll("button"))
      .find((button) => button.textContent === "Delete feeds + folders")
      ?.click();
    await flushPromises();

    expect(settings.feeds).toEqual([]);
    expect(settings.folders).toEqual([]);
    expect(events).toEqual(["save", "clear-cache", "refresh-dashboard"]);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
