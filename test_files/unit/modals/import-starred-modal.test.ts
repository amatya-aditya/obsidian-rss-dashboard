import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DEFAULT_SETTINGS, type Feed } from "../../../src/types/types";
import {
  DEFAULT_NEW_FEED_FOLDER,
  ImportStarredModal,
} from "../../../src/modals/import-starred-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type { FullArticleFetchResult } from "../../../src/utils/fetch-helpers";
import type { Tag } from "../../../src/types/types";

const fetchFullArticleContentWithOutcomeMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/utils/full-article-fetch", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/utils/full-article-fetch")
  >("../../../src/utils/full-article-fetch");

  return {
    ...actual,
    fetchFullArticleContentWithOutcome: fetchFullArticleContentWithOutcomeMock,
  };
});

/**
 * The tag-editing portal itself (`createTagsDropdownPortal`) has no
 * existing test coverage anywhere in the suite and none is added by this
 * work (see draft-20260910-starred-import-followups.md's Testing
 * Decisions). Tests for the per-article tag chip (234-12) assert that
 * clicking it invokes the portal with the expected article reference, not
 * on the portal's own internal rendering — so it is mocked here rather than
 * exercised for real.
 */
const createTagsDropdownPortalMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/utils/tags-dropdown-portal", () => ({
  createTagsDropdownPortal: createTagsDropdownPortalMock,
}));

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

function getMetadataRefreshToggle(content: HTMLElement): HTMLInputElement {
  return content.querySelector<HTMLInputElement>(
    ".import-metadata-refresh-setting input[type='checkbox']",
  )!;
}

function getMetadataRefreshDescription(content: HTMLElement): HTMLElement {
  return content.querySelector<HTMLElement>(
    ".import-metadata-refresh-setting .setting-item-description",
  )!;
}

function getTagImportToggle(content: HTMLElement): HTMLInputElement {
  return content.querySelector<HTMLInputElement>(
    ".import-tag-import-setting input[type='checkbox']",
  )!;
}

function getTagImportDescription(content: HTMLElement): HTMLElement {
  return content.querySelector<HTMLElement>(
    ".import-tag-import-setting .setting-item-description",
  )!;
}

function getNewFeedFolderInput(content: HTMLElement): HTMLInputElement {
  return content.querySelector<HTMLInputElement>(
    ".import-options-panel input[type='text']",
  )!;
}

function getGroupRow(content: HTMLElement, feedUrl: string): HTMLElement {
  return content.querySelector<HTMLElement>(
    `.import-preview-row--folder[data-feed-url='${feedUrl}']`,
  )!;
}

function getNewTagsSection(content: HTMLElement): HTMLElement | null {
  return content.querySelector<HTMLElement>(".import-new-tags-section");
}

function getItemRow(content: HTMLElement, guid: string): HTMLElement {
  return content.querySelector<HTMLElement>(`[data-guid='${guid}']`)!;
}

function getItemTagsControl(content: HTMLElement, guid: string): HTMLElement {
  return getItemRow(content, guid).querySelector<HTMLElement>(
    ".import-preview-tags-control",
  )!;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
  fetchFullArticleContentWithOutcomeMock.mockReset();
  createTagsDropdownPortalMock.mockReset();
  createTagsDropdownPortalMock.mockImplementation(() => vi.fn());
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


  it("creates the missing source feed, assigns it to the default folder, and inserts its starred item immediately without waiting on the fetch, when the metadata-refresh toggle is on", async () => {
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
    getMetadataRefreshToggle(content).click();

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
    expect(newFeed?.folder).toBe(DEFAULT_NEW_FEED_FOLDER);
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
      DEFAULT_NEW_FEED_FOLDER,
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

  it("renders an Options panel above Preview containing the new-feed metadata-refresh toggle, off by default", async () => {
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
    const optionsPanel = content.querySelector(".import-options-panel");
    expect(optionsPanel).not.toBeNull();
    expect(optionsPanel?.textContent).toContain("New-feed metadata refresh");

    const preview = content.querySelector(".import-preview-container")!;
    const optionsIndex = Array.from(preview.children).indexOf(
      optionsPanel as Element,
    );
    const headerIndex = Array.from(preview.children).findIndex((child) =>
      child.querySelector("h4")?.textContent === "Preview",
    );
    expect(optionsIndex).toBeGreaterThanOrEqual(0);
    expect(headerIndex).toBeGreaterThan(optionsIndex);

    expect(getMetadataRefreshToggle(content).checked).toBe(false);
  });

  it("dims the metadata-refresh toggle's description while off, and un-dims it once switched on", async () => {
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
    expect(
      getMetadataRefreshDescription(content).classList.contains(
        "import-option-description--disabled",
      ),
    ).toBe(true);

    getMetadataRefreshToggle(content).click();

    expect(
      getMetadataRefreshDescription(content).classList.contains(
        "import-option-description--disabled",
      ),
    ).toBe(false);
  });

  it("creates the missing source feed using only the export's data and never triggers a live fetch when the metadata-refresh toggle is left off", async () => {
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
    // The toggle is off by default — left untouched.
    const importButton = content.querySelector<HTMLButtonElement>(
      ".rss-dashboard-modal-buttons .rss-dashboard-primary-button",
    )!;
    importButton.click();
    await flushPromises();

    const newFeed = settings.feeds.find(
      (f) => f.url === "https://not-subscribed.example.test/feed",
    );
    expect(newFeed).toBeDefined();
    expect(newFeed?.title).toBe("Not Subscribed Source");
    expect(newFeed?.siteUrl).toBe("https://not-subscribed.example.test/");
    expect(newFeed?.folder).toBe(DEFAULT_NEW_FEED_FOLDER);
    expect(newFeed?.items).toHaveLength(1);
    expect(newFeed?.items[0]).toMatchObject({
      title: "Unsubscribed Source Article",
      starred: true,
      read: false,
    });

    // No live fetch was triggered for the new feed.
    expect(deferred.calls).toHaveLength(0);
  });

  it("lets the user change the shared new-feed folder before importing", async () => {
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
    const folderInput = getNewFeedFolderInput(content);
    expect(folderInput.value).toBe(DEFAULT_NEW_FEED_FOLDER);

    folderInput.value = "Imported";
    folderInput.dispatchEvent(new Event("blur"));

    const importButton = content.querySelector<HTMLButtonElement>(
      ".rss-dashboard-modal-buttons .rss-dashboard-primary-button",
    )!;
    importButton.click();
    await flushPromises();

    const newFeed = settings.feeds.find(
      (f) => f.url === "https://not-subscribed.example.test/feed",
    );
    expect(newFeed?.folder).toBe("Imported");
    expect(plugin.ensureFolderExists).toHaveBeenCalledWith("Imported", {
      saveSettings: false,
      refreshView: false,
    });
  });

  it("falls back to the default new-feed folder when the field is cleared", async () => {
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
    const folderInput = getNewFeedFolderInput(content);
    folderInput.value = "   ";
    folderInput.dispatchEvent(new Event("blur"));

    expect(folderInput.value).toBe(DEFAULT_NEW_FEED_FOLDER);
  });

  it("marks a new-feed group's row with a '*' and explains it in the helper text, but leaves existing-feed rows unmarked", async () => {
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

    const newFeedRow = getGroupRow(
      content,
      "https://not-subscribed.example.test/feed",
    );
    expect(
      newFeedRow.querySelector(".import-preview-new-feed-marker"),
    ).toBeTruthy();

    const existingFeedRow = getGroupRow(
      content,
      "https://example-feed.test/rss",
    );
    expect(
      existingFeedRow.querySelector(".import-preview-new-feed-marker"),
    ).toBeNull();

    const helperText = content.querySelector<HTMLElement>(
      ".import-preview-helper",
    );
    expect(helperText?.textContent).toContain("*");
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

  it("adds a new label as an availableTags entry and tags the imported article with it", async () => {
    const app = createMockApp();
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("https://example-feed.test/rss", "Example Feed"),
      makeFeed("https://example.com/blog/feed.xml", "Example Blog"),
    ];
    const originalTagCount = settings.availableTags.length;
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
    const importButton = content.querySelector<HTMLButtonElement>(
      ".rss-dashboard-modal-buttons .rss-dashboard-primary-button",
    )!;
    importButton.click();
    await flushPromises();

    expect(settings.availableTags).toHaveLength(originalTagCount + 2);
    const design = settings.availableTags.find((t) => t.name === "Design");
    const art = settings.availableTags.find((t) => t.name === "art");
    expect(design).toBeDefined();
    expect(art).toBeDefined();

    const labeledItem = settings.feeds[1].items[0];
    expect(labeledItem.tags).toEqual([design, art]);
  });

  it("reuses an existing availableTags color for a label instead of adding a duplicate entry", async () => {
    const app = createMockApp();
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("https://example-feed.test/rss", "Example Feed"),
      makeFeed("https://example.com/blog/feed.xml", "Example Blog"),
    ];
    settings.availableTags.push({ name: "design", color: "#654321" });
    const originalTagCount = settings.availableTags.length;
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
    const importButton = content.querySelector<HTMLButtonElement>(
      ".rss-dashboard-modal-buttons .rss-dashboard-primary-button",
    )!;
    importButton.click();
    await flushPromises();

    // Only "art" is new; "design"/"Design" already existed (case-insensitive).
    expect(settings.availableTags).toHaveLength(originalTagCount + 1);
    const designEntries = settings.availableTags.filter(
      (t) => t.name.toLowerCase() === "design",
    );
    expect(designEntries).toEqual([{ name: "design", color: "#654321" }]);

    const labeledItem = settings.feeds[1].items[0];
    expect(labeledItem.tags?.[0]).toEqual({ name: "design", color: "#654321" });
  });

  it("re-importing the same export updates the existing article instead of duplicating it", async () => {
    const app = createMockApp();
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("https://example-feed.test/rss", "Example Feed"),
      makeFeed("https://example.com/blog/feed.xml", "Example Blog"),
    ];
    const plugin = createTestPlugin(settings);

    const runImport = async () => {
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
    };

    // First import: user then reads the article and it gets saved locally.
    await runImport();
    settings.feeds[0].items[0].read = true;
    settings.feeds[0].items[0].saved = true;
    settings.feeds[0].items[0].savedFilePath = "Articles/existing-feed-article-one.md";

    // Re-running the same export must not duplicate the article, and must
    // leave the locally-edited fields untouched even though the export
    // itself reports the item as unsaved.
    await runImport();

    expect(settings.feeds[0].items).toHaveLength(1);
    expect(settings.feeds[0].items[0]).toMatchObject({
      title: "Existing Feed Article One",
      starred: true,
      read: true,
      saved: true,
      savedFilePath: "Articles/existing-feed-article-one.md",
    });
    expect(settings.feeds[1].items).toHaveLength(1);
  });
  it("has no 'Fetch full article content' toggle and never fetches full content during import, regardless of any setting (234-10)", async () => {
    const app = createMockApp();
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("https://example-feed.test/rss", "Example Feed"),
      makeFeed("https://example.com/blog/feed.xml", "Example Blog"),
      makeFeed(
        "https://not-subscribed.example.test/feed",
        "Not Subscribed Source",
      ),
    ];
    const plugin = createTestPlugin(settings);
    // Even if the (now-removed) fetch pipeline were somehow still wired up,
    // making it resolve successfully should not matter — the toggle no
    // longer exists to enable it, and the call site is gone.
    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "<article>Full fetched content</article>",
      failureType: "none",
    } satisfies FullArticleFetchResult);

    const modal = new ImportStarredModal(
      app,
      plugin as unknown as ConstructorParameters<typeof ImportStarredModal>[1],
    );
    (modal as unknown as TestModal).open();

    await (modal as unknown as TestModal).handleFileSelection(
      new File([readFixture()], "starred.json"),
    );

    const content = (modal as unknown as TestModal).contentEl;

    // The toggle and its description are gone entirely.
    expect(
      content.querySelector(".import-fetch-full-content-setting"),
    ).toBeNull();
    expect(content.textContent).not.toContain("Fetch full article content");

    const importButton = content.querySelector<HTMLButtonElement>(
      ".rss-dashboard-modal-buttons .rss-dashboard-primary-button",
    )!;
    importButton.click();
    await flushPromises();

    // No full-content fetch call happens during import.
    expect(fetchFullArticleContentWithOutcomeMock).not.toHaveBeenCalled();

    // Every imported article keeps its export-provided content and starts
    // in the "unfetched" state (234-09) — the reader's manual "Fetch now"
    // path is the only way to get full content post-import.
    expect(settings.feeds[0].items[0].content).toBe(
      "<p>Placeholder summary content for article one.</p>",
    );
    expect(settings.feeds[0].items[0].starredImportContentState).toBe(
      "unfetched",
    );
    expect(settings.feeds[0].items[0].starredImportedAt).toBeGreaterThan(0);

    // The import-time failure-summary screen is unreachable — the modal
    // closes normally instead of swapping to a results summary.
    expect(
      content.querySelector(".import-fetch-full-content-failures"),
    ).toBeNull();
    expect(content.textContent).not.toContain(
      "could not be fetched",
    );
  });

  it("shows the tag-import toggle in the Options panel, on by default, alongside the metadata-refresh toggle", async () => {
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
    const optionsPanel = content.querySelector(".import-options-panel");
    expect(optionsPanel?.textContent).toContain("Import labels as tags");
    expect(getTagImportToggle(content).checked).toBe(true);
  });

  it("dims the tag-import toggle's description once switched off", async () => {
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
    expect(
      getTagImportDescription(content).classList.contains(
        "import-option-description--disabled",
      ),
    ).toBe(false);

    getTagImportToggle(content).click();

    expect(
      getTagImportDescription(content).classList.contains(
        "import-option-description--disabled",
      ),
    ).toBe(true);
  });

  it("shows a live 'New tags (N)' section listing every label-derived tag not already in the palette, matching selected articles", async () => {
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
    const section = getNewTagsSection(content);
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain("New tags (2)");
    expect(section?.textContent).toContain("Design");
    expect(section?.textContent).toContain("art");

    // Deselecting the only article carrying those labels removes them from
    // the live preview.
    const labeledCheckbox = content.querySelector<HTMLInputElement>(
      "[data-guid='tag:google.com,2005:reader/item/0000000000000002'] .import-preview-checkbox",
    )!;
    labeledCheckbox.click();

    expect(getNewTagsSection(content)).toBeNull();
  });

  it("shows no 'New tags' section when every label-derived tag already exists in the palette", async () => {
    const app = createMockApp();
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("https://example-feed.test/rss", "Example Feed"),
      makeFeed("https://example.com/blog/feed.xml", "Example Blog"),
    ];
    settings.availableTags.push(
      { name: "design", color: "#111111" },
      { name: "art", color: "#222222" },
    );
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
    expect(getNewTagsSection(content)).toBeNull();
  });

  it("hides the 'New tags' section and turning the toggle off skips the palette mutation entirely", async () => {
    const app = createMockApp();
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("https://example-feed.test/rss", "Example Feed"),
      makeFeed("https://example.com/blog/feed.xml", "Example Blog"),
    ];
    const originalTagCount = settings.availableTags.length;
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
    getTagImportToggle(content).click();

    expect(getNewTagsSection(content)).toBeNull();

    const importButton = content.querySelector<HTMLButtonElement>(
      ".rss-dashboard-modal-buttons .rss-dashboard-primary-button",
    )!;
    importButton.click();
    await flushPromises();

    // No new tag reached the palette, and the imported article carries no
    // label-derived tags at all.
    expect(settings.availableTags).toHaveLength(originalTagCount);
    const labeledItem = settings.feeds[1].items[0];
    expect(labeledItem.tags).toBeUndefined();
  });

  it("imports label-derived tags as usual when the tag-import toggle is left on (matches shipped 234-04 behavior)", async () => {
    const app = createMockApp();
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("https://example-feed.test/rss", "Example Feed"),
      makeFeed("https://example.com/blog/feed.xml", "Example Blog"),
    ];
    const originalTagCount = settings.availableTags.length;
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
    const importButton = content.querySelector<HTMLButtonElement>(
      ".rss-dashboard-modal-buttons .rss-dashboard-primary-button",
    )!;
    importButton.click();
    await flushPromises();

    expect(settings.availableTags).toHaveLength(originalTagCount + 2);
    const labeledItem = settings.feeds[1].items[0];
    expect(labeledItem.tags?.map((t) => t.name)).toEqual(["Design", "art"]);
  });

  describe("per-article tag chip (234-12)", () => {
    const labeledGuid = "tag:google.com,2005:reader/item/0000000000000002";
    const unlabeledGuid = "tag:google.com,2005:reader/item/0000000000000001";

    async function setUpModal(settingsOverride?: typeof DEFAULT_SETTINGS) {
      const app = createMockApp();
      const settings = settingsOverride ?? cloneSettings();
      settings.feeds = settings.feeds.length
        ? settings.feeds
        : [
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
      return {
        settings,
        content: (modal as unknown as TestModal).contentEl,
      };
    }

    it("renders an article's assigned tags as chips using the existing dashboard-card chip renderer", async () => {
      const { content } = await setUpModal();

      const labeledControl = getItemTagsControl(content, labeledGuid);
      const chips = Array.from(
        labeledControl.querySelectorAll(".rss-dashboard-tag-badge"),
      ).map((el) => el.textContent);
      expect(chips).toEqual(["Design", "art"]);
    });

    it("shows no tag chips (and no Read/Unread text) for an article with no assigned tags", async () => {
      const { content } = await setUpModal();

      const row = getItemRow(content, unlabeledGuid);
      expect(row.textContent).not.toContain("Read");
      expect(row.textContent).not.toContain("Unread");

      const unlabeledControl = getItemTagsControl(content, unlabeledGuid);
      expect(
        unlabeledControl.querySelectorAll(".rss-dashboard-tag-badge"),
      ).toHaveLength(0);
    });

    it("removes the 'Read'/'Unread' text from every article row", async () => {
      const { content } = await setUpModal();

      const rows = content.querySelectorAll(".import-preview-row--feed");
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((row) => {
        expect(row.textContent).not.toContain("Read");
        expect(row.textContent).not.toContain("Unread");
      });
    });

    it("clicking a row's tag chip opens the tag-editing portal against that row's live candidate article", async () => {
      const { content } = await setUpModal();

      const control = getItemTagsControl(content, labeledGuid);
      control.click();

      expect(createTagsDropdownPortalMock).toHaveBeenCalledTimes(1);
      const call = createTagsDropdownPortalMock.mock.calls[0][0] as {
        anchor: HTMLElement;
        item: { guid: string; tags?: Tag[] };
      };
      expect(call.anchor).toBe(control);
      expect(call.item.guid).toBe(labeledGuid);
      expect(call.item.tags?.map((t) => t.name)).toEqual(["Design", "art"]);
    });

    it("adding a tag through the portal mutates the underlying candidate article's tags directly, which carry through to the imported item", async () => {
      const { settings, content } = await setUpModal();

      const control = getItemTagsControl(content, unlabeledGuid);
      control.click();

      const call = createTagsDropdownPortalMock.mock.calls[0][0] as {
        onTagAssignmentChange: (tag: Tag, checked: boolean) => void;
      };
      call.onTagAssignmentChange({ name: "inoreader", color: "#8b5cf6" }, true);

      // The chip re-renders immediately from the same candidate object.
      const chips = Array.from(
        getItemTagsControl(content, unlabeledGuid).querySelectorAll(
          ".rss-dashboard-tag-badge",
        ),
      ).map((el) => el.textContent);
      expect(chips).toEqual(["inoreader"]);

      const importButton = content.querySelector<HTMLButtonElement>(
        ".rss-dashboard-modal-buttons .rss-dashboard-primary-button",
      )!;
      importButton.click();
      await flushPromises();

      const importedItem = settings.feeds[0].items.find(
        (item) => item.guid === unlabeledGuid,
      );
      expect(importedItem?.tags?.map((t) => t.name)).toEqual(["inoreader"]);
    });

    it("removing a tag through the portal removes it from the underlying candidate article", async () => {
      const { content } = await setUpModal();

      const control = getItemTagsControl(content, labeledGuid);
      control.click();

      const call = createTagsDropdownPortalMock.mock.calls[0][0] as {
        onTagAssignmentChange: (tag: Tag, checked: boolean) => void;
      };
      call.onTagAssignmentChange({ name: "Design", color: "#111111" }, false);

      const chips = Array.from(
        getItemTagsControl(content, labeledGuid).querySelectorAll(
          ".rss-dashboard-tag-badge",
        ),
      ).map((el) => el.textContent);
      expect(chips).toEqual(["art"]);
    });

    it("a tag created on the fly through the chip's portal appears in the 'New tags (N)' confirmation section, with exactly one confirmation path", async () => {
      const { content } = await setUpModal();

      // No labels in this fixture require confirmation before this test's
      // ad hoc creation, so the section starts absent.
      const labeledControl = getItemTagsControl(content, labeledGuid);
      labeledControl.click();
      const firstCall = createTagsDropdownPortalMock.mock.calls[0][0] as {
        onTagAssignmentChange: (tag: Tag, checked: boolean) => void;
      };
      // Remove the bulk-imported labels first so only the ad hoc tag is in play.
      firstCall.onTagAssignmentChange({ name: "Design", color: "#111111" }, false);
      firstCall.onTagAssignmentChange({ name: "art", color: "#222222" }, false);
      expect(getNewTagsSection(content)).toBeNull();

      const unlabeledControl = getItemTagsControl(content, unlabeledGuid);
      unlabeledControl.click();
      const secondCall = createTagsDropdownPortalMock.mock.calls[
        createTagsDropdownPortalMock.mock.calls.length - 1
      ][0] as {
        onTagAssignmentChange: (tag: Tag, checked: boolean) => void;
      };
      secondCall.onTagAssignmentChange(
        { name: "googleAPI", color: "#00ff00" },
        true,
      );

      const section = getNewTagsSection(content);
      expect(section).not.toBeNull();
      expect(section?.textContent).toContain("New tags (1)");
      expect(section?.textContent).toContain("googleAPI");
    });

    it("hides label-derived chips when 'Import labels as tags' is off, but keeps a tag added by hand through the chip's portal", async () => {
      const { settings, content } = await setUpModal();

      getTagImportToggle(content).click();

      // "Design" and "art" are label-derived (234-04's mapping), so they're
      // hidden from the chip once the bulk toggle is off.
      const control = getItemTagsControl(content, labeledGuid);
      expect(control.querySelectorAll(".rss-dashboard-tag-badge")).toHaveLength(0);

      control.click();
      const call = createTagsDropdownPortalMock.mock.calls[
        createTagsDropdownPortalMock.mock.calls.length - 1
      ][0] as {
        onTagAssignmentChange: (tag: Tag, checked: boolean) => void;
      };
      call.onTagAssignmentChange({ name: "inoreader", color: "#8b5cf6" }, true);

      // The manually-added tag survives display even though the bulk toggle
      // is still off — only the label-derived tags stay hidden.
      const chips = Array.from(
        getItemTagsControl(content, labeledGuid).querySelectorAll(
          ".rss-dashboard-tag-badge",
        ),
      ).map((el) => el.textContent);
      expect(chips).toEqual(["inoreader"]);

      const importButton = content.querySelector<HTMLButtonElement>(
        ".rss-dashboard-modal-buttons .rss-dashboard-primary-button",
      )!;
      importButton.click();
      await flushPromises();

      const importedItem = settings.feeds
        .flatMap((feed) => feed.items)
        .find((item) => item.guid === labeledGuid);
      expect(importedItem?.tags?.map((t) => t.name)).toEqual(["inoreader"]);
    });
  });
});
