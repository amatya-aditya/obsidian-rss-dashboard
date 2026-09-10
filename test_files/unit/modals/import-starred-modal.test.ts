import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DEFAULT_SETTINGS, type Feed } from "../../../src/types/types";
import { ImportStarredModal } from "../../../src/modals/import-starred-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type MockApp = obsidian.App;

interface TestPlugin {
  app: MockApp;
  settings: typeof DEFAULT_SETTINGS;
  saveSettings: () => Promise<void>;
  getActiveDashboardView: () => Promise<null>;
}

interface TestModal {
  contentEl: HTMLElement;
  open: () => void;
  handleFileSelection: (file: File) => Promise<void>;
}

function readFixture(): string {
  const fixturePath = path.resolve(
    __dirname,
    "../../fixtures/starred/starred.json",
  );
  return readFileSync(fixturePath, "utf-8");
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function cloneSettings(): typeof DEFAULT_SETTINGS {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
}

function makeFeed(url: string, title: string): Feed {
  return { title, url, folder: "Uncategorized", items: [], lastUpdated: 0 };
}

function createMockApp(): MockApp {
  return new obsidian.App();
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("ImportStarredModal", () => {
  it("shows an error for a non-JSON file", async () => {
    const app = createMockApp();
    const plugin: TestPlugin = {
      app,
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
    };
    const modal = new ImportStarredModal(
      app,
      plugin as unknown as ConstructorParameters<typeof ImportStarredModal>[1],
    );
    (modal as unknown as TestModal).open();

    await (modal as unknown as TestModal).handleFileSelection(
      new File(["not json"], "starred.txt"),
    );

    const content = (modal as unknown as TestModal).contentEl;
    expect(
      content.querySelector(".import-error-message")?.textContent,
    ).toContain("Please select a valid starred.json file");
  });

  it("shows the no-items error when no starred item matches an existing feed", async () => {
    const app = createMockApp();
    const plugin: TestPlugin = {
      app,
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
    };
    const modal = new ImportStarredModal(
      app,
      plugin as unknown as ConstructorParameters<typeof ImportStarredModal>[1],
    );
    (modal as unknown as TestModal).open();

    await (modal as unknown as TestModal).handleFileSelection(
      new File([readFixture()], "starred.json"),
    );

    const content = (modal as unknown as TestModal).contentEl;
    expect(
      content.querySelector(".import-error-message")?.textContent,
    ).toContain("No starred articles matched a feed you already subscribe to.");
  });

  it("renders a grouped preview and imports selected articles into their matching feed", async () => {
    const app = createMockApp();
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("https://example-feed.test/rss", "Example Feed"),
      makeFeed("https://example.com/blog/feed.xml", "Example Blog"),
    ];
    const plugin: TestPlugin = {
      app,
      settings,
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
    };
    const modal = new ImportStarredModal(
      app,
      plugin as unknown as ConstructorParameters<typeof ImportStarredModal>[1],
    );
    (modal as unknown as TestModal).open();

    await (modal as unknown as TestModal).handleFileSelection(
      new File([readFixture()], "starred.json"),
    );

    const content = (modal as unknown as TestModal).contentEl;
    const preview = content.querySelector(".import-preview-container")!;
    expect(preview.textContent).toContain("2 articles");
    expect(preview.textContent).toContain("Example Feed");
    expect(preview.textContent).toContain("Example Blog");

    const importButton = content.querySelector<HTMLButtonElement>(
      ".rss-dashboard-modal-buttons .rss-dashboard-primary-button",
    )!;
    expect(importButton.textContent).toBe("Import 2 articles");

    importButton.click();
    await flushPromises();

    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(settings.feeds[0].items).toHaveLength(1);
    expect(settings.feeds[0].items[0]).toMatchObject({
      title: "Existing Feed Article One",
      starred: true,
      read: true,
    });
    expect(settings.feeds[1].items).toHaveLength(1);
    expect(settings.feeds[1].items[0]).toMatchObject({
      title: "Existing Feed Article Two With Labels",
      starred: true,
      read: false,
    });
  });
});
