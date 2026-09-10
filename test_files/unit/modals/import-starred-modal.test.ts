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
  ensureFolderExists: (
    folder: string,
    opts: { saveSettings: boolean; refreshView: boolean },
  ) => Promise<boolean>;
  feedParser: {
    refreshFeed: (feed: Feed) => Promise<Feed>;
  };
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

function readUnimportableFixture(): string {
  const fixturePath = path.resolve(
    __dirname,
    "../../fixtures/starred/starred-unimportable.json",
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

/**
 * Deferred `refreshFeed` mock: resolves only when the test calls
 * `resolve()`, so tests can assert that starred-item insertion already
 * happened before the background fetch completes.
 */
function createDeferredRefreshFeed(): {
  refreshFeed: (feed: Feed) => Promise<Feed>;
  resolve: (feed: Feed) => void;
  calls: Feed[];
} {
  const calls: Feed[] = [];
  let resolveFn: (feed: Feed) => void = () => {};
  const refreshFeed = (feed: Feed): Promise<Feed> => {
    calls.push(feed);
    return new Promise<Feed>((resolve) => {
      resolveFn = resolve;
    });
  };
  return {
    refreshFeed,
    resolve: (feed: Feed) => resolveFn(feed),
    calls,
  };
}

function createTestPlugin(
  settings: typeof DEFAULT_SETTINGS,
  overrides?: Partial<TestPlugin>,
): TestPlugin {
  return {
    app: createMockApp(),
    settings,
    saveSettings: vi.fn(async () => {}),
    getActiveDashboardView: vi.fn(async () => null),
    ensureFolderExists: vi.fn(async () => true),
    feedParser: {
      refreshFeed: vi.fn(async (feed: Feed) => feed),
    },
    ...overrides,
  };
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("ImportStarredModal", () => {
  it("shows an error for a non-JSON file", async () => {
    const app = createMockApp();
    const plugin = createTestPlugin(cloneSettings());
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

  it("shows the no-items error when the export has no items at all", async () => {
    const app = createMockApp();
    const plugin = createTestPlugin(cloneSettings());
    const modal = new ImportStarredModal(
      app,
      plugin as unknown as ConstructorParameters<typeof ImportStarredModal>[1],
    );
    (modal as unknown as TestModal).open();

    const emptyExport = JSON.stringify({ items: [] });

    await (modal as unknown as TestModal).handleFileSelection(
      new File([emptyExport], "starred.json"),
    );

    const content = (modal as unknown as TestModal).contentEl;
    expect(
      content.querySelector(".import-error-message")?.textContent,
    ).toContain("No importable starred articles were found in this file.");
  });

  it("shows the unable-to-import section instead of the blanket no-items error when every item lacks an origin.streamId (234-03)", async () => {
    const app = createMockApp();
    const plugin = createTestPlugin(cloneSettings());
    const modal = new ImportStarredModal(
      app,
      plugin as unknown as ConstructorParameters<typeof ImportStarredModal>[1],
    );
    (modal as unknown as TestModal).open();

    const noOriginExport = JSON.stringify({
      items: [
        {
          id: "tag:google.com,2005:reader/item/no-origin",
          title: "No origin item",
          canonical: [{ href: "https://example.test/no-origin" }],
        },
      ],
    });

    await (modal as unknown as TestModal).handleFileSelection(
      new File([noOriginExport], "starred.json"),
    );

    const content = (modal as unknown as TestModal).contentEl;
    expect(content.querySelector(".import-error-message")).toBeNull();
    const section = content.querySelector(".import-unimportable-section");
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain("Unable to import (1)");
    expect(section?.textContent).toContain("No origin item");
  });

  it("renders a grouped preview and imports selected articles into their matching existing feed", async () => {
    const app = createMockApp();
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("https://example-feed.test/rss", "Example Feed"),
      makeFeed("https://example.com/blog/feed.xml", "Example Blog"),
    ];
    const plugin = createTestPlugin(settings);
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
    // 3 candidates now: 2 matched to existing feeds, 1 new-feed candidate
    // for the fixture's "Not Subscribed Source" item (234-02).
    expect(preview.textContent).toContain("3 articles");
    expect(preview.textContent).toContain("Example Feed");
    expect(preview.textContent).toContain("Example Blog");
    expect(preview.textContent).toContain("Not Subscribed Source");
    expect(preview.textContent).toContain("1 new feed");

    const importButton = content.querySelector<HTMLButtonElement>(
      ".rss-dashboard-modal-buttons .rss-dashboard-primary-button",
    )!;
    expect(importButton.textContent).toBe("Import 3 articles");

    importButton.click();
    await flushPromises();

    expect(plugin.saveSettings).toHaveBeenCalled();
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

  it("creates the missing source feed, assigns it to the default folder, and inserts its starred item immediately without waiting on the fetch", async () => {
    const app = createMockApp();
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("https://example-feed.test/rss", "Example Feed"),
      makeFeed("https://example.com/blog/feed.xml", "Example Blog"),
    ];
    const deferred = createDeferredRefreshFeed();
    const plugin = createTestPlugin(settings, {
      feedParser: { refreshFeed: deferred.refreshFeed },
    });
    const modal = new ImportStarredModal(
      app,
      plugin as unknown as ConstructorParameters<typeof ImportStarredModal>[1],
    );
    (modal as unknown as TestModal).open();

    await (modal as unknown as TestModal).handleFileSelection(
      new File([readFixture()], "starred.json"),
    );

    const content = (modal as unknown as TestModal).contentEl;
    const importButton = content.querySelector<HTMLButtonElement>(
      ".rss-dashboard-modal-buttons .rss-dashboard-primary-button",
    )!;
    importButton.click();
    await flushPromises();

    // The new feed exists and its historical starred item is already
    // inserted, starred and (per the export) unread — the live fetch has
    // not resolved yet.
    const newFeed = settings.feeds.find(
      (f) => f.url === "https://not-subscribed.example.test/feed",
    );
    expect(newFeed).toBeDefined();
    expect(newFeed?.title).toBe("Not Subscribed Source");
    expect(newFeed?.siteUrl).toBe("https://not-subscribed.example.test/");
    expect(newFeed?.folder).toBe("Uncategorized");
    expect(newFeed?.items).toHaveLength(1);
    expect(newFeed?.items[0]).toMatchObject({
      title: "Unsubscribed Source Article",
      starred: true,
      read: false,
    });

    // Exactly one fetch was triggered for the new feed, and it has not
    // resolved yet.
    expect(deferred.calls).toHaveLength(1);
    expect(deferred.calls[0].url).toBe(
      "https://not-subscribed.example.test/feed",
    );
    expect(plugin.ensureFolderExists).toHaveBeenCalledWith(
      "Uncategorized",
      { saveSettings: false, refreshView: false },
    );

    // Now let the fetch resolve and confirm it merges back in without
    // disturbing the already-inserted starred item.
    const savesBeforeResolve = (plugin.saveSettings as ReturnType<typeof vi.fn>)
      .mock.calls.length;
    deferred.resolve({
      ...newFeed!,
      title: "Not Subscribed Source (Live)",
      items: [...newFeed!.items],
    });
    await flushPromises();

    const mergedFeed = settings.feeds.find(
      (f) => f.url === "https://not-subscribed.example.test/feed",
    );
    expect(mergedFeed?.title).toBe("Not Subscribed Source (Live)");
    expect(mergedFeed?.items).toHaveLength(1);
    expect((plugin.saveSettings as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
      savesBeforeResolve,
    );
  });

  it("lets the user edit the target folder for a new feed before importing", async () => {
    const app = createMockApp();
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("https://example-feed.test/rss", "Example Feed"),
      makeFeed("https://example.com/blog/feed.xml", "Example Blog"),
    ];
    const plugin = createTestPlugin(settings);
    const modal = new ImportStarredModal(
      app,
      plugin as unknown as ConstructorParameters<typeof ImportStarredModal>[1],
    );
    (modal as unknown as TestModal).open();

    await (modal as unknown as TestModal).handleFileSelection(
      new File([readFixture()], "starred.json"),
    );

    const content = (modal as unknown as TestModal).contentEl;
    const editButton = content.querySelector<HTMLElement>(
      ".import-preview-edit",
    )!;
    expect(editButton).toBeTruthy();
    editButton.click();

    const input = content.querySelector<HTMLInputElement>(
      ".import-preview-edit-input",
    )!;
    expect(input).toBeTruthy();
    input.value = "Imported";
    input.dispatchEvent(new Event("blur"));

    const importButton = content.querySelector<HTMLButtonElement>(
      ".rss-dashboard-modal-buttons .rss-dashboard-primary-button",
    )!;
    importButton.click();
    await flushPromises();

    const newFeed = settings.feeds.find(
      (f) => f.url === "https://not-subscribed.example.test/feed",
    );
    expect(newFeed?.folder).toBe("Imported");
    expect(plugin.ensureFolderExists).toHaveBeenCalledWith(
      "Imported",
      { saveSettings: false, refreshView: false },
    );
  });

  it("does not create a duplicate feed when a new-feed candidate's url already exists locally by the time import executes", async () => {
    const app = createMockApp();
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("https://example-feed.test/rss", "Example Feed"),
      makeFeed("https://example.com/blog/feed.xml", "Example Blog"),
    ];
    const plugin = createTestPlugin(settings);
    const modal = new ImportStarredModal(
      app,
      plugin as unknown as ConstructorParameters<typeof ImportStarredModal>[1],
    );
    (modal as unknown as TestModal).open();

    await (modal as unknown as TestModal).handleFileSelection(
      new File([readFixture()], "starred.json"),
    );

    // Simulate the feed having been added through another path after the
    // preview was built but before the user clicks import.
    settings.feeds.push(
      makeFeed(
        "https://not-subscribed.example.test/feed",
        "Not Subscribed Source",
      ),
    );

    const content = (modal as unknown as TestModal).contentEl;
    const importButton = content.querySelector<HTMLButtonElement>(
      ".rss-dashboard-modal-buttons .rss-dashboard-primary-button",
    )!;
    importButton.click();
    await flushPromises();

    const matches = settings.feeds.filter(
      (f) => f.url === "https://not-subscribed.example.test/feed",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].items).toHaveLength(1);
  });

  it("renders an 'unable to import' section listing entries with no source feed or no article url, never dropping them silently", async () => {
    const app = createMockApp();
    const settings = cloneSettings();
    settings.feeds = [makeFeed("https://example-feed.test/rss", "Example Feed")];
    const plugin = createTestPlugin(settings);
    const modal = new ImportStarredModal(
      app,
      plugin as unknown as ConstructorParameters<typeof ImportStarredModal>[1],
    );
    (modal as unknown as TestModal).open();

    await (modal as unknown as TestModal).handleFileSelection(
      new File([readUnimportableFixture()], "starred-unimportable.json"),
    );

    const content = (modal as unknown as TestModal).contentEl;
    const section = content.querySelector(".import-unimportable-section");
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain("Unable to import (3)");

    const rows = Array.from(
      content.querySelectorAll(".import-unimportable-row"),
    );
    expect(rows).toHaveLength(3);

    expect(section?.textContent).toContain("No Source Feed Article");
    expect(section?.textContent).toContain("No source feed identified");
    expect(section?.textContent).toContain("No Article Url Article");
    expect(section?.textContent).toContain("No article link found");
    expect(section?.textContent).toContain(
      "No Source Feed And No Article Url Article",
    );
  });

  it("shows both the matched preview and the unable-to-import section when a file has both kinds of entries", async () => {
    const app = createMockApp();
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("https://example-feed.test/rss", "Example Feed"),
      makeFeed("https://example.com/blog/feed.xml", "Example Blog"),
    ];
    const plugin = createTestPlugin(settings);
    const modal = new ImportStarredModal(
      app,
      plugin as unknown as ConstructorParameters<typeof ImportStarredModal>[1],
    );
    (modal as unknown as TestModal).open();

    const combined = JSON.parse(readFixture()) as { items: unknown[] };
    const extra = JSON.parse(readUnimportableFixture()) as { items: unknown[] };
    combined.items = [...combined.items, ...extra.items];

    await (modal as unknown as TestModal).handleFileSelection(
      new File([JSON.stringify(combined)], "starred.json"),
    );

    const content = (modal as unknown as TestModal).contentEl;
    const preview = content.querySelector(".import-preview-container")!;
    // Base fixture contributes 3 candidates (2 matched + 1 new-feed, 234-02);
    // the unimportable fixture's 3 entries never become candidates.
    expect(preview.textContent).toContain("3 articles");
    expect(preview.textContent).toContain("1 new feed");

    const section = content.querySelector(".import-unimportable-section");
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain("Unable to import (3)");
  });
});
