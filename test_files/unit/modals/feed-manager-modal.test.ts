import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { FeedManagerModal } from "../../../src/modals/feed-manager/feed-manager-modal";
import { ImportOpmlModal } from "../../../src/modals/import-opml-modal";
import {
  DEFAULT_SETTINGS,
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
  Object.defineProperty(window, "innerWidth", {
    value: 1400,
    configurable: true,
  });
  vi.restoreAllMocks();
});

describe("FeedManagerModal", () => {
  it("discloses and clears cached preview images when all feeds are deleted", async () => {
    const app = obsidian.App.createMock();
    const settings = cloneSettings();
    settings.feeds = [
      {
        title: "Feed",
        url: "https://example.com/feed.xml",
        folder: "Inbox",
        items: [],
        lastUpdated: 0,
        mediaType: "article",
      },
    ];
    const clearImageCache = vi.fn(async () => ({ cleared: 3, failed: 0 }));
    const plugin = {
      app,
      settings,
      saveSettings: vi.fn(async () => {}),
      getImageCacheSizeBytes: vi.fn(() => 1_024),
      clearImageCache,
      getActiveDashboardView: vi.fn(async () => null),
      exportOpml: vi.fn(),
      addFeed: vi.fn(async () => true),
    };
    const modal = new FeedManagerModal(
      app as unknown as obsidian.App,
      plugin as unknown as RssDashboardPlugin,
    );
    modal.open();

    const deleteAllButton = modal.contentEl.querySelector(
      ".feed-manager-delete-all-button",
    ) as HTMLButtonElement;
    deleteAllButton.click();

    const confirmation = Array.from(
      document.querySelectorAll(".rss-dashboard-confirm-modal"),
    )[0] as HTMLElement;
    expect(confirmation.textContent).toContain("1.0 KB");

    const confirmButton = Array.from(confirmation.querySelectorAll("button")).find(
      (button) => button.textContent === "Delete all feeds",
    ) as HTMLButtonElement;
    confirmButton.click();
    await flushPromises();

    expect(settings.feeds).toEqual([]);
    expect(clearImageCache).toHaveBeenCalledTimes(1);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("reports cache-clear failures after deleting all feeds", async () => {
    const app = obsidian.App.createMock();
    const settings = cloneSettings();
    settings.feeds = [
      {
        title: "Feed",
        url: "https://example.com/feed.xml",
        folder: "Inbox",
        items: [],
        lastUpdated: 0,
        mediaType: "article",
      },
    ];
    const plugin = {
      app,
      settings,
      saveSettings: vi.fn(async () => {}),
      getImageCacheSizeBytes: vi.fn(() => 1),
      clearImageCache: vi.fn(async () => ({ cleared: 2, failed: 1 })),
      getActiveDashboardView: vi.fn(async () => null),
      exportOpml: vi.fn(),
      addFeed: vi.fn(async () => true),
    };
    const noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const modal = new FeedManagerModal(
      app as unknown as obsidian.App,
      plugin as unknown as RssDashboardPlugin,
    );
    modal.open();
    (modal.contentEl.querySelector(
      ".feed-manager-delete-all-button",
    ) as HTMLButtonElement).click();

    const confirmation = document.querySelector(
      ".rss-dashboard-confirm-modal",
    ) as HTMLElement;
    (Array.from(confirmation.querySelectorAll("button")).find(
      (button) => button.textContent === "Delete all feeds",
    ) as HTMLButtonElement).click();
    await flushPromises();

    expect(
      noticeSpy.mock.calls.some(
        ([prefix, message]) =>
          prefix === "[Stub Notice]" &&
          message === "All feeds deleted, but 1 cached image could not be removed.",
      ),
    ).toBe(true);
  });

  it("closes after the OPML import modal reports import started", () => {
    const app = obsidian.App.createMock();
    const plugin = {
      app,
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      exportOpml: vi.fn(),
      addFeed: vi.fn(async () => true),
    };

    const openSpy = vi
      .spyOn(ImportOpmlModal.prototype, "open")
      .mockImplementation(function (this: ImportOpmlModal) {
        (
          this as unknown as { onImportStarted?: () => void }
        ).onImportStarted?.();
      });

    const modal = new FeedManagerModal(
      app as unknown as obsidian.App,
      plugin as unknown as RssDashboardPlugin,
    );
    const closeSpy = vi.spyOn(modal, "close");
    modal.open();

    const importButton = modal.contentEl.querySelector(
      ".feed-manager-import-button",
    ) as HTMLButtonElement;
    importButton.click();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
