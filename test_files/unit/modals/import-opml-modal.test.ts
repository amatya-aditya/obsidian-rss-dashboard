import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { ImportOpmlModal } from "../../../src/modals/import-opml-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readFixture(name: string): string {
  const fixturePath = path.resolve(__dirname, "../../fixtures/opml", name);
  return readFileSync(fixturePath, "utf-8");
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function cloneSettings(): typeof DEFAULT_SETTINGS {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  Object.defineProperty(window, "innerWidth", { value: 1400, configurable: true });
  vi.restoreAllMocks();
});

describe("ImportOpmlModal", () => {
  it("shows a validation error for invalid XML and keeps import disabled", async () => {
    const app = obsidian.App.createMock();
    const plugin = {
      app,
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      startBackgroundImport: vi.fn(),
    };

    const modal = new ImportOpmlModal(app as any, plugin as any);
    modal.open();

    const file = new File([readFixture("invalid.opml")], "invalid.opml", {
      type: "text/xml",
    });

    await (modal as any).handleFileSelection(file);

    const errorMessage = document.querySelector(
      ".import-error-message",
    ) as HTMLDivElement;
    expect(errorMessage?.textContent).toContain("invalid XML");

    const importBtn = modal.contentEl.querySelector(
      "button.rss-dashboard-primary-button",
    ) as HTMLButtonElement;
    expect(importBtn.disabled).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(0);
  });

  it("shows a validation error for missing OPML structure and keeps import disabled", async () => {
    const app = obsidian.App.createMock();
    const plugin = {
      app,
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      startBackgroundImport: vi.fn(),
    };

    const modal = new ImportOpmlModal(app as any, plugin as any);
    modal.open();

    const file = new File([""], "empty.opml", { type: "text/xml" });
    await (modal as any).handleFileSelection(file);

    const errorMessage = document.querySelector(
      ".import-error-message",
    ) as HTMLDivElement;
    expect(errorMessage?.textContent?.length).toBeGreaterThan(0);

    const importBtn = modal.contentEl.querySelector(
      "button.rss-dashboard-primary-button",
    ) as HTMLButtonElement;
    expect(importBtn.disabled).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(0);
  });

  it("imports a valid OPML file in update mode and persists once", async () => {
    const app = obsidian.App.createMock();
    const settings = cloneSettings();
    settings.feeds = [
      {
        title: "Existing",
        url: "https://example.com/existing.xml",
        folder: "Tech",
        items: [],
        lastUpdated: 0,
      },
    ];

    const plugin = {
      app,
      settings,
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      startBackgroundImport: vi.fn(),
      ingestFeedsForBackgroundImport: vi.fn(async () => ({
        addedCount: 1,
        skippedCount: 0,
        queuedFeeds: [],
      })),
    };

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const modal = new ImportOpmlModal(app as any, plugin as any);
    modal.open();

    const file = new File([readFixture("single-feed.opml")], "single-feed.opml", {
      type: "text/xml",
    });

    await (modal as any).handleFileSelection(file);

    const importBtn = modal.contentEl.querySelector(
      "button.rss-dashboard-primary-button",
    ) as HTMLButtonElement;
    expect(importBtn.disabled).toBe(false);

    await (modal as any).executeImport();
    await flushPromises();

    expect(plugin.ingestFeedsForBackgroundImport).toHaveBeenCalledTimes(1);
    expect(plugin.ingestFeedsForBackgroundImport).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          url: "https://example.com/feed.xml",
        }),
      ],
      expect.objectContaining({ mode: "update" }),
    );
    expect(logSpy.mock.calls.some((c) => c[0] === "[Stub Notice]")).toBe(true);
  });

  it("parses nested folders and imports derived folders", async () => {
    const app = obsidian.App.createMock();
    const plugin = {
      app,
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      startBackgroundImport: vi.fn(),
      ingestFeedsForBackgroundImport: vi.fn(async () => ({
        addedCount: 1,
        skippedCount: 0,
        queuedFeeds: [],
      })),
    };

    const modal = new ImportOpmlModal(app as any, plugin as any);
    modal.open();

    const file = new File([readFixture("nested-folders.opml")], "nested-folders.opml", {
      type: "text/xml",
    });

    await (modal as any).handleFileSelection(file);
    await (modal as any).executeImport();
    await flushPromises();

    expect(plugin.ingestFeedsForBackgroundImport).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        mode: "update",
        folders: expect.arrayContaining([
          expect.objectContaining({ name: "Tech" }),
        ]),
      }),
    );
  });

  it("uses overwrite mode when replacing feeds", async () => {
    const app = obsidian.App.createMock();
    const plugin = {
      app,
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      startBackgroundImport: vi.fn(),
      ingestFeedsForBackgroundImport: vi.fn(async () => ({
        addedCount: 1,
        skippedCount: 0,
        queuedFeeds: [],
      })),
    };

    const modal = new ImportOpmlModal(app as any, plugin as any);
    modal.open();

    const file = new File([readFixture("single-feed.opml")], "single-feed.opml", {
      type: "text/xml",
    });

    await (modal as any).handleFileSelection(file);
    (modal as any).importMode = "overwrite";
    await (modal as any).executeImport();
    await flushPromises();

    expect(plugin.ingestFeedsForBackgroundImport).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ mode: "overwrite" }),
    );
  });
});
