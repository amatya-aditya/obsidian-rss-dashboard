import { beforeEach, describe, expect, it, vi } from "vitest";
/* eslint-disable import/no-nodejs-modules -- test fixtures require Node.js fs/path/url modules */
import * as obsidian from "obsidian";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { ImportOpmlModal } from "../../../src/modals/import-opml-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type MockApp = obsidian.App;

interface TestPlugin {
  settings: typeof DEFAULT_SETTINGS;
  saveSettings: () => Promise<void>;
  getActiveDashboardView: () => Promise<null>;
  startBackgroundImport: () => void;
  ingestFeedsForBackgroundImport: (
    feeds: unknown[],
    options: { mode: string; folders?: unknown[] },
  ) => Promise<{ addedCount: number; skippedCount: number; queuedFeeds: unknown[] }>;
}

interface TestModal {
  contentEl: HTMLElement;
  open: () => void;
  selectedFile: File | null;
  opmlContent: string | null;
  importMode: "update" | "overwrite";
  handleFileSelection: (file: File) => Promise<void>;
  executeImport: () => Promise<void>;
}

function readFixture(name: string): string {
  const fixturePath = path.resolve(__dirname, "../../fixtures/opml", name);
  return readFileSync(fixturePath, "utf-8");
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function cloneSettings(): typeof DEFAULT_SETTINGS {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- JSON.parse result is cloned settings
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function createMockApp(): MockApp {
  return new obsidian.App();
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

describe("ImportOpmlModal", () => {
  it("shows a validation error for invalid XML and keeps import disabled", async () => {
    const app = createMockApp();
    const plugin: TestPlugin = {
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      startBackgroundImport: vi.fn(),
    } as unknown as TestPlugin;

    const modal = new ImportOpmlModal(app, plugin as unknown as ConstructorParameters<typeof ImportOpmlModal>[1]);
    (modal as unknown as TestModal).open();

    const file = new File([readFixture("invalid.opml")], "invalid.opml", {
      type: "text/xml",
    });

    await (modal as unknown as TestModal).handleFileSelection(file);

    const errorMessage = document.querySelector(
      ".import-error-message",
    ) as HTMLDivElement;
    expect(errorMessage?.textContent).toContain("invalid XML");

    const importBtn = (modal as unknown as TestModal).contentEl.querySelector(
      "button.rss-dashboard-primary-button",
    ) as HTMLButtonElement;
    expect(importBtn.disabled).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(0);
  });

  it("shows a validation error for missing OPML structure and keeps import disabled", async () => {
    const app = createMockApp();
    const plugin: TestPlugin = {
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      startBackgroundImport: vi.fn(),
    } as unknown as TestPlugin;

    const modal = new ImportOpmlModal(app, plugin as unknown as ConstructorParameters<typeof ImportOpmlModal>[1]);
    (modal as unknown as TestModal).open();

    const file = new File([""], "empty.opml", { type: "text/xml" });
    await (modal as unknown as TestModal).handleFileSelection(file);

    const errorMessage = document.querySelector(
      ".import-error-message",
    ) as HTMLDivElement;
    expect(errorMessage?.textContent?.length).toBeGreaterThan(0);

    const importBtn = (modal as unknown as TestModal).contentEl.querySelector(
      "button.rss-dashboard-primary-button",
    ) as HTMLButtonElement;
    expect(importBtn.disabled).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(0);
  });

  it("imports a valid OPML file in update mode and persists once", async () => {
    const app = createMockApp();
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

    const plugin: TestPlugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      startBackgroundImport: vi.fn(),
      ingestFeedsForBackgroundImport: vi.fn(async () => ({
        addedCount: 1,
        skippedCount: 0,
        queuedFeeds: [],
      })),
    } as unknown as TestPlugin;

    const logSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    const modal = new ImportOpmlModal(app, plugin as unknown as ConstructorParameters<typeof ImportOpmlModal>[1]);
    (modal as unknown as TestModal).open();

    const file = new File(
      [readFixture("single-feed.opml")],
      "single-feed.opml",
      {
        type: "text/xml",
      },
    );

    await (modal as unknown as TestModal).handleFileSelection(file);

    const importBtn = (modal as unknown as TestModal).contentEl.querySelector(
      "button.rss-dashboard-primary-button",
    ) as HTMLButtonElement;
    expect(importBtn.disabled).toBe(false);

    await (modal as unknown as TestModal).executeImport();
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

  it("calls the optional callback after a successful import starts", async () => {
    const app = createMockApp();
    const plugin: TestPlugin = {
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      startBackgroundImport: vi.fn(),
      ingestFeedsForBackgroundImport: vi.fn(async () => ({
        addedCount: 1,
        skippedCount: 0,
        queuedFeeds: [],
      })),
    } as unknown as TestPlugin;
    const onImportStarted = vi.fn();

    const modal = new ImportOpmlModal(
      app,
      plugin as unknown as ConstructorParameters<typeof ImportOpmlModal>[1],
      onImportStarted,
    );
    (modal as unknown as TestModal).open();

    const file = new File(
      [readFixture("single-feed.opml")],
      "single-feed.opml",
      {
        type: "text/xml",
      },
    );

    await (modal as unknown as TestModal).handleFileSelection(file);
    await (modal as unknown as TestModal).executeImport();
    await flushPromises();

    expect(onImportStarted).toHaveBeenCalledTimes(1);
  });

  it("calls the optional callback when update mode finds no new feeds", async () => {
    const app = createMockApp();
    const plugin: TestPlugin = {
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      startBackgroundImport: vi.fn(),
      ingestFeedsForBackgroundImport: vi.fn(async () => ({
        addedCount: 0,
        skippedCount: 1,
        queuedFeeds: [],
      })),
    } as unknown as TestPlugin;
    const onImportStarted = vi.fn();

    const modal = new ImportOpmlModal(
      app,
      plugin as unknown as ConstructorParameters<typeof ImportOpmlModal>[1],
      onImportStarted,
    );
    (modal as unknown as TestModal).open();

    const file = new File(
      [readFixture("single-feed.opml")],
      "single-feed.opml",
      {
        type: "text/xml",
      },
    );

    await (modal as unknown as TestModal).handleFileSelection(file);
    await (modal as unknown as TestModal).executeImport();
    await flushPromises();

    expect(onImportStarted).toHaveBeenCalledTimes(1);
  });

  it("parses nested folders and imports derived folders", async () => {
    const app = createMockApp();
    const plugin: TestPlugin = {
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      startBackgroundImport: vi.fn(),
      ingestFeedsForBackgroundImport: vi.fn(async () => ({
        addedCount: 1,
        skippedCount: 0,
        queuedFeeds: [],
      })),
    } as unknown as TestPlugin;

    const modal = new ImportOpmlModal(app, plugin as unknown as ConstructorParameters<typeof ImportOpmlModal>[1]);
    (modal as unknown as TestModal).open();

    const file = new File(
      [readFixture("nested-folders.opml")],
      "nested-folders.opml",
      {
        type: "text/xml",
      },
    );

    await (modal as unknown as TestModal).handleFileSelection(file);
    await (modal as unknown as TestModal).executeImport();
    await flushPromises();

expect(plugin.ingestFeedsForBackgroundImport).toHaveBeenCalledWith(
        expect.any(Array),
        {
          mode: "update",
          folders: expect.arrayContaining([
            expect.objectContaining({ name: "Tech" }),
          ]) as unknown as { name: string }[],
        } as unknown as object,
      );
  });

  it("uses overwrite mode when replacing feeds", async () => {
    const app = createMockApp();
    const plugin: TestPlugin = {
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      startBackgroundImport: vi.fn(),
      ingestFeedsForBackgroundImport: vi.fn(async () => ({
        addedCount: 1,
        skippedCount: 0,
        queuedFeeds: [],
      })),
    } as unknown as TestPlugin;

    const modal = new ImportOpmlModal(app, plugin as unknown as ConstructorParameters<typeof ImportOpmlModal>[1]);
    (modal as unknown as TestModal).open();

    const file = new File(
      [readFixture("single-feed.opml")],
      "single-feed.opml",
      {
        type: "text/xml",
      },
    );

    await (modal as unknown as TestModal).handleFileSelection(file);
    (modal as unknown as { importMode: "update" | "overwrite" }).importMode = "overwrite";
    await (modal as unknown as TestModal).executeImport();
    await flushPromises();

    expect(plugin.ingestFeedsForBackgroundImport).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ mode: "overwrite" }),
    );
  });
});
