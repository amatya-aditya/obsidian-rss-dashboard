/**
 * Characterization tests for the plugin lifecycle (#436, phase 4).
 *
 * These pin how RssDashboardPlugin starts up, shuts down and reloads today,
 * so the main.ts extractions can prove they preserve it (#436 rule 9). They
 * are read-only on refactor PRs; see docs/development/architecture.md.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { App, Platform, type MockApp, type PluginManifest } from "obsidian";
import RssDashboardPlugin from "../../../main";
import type { Feed } from "../../../src/types/types";

const MANIFEST: PluginManifest = {
  id: "rss-dashboard",
  name: "RSS Dashboard",
  version: "2.7.0",
  minAppVersion: "1.8.7",
  author: "Test",
  description: "Test plugin",
};

/** Stands in for the plugin's data.json, shared across plugin instances. */
interface DataStore {
  data: unknown;
}

type EventCallback = (...args: unknown[]) => void;

interface Harness {
  plugin: RssDashboardPlugin;
  log: string[];
}

/**
 * Builds a plugin whose calls into Obsidian are recorded, in order, as `log`
 * entries. Registration methods keep their stub behavior.
 */
function createHarness(store: DataStore, app: MockApp): Harness {
  const log: string[] = [];
  const plugin = new RssDashboardPlugin(app, {
    ...MANIFEST,
    dir: `${app.vault.configDir}/plugins/rss-dashboard`,
  });

  plugin.loadData = () => {
    log.push("loadData");
    return Promise.resolve(structuredClone(store.data));
  };
  plugin.saveData = (data: unknown) => {
    log.push("saveData");
    store.data = structuredClone(data);
    return Promise.resolve();
  };

  // The stub vault has no event API; model the four events main.ts watches.
  (app.vault as unknown as { on: unknown }).on = (name: string) => {
    log.push("vault.on:" + name);
    return { name };
  };
  const workspace = app.workspace as unknown as {
    on: (name: string, callback: EventCallback) => unknown;
    onLayoutReady: (callback: () => void) => void;
  };
  const workspaceOn = workspace.on.bind(workspace);
  workspace.on = (name, callback) => {
    log.push("workspace.on:" + name);
    return workspaceOn(name, callback);
  };
  const onLayoutReady = workspace.onLayoutReady.bind(workspace);
  workspace.onLayoutReady = (callback) => {
    log.push("workspace.onLayoutReady");
    onLayoutReady(callback);
  };

  const record = (
    method: keyof RssDashboardPlugin,
    describeCall: (firstArg: never) => string,
  ): void => {
    const original = (plugin[method] as (...args: unknown[]) => unknown).bind(
      plugin,
    );
    (plugin as unknown as Record<string, unknown>)[method] = (
      ...args: never[]
    ) => {
      log.push(describeCall(args[0]));
      return original(...args);
    };
  };
  record("registerEvent", () => "registerEvent");
  record(
    "registerObsidianProtocolHandler",
    (action: string) => "registerObsidianProtocolHandler:" + action,
  );
  record("registerView", (type: string) => "registerView:" + type);
  record("addRibbonIcon", (icon: string) => "addRibbonIcon:" + icon);
  record("addSettingTab", () => "addSettingTab");
  record("addCommand", (command: { id: string }) => "addCommand:" + command.id);
  record("registerInterval", () => "registerInterval");
  record("registerDomEvent", () => "registerDomEvent");

  return { plugin, log };
}

/** What onload asks of Obsidian, in order, with no dashboard open. */
// Palette commands (#827) register last, after the version status bar command.
const PALETTE_COMMAND_LOG = [
  "addCommand:open-settings-general",
  "addCommand:open-settings-storage",
  "addCommand:open-settings-display",
  "addCommand:open-settings-sidebar",
  "addCommand:open-settings-media",
  "addCommand:open-settings-article-saving",
  "addCommand:open-settings-rules",
  "addCommand:open-settings-highlights",
  "addCommand:open-settings-import-export",
  "addCommand:open-settings-tags",
  "addCommand:open-settings-about",
  "addCommand:dashboard-focus-search",
  "addCommand:dashboard-clear-filters",
  "addCommand:dashboard-filter-all",
  "addCommand:dashboard-filter-unread",
  "addCommand:dashboard-filter-read",
  "addCommand:dashboard-filter-starred",
  "addCommand:dashboard-view-list",
  "addCommand:dashboard-view-card",
  "addCommand:dashboard-view-feed",
  "addCommand:dashboard-collapse-all-folders",
  "addCommand:dashboard-expand-all-folders",
  "addCommand:dashboard-mark-all-read",
  "addCommand:dashboard-mark-all-unread",
  "addCommand:reader-next-article",
  "addCommand:reader-previous-article",
  "addCommand:reader-close",
  "addCommand:reader-toggle-star",
  "addCommand:reader-toggle-read",
  "addCommand:reader-open-tags",
  "addCommand:reader-open-original",
];

const STARTUP_SEQUENCE = [
  "loadData",
  "workspace.on:rss-dashboard:tag-chip-radius-changed",
  "registerEvent",
  "workspace.on:window-open",
  "registerEvent",
  "vault.on:modify",
  "registerEvent",
  "vault.on:create",
  "registerEvent",
  "vault.on:rename",
  "registerEvent",
  "vault.on:delete",
  "registerEvent",
  "workspace.onLayoutReady",
  "workspace.on:active-leaf-change",
  "registerEvent",
  // What's New check for a dashboard restored as the active tab.
  "workspace.onLayoutReady",
  "registerObsidianProtocolHandler:rss-dashboard",
  "registerView:rss-dashboard-view",
  "registerView:rss-discover-view",
  "registerView:rss-reader-view",
  "registerView:rss-smallweb-view",
  "addRibbonIcon:compass",
  "addSettingTab",
  "addCommand:open-dashboard",
  "addCommand:open-discover",
  "addCommand:refresh-feeds",
  "addCommand:import-opml",
  "addCommand:import-starred",
  "addCommand:export-opml",
  "addCommand:import-usersettings-json",
  "addCommand:export-usersettings-json",
  "addCommand:apply-feed-limits",
  "addCommand:toggle-sidebar",
  "addCommand:show-version-in-status-bar",
  ...PALETTE_COMMAND_LOG,
];

const FEED_URL = "https://example.com/feed.xml";
const ARTICLE_URL = "https://example.com/a";
const RSS =
  '<?xml version="1.0"?><rss version="2.0"><channel><title>Example</title>' +
  "<link>https://example.com</link><item><title>A</title>" +
  `<link>${ARTICLE_URL}</link><guid>${ARTICLE_URL}</guid>` +
  "<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item></channel></rss>";

/**
 * Answers every request with the RSS above. With `held`, answers only after
 * `release()`, so a refresh stays in flight while a test unloads.
 */
function mockFeedRequests(options: { held?: boolean } = {}) {
  let release: () => void = () => {};
  const gate = options.held
    ? new Promise<void>((resolve) => {
        release = resolve;
      })
    : Promise.resolve();
  const spy = vi.spyOn(obsidian, "requestUrl").mockImplementation((() =>
    gate.then(() => ({
      status: 200,
      text: RSS,
      headers: { "content-type": "application/rss+xml" },
      arrayBuffer: new ArrayBuffer(0),
      json: {},
    }))) as unknown as typeof obsidian.requestUrl);
  return { spy, release: () => release() };
}

/**
 * Leaves `app` and a data store as a first run would: one feed with one
 * episode, automatic refresh every 60 minutes, and the given startup delay.
 * The feed has never refreshed, so it is due at once.
 */
async function seedStore(
  app: MockApp,
  startupRefreshDelaySeconds: number,
): Promise<DataStore> {
  const store: DataStore = { data: null };
  const { plugin } = createHarness(store, app);
  await plugin.onload();
  plugin.settings.refreshInterval = 60;
  plugin.settings.startupRefreshDelaySeconds = startupRefreshDelaySeconds;
  plugin.settings.feeds = [
    {
      title: "Example",
      url: FEED_URL,
      folder: "",
      lastUpdated: 0,
      items: [
        {
          title: "A",
          link: ARTICLE_URL,
          guid: ARTICLE_URL,
          description: "",
          pubDate: "2024-01-01T00:00:00Z",
          read: false,
          starred: false,
          tags: [],
          feedTitle: "Example",
          feedUrl: FEED_URL,
          coverImage: "",
        },
      ],
    } as unknown as Feed,
  ];
  await plugin.saveSettings();
  plugin.unload();
  return store;
}

describe("plugin lifecycle (characterization)", () => {
  let app: MockApp;

  beforeEach(() => {
    vi.useFakeTimers();
    app = App.createMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.empty();
  });

  describe("startup", () => {
    it("loads saved data first, then registers with Obsidian in a fixed order", async () => {
      const { plugin, log } = createHarness({ data: null }, app);

      await plugin.onload();

      expect(log).toEqual(STARTUP_SEQUENCE);
    });

    it("leaves only the delayed automatic refresh pending", async () => {
      const { plugin } = createHarness({ data: null }, app);

      await plugin.onload();

      expect(vi.getTimerCount()).toBe(1);
    });

    it("starts the automatic refresh after the startup delay, not before", async () => {
      const store = await seedStore(app, 5);
      const { spy } = mockFeedRequests();
      const { plugin } = createHarness(store, app);

      await plugin.onload();
      await vi.advanceTimersByTimeAsync(4999);
      expect(spy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(100);
      expect(spy).toHaveBeenCalled();
    });

    it("starts the automatic refresh without waiting when the startup delay is 0", async () => {
      const store = await seedStore(app, 0);
      const { spy } = mockFeedRequests();
      const { plugin } = createHarness(store, app);

      await plugin.onload();
      await vi.advanceTimersByTimeAsync(100);

      expect(spy).toHaveBeenCalled();
    });

    it("resumes scheduled auto-refreshes when a manual refresh cancels the startup delay", async () => {
      const store = await seedStore(app, 5);
      const { spy } = mockFeedRequests();
      const { plugin } = createHarness(store, app);

      await plugin.onload();
      await vi.advanceTimersByTimeAsync(2000);
      expect(spy).not.toHaveBeenCalled();

      plugin.cancelPendingStartupRefresh();
      await plugin.refreshFeeds();
      expect(spy).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("starts the scheduler without deferring global refresh when a partial refresh cancels startup delay", async () => {
      const store = await seedStore(app, 5);
      const { spy } = mockFeedRequests();
      const { plugin } = createHarness(store, app);

      await plugin.onload();
      await vi.advanceTimersByTimeAsync(2000);
      expect(spy).not.toHaveBeenCalled();

      plugin.cancelPendingStartupRefresh();
      await plugin.refreshFailedFeeds();

      // Scheduler starts and does not push global refresh out by a full 60-minute interval
      await vi.advanceTimersByTimeAsync(100);
      expect(spy).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe("unload", () => {
    it("leaves no timers pending and writes nothing when idle", async () => {
      const { plugin, log } = createHarness({ data: null }, app);
      await plugin.onload();
      const logLength = log.length;

      plugin.unload();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(vi.getTimerCount()).toBe(0);
      expect(log.slice(logLength)).toEqual([]);
    });

    it("cancels the automatic refresh when unloaded before the startup delay", async () => {
      const store = await seedStore(app, 5);
      const { spy } = mockFeedRequests();
      const { plugin } = createHarness(store, app);
      await plugin.onload();

      await vi.advanceTimersByTimeAsync(4000);
      plugin.unload();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(spy).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("ensures no scheduled refresh fires afterwards when unloaded during startup delay", async () => {
      const store = await seedStore(app, 5);
      const { spy } = mockFeedRequests();
      const { plugin } = createHarness(store, app);
      await plugin.onload();

      await vi.advanceTimersByTimeAsync(3000);
      plugin.unload();
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 10_000);

      expect(spy).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("saves playback progress that was still waiting to be saved", async () => {
      const store = await seedStore(app, 5);
      const first = createHarness(store, app);
      await first.plugin.onload();

      first.plugin.updatePlaybackProgress(FEED_URL, ARTICLE_URL, 42, 100);
      first.plugin.unload();
      await vi.advanceTimersByTimeAsync(0);

      const second = createHarness(store, app);
      await second.plugin.onload();
      const [episode] = second.plugin.settings.feeds[0].items;
      expect(episode.playbackProgress).toMatchObject({
        position: 42,
        duration: 100,
      });
    });

    it("stops a refresh that is already running", async () => {
      const store = await seedStore(app, 0);
      const { spy, release } = mockFeedRequests({ held: true });
      const { plugin, log } = createHarness(store, app);
      await plugin.onload();
      await vi.advanceTimersByTimeAsync(100);
      expect(spy).toHaveBeenCalled();

      plugin.unload();
      const logLength = log.length;
      expect(vi.getTimerCount()).toBe(0);

      release();
      await vi.advanceTimersByTimeAsync(20_000);

      expect(log.slice(logLength)).not.toContain("saveData");
    });

    it("stops a manually selected feed refresh when the plugin unloads", async () => {
      const store = await seedStore(app, 5);
      const { spy, release } = mockFeedRequests({ held: true });
      const { plugin, log } = createHarness(store, app);
      await plugin.onload();
      plugin.cancelPendingStartupRefresh();
      const feed = plugin.settings.feeds[0];
      expect(feed).toBeDefined();

      const refresh = plugin.refreshSelectedFeed(feed);
      await vi.waitFor(() => expect(spy).toHaveBeenCalled());

      plugin.unload();
      const logLength = log.length;
      expect(vi.getTimerCount()).toBe(0);

      release();
      await refresh;
      await vi.advanceTimersByTimeAsync(20_000);

      expect(log.slice(logLength)).not.toContain("saveData");
    });

    it("stops a due multi-feed refresh when the plugin unloads", async () => {
      const store = await seedStore(app, 0);
      const { spy, release } = mockFeedRequests({ held: true });
      const { plugin, log } = createHarness(store, app);
      await plugin.onload();
      const firstFeed = plugin.settings.feeds[0];
      expect(firstFeed).toBeDefined();
      plugin.settings.feeds.push({
        ...firstFeed,
        title: "Example 2",
        url: "https://example.com/second.xml",
        items: [],
      });

      await vi.advanceTimersByTimeAsync(100);
      await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

      plugin.unload();
      const logLength = log.length;
      expect(vi.getTimerCount()).toBe(0);

      release();
      await vi.advanceTimersByTimeAsync(20_000);

      expect(log.slice(logLength)).not.toContain("saveData");
    });
  });

  describe("disable and re-enable", () => {
    it("registers the same way and reloads the same feeds and articles", async () => {
      const store = await seedStore(app, 5);

      const reloaded = createHarness(store, app);
      await reloaded.plugin.onload();

      expect(reloaded.log).toEqual(STARTUP_SEQUENCE);
      const [feed] = reloaded.plugin.settings.feeds;
      expect(feed.url).toBe(FEED_URL);
      expect(feed.items.map((item) => item.guid)).toEqual([ARTICLE_URL]);
    });
  });
});

type AnyFn = (...args: unknown[]) => unknown;

/** The plugin's non-public steps and fields, which onload's order runs through. */
interface Internals {
  [name: string]: unknown;
  previewImageCache: { initialize: AnyFn };
  settingsStore: { registerVaultMetadataChangeListeners: AnyFn };
  backgroundImportService: { resumePendingImports: AnyFn };
}

interface Captured {
  commands: Map<string, Record<string, AnyFn>>;
  ribbonCallbacks: AnyFn[];
  protocolHandlers: AnyFn[];
  activeLeafHandlers: AnyFn[];
  layoutReadyCallbacks: AnyFn[];
  settingTabs: unknown[];
}

/**
 * Adds onload's internal steps to the harness log, in call order, so the order
 * they run in is pinned and not only the Obsidian calls they lead to. Also
 * keeps what onload registers, so a test can run the callbacks afterwards.
 * Every wrapper forwards to the original.
 */
function observeOnload(harness: Harness, app: MockApp): Captured {
  const { plugin, log } = harness;
  const internals = plugin as unknown as Internals;
  const captured: Captured = {
    commands: new Map(),
    ribbonCallbacks: [],
    protocolHandlers: [],
    activeLeafHandlers: [],
    layoutReadyCallbacks: [],
    settingTabs: [],
  };

  const step = (name: string, after?: (result: unknown) => void): void => {
    const original = (internals[name] as AnyFn).bind(plugin);
    internals[name] = (...args: unknown[]) => {
      log.push("step:" + name);
      const result = original(...args);
      after?.(result);
      return result;
    };
  };

  step("loadSettings");
  step("getActiveDashboardView");
  step("applyMobileOptimizations");
  step("initializeSettingsBackedServices", () => {
    const service = internals.backgroundImportService;
    const resume = service.resumePendingImports.bind(service);
    service.resumePendingImports = () => {
      log.push("step:resumePendingImports");
      return resume();
    };
  });
  step("ensureAutoRefreshScheduler", (scheduler) => {
    const target = scheduler as { start: AnyFn };
    const start = target.start.bind(target);
    target.start = () => {
      log.push("step:scheduler.start");
      return start();
    };
  });

  const cache = internals.previewImageCache;
  const initialize = cache.initialize.bind(cache);
  cache.initialize = () => {
    log.push("step:previewImageCache.initialize");
    return initialize();
  };
  const store = internals.settingsStore;
  const register = store.registerVaultMetadataChangeListeners.bind(store);
  store.registerVaultMetadataChangeListeners = (...args: unknown[]) => {
    log.push("step:registerVaultMetadataChangeListeners");
    return register(...args);
  };

  const workspace = app.workspace as unknown as {
    on: (name: string, callback: AnyFn) => unknown;
    onLayoutReady: (callback: AnyFn) => void;
  };
  const workspaceOn = workspace.on;
  workspace.on = (name, callback) => {
    if (name === "active-leaf-change") {
      captured.activeLeafHandlers.push(callback);
    }
    return workspaceOn(name, callback);
  };
  const onLayoutReady = workspace.onLayoutReady;
  workspace.onLayoutReady = (callback) => {
    captured.layoutReadyCallbacks.push(callback);
    onLayoutReady(callback);
  };

  const addCommand = plugin.addCommand.bind(plugin);
  plugin.addCommand = (command) => {
    captured.commands.set(
      command.id,
      command as unknown as Record<string, AnyFn>,
    );
    return addCommand(command);
  };
  const addRibbonIcon = plugin.addRibbonIcon.bind(plugin);
  plugin.addRibbonIcon = (icon, title, callback) => {
    captured.ribbonCallbacks.push(callback as AnyFn);
    return addRibbonIcon(icon, title, callback);
  };
  const addSettingTab = plugin.addSettingTab.bind(plugin);
  plugin.addSettingTab = (tab) => {
    captured.settingTabs.push(tab);
    addSettingTab(tab);
  };
  const protocol = plugin.registerObsidianProtocolHandler.bind(plugin);
  plugin.registerObsidianProtocolHandler = (action, handler) => {
    captured.protocolHandlers.push(handler as AnyFn);
    protocol(action, handler);
  };

  return captured;
}

/** The internal steps in a harness log, in order. */
function stepsOf(log: string[]): string[] {
  return log.filter((entry) => entry.startsWith("step:"));
}

describe("onload steps (characterization)", () => {
  let app: MockApp;
  const originalIsMobile = Platform.isMobile;

  beforeEach(() => {
    vi.useFakeTimers();
    app = App.createMock();
    Platform.isMobile = false;
  });

  afterEach(() => {
    Platform.isMobile = originalIsMobile;
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.empty();
  });

  async function startedPlugin(
    data: unknown = null,
  ): Promise<{ harness: Harness; captured: Captured }> {
    const harness = createHarness({ data }, app);
    const captured = observeOnload(harness, app);
    await harness.plugin.onload();
    return { harness, captured };
  }

  describe("order", () => {
    it("loads settings, then the image cache and watchers, then builds services and registers with Obsidian", async () => {
      const { harness } = await startedPlugin();

      expect(harness.log).toEqual([
        "step:loadSettings",
        "loadData",
        "workspace.on:rss-dashboard:tag-chip-radius-changed",
        "registerEvent",
        "workspace.on:window-open",
        "registerEvent",
        "step:previewImageCache.initialize",
        "step:registerVaultMetadataChangeListeners",
        "vault.on:modify",
        "registerEvent",
        "vault.on:create",
        "registerEvent",
        "vault.on:rename",
        "registerEvent",
        "step:initializeSettingsBackedServices",
        "vault.on:delete",
        "registerEvent",
        "step:getActiveDashboardView",
        "step:ensureAutoRefreshScheduler",
        "workspace.onLayoutReady",
        "workspace.on:active-leaf-change",
        "registerEvent",
        "workspace.onLayoutReady",
        "registerObsidianProtocolHandler:rss-dashboard",
        "registerView:rss-dashboard-view",
        "registerView:rss-discover-view",
        "registerView:rss-reader-view",
        "registerView:rss-smallweb-view",
        "addRibbonIcon:compass",
        "addSettingTab",
        "addCommand:open-dashboard",
        "addCommand:open-discover",
        "addCommand:refresh-feeds",
        "addCommand:import-opml",
        "addCommand:import-starred",
        "addCommand:export-opml",
        "addCommand:import-usersettings-json",
        "addCommand:export-usersettings-json",
        "addCommand:apply-feed-limits",
        "addCommand:toggle-sidebar",
        "addCommand:show-version-in-status-bar",
        ...PALETTE_COMMAND_LOG,
      ]);
    });

    it("applies mobile adjustments after the scheduler without scheduling saved-note validation", async () => {
      Platform.isMobile = true;

      const { harness } = await startedPlugin({
        refreshInterval: 30,
        maxItems: 200,
        sidebarCollapsed: false,
      });

      const steps = stepsOf(harness.log);
      const scheduler = steps.indexOf("step:ensureAutoRefreshScheduler");
      const mobile = steps.indexOf("step:applyMobileOptimizations");
      expect(scheduler).toBeGreaterThan(-1);
      expect(mobile).toBe(scheduler + 1);
      expect(steps).not.toContain("step:scheduleStartupSavedArticleValidation");
      expect(harness.plugin.settings).toMatchObject({
        refreshInterval: 60,
        maxItems: 50,
        sidebarCollapsed: true,
      });
    });

    it("leaves the settings alone on desktop", async () => {
      const { harness } = await startedPlugin({
        refreshInterval: 30,
        maxItems: 200,
        sidebarCollapsed: false,
      });

      expect(stepsOf(harness.log)).not.toContain(
        "step:applyMobileOptimizations",
      );
      expect(harness.plugin.settings).toMatchObject({
        refreshInterval: 30,
        maxItems: 200,
        sidebarCollapsed: false,
      });
    });

    it("repairs folders before redrawing an open dashboard", async () => {
      const harness = createHarness(
        {
          data: {
            feeds: [
              {
                title: "Orphan",
                url: FEED_URL,
                folder: "Missing folder",
                items: [],
              },
            ],
            folders: [],
          },
        },
        app,
      );
      observeOnload(harness, app);
      let folderPresentAtRender = false;
      const render = vi.fn(() => {
        folderPresentAtRender = harness.plugin.settings.folders.some(
          (folder) => folder.name === "Missing folder",
        );
        harness.log.push("view.render");
      });
      (harness.plugin as unknown as Internals).getActiveDashboardView = () =>
        Promise.resolve({ render });

      await harness.plugin.onload();

      const renderIndex = harness.log.indexOf("view.render");
      const serviceInitializationIndex = harness.log.lastIndexOf(
        "step:initializeSettingsBackedServices",
      );
      const schedulerIndex = harness.log.indexOf(
        "step:ensureAutoRefreshScheduler",
      );
      expect(harness.log.indexOf("vault.on:rename")).toBeLessThan(renderIndex);
      expect(serviceInitializationIndex).toBeLessThan(renderIndex);
      expect(renderIndex).toBeLessThan(schedulerIndex);
      expect(render).toHaveBeenCalledTimes(1);
      expect(folderPresentAtRender).toBe(true);
    });
  });

  describe("startup refresh", () => {
    const START = ["step:resumePendingImports", "step:scheduler.start"];

    /**
     * Starts the plugin with the delay set after settings load, because the
     * loader already replaces a negative delay with the default.
     */
    async function startWithDelay(delaySeconds: number): Promise<Harness> {
      const harness = createHarness({ data: null }, app);
      observeOnload(harness, app);
      const internals = harness.plugin as unknown as Internals;
      const loadSettings = internals.loadSettings as AnyFn;
      internals.loadSettings = async () => {
        await loadSettings();
        harness.plugin.settings.startupRefreshDelaySeconds = delaySeconds;
      };
      await harness.plugin.onload();
      return harness;
    }

    it("resumes background imports and then starts the scheduler once the delay passes", async () => {
      const { log } = await startWithDelay(5);
      expect(stepsOf(log)).not.toContain(START[0]);

      await vi.advanceTimersByTimeAsync(4999);
      expect(stepsOf(log)).not.toContain(START[0]);
      await vi.advanceTimersByTimeAsync(1);

      expect(stepsOf(log).slice(-2)).toEqual(START);
    });

    it.each([0, -1])(
      "starts both inside onload when the delay is %s",
      async (delaySeconds) => {
        const { log } = await startWithDelay(delaySeconds);

        expect(stepsOf(log).slice(-2)).toEqual(START);
        expect(vi.getTimerCount()).toBe(0);
      },
    );

    it("falls back to the default 5 second delay when the setting is not a finite number", async () => {
      // The settings loader keeps NaN, so this fallback is the only guard.
      const { log } = await startWithDelay(Number.NaN);
      expect(stepsOf(log)).not.toContain(START[0]);

      await vi.advanceTimersByTimeAsync(4999);
      expect(stepsOf(log)).not.toContain(START[0]);
      await vi.advanceTimersByTimeAsync(1);

      expect(stepsOf(log).slice(-2)).toEqual(START);
    });
  });

  describe("when startup fails part-way", () => {
    async function failingStartup(error: unknown) {
      const harness = createHarness({ data: null }, app);
      observeOnload(harness, app);
      const internals = harness.plugin as unknown as Internals;
      internals.ensureAutoRefreshScheduler = () => {
        throw error;
      };
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const notices = vi.spyOn(console, "debug").mockImplementation(() => {});

      await harness.plugin.onload();
      return { harness, logged, notices };
    }

    it("reports the error, keeps what was already registered and registers nothing more", async () => {
      const error = new Error("boom");

      const { harness, logged, notices } = await failingStartup(error);

      expect(logged).toHaveBeenCalledWith(
        "[RSS Dashboard] onload initialization failed:",
        error,
      );
      expect(notices).toHaveBeenCalledWith(
        "[Stub Notice]",
        "Error initializing RSS dashboard plugin.",
      );
      expect(harness.log).toEqual([
        "step:loadSettings",
        "loadData",
        "workspace.on:rss-dashboard:tag-chip-radius-changed",
        "registerEvent",
        "workspace.on:window-open",
        "registerEvent",
        "step:previewImageCache.initialize",
        "step:registerVaultMetadataChangeListeners",
        "vault.on:modify",
        "registerEvent",
        "vault.on:create",
        "registerEvent",
        "vault.on:rename",
        "registerEvent",
        "step:initializeSettingsBackedServices",
        "vault.on:delete",
        "registerEvent",
        "step:getActiveDashboardView",
      ]);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("logs a thrown value that is not an Error as text", async () => {
      const { logged } = await failingStartup("plain failure");

      expect(logged).toHaveBeenCalledWith(
        "[RSS Dashboard] onload initialization failed:",
        "plain failure",
      );
    });
  });

  describe("registered callbacks", () => {
    it("shows What's New from both the active-leaf listener and the layout-ready hook", async () => {
      const harness = createHarness({ data: null }, app);
      const captured = observeOnload(harness, app);
      const show = vi
        .spyOn(harness.plugin, "maybeShowWhatsNewForActiveDashboard")
        .mockImplementation(() => {});
      await harness.plugin.onload();

      expect(captured.activeLeafHandlers).toHaveLength(1);
      captured.activeLeafHandlers[0]();
      expect(show).toHaveBeenCalledTimes(1);

      expect(captured.layoutReadyCallbacks).toHaveLength(2);
      captured.layoutReadyCallbacks[1]();
      expect(show).toHaveBeenCalledTimes(2);
    });

    it("hands an obsidian:// link to the URI action dispatcher", async () => {
      const harness = createHarness({ data: null }, app);
      const captured = observeOnload(harness, app);
      const dispatch = vi.fn().mockResolvedValue(undefined);
      (harness.plugin as unknown as Internals).dispatchUriAction = dispatch;
      await harness.plugin.onload();

      const params = { action: "rss-dashboard", url: FEED_URL };
      captured.protocolHandlers[0](params);

      expect(dispatch).toHaveBeenCalledWith(params);
    });

    it("registers the setting tab it keeps on the plugin", async () => {
      const { harness, captured } = await startedPlugin();

      expect(captured.settingTabs).toHaveLength(1);
      expect(harness.plugin.settingTab).toBe(captured.settingTabs[0]);
    });

    it("opens the dashboard from the ribbon icon", async () => {
      const harness = createHarness({ data: null }, app);
      const captured = observeOnload(harness, app);
      const activate = vi
        .spyOn(harness.plugin, "activateView")
        .mockResolvedValue(undefined);
      await harness.plugin.onload();

      captured.ribbonCallbacks[0]();

      expect(activate).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["open-dashboard", "activateView"],
      ["open-discover", "activateDiscoverView"],
      ["export-opml", "exportOpml"],
      ["import-usersettings-json", "importUserSettingsJson"],
      ["export-usersettings-json", "exportUserSettingsJson"],
      ["apply-feed-limits", "applyFeedLimitsToAllFeeds"],
    ])("runs %s through the plugin's %s", async (id, method) => {
      const harness = createHarness({ data: null }, app);
      const captured = observeOnload(harness, app);
      const spy = vi
        .spyOn(harness.plugin as unknown as Record<string, AnyFn>, method)
        .mockResolvedValue(undefined);
      await harness.plugin.onload();

      captured.commands.get(id)?.callback();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("cancels the pending startup refresh before the refresh-feeds command refreshes", async () => {
      const harness = createHarness({ data: null }, app);
      const captured = observeOnload(harness, app);
      const calls: string[] = [];
      vi.spyOn(
        harness.plugin,
        "cancelPendingStartupRefresh",
      ).mockImplementation(() => {
        calls.push("cancel");
      });
      vi.spyOn(harness.plugin, "refreshFeeds").mockImplementation(() => {
        calls.push("refresh");
        return Promise.resolve();
      });
      await harness.plugin.onload();

      captured.commands.get("refresh-feeds")?.callback();

      expect(calls).toEqual(["cancel", "refresh"]);
    });

    describe("toggle-sidebar", () => {
      async function withToggle(dashboardOpen: boolean) {
        const { harness, captured } = await startedPlugin();
        const render = vi.fn();
        harness.plugin.getActiveDashboardView = vi
          .fn()
          .mockResolvedValue({ render });
        const save = vi
          .spyOn(harness.plugin, "saveSettings")
          .mockResolvedValue(undefined);
        vi.spyOn(app.workspace, "getLeavesOfType").mockReturnValue(
          dashboardOpen ? [{} as never] : [],
        );
        const command = captured.commands.get("toggle-sidebar")!;
        return { plugin: harness.plugin, render, save, command };
      }

      it("is unavailable while no dashboard is open", async () => {
        const { plugin, render, save, command } = await withToggle(false);
        const before = plugin.settings.sidebarCollapsed;

        expect(command.checkCallback(true)).toBe(false);
        expect(command.checkCallback(false)).toBe(false);
        await vi.advanceTimersByTimeAsync(0);

        expect(plugin.settings.sidebarCollapsed).toBe(before);
        expect(save).not.toHaveBeenCalled();
        expect(render).not.toHaveBeenCalled();
      });

      it("only reports availability when asked to check", async () => {
        const { plugin, render, save, command } = await withToggle(true);
        const before = plugin.settings.sidebarCollapsed;

        expect(command.checkCallback(true)).toBe(true);
        await vi.advanceTimersByTimeAsync(0);

        expect(plugin.settings.sidebarCollapsed).toBe(before);
        expect(save).not.toHaveBeenCalled();
        expect(render).not.toHaveBeenCalled();
      });

      it("flips the sidebar, saves, then redraws when run", async () => {
        const { plugin, render, save, command } = await withToggle(true);
        const before = plugin.settings.sidebarCollapsed;

        expect(command.checkCallback(false)).toBe(true);
        await vi.advanceTimersByTimeAsync(0);

        expect(plugin.settings.sidebarCollapsed).toBe(!before);
        expect(save).toHaveBeenCalledTimes(1);
        expect(render).toHaveBeenCalledTimes(1);
        expect(save.mock.invocationCallOrder[0]).toBeLessThan(
          render.mock.invocationCallOrder[0],
        );
      });
    });
  });
});
