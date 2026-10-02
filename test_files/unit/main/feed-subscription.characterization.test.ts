/**
 * Characterization tests for feed subscriptions in main.ts (#551).
 *
 * Feed subscriptions are the plugin's `addFeed`, `editFeed`, `addSubfolder`
 * and `applyFeedLimitsToAllFeeds`. These tests pin what they do today, bugs
 * included, through the plugin's public surface only, so they can move into
 * their own module (ADR 0015, step 4) without these tests changing.
 *
 * Everything the methods do is written to one ordered event log: saves,
 * dashboard redraws and notices. The parser is a double that answers every
 * `parseFeed` call from the feed it was given, unless a test holds or fails it.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { App, type MockApp, type PluginManifest } from "obsidian";
import RssDashboardPlugin from "../../../main";
import type { RssDashboardView } from "../../../src/views/dashboard-view";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type Folder,
  type RssDashboardSettings,
} from "../../../src/types/types";

function createManifest(app: MockApp): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "Test",
    description: "Test plugin",
    dir: `${app.vault.configDir}/plugins/rss-dashboard`,
  };
}

const BUSY_NOTICE = "A feed operation is already in progress.";
const NEW_URL = "https://example.com/new.xml";

type ParseFeedMock = Mock<
  (
    url: string,
    existing?: Feed | null,
    options?: { signal?: AbortSignal; allowEmpty?: boolean },
  ) => Promise<Feed>
>;

interface Harness {
  plugin: RssDashboardPlugin;
  parseFeed: ParseFeedMock;
  save: Mock<() => Promise<void>>;
  refresh: Mock<() => void>;
  /** Saves, redraws and notices, oldest first. */
  events: string[];
  /** How many feeds `settings.feeds` held at each save. */
  feedCountAtSave: number[];
  /** Makes `getActiveDashboardView` return no view, as with no dashboard open. */
  closeDashboard(): void;
}

let harnesses: Harness[] = [];

function createItem(feedUrl: string, guid: string, overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: guid,
    link: `${feedUrl}#${guid}`,
    description: "",
    pubDate: "2026-09-01T00:00:00.000Z",
    guid,
    read: true,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl,
    coverImage: "",
    ...overrides,
  };
}

function createFeed(name: string, overrides: Partial<Feed> = {}): Feed {
  const url = `https://example.com/${name}.xml`;
  return {
    title: `Feed ${name}`,
    url,
    folder: "",
    items: [],
    lastUpdated: 1,
    mediaType: "article",
    ...overrides,
  };
}

function createSettings(feeds: Feed[], folders: Folder[]): RssDashboardSettings {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.storageMode = "legacy-json";
  settings.feeds = feeds;
  settings.folders = folders;
  return settings;
}

function createHarness(
  feeds: Feed[] = [],
  folders: Folder[] = [],
): Harness {
  const app = App.createMock();
  const plugin = new RssDashboardPlugin(app, createManifest(app));
  const events: string[] = [];
  const feedCountAtSave: number[] = [];

  plugin.settings = createSettings(feeds, folders);
  plugin.loadData = vi.fn().mockResolvedValue(null);
  plugin.saveData = vi.fn().mockResolvedValue(undefined);
  // Folder service and the rest of the settings-backed services, as onload()
  // builds them.
  (
    plugin as unknown as { initializeSettingsBackedServices(): void }
  ).initializeSettingsBackedServices();

  const original = plugin.saveSettings.bind(plugin);
  const save = vi.spyOn(plugin, "saveSettings").mockImplementation(async () => {
    events.push("save");
    feedCountAtSave.push(plugin.settings.feeds.length);
    await original();
  }) as unknown as Mock<() => Promise<void>>;

  // A parser that echoes the feed it is given back with one article.
  const parseFeed: ParseFeedMock = vi.fn(async (url, existing) => ({
    ...(existing as Feed),
    items: [createItem(url, "one")],
  }));
  plugin.feedParser = {
    parseFeed,
    refreshFeed: vi.fn(),
    refreshAllFeeds: vi.fn(),
  } as unknown as RssDashboardPlugin["feedParser"];

  const refresh = vi.fn(() => {
    events.push("refresh");
  });
  let dashboardOpen = true;
  plugin.getActiveDashboardView = vi.fn(async () =>
    dashboardOpen
      ? ({ refresh, render: vi.fn() } as unknown as RssDashboardView)
      : null,
  );

  vi.spyOn(console, "debug").mockImplementation((tag: unknown, message: unknown) => {
    if (tag === "[Stub Notice]") events.push(`notice: ${String(message)}`);
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  const harness: Harness = {
    plugin,
    parseFeed,
    save,
    refresh,
    events,
    feedCountAtSave,
    closeDashboard: () => {
      dashboardOpen = false;
    },
  };
  harnesses.push(harness);
  return harness;
}

function notices(harness: Harness): string[] {
  return harness.events
    .filter((event) => event.startsWith("notice: "))
    .map((event) => event.slice("notice: ".length));
}

function addFeed(
  harness: Harness,
  fields: {
    title?: string;
    url?: string;
    folder?: string;
    autoDeleteDuration?: number;
    maxItemsLimit?: number;
    scanInterval?: number;
    keywordRules?: Feed["keywordRules"];
    customTemplate?: string;
    excludeFromRefresh?: boolean;
    customTags?: string[];
  } = {},
  options?: Parameters<RssDashboardPlugin["addFeed"]>[10],
): Promise<boolean> {
  return harness.plugin.addFeed(
    fields.title ?? "New feed",
    fields.url ?? NEW_URL,
    fields.folder ?? "",
    fields.autoDeleteDuration,
    fields.maxItemsLimit,
    fields.scanInterval,
    fields.keywordRules,
    fields.customTemplate,
    fields.excludeFromRefresh,
    fields.customTags,
    options,
  );
}

function storedFeed(harness: Harness, url = NEW_URL): Feed {
  const feed = harness.plugin.settings.feeds.find((f) => f.url === url);
  if (!feed) throw new Error(`No stored feed for ${url}`);
  return feed;
}

beforeEach(() => {
  harnesses = [];
});

afterEach(() => {
  for (const harness of harnesses) harness.plugin.onunload();
  harnesses = [];
  vi.restoreAllMocks();
  document.body.empty();
});

describe("feed subscription: addFeed duplicates and defaults", () => {
  it("refuses a URL that is already subscribed, with a notice", async () => {
    const harness = createHarness([createFeed("new", { url: NEW_URL })]);

    const added = await addFeed(harness);

    expect(added).toBe(false);
    expect(notices(harness)).toEqual(["This feed URL already exists"]);
    expect(harness.parseFeed).not.toHaveBeenCalled();
    expect(harness.save).not.toHaveBeenCalled();
  });

  it("refuses a duplicate silently when showNotice is false", async () => {
    const harness = createHarness([createFeed("new", { url: NEW_URL })]);

    const added = await addFeed(harness, {}, { showNotice: false });

    expect(added).toBe(false);
    expect(notices(harness)).toEqual([]);
  });

  it("compares URLs as exact strings, so a trailing slash is a different feed", async () => {
    const harness = createHarness([createFeed("new", { url: NEW_URL })]);

    const added = await addFeed(harness, { url: `${NEW_URL}/` });

    expect(added).toBe(true);
    expect(harness.plugin.settings.feeds).toHaveLength(2);
  });

  it("fills unset limits from the settings and the scan interval with zero", async () => {
    const harness = createHarness();
    harness.plugin.settings.defaultAutoDeleteDuration = 45;
    harness.plugin.settings.maxItems = 77;

    await addFeed(harness);

    const feed = storedFeed(harness);
    expect(feed.autoDeleteDuration).toBe(45);
    expect(feed.maxItemsLimit).toBe(77);
    expect(feed.scanInterval).toBe(0);
    expect(feed.excludeFromRefresh).toBe(false);
    expect(feed.keywordRules).toEqual({
      overrideGlobalRules: false,
      includeLogic: "AND",
      rules: [],
    });
  });

  it("passes the parser a feed built from the request, before storing anything", async () => {
    const harness = createHarness();
    harness.parseFeed.mockImplementation(async (_url, existing) => {
      expect(harness.plugin.settings.feeds).toHaveLength(0);
      return { ...(existing as Feed) };
    });

    await addFeed(harness, {
      title: "Requested",
      autoDeleteDuration: 9,
      maxItemsLimit: 8,
      scanInterval: 7,
      excludeFromRefresh: true,
    });

    const [url, existing, options] = harness.parseFeed.mock.calls[0];
    expect(url).toBe(NEW_URL);
    expect(existing).toMatchObject({
      title: "Requested",
      autoDeleteDuration: 9,
      maxItemsLimit: 8,
      scanInterval: 7,
      excludeFromRefresh: true,
      items: [],
    });
    expect(options).toEqual({ allowEmpty: true, signal: undefined });
  });

  it("treats only literal true as excluding the feed from refresh", async () => {
    const harness = createHarness();

    await addFeed(harness, { excludeFromRefresh: undefined });

    expect(storedFeed(harness).excludeFromRefresh).toBe(false);
  });

  it("drops an empty custom template and empty custom tags, and copies a non-empty tag list", async () => {
    const harness = createHarness();
    const tags = ["a", "b"];

    await addFeed(harness, { customTemplate: "", customTags: [] });
    const first = storedFeed(harness);
    expect(first.customTemplate).toBeUndefined();
    expect(first.customTags).toBeUndefined();

    await addFeed(harness, {
      url: "https://example.com/two.xml",
      customTemplate: "{{title}}",
      customTags: tags,
    });
    const second = storedFeed(harness, "https://example.com/two.xml");
    expect(second.customTemplate).toBe("{{title}}");
    expect(second.customTags).toEqual(["a", "b"]);
    expect(harness.parseFeed.mock.calls[1][1]?.customTags).not.toBe(tags);
  });

  it("keeps the Windows-1251 encoding and drops any other", async () => {
    const harness = createHarness();

    await addFeed(harness, {}, { feedEncoding: "windows-1251" });
    await addFeed(
      harness,
      { url: "https://example.com/two.xml" },
      { feedEncoding: "auto" },
    );

    expect(storedFeed(harness).feedEncoding).toBe("windows-1251");
    expect(storedFeed(harness, "https://example.com/two.xml").feedEncoding).toBeUndefined();
  });

  it("passes the requested keyword rules through", async () => {
    const harness = createHarness();
    const rules = {
      overrideGlobalRules: true,
      includeLogic: "OR" as const,
      rules: [],
    };

    await addFeed(harness, { keywordRules: rules });

    expect(storedFeed(harness).keywordRules).toEqual(rules);
  });
});

describe("feed subscription: addFeed media type", () => {
  it("marks a feed added to the default YouTube folder as video", async () => {
    const harness = createHarness();

    await addFeed(harness, { folder: "Videos" });

    expect(storedFeed(harness).mediaType).toBe("video");
  });

  it("marks a feed added to the default podcast folder as podcast", async () => {
    const harness = createHarness();

    await addFeed(harness, { folder: "Podcasts" });

    expect(storedFeed(harness).mediaType).toBe("podcast");
  });

  it("matches the media folder exactly: case and subfolders stay article", async () => {
    const harness = createHarness();

    await addFeed(harness, { folder: "videos" });
    await addFeed(harness, { url: "https://example.com/two.xml", folder: "Videos/Sub" });

    expect(storedFeed(harness).mediaType).toBe("article");
    expect(storedFeed(harness, "https://example.com/two.xml").mediaType).toBe("article");

    await addFeed(harness, { url: "https://example.com/three.xml", folder: "Podcasts/Sub" });
    expect(storedFeed(harness, "https://example.com/three.xml").mediaType).toBe("article");
  });
});

describe("feed subscription: addFeed parsed values", () => {
  it("lets values the parser returns win over the requested ones", async () => {
    const harness = createHarness();
    harness.parseFeed.mockImplementation(async (_url, existing) => ({
      ...(existing as Feed),
      autoDeleteDuration: 1,
      maxItemsLimit: 2,
      scanInterval: 3,
      excludeFromRefresh: true,
      customTemplate: "parsed template",
      customTags: ["parsed"],
      keywordRules: { overrideGlobalRules: true, includeLogic: "OR", rules: [] },
    }));

    await addFeed(harness, {
      autoDeleteDuration: 9,
      maxItemsLimit: 8,
      scanInterval: 7,
      excludeFromRefresh: false,
      customTemplate: "requested template",
      customTags: ["requested"],
    });

    expect(storedFeed(harness)).toMatchObject({
      autoDeleteDuration: 1,
      maxItemsLimit: 2,
      scanInterval: 3,
      excludeFromRefresh: true,
      customTemplate: "parsed template",
      customTags: ["parsed"],
      keywordRules: { overrideGlobalRules: true, includeLogic: "OR", rules: [] },
    });
  });

  it("keeps the requested values when the parser returns none of them", async () => {
    const harness = createHarness();
    harness.parseFeed.mockImplementation(async () => ({
      title: "Parsed",
      url: NEW_URL,
      folder: "",
      items: [],
      lastUpdated: 1,
    }));

    await addFeed(harness, {
      autoDeleteDuration: 9,
      maxItemsLimit: 8,
      scanInterval: 7,
      excludeFromRefresh: true,
      customTemplate: "requested template",
      customTags: ["requested"],
    });

    expect(storedFeed(harness)).toMatchObject({
      title: "Parsed",
      autoDeleteDuration: 9,
      maxItemsLimit: 8,
      scanInterval: 7,
      excludeFromRefresh: true,
      customTemplate: "requested template",
      customTags: ["requested"],
    });
  });
});

describe("feed subscription: addFeed storing", () => {
  it("stores the feed before the one save, then redraws, then notices", async () => {
    const harness = createHarness();

    const added = await addFeed(harness, { title: "Blog" });

    expect(added).toBe(true);
    expect(harness.feedCountAtSave).toEqual([1]);
    expect(harness.events).toEqual(["save", "refresh", 'notice: Feed "Blog" added']);
  });

  it("creates a missing folder path without saving or redrawing for it", async () => {
    const harness = createHarness([], [{ name: "News", subfolders: [] }]);

    await addFeed(harness, { folder: "News/Brand new" });

    const news = harness.plugin.settings.folders[0];
    expect(news.subfolders.map((folder) => folder.name)).toEqual(["Brand new"]);
    expect(harness.save).toHaveBeenCalledTimes(1);
    expect(harness.refresh).toHaveBeenCalledTimes(1);
  });

  it("creates no folder for an empty folder or Uncategorized", async () => {
    const harness = createHarness();

    await addFeed(harness, { folder: "" });
    await addFeed(harness, { url: "https://example.com/two.xml", folder: "Uncategorized" });

    expect(harness.plugin.settings.folders.map((f) => f.name)).not.toContain("Uncategorized");
  });

  it("applies the folder's auto-tags to the stored articles after creating it", async () => {
    const tag = { name: "Tech", color: "#123456" };
    const harness = createHarness([], [
      { name: "News", subfolders: [], autoTags: [tag] },
    ]);
    harness.plugin.settings.availableTags = [tag];

    await addFeed(harness, { folder: "News" });

    expect(storedFeed(harness).items[0].tags?.map((t) => t.name)).toEqual(["Tech"]);
  });

  it("skips the redraw without an open dashboard, and still notices", async () => {
    const harness = createHarness();
    harness.closeDashboard();

    await addFeed(harness, { title: "Blog" });

    expect(harness.refresh).not.toHaveBeenCalled();
    expect(harness.events).toEqual(["save", 'notice: Feed "Blog" added']);
  });

  it("stores and returns true without any notice when showNotice is false", async () => {
    const harness = createHarness();

    const added = await addFeed(harness, {}, { showNotice: false });

    expect(added).toBe(true);
    expect(notices(harness)).toEqual([]);
    expect(harness.plugin.settings.feeds).toHaveLength(1);
  });
});

describe("feed subscription: addFeed failures", () => {
  it("stores nothing and shows the parse failure when the feed can't be parsed", async () => {
    const harness = createHarness();
    harness.parseFeed.mockRejectedValue(new Error("Timed out"));

    const added = await addFeed(harness);

    expect(added).toBe(false);
    expect(harness.plugin.settings.feeds).toHaveLength(0);
    expect(harness.save).not.toHaveBeenCalled();
    expect(notices(harness)).toEqual(["Error parsing feed: Timed out"]);
  });

  it("shows no parse failure when showNotice is false", async () => {
    const harness = createHarness();
    harness.parseFeed.mockRejectedValue(new Error("Timed out"));

    const added = await addFeed(harness, {}, { showNotice: false });

    expect(added).toBe(false);
    expect(notices(harness)).toEqual([]);
  });

  it("reports a failing save as a parse failure and leaves the feed unsaved in memory", async () => {
    const harness = createHarness();
    harness.save.mockImplementationOnce(async () => {
      harness.events.push("save");
      throw new Error("disk full");
    });

    const added = await addFeed(harness);

    // BUG: pinned, see #552
    expect(added).toBe(false);
    expect(notices(harness)).toEqual(["Error parsing feed: disk full"]);
    expect(harness.plugin.settings.feeds).toHaveLength(1);
  });

  it("reports a failure before the parse as an add error", async () => {
    const harness = createHarness();
    (harness.plugin.settings as { media: unknown }).media = undefined;

    const added = await addFeed(harness);

    expect(added).toBe(false);
    expect(notices(harness)).toHaveLength(1);
    expect(notices(harness)[0].startsWith("Error adding feed: ")).toBe(true);
    expect(harness.parseFeed).not.toHaveBeenCalled();
  });

  it("stays silent on a failure before the parse when showNotice is false", async () => {
    const harness = createHarness();
    (harness.plugin.settings as { media: unknown }).media = undefined;

    const added = await addFeed(harness, {}, { showNotice: false });

    expect(added).toBe(false);
    expect(notices(harness)).toEqual([]);
  });
});

describe("feed subscription: addFeed as a global feed operation", () => {
  it("runs the parse under an operation signal and ends the operation afterwards", async () => {
    const harness = createHarness();

    const added = await addFeed(harness, {}, { showNotice: false, globalOperation: true });

    expect(added).toBe(true);
    const options = harness.parseFeed.mock.calls[0][2];
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(harness.plugin.isGlobalRefreshCancellable).toBe(false);
  });

  it("refuses to start while another operation runs, and still shows the tracker's notice with showNotice false", async () => {
    const harness = createHarness();
    let finish: () => void = () => {};
    harness.parseFeed.mockImplementationOnce(
      (_url, existing) =>
        new Promise<Feed>((resolve) => {
          finish = () => resolve({ ...(existing as Feed) });
        }),
    );
    const first = addFeed(harness, {}, { showNotice: false, globalOperation: true });
    await vi.waitFor(() => expect(harness.parseFeed).toHaveBeenCalledTimes(1));

    const second = await addFeed(
      harness,
      { url: "https://example.com/two.xml" },
      { showNotice: false, globalOperation: true },
    );

    expect(second).toBe(false);
    expect(harness.parseFeed).toHaveBeenCalledTimes(1);
    expect(notices(harness)).toEqual([BUSY_NOTICE]);
    finish();
    expect(await first).toBe(true);
  });

  it("ends the operation when the parse fails, so the next one can start", async () => {
    const harness = createHarness();
    harness.parseFeed.mockRejectedValueOnce(new Error("Timed out"));

    await addFeed(harness, {}, { showNotice: false, globalOperation: true });
    const next = await addFeed(harness, {}, { showNotice: false, globalOperation: true });

    expect(next).toBe(true);
  });
});

describe("feed subscription: editFeed", () => {
  function editHarness(): { harness: Harness; feed: Feed } {
    const feed = createFeed("edit", {
      title: "Old title",
      folder: "News",
      lastRefreshAttemptCompletedAt: 123,
      lastFetchError: "boom",
    });
    feed.items = [createItem(feed.url, "a", { feedTitle: "Old title" })];
    const harness = createHarness([feed], [{ name: "News", subfolders: [] }]);
    return { harness, feed };
  }

  it("changes the given feed in place and saves once", async () => {
    const { harness, feed } = editHarness();

    await harness.plugin.editFeed(feed, "New title", "https://example.com/other.xml", "News");

    expect(harness.plugin.settings.feeds[0]).toBe(feed);
    expect(feed).toMatchObject({
      title: "New title",
      url: "https://example.com/other.xml",
      folder: "News",
    });
    expect(harness.save).toHaveBeenCalledTimes(1);
  });

  it("resets the refresh state only when the URL changes", async () => {
    const { harness, feed } = editHarness();

    await harness.plugin.editFeed(feed, "Old title", feed.url, "News");
    expect(feed.lastRefreshAttemptCompletedAt).toBe(123);
    expect(feed.lastFetchError).toBe("boom");

    await harness.plugin.editFeed(feed, "Old title", "https://example.com/other.xml", "News");
    expect(feed.lastRefreshAttemptCompletedAt).toBe(0);
    expect(feed.lastFetchError).toBeUndefined();
  });

  it("rewrites the feed title on every article only when the title changes", async () => {
    const { harness, feed } = editHarness();
    feed.items[0].feedTitle = "Custom";

    await harness.plugin.editFeed(feed, "Old title", feed.url, "News");
    expect(feed.items[0].feedTitle).toBe("Custom");

    await harness.plugin.editFeed(feed, "New title", feed.url, "News");
    expect(feed.items[0].feedTitle).toBe("New title");
  });

  it("leaves the feed URL on the articles when the URL changes", async () => {
    const { harness, feed } = editHarness();
    const oldUrl = feed.url;

    await harness.plugin.editFeed(feed, "Old title", "https://example.com/other.xml", "News");

    // BUG: pinned, see #553
    expect(feed.items[0].feedUrl).toBe(oldUrl);
  });

  it.each([false, true])("refuses another feed's URL without changing feeds or creating a folder (pre-existing duplicate: %s)", async (hasDuplicate) => {
    const { harness, feed } = editHarness();
    const other = createFeed("other");
    harness.plugin.settings.feeds.push(other);
    if (hasDuplicate) {
      harness.plugin.settings.feeds.push(createFeed("duplicate", { url: feed.url }));
    }
    const before = structuredClone(harness.plugin.settings);

    await harness.plugin.editFeed(feed, "New title", other.url, "News/New sub");

    expect(harness.plugin.settings).toEqual(before);
    expect(harness.save).not.toHaveBeenCalled();
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(harness.events).toEqual(["notice: This feed URL already exists"]);
  });

  it.each([false, true])("allows title and folder edits while keeping the feed's own URL (pre-existing duplicate: %s)", async (hasDuplicate) => {
    const { harness, feed } = editHarness();
    harness.plugin.settings.feeds.push(createFeed("other"));
    if (hasDuplicate) {
      harness.plugin.settings.feeds.push(createFeed("duplicate", { url: feed.url }));
    }
    const oldUrl = feed.url;

    await harness.plugin.editFeed(feed, "New title", oldUrl, "News/New sub");

    expect(feed).toMatchObject({
      title: "New title",
      url: oldUrl,
      folder: "News/New sub",
      lastRefreshAttemptCompletedAt: 123,
      lastFetchError: "boom",
    });
    expect(feed.items[0].feedTitle).toBe("New title");
    expect(harness.events).toEqual(["save", "refresh", 'notice: Feed "New title" updated']);
  });

  it("creates a missing target folder without a save or redraw of its own", async () => {
    const { harness, feed } = editHarness();

    await harness.plugin.editFeed(feed, "Old title", feed.url, "News/New sub");

    expect(harness.plugin.settings.folders[0].subfolders.map((f) => f.name)).toEqual(["New sub"]);
    expect(harness.save).toHaveBeenCalledTimes(1);
    expect(harness.refresh).toHaveBeenCalledTimes(1);
  });

  it("skips folder creation for an empty folder and stores the empty folder", async () => {
    const { harness, feed } = editHarness();

    await harness.plugin.editFeed(feed, "Old title", feed.url, "");

    expect(feed.folder).toBe("");
    expect(harness.plugin.settings.folders.map((f) => f.name)).toEqual(["News"]);
  });

  it("saves, redraws, then notices when a dashboard is open", async () => {
    const { harness, feed } = editHarness();

    await harness.plugin.editFeed(feed, "New title", feed.url, "News");

    expect(harness.events).toEqual(["save", "refresh", 'notice: Feed "New title" updated']);
  });

  it("saves but neither redraws nor notices without a dashboard", async () => {
    const { harness, feed } = editHarness();
    harness.closeDashboard();

    await harness.plugin.editFeed(feed, "New title", feed.url, "News");

    expect(harness.events).toEqual(["save"]);
  });
});

describe("feed subscription: addSubfolder", () => {
  function folderHarness(): Harness {
    return createHarness([], [
      { name: "News", subfolders: [{ name: "Tech", subfolders: [] }] },
    ]);
  }

  it("adds an empty subfolder under a top-level folder, saves, redraws, then notices", async () => {
    const harness = folderHarness();

    await harness.plugin.addSubfolder("News", "World");

    expect(harness.plugin.settings.folders[0].subfolders).toEqual([
      { name: "Tech", subfolders: [] },
      { name: "World", subfolders: [] },
    ]);
    expect(harness.events).toEqual([
      "save",
      "refresh",
      'notice: Subfolder "World" created under "News"',
    ]);
  });

  it("saves but neither redraws nor notices without a dashboard", async () => {
    const harness = folderHarness();
    harness.closeDashboard();

    await harness.plugin.addSubfolder("News", "World");

    expect(harness.events).toEqual(["save"]);
  });

  it("refuses an existing subfolder with a notice, without saving, dashboard or not", async () => {
    const harness = folderHarness();
    harness.closeDashboard();

    await harness.plugin.addSubfolder("News", "Tech");

    expect(harness.events).toEqual(['notice: Subfolder "Tech" already exists in "News"']);
    expect(harness.plugin.settings.folders[0].subfolders).toHaveLength(1);
  });

  it("does nothing at all for an unknown parent", async () => {
    const harness = folderHarness();

    await harness.plugin.addSubfolder("Missing", "World");

    // BUG: pinned, see #555
    expect(harness.events).toEqual([]);
  });

  it("does nothing at all for a nested parent path", async () => {
    const harness = folderHarness();

    await harness.plugin.addSubfolder("News/Tech", "World");

    // BUG: pinned, see #555
    expect(harness.events).toEqual([]);
    expect(harness.plugin.settings.folders[0].subfolders[0].subfolders).toEqual([]);
  });
});

describe("feed subscription: applyFeedLimitsToAllFeeds", () => {
  /** A feed of `count` articles, article `n` published `n` days after the first. */
  function feedOfArticles(
    name: string,
    count: number,
    overrides: Partial<Feed> = {},
  ): Feed {
    const feed = createFeed(name, {
      maxItemsLimit: 2,
      autoDeleteDuration: 0,
      ...overrides,
    });
    feed.items = Array.from({ length: count }, (_, index) =>
      createItem(feed.url, `${name}-${index}`, {
        pubDate: new Date(Date.UTC(2026, 8, 1 + index)).toISOString(),
      }),
    );
    return feed;
  }

  function guids(feed: Feed): string[] {
    return feed.items.map((item) => item.guid);
  }

  it("keeps the newest articles up to each feed's own limit", async () => {
    const harness = createHarness([feedOfArticles("a", 4), feedOfArticles("b", 1)]);

    await harness.plugin.applyFeedLimitsToAllFeeds();

    expect(guids(harness.plugin.settings.feeds[0])).toEqual(["a-3", "a-2"]);
    expect(guids(harness.plugin.settings.feeds[1])).toEqual(["b-0"]);
  });

  it("keeps a starred article beyond the limit while starred articles are protected", async () => {
    const feed = feedOfArticles("a", 4);
    feed.items[0].starred = true;
    const harness = createHarness([feed]);

    await harness.plugin.applyFeedLimitsToAllFeeds();

    expect(guids(feed).sort()).toEqual(["a-0", "a-2", "a-3"]);
  });

  it("trims a starred article once starred articles are unprotected", async () => {
    const feed = feedOfArticles("a", 4);
    feed.items[0].starred = true;
    const harness = createHarness([feed]);
    harness.plugin.settings.protectStarred = false;

    await harness.plugin.applyFeedLimitsToAllFeeds();

    expect(guids(feed)).toEqual(["a-3", "a-2"]);
  });

  it("ranks undated articles by first-seen time only when the fallback is on", async () => {
    const build = (): Feed => {
      const feed = feedOfArticles("a", 3);
      feed.items.forEach((item, index) => {
        item.pubDate = "";
        item.firstSeenMs = index + 1;
      });
      return feed;
    };

    const off = build();
    const offHarness = createHarness([off]);
    await offHarness.plugin.applyFeedLimitsToAllFeeds();
    const on = build();
    const onHarness = createHarness([on]);
    onHarness.plugin.settings.useFirstSeenDateFallback = true;
    await onHarness.plugin.applyFeedLimitsToAllFeeds();

    expect(guids(on)).toEqual(["a-2", "a-1"]);
    expect(guids(off)).not.toEqual(["a-2", "a-1"]);
  });

  it("saves, redraws, then reports how many feeds lost articles", async () => {
    const harness = createHarness([
      feedOfArticles("a", 4),
      feedOfArticles("b", 3),
      feedOfArticles("c", 1),
    ]);

    await harness.plugin.applyFeedLimitsToAllFeeds();

    expect(harness.events).toEqual(["save", "refresh", "notice: Applied limits to 2 feeds"]);
  });

  it("says 1 feeds for a single trimmed feed", async () => {
    const harness = createHarness([feedOfArticles("a", 4)]);

    await harness.plugin.applyFeedLimitsToAllFeeds();

    // BUG: pinned, see #556
    expect(notices(harness)).toEqual(["Applied limits to 1 feeds"]);
  });

  it("still saves and redraws when nothing needs trimming, and says so", async () => {
    const harness = createHarness([feedOfArticles("a", 1)]);

    await harness.plugin.applyFeedLimitsToAllFeeds();

    expect(harness.events).toEqual([
      "save",
      "refresh",
      "notice: No feeds needed limit adjustments",
    ]);
  });

  it("saves and notices without a dashboard, skipping only the redraw", async () => {
    const harness = createHarness([feedOfArticles("a", 4)]);
    harness.closeDashboard();

    await harness.plugin.applyFeedLimitsToAllFeeds();

    expect(harness.events).toEqual(["save", "notice: Applied limits to 1 feeds"]);
  });

  it("reports a failing save, with the articles already trimmed in memory", async () => {
    const feed = feedOfArticles("a", 4);
    const harness = createHarness([feed]);
    harness.save.mockImplementationOnce(async () => {
      harness.events.push("save");
      throw new Error("disk full");
    });

    await harness.plugin.applyFeedLimitsToAllFeeds();

    expect(harness.events).toEqual(["save", "notice: Error applying feed limits: disk full"]);
    expect(guids(feed)).toEqual(["a-3", "a-2"]);
  });

  it("is what the apply-feed-limits command runs", async () => {
    const harness = createHarness([feedOfArticles("a", 4)]);
    const commands: { id: string; callback?: () => void }[] = [];
    vi.spyOn(harness.plugin, "addCommand").mockImplementation(((command: {
      id: string;
      callback?: () => void;
    }) => {
      commands.push(command);
      return command;
    }) as never);
    const apply = vi.spyOn(harness.plugin, "applyFeedLimitsToAllFeeds");

    await harness.plugin.onload();
    commands.find((command) => command.id === "apply-feed-limits")?.callback?.();

    expect(apply).toHaveBeenCalledTimes(1);
  });
});
