/**
 * Characterization tests for the preview image cache in main.ts (#455).
 *
 * They pin what the plugin does today, bugs included, through its public
 * surface only, so the code can move into its own module (ADR 0015, step 1)
 * without these tests changing. The cache is real: `ImageCacheService` writes
 * into the stub vault, and preview images come from the stub's `requestUrl`
 * fake server.
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
import {
  App,
  setRequestUrlHandler,
  type MockApp,
  type PluginManifest,
  type RequestUrlHandlerResult,
  type RequestUrlParam,
} from "obsidian";
import RssDashboardPlugin from "../../../main";
import {
  DEFAULT_SETTINGS,
  IMAGE_CACHE_LIMIT_MAX_MIB,
  IMAGE_CACHE_LIMIT_MIN_MIB,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

const INSTALL_FOLDER = "obsidian-rss-dashboard";

// A GIF signature is plain ASCII, so it survives the stub's text-only bodies.
const GIF_BODY = "GIF89a\u0001\u0000\u0001\u0000";
// Two of these exceed a 1 MiB cache limit; one alone stays under the 1 MiB
// per-image cap.
const LARGE_GIF_BODY = `GIF89a${"x".repeat(600_000)}`;

type DisplaySettings = RssDashboardSettings["display"];

interface DashboardViewDouble {
  refresh: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  refreshSidebarOnly: ReturnType<typeof vi.fn>;
  refreshFilterStatusBarOnly: ReturnType<typeof vi.fn>;
  refreshGlobalRefreshProgressOnly: ReturnType<typeof vi.fn>;
}

type RefreshFeedMock = Mock<(feed: Feed) => Promise<Feed>>;
type ParseFeedMock = Mock<(url: string) => Promise<Feed>>;

interface Harness {
  app: MockApp;
  plugin: RssDashboardPlugin;
  view: DashboardViewDouble;
  cacheRoot: string;
  saveSettings: ReturnType<typeof vi.fn>;
  refreshFeed: RefreshFeedMock;
  parseFeed: ParseFeedMock;
}

let activePlugins: RssDashboardPlugin[] = [];

/**
 * The stub's adapter has no `writeBinary` or `getResourcePath`, which real
 * Obsidian adapters have. Add just those two on top of the stub's own file
 * model, so exists, read, write, mkdir, remove and rmdir keep their observed
 * behavior.
 */
function addBinaryFileSupport(app: MockApp): void {
  const adapter = app.vault.adapter as unknown as {
    write(path: string, content: string): Promise<void>;
    writeBinary?: (path: string, data: ArrayBuffer) => Promise<void>;
    getResourcePath?: (path: string) => string;
  };
  adapter.writeBinary = async (path, data) => {
    await adapter.write(path, new TextDecoder().decode(data));
  };
  adapter.getResourcePath = (path) => `app://local/${path}`;
}

function createManifest(app: MockApp): PluginManifest {
  return {
    // Deliberately differs from the install folder name.
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "Test",
    description: "Test plugin",
    dir: `${app.vault.configDir}/plugins/${INSTALL_FOLDER}`,
  };
}

function createSettings(
  display: Partial<DisplaySettings> = {},
  feeds: Feed[] = [],
): RssDashboardSettings {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.storageMode = "legacy-json";
  settings.display = { ...settings.display, ...display };
  settings.feeds = feeds;
  return settings;
}

function createHarness(
  options: {
    display?: Partial<DisplaySettings>;
    feeds?: Feed[];
    binaryFiles?: boolean;
  } = {},
): Harness {
  const app = App.createMock();
  if (options.binaryFiles !== false) addBinaryFileSupport(app);
  const manifest = createManifest(app);
  const plugin = new RssDashboardPlugin(app, manifest);
  activePlugins.push(plugin);

  plugin.settings = createSettings(
    { allowImageCaching: true, showCoverImage: true, ...options.display },
    options.feeds ?? [],
  );
  plugin.loadData = vi.fn().mockResolvedValue(plugin.settings);
  plugin.saveData = vi.fn().mockResolvedValue(undefined);

  // Persistence is not under test; saveSettings stays on the plugin, so a
  // stub here keeps working after the cache moves out of main.ts.
  const saveSettings = vi.fn().mockResolvedValue(undefined);
  plugin.saveSettings = saveSettings;

  const view: DashboardViewDouble = {
    refresh: vi.fn(),
    render: vi.fn(),
    refreshSidebarOnly: vi.fn(),
    refreshFilterStatusBarOnly: vi.fn(),
    refreshGlobalRefreshProgressOnly: vi.fn(),
  };
  plugin.getActiveDashboardView = vi
    .fn()
    .mockResolvedValue(
      view as unknown as Awaited<
        ReturnType<RssDashboardPlugin["getActiveDashboardView"]>
      >,
    );

  const refreshFeed: RefreshFeedMock = vi.fn(async (feed: Feed) => feed);
  const parseFeed: ParseFeedMock = vi.fn();
  useFeedParser(plugin, refreshFeed, parseFeed);

  return {
    app,
    plugin,
    view,
    cacheRoot: `${manifest.dir}/image-cache`,
    saveSettings,
    refreshFeed,
    parseFeed,
  };
}

function useFeedParser(
  plugin: RssDashboardPlugin,
  refreshFeed: RefreshFeedMock,
  parseFeed: ParseFeedMock,
): void {
  plugin.feedParser = {
    refreshFeed,
    parseFeed,
    refreshAllFeeds: vi.fn(),
  } as unknown as RssDashboardPlugin["feedParser"];
}

/**
 * Builds the plugin's own settings-backed services (folder service,
 * background import) without running all of onload(). This member stays in
 * main.ts; addFeed and background import have no public route to them.
 */
function initializeSettingsBackedServices(harness: Harness): void {
  (
    harness.plugin as unknown as { initializeSettingsBackedServices(): void }
  ).initializeSettingsBackedServices();
  // The rebuild replaces the parser; keep the test's parser in place.
  useFeedParser(harness.plugin, harness.refreshFeed, harness.parseFeed);
  // The Plugin stub has no status bar; background import needs one.
  (
    harness.plugin as unknown as { addStatusBarItem: () => HTMLElement }
  ).addStatusBarItem = () => createDiv();
}

function createItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Article",
    link: "https://example.com/article",
    description: "",
    pubDate: "2026-09-01T00:00:00.000Z",
    guid: "article",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    ...overrides,
  };
}

function createFeed(url: string, coverImages: string[]): Feed {
  return {
    title: url,
    url,
    folder: "Uncategorized",
    items: coverImages.map((coverImage, index) =>
      createItem({ guid: `${url}#${index}`, feedUrl: url, coverImage }),
    ),
    lastUpdated: 1,
    mediaType: "article",
  };
}

function gifResponse(body = GIF_BODY): RequestUrlHandlerResult {
  return { status: 200, headers: { "content-type": "image/gif" }, text: body };
}

/** Serves every preview at once; returns the URLs requested so far. */
function serveImages(
  bodyFor: (url: string) => string = () => GIF_BODY,
): string[] {
  const requested: string[] = [];
  setRequestUrlHandler((param: RequestUrlParam) => {
    requested.push(param.url);
    return gifResponse(bodyFor(param.url));
  });
  return requested;
}

/** Holds every preview response until the test releases it. */
function serveImagesOnRelease(): {
  requested: string[];
  release: (url: string) => void;
  releaseAll: () => void;
} {
  const requested: string[] = [];
  const pending = new Map<string, () => void>();
  setRequestUrlHandler(
    (param: RequestUrlParam) =>
      new Promise<RequestUrlHandlerResult>((resolve) => {
        requested.push(param.url);
        pending.set(param.url, () => resolve(gifResponse()));
      }),
  );
  const release = (url: string): void => {
    pending.get(url)?.();
    pending.delete(url);
  };
  return {
    requested,
    release,
    releaseAll: () => [...pending.keys()].forEach(release),
  };
}

/** Lets pending cache work (hashing, writes) finish before asserting "nothing happened". */
async function settle(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 30));
}

async function exists(app: MockApp, path: string): Promise<boolean> {
  return app.vault.adapter.exists(path);
}

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  // Clears the startup-refresh timer that onload() arms.
  for (const plugin of activePlugins) plugin.onunload();
  activePlugins = [];
  setRequestUrlHandler(null);
  document.body.empty();
  vi.restoreAllMocks();
});

describe("image cache: folder lifecycle", () => {
  it("creates nothing on load when image caching is disabled", async () => {
    const { app, plugin, cacheRoot } = createHarness({
      display: { allowImageCaching: false },
    });

    await plugin.onload();

    expect(await exists(app, cacheRoot)).toBe(false);
    expect(await exists(app, `${cacheRoot}/index.json`)).toBe(false);
  });

  it("creates the cache inside the plugin install directory when enabled on load", async () => {
    const { app, plugin, cacheRoot } = createHarness();

    await plugin.onload();

    expect(cacheRoot).toBe(
      `${app.vault.configDir}/plugins/${INSTALL_FOLDER}/image-cache`,
    );
    expect(await exists(app, `${cacheRoot}/index.json`)).toBe(true);
    // Not a folder derived from the manifest id.
    expect(
      await exists(app, `${app.vault.configDir}/plugins/rss-dashboard`),
    ).toBe(false);
  });

  it("creates the cache when the setting is switched on, and saves the setting", async () => {
    const { app, plugin, cacheRoot, saveSettings } = createHarness({
      display: { allowImageCaching: false },
    });
    await plugin.onload();
    saveSettings.mockClear();

    await plugin.setImageCachingEnabled(true);

    expect(await exists(app, `${cacheRoot}/index.json`)).toBe(true);
    expect(plugin.settings.display.allowImageCaching).toBe(true);
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("removes the cache folder when the setting is switched off, and saves the setting", async () => {
    const { app, plugin, cacheRoot, saveSettings } = createHarness();
    await plugin.onload();
    saveSettings.mockClear();

    await plugin.setImageCachingEnabled(false);

    expect(await exists(app, cacheRoot)).toBe(false);
    expect(await exists(app, `${cacheRoot}/index.json`)).toBe(false);
    expect(plugin.settings.display.allowImageCaching).toBe(false);
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("creates no cache when the vault adapter can't write binary files, but still records the setting", async () => {
    const { app, plugin, cacheRoot, saveSettings } = createHarness({
      display: { allowImageCaching: false },
      binaryFiles: false,
    });

    await plugin.setImageCachingEnabled(true);

    expect(await exists(app, cacheRoot)).toBe(false);
    expect(plugin.settings.display.allowImageCaching).toBe(true);
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });
});

describe("image cache: warming previews", () => {
  it("caches a refreshed feed's cover image and resolves it to a vault resource path", async () => {
    const url = "https://example.com/cover.gif";
    const feed = createFeed("https://example.com/feed.xml", [url]);
    const { plugin, cacheRoot } = createHarness({ feeds: [feed] });
    const requested = serveImages();
    await plugin.setImageCachingEnabled(true);

    await plugin.refreshSelectedFeed(feed);

    await vi.waitFor(() => {
      expect(plugin.resolveCachedImageUrl(url)).not.toBeNull();
    });
    expect(requested).toEqual([url]);
    expect(plugin.resolveCachedImageUrl(url)).toMatch(
      new RegExp(`^app://local/${cacheRoot}/[a-f0-9]{64}\\.gif$`),
    );
  });

  it("warms nothing while cover images are hidden", async () => {
    const feed = createFeed("https://example.com/feed.xml", [
      "https://example.com/cover.gif",
    ]);
    const { plugin } = createHarness({
      feeds: [feed],
      display: { showCoverImage: false },
    });
    const requested = serveImages();
    await plugin.setImageCachingEnabled(true);

    await plugin.refreshSelectedFeed(feed);
    await settle();

    expect(requested).toEqual([]);
  });

  it("warms nothing while image caching is off", async () => {
    const feed = createFeed("https://example.com/feed.xml", [
      "https://example.com/cover.gif",
    ]);
    const { plugin } = createHarness({
      feeds: [feed],
      display: { allowImageCaching: false },
    });
    const requested = serveImages();

    await plugin.refreshSelectedFeed(feed);
    await settle();

    expect(requested).toEqual([]);
  });

  it("warms both the cover image and the image field of an article", async () => {
    const feed = createFeed("https://example.com/feed.xml", []);
    feed.items = [
      createItem({
        feedUrl: feed.url,
        coverImage: "https://example.com/cover.gif",
        image: "https://example.com/image.gif",
      }),
    ];
    const { plugin } = createHarness({ feeds: [feed] });
    const requested = serveImages();
    await plugin.setImageCachingEnabled(true);

    await plugin.refreshSelectedFeed(feed);

    await vi.waitFor(() => {
      expect([...requested].sort()).toEqual([
        "https://example.com/cover.gif",
        "https://example.com/image.gif",
      ]);
    });
  });

  it("fetches at most two previews at a time", async () => {
    const urls = [1, 2, 3, 4].map((n) => `https://example.com/${n}.gif`);
    const feed = createFeed("https://example.com/feed.xml", urls);
    const { plugin } = createHarness({ feeds: [feed] });
    const server = serveImagesOnRelease();
    await plugin.setImageCachingEnabled(true);

    await plugin.refreshSelectedFeed(feed);
    await vi.waitFor(() => expect(server.requested).toHaveLength(2));
    await settle();
    expect(server.requested).toEqual(urls.slice(0, 2));

    server.release(urls[0]);
    await vi.waitFor(() => expect(server.requested).toHaveLength(3));
    server.releaseAll();
    await vi.waitFor(() => expect(server.requested).toHaveLength(4));
    server.releaseAll();
  });

  it("fetches each preview once when the same feed is warmed again while its previews are pending", async () => {
    const urls = [1, 2, 3].map((n) => `https://example.com/${n}.gif`);
    const feed = createFeed("https://example.com/feed.xml", urls);
    const { plugin } = createHarness({ feeds: [feed] });
    const server = serveImagesOnRelease();
    await plugin.setImageCachingEnabled(true);

    await plugin.refreshSelectedFeed(feed);
    await vi.waitFor(() => expect(server.requested).toHaveLength(2));
    await plugin.refreshSelectedFeed(feed);
    server.releaseAll();
    await vi.waitFor(() => expect(server.requested).toHaveLength(3));
    server.releaseAll();
    await vi.waitFor(() => {
      for (const url of urls) {
        expect(plugin.resolveCachedImageUrl(url)).not.toBeNull();
      }
    });

    expect([...server.requested].sort()).toEqual([...urls].sort());
  });

  it("warms the cover images of a feed added through addFeed", async () => {
    const feedUrl = "https://example.com/new.xml";
    const coverUrl = "https://example.com/new-cover.gif";
    const harness = createHarness();
    initializeSettingsBackedServices(harness);
    const requested = serveImages();
    await harness.plugin.setImageCachingEnabled(true);
    harness.parseFeed.mockResolvedValue(createFeed(feedUrl, [coverUrl]));

    const added = await harness.plugin.addFeed(
      "New feed",
      feedUrl,
      "Uncategorized",
    );

    expect(added).toBe(true);
    await vi.waitFor(() => {
      expect(harness.plugin.resolveCachedImageUrl(coverUrl)).not.toBeNull();
    });
    expect(requested).toEqual([coverUrl]);
  });

  it("warms the cover images of a feed a background import brings in", async () => {
    const feedUrl = "https://example.com/discovered.xml";
    const coverUrl = "https://example.com/discovered-cover.gif";
    const harness = createHarness();
    initializeSettingsBackedServices(harness);
    const requested = serveImages();
    await harness.plugin.setImageCachingEnabled(true);
    harness.parseFeed.mockResolvedValue(createFeed(feedUrl, [coverUrl]));

    await harness.plugin.ingestFeedsForBackgroundImport([
      { title: "Discovered", url: feedUrl, folder: "Discover" },
    ]);

    await vi.waitFor(() => {
      expect(harness.plugin.resolveCachedImageUrl(coverUrl)).not.toBeNull();
    });
    expect(requested).toEqual([coverUrl]);
  });
});

describe("image cache: dashboard redraw after a warm-up batch", () => {
  it("refreshes the dashboard after a newly added feed finishes warming preview images", async () => {
    const feedUrl = "https://example.com/new.xml";
    const coverUrl = "https://example.com/new-cover.gif";
    const harness = createHarness();
    initializeSettingsBackedServices(harness);
    const server = serveImagesOnRelease();
    await harness.plugin.setImageCachingEnabled(true);
    harness.parseFeed.mockResolvedValue(createFeed(feedUrl, [coverUrl]));

    const added = await harness.plugin.addFeed(
      "New feed",
      feedUrl,
      "Uncategorized",
    );

    expect(added).toBe(true);
    expect(harness.view.refresh).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(server.requested).toEqual([coverUrl]));

    server.release(coverUrl);

    await vi.waitFor(() => {
      expect(harness.view.refresh).toHaveBeenCalledTimes(2);
    });
  });

  it("refreshes the dashboard again when a single-feed refresh's previews finish caching", async () => {
    const feed = createFeed("https://example.com/feed.xml", [
      "https://example.com/cover.gif",
    ]);
    const { plugin, view } = createHarness({ feeds: [feed] });
    serveImages();
    await plugin.setImageCachingEnabled(true);

    await plugin.refreshSelectedFeed(feed);

    // Once for the refresh itself, once when the warm-up batch completes.
    await vi.waitFor(() => expect(view.refresh).toHaveBeenCalledTimes(2));
    await settle();
    expect(view.refresh).toHaveBeenCalledTimes(2);
  });

  it("does not refresh the dashboard when no preview in the batch could be cached", async () => {
    const feed = createFeed("https://example.com/feed.xml", [
      "https://example.com/missing.gif",
    ]);
    const { plugin, view } = createHarness({ feeds: [feed] });
    const requested: string[] = [];
    setRequestUrlHandler((param: RequestUrlParam) => {
      requested.push(param.url);
      return { status: 404 };
    });
    await plugin.setImageCachingEnabled(true);

    await plugin.refreshSelectedFeed(feed);
    await vi.waitFor(() => expect(requested).toHaveLength(1));
    await settle();

    expect(view.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not rebuild the dashboard when an image-cache batch finishes during a global refresh", async () => {
    const feedA = createFeed("https://example.com/a.xml", []);
    const feedB = createFeed("https://example.com/b.xml", []);
    const { plugin, view, refreshFeed } = createHarness({
      feeds: [feedA, feedB],
    });
    serveImages();
    await plugin.setImageCachingEnabled(true);
    const resolvers = new Map<string, (feed: Feed) => void>();
    refreshFeed.mockImplementation(
      (feed: Feed) =>
        new Promise<Feed>((resolve) => resolvers.set(feed.url, resolve)),
    );
    const coverUrl = "https://example.com/a-cover.gif";

    const refreshPromise = plugin.refreshFeeds();
    await vi.waitFor(() => expect(resolvers.size).toBe(2));
    resolvers.get(feedA.url)?.(createFeed(feedA.url, [coverUrl]));
    await vi.waitFor(() => {
      expect(plugin.resolveCachedImageUrl(coverUrl)).not.toBeNull();
    });
    await settle();

    expect(view.refresh).not.toHaveBeenCalled();

    resolvers.get(feedB.url)?.(feedB);
    await refreshPromise;
    await settle();

    // Only the refresh's own final redraw.
    expect(view.refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps a batch queued during a multi-feed refresh from redrawing even when it finishes after the refresh", async () => {
    const feedA = createFeed("https://example.com/a.xml", []);
    const feedB = createFeed("https://example.com/b.xml", []);
    const { plugin, view, refreshFeed } = createHarness({
      feeds: [feedA, feedB],
    });
    const server = serveImagesOnRelease();
    await plugin.setImageCachingEnabled(true);
    const resolvers = new Map<string, (feed: Feed) => void>();
    refreshFeed.mockImplementation(
      (feed: Feed) =>
        new Promise<Feed>((resolve) => resolvers.set(feed.url, resolve)),
    );
    const coverUrl = "https://example.com/a-cover.gif";

    const refreshPromise = plugin.refreshFeeds();
    await vi.waitFor(() => expect(resolvers.size).toBe(2));
    resolvers.get(feedA.url)?.(createFeed(feedA.url, [coverUrl]));
    await vi.waitFor(() => expect(server.requested).toEqual([coverUrl]));
    resolvers.get(feedB.url)?.(feedB);
    await refreshPromise;
    expect(view.refresh).toHaveBeenCalledTimes(1);

    server.release(coverUrl);
    await vi.waitFor(() => {
      expect(plugin.resolveCachedImageUrl(coverUrl)).not.toBeNull();
    });
    await settle();

    expect(view.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("image cache: size and change notifications", () => {
  it("reports zero bytes before the cache exists and the cached bytes after a warm", async () => {
    const feed = createFeed("https://example.com/feed.xml", [
      "https://example.com/cover.gif",
    ]);
    const { plugin } = createHarness({ feeds: [feed] });
    serveImages();

    expect(plugin.getImageCacheSizeBytes()).toBe(0);

    await plugin.setImageCachingEnabled(true);
    await plugin.refreshSelectedFeed(feed);

    await vi.waitFor(() => {
      expect(plugin.getImageCacheSizeBytes()).toBe(
        new TextEncoder().encode(GIF_BODY).byteLength,
      );
    });
  });

  it("notifies change listeners when an image is cached or the cache is cleared, until the listener is disposed", async () => {
    const feed = createFeed("https://example.com/feed.xml", [
      "https://example.com/cover.gif",
    ]);
    const { plugin } = createHarness({ feeds: [feed] });
    serveImages();
    await plugin.setImageCachingEnabled(true);
    const listener = vi.fn();
    const dispose = plugin.onImageCacheChanged(listener);

    await plugin.refreshSelectedFeed(feed);
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    const callsAfterWarm = listener.mock.calls.length;

    await plugin.clearImageCache();
    expect(listener.mock.calls.length).toBeGreaterThan(callsAfterWarm);

    dispose();
    const callsAfterDispose = listener.mock.calls.length;
    await plugin.clearImageCache();
    expect(listener).toHaveBeenCalledTimes(callsAfterDispose);
  });

  it("returns no cached URL once caching is turned off in settings, even before the cache is torn down", async () => {
    const url = "https://example.com/cover.gif";
    const feed = createFeed("https://example.com/feed.xml", [url]);
    const { plugin } = createHarness({ feeds: [feed] });
    serveImages();
    await plugin.setImageCachingEnabled(true);
    await plugin.refreshSelectedFeed(feed);
    await vi.waitFor(() => {
      expect(plugin.resolveCachedImageUrl(url)).not.toBeNull();
    });

    // As a settings change arriving from another device would leave it.
    plugin.settings.display.allowImageCaching = false;

    expect(plugin.resolveCachedImageUrl(url)).toBeNull();
  });
});

describe("image cache: size limit", () => {
  it("falls back to the default limit for a non-integer value and saves settings", async () => {
    const { plugin, saveSettings } = createHarness();

    await plugin.setImageCacheLimit(12.5, false);

    expect(plugin.settings.display.imageCacheLimitMiB).toBe(
      DEFAULT_SETTINGS.display.imageCacheLimitMiB,
    );
    expect(plugin.settings.display.imageCacheUnlimited).toBe(false);
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("clamps the limit to the allowed range", async () => {
    const { plugin } = createHarness();

    await plugin.setImageCacheLimit(0, false);
    expect(plugin.settings.display.imageCacheLimitMiB).toBe(
      IMAGE_CACHE_LIMIT_MIN_MIB,
    );

    await plugin.setImageCacheLimit(IMAGE_CACHE_LIMIT_MAX_MIB + 1, false);
    expect(plugin.settings.display.imageCacheLimitMiB).toBe(
      IMAGE_CACHE_LIMIT_MAX_MIB,
    );
  });

  it("records the unlimited flag alongside the normalized limit", async () => {
    const { plugin } = createHarness();

    await plugin.setImageCacheLimit(10, true);

    expect(plugin.settings.display.imageCacheUnlimited).toBe(true);
    expect(plugin.settings.display.imageCacheLimitMiB).toBe(10);
  });

  it("evicts the older preview once the cache passes its limit", async () => {
    const [first, second] = [1, 2].map((n) => `https://example.com/${n}.gif`);
    const feedA = createFeed("https://example.com/a.xml", [first]);
    const feedB = createFeed("https://example.com/b.xml", [second]);
    const { plugin } = createHarness({
      feeds: [feedA, feedB],
      display: { imageCacheLimitMiB: 1, imageCacheUnlimited: false },
    });
    serveImages(() => LARGE_GIF_BODY);
    await plugin.setImageCachingEnabled(true);

    await plugin.refreshSelectedFeed(feedA);
    await vi.waitFor(() => {
      expect(plugin.resolveCachedImageUrl(first)).not.toBeNull();
    });
    await plugin.refreshSelectedFeed(feedB);
    await vi.waitFor(() => {
      expect(plugin.resolveCachedImageUrl(second)).not.toBeNull();
    });

    expect(plugin.resolveCachedImageUrl(first)).toBeNull();
  });

  it("applies a new limit to the running cache", async () => {
    const [first, second] = [1, 2].map((n) => `https://example.com/${n}.gif`);
    const feed = createFeed("https://example.com/feed.xml", [
      first,
      second,
    ]);
    const { plugin } = createHarness({
      feeds: [feed],
      display: { imageCacheUnlimited: true },
    });
    serveImages(() => LARGE_GIF_BODY);
    await plugin.setImageCachingEnabled(true);
    await plugin.refreshSelectedFeed(feed);
    await vi.waitFor(() => {
      expect(plugin.resolveCachedImageUrl(first)).not.toBeNull();
      expect(plugin.resolveCachedImageUrl(second)).not.toBeNull();
    });

    await plugin.setImageCacheLimit(1, false);

    expect(plugin.getImageCacheSizeBytes()).toBe(
      new TextEncoder().encode(LARGE_GIF_BODY).byteLength,
    );
  });

  it("keeps the running cache's limit when a settings reload changes it", async () => {
    // The limit is handed to the cache once, when it is created; only
    // setImageCacheLimit changes it afterwards (ADR 0015, "captured by value").
    const [first, second] = [1, 2].map((n) => `https://example.com/${n}.gif`);
    const feedA = createFeed("https://example.com/a.xml", [first]);
    const feedB = createFeed("https://example.com/b.xml", [second]);
    const harness = createHarness({
      feeds: [feedA, feedB],
      display: { imageCacheLimitMiB: 1, imageCacheUnlimited: false },
    });
    const { plugin } = harness;
    serveImages(() => LARGE_GIF_BODY);
    await plugin.setImageCachingEnabled(true);

    const reloaded = createSettings(
      { allowImageCaching: true, showCoverImage: true, imageCacheUnlimited: true },
      [feedA, feedB],
    );
    plugin.loadData = vi.fn().mockResolvedValue(reloaded);
    await plugin.loadSettings();
    // A reload can rebuild the parser; keep the test's parser in place.
    useFeedParser(plugin, harness.refreshFeed, harness.parseFeed);
    expect(plugin.settings.display.imageCacheUnlimited).toBe(true);

    await plugin.refreshSelectedFeed(feedA);
    await vi.waitFor(() => {
      expect(plugin.resolveCachedImageUrl(first)).not.toBeNull();
    });
    await plugin.refreshSelectedFeed(feedB);
    await vi.waitFor(() => {
      expect(plugin.resolveCachedImageUrl(second)).not.toBeNull();
    });

    // Still limited to 1 MiB, so the older preview was evicted.
    expect(plugin.resolveCachedImageUrl(first)).toBeNull();
  });
});

describe("image cache: clearing", () => {
  it("returns zero counts when caching was never enabled", async () => {
    const { plugin } = createHarness({ display: { allowImageCaching: false } });

    await expect(plugin.clearImageCache()).resolves.toEqual({
      cleared: 0,
      failed: 0,
    });
  });

  it("removes every cached preview and reports how many it cleared", async () => {
    const urls = [1, 2].map((n) => `https://example.com/${n}.gif`);
    const feed = createFeed("https://example.com/feed.xml", urls);
    const { plugin } = createHarness({ feeds: [feed] });
    serveImages();
    await plugin.setImageCachingEnabled(true);
    await plugin.refreshSelectedFeed(feed);
    await vi.waitFor(() => {
      for (const url of urls) {
        expect(plugin.resolveCachedImageUrl(url)).not.toBeNull();
      }
    });

    await expect(plugin.clearImageCache()).resolves.toEqual({
      cleared: 2,
      failed: 0,
    });
    expect(plugin.getImageCacheSizeBytes()).toBe(0);
    for (const url of urls) {
      expect(plugin.resolveCachedImageUrl(url)).toBeNull();
    }
  });

  it("drops queued previews and discards in-flight ones", async () => {
    const urls = [1, 2, 3].map((n) => `https://example.com/${n}.gif`);
    const feed = createFeed("https://example.com/feed.xml", urls);
    const { plugin } = createHarness({ feeds: [feed] });
    const server = serveImagesOnRelease();
    await plugin.setImageCachingEnabled(true);
    await plugin.refreshSelectedFeed(feed);
    await vi.waitFor(() => expect(server.requested).toHaveLength(2));

    await plugin.clearImageCache();
    server.releaseAll();
    await settle();

    expect(server.requested).toEqual(urls.slice(0, 2));
    expect(plugin.getImageCacheSizeBytes()).toBe(0);
  });
});

describe("image cache: deleting a feed", () => {
  it("removes previews only the deleted feed used and keeps one a remaining feed shares", async () => {
    const onlyA = "https://example.com/only-a.gif";
    const shared = "https://example.com/shared.gif";
    const feedA = createFeed("https://example.com/a.xml", [onlyA, shared]);
    const feedB = createFeed("https://example.com/b.xml", [shared]);
    const { plugin } = createHarness({ feeds: [feedA, feedB] });
    serveImages();
    await plugin.setImageCachingEnabled(true);
    await plugin.refreshSelectedFeed(feedA);
    await vi.waitFor(() => {
      expect(plugin.resolveCachedImageUrl(onlyA)).not.toBeNull();
      expect(plugin.resolveCachedImageUrl(shared)).not.toBeNull();
    });

    // Callers remove the feed from settings before clearing its images.
    plugin.settings.feeds = [feedB];
    await plugin.removeCachedImagesForDeletedFeed(feedA);

    expect(plugin.resolveCachedImageUrl(onlyA)).toBeNull();
    expect(plugin.resolveCachedImageUrl(shared)).not.toBeNull();
  });

  it("drops the deleted feed's queued previews and discards its in-flight ones", async () => {
    const urls = [1, 2, 3].map((n) => `https://example.com/${n}.gif`);
    const feed = createFeed("https://example.com/feed.xml", urls);
    const { plugin } = createHarness({ feeds: [feed] });
    const server = serveImagesOnRelease();
    await plugin.setImageCachingEnabled(true);
    await plugin.refreshSelectedFeed(feed);
    await vi.waitFor(() => expect(server.requested).toHaveLength(2));

    plugin.settings.feeds = [];
    await plugin.removeCachedImagesForDeletedFeed(feed);
    server.releaseAll();
    await settle();

    expect(server.requested).toEqual(urls.slice(0, 2));
    expect(plugin.getImageCacheSizeBytes()).toBe(0);
  });

  it("leaves the cache alone for a feed without preview images", async () => {
    const url = "https://example.com/cover.gif";
    const feedWithCover = createFeed("https://example.com/a.xml", [url]);
    const feedWithout = createFeed("https://example.com/b.xml", []);
    const { plugin } = createHarness({ feeds: [feedWithCover, feedWithout] });
    serveImages();
    await plugin.setImageCachingEnabled(true);
    await plugin.refreshSelectedFeed(feedWithCover);
    await vi.waitFor(() => {
      expect(plugin.resolveCachedImageUrl(url)).not.toBeNull();
    });
    const sizeBefore = plugin.getImageCacheSizeBytes();

    plugin.settings.feeds = [feedWithCover];
    await plugin.removeCachedImagesForDeletedFeed(feedWithout);

    expect(plugin.getImageCacheSizeBytes()).toBe(sizeBefore);
    expect(plugin.resolveCachedImageUrl(url)).not.toBeNull();
  });
});

describe("image cache: unload", () => {
  it("keeps warming queued previews after the plugin unloads", async () => {
    // BUG: pinned, see #444
    const urls = [1, 2, 3].map((n) => `https://example.com/${n}.gif`);
    const feed = createFeed("https://example.com/feed.xml", urls);
    const { plugin } = createHarness({ feeds: [feed] });
    const server = serveImagesOnRelease();
    await plugin.setImageCachingEnabled(true);
    await plugin.refreshSelectedFeed(feed);
    await vi.waitFor(() => expect(server.requested).toHaveLength(2));

    plugin.onunload();
    server.releaseAll();

    await vi.waitFor(() => expect(server.requested).toHaveLength(3));
    server.releaseAll();
    await vi.waitFor(() => {
      for (const url of urls) {
        expect(plugin.resolveCachedImageUrl(url)).not.toBeNull();
      }
    });
  });
});
