/**
 * Unit tests for PluginLifecycleManager (Phase 5 extraction)
 *
 * Tests the key behaviors owned by this service:
 *  - scheduleStartupSavedArticleValidation()
 *  - scheduleStartupRefreshIfNeeded()
 *  - cancelPendingStartupRefresh()
 *  - onUnload()
 *  - performFactoryReset()
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { PluginLifecycleManager } from "../../../src/services/plugin-lifecycle-manager";
import type {
  IPluginForLifecycle,
  IAppForLifecycle,
} from "../../../src/services/plugin-lifecycle-manager";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import type { RssDashboardSettings } from "../../../src/types/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSettings(overrides?: Partial<RssDashboardSettings>): RssDashboardSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function makePlugin(overrides?: Partial<IPluginForLifecycle>): IPluginForLifecycle {
  return {
    settings: makeSettings(),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    getActiveDashboardView: vi.fn().mockResolvedValue(null),
    getActiveDiscoverView: vi.fn().mockResolvedValue(null),
    articleSaver: {
      fixSavedFilePaths: vi.fn().mockResolvedValue(undefined),
      checkSavedFileExists: vi.fn().mockReturnValue(true),
    },
    initializeSettingsBackedServices: vi.fn(),
    settingTab: null,
    refreshFeeds: vi.fn().mockResolvedValue(undefined),
    cancelPendingStartupRefresh: vi.fn(),
    performAutoBackups: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeApp(layoutReadyBehavior: "sync" | "async" | "none" = "sync"): IAppForLifecycle {
  return {
    workspace: {
      onLayoutReady:
        layoutReadyBehavior === "none"
          ? undefined
          : (cb: () => void) => {
              if (layoutReadyBehavior === "sync") cb();
              // "async" means we capture it without calling
            },
    },
  };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("PluginLifecycleManager — scheduleStartupSavedArticleValidation()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls fixSavedFilePaths once layout is ready (sync)", async () => {
    const plugin = makePlugin();
    const app = makeApp("sync");
    const mgr = new PluginLifecycleManager(app, plugin);

    mgr.scheduleStartupSavedArticleValidation();

    // flushPromises equivalent: allow microtasks to settle
    await Promise.resolve();
    await Promise.resolve();

    expect(plugin.articleSaver.fixSavedFilePaths).toHaveBeenCalledTimes(1);
  });

  it("does not call fixSavedFilePaths a second time if invoked again", async () => {
    const plugin = makePlugin();
    const app = makeApp("sync");
    const mgr = new PluginLifecycleManager(app, plugin);

    mgr.scheduleStartupSavedArticleValidation();
    await Promise.resolve();
    await Promise.resolve();

    // Second call should be a no-op due to guard flag
    mgr.scheduleStartupSavedArticleValidation();
    await Promise.resolve();
    await Promise.resolve();

    expect(plugin.articleSaver.fixSavedFilePaths).toHaveBeenCalledTimes(1);
  });

  it("calls reconcile immediately when onLayoutReady is unavailable", async () => {
    const plugin = makePlugin();
    const app = makeApp("none");
    const mgr = new PluginLifecycleManager(app, plugin);

    mgr.scheduleStartupSavedArticleValidation();
    await Promise.resolve();
    await Promise.resolve();

    expect(plugin.articleSaver.fixSavedFilePaths).toHaveBeenCalledTimes(1);
  });

  it("marks saved=false for articles whose file no longer exists", async () => {
    const plugin = makePlugin();
    plugin.settings = makeSettings({
      feeds: [
        {
          title: "Feed",
          url: "https://example.com/rss",
          folder: "Uncategorized",
          items: [
            {
              guid: "art-1",
              title: "Orphaned Article",
              link: "",
              description: "",
              pubDate: "",
              read: false,
              starred: false,
              saved: true,
              savedFilePath: "Articles/Orphaned.md",
              tags: [{ name: "saved", color: "#3498db" }],
              feedTitle: "Feed",
              feedUrl: "https://example.com/rss",
              coverImage: "",
            },
          ],
          lastUpdated: 0,
          mediaType: "article",
        },
      ],
    });
    // Simulate missing file
    (plugin.articleSaver.checkSavedFileExists as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const app = makeApp("sync");
    const mgr = new PluginLifecycleManager(app, plugin);

    mgr.scheduleStartupSavedArticleValidation();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(plugin.settings.feeds[0].items[0].saved).toBe(false);
    expect(plugin.settings.feeds[0].items[0].savedFilePath).toBeUndefined();
    expect(plugin.settings.feeds[0].items[0].tags).toEqual([]);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------

describe("PluginLifecycleManager — scheduleStartupRefreshIfNeeded()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls refreshFeeds immediately when delay is 0 and interval has elapsed", () => {
    const plugin = makePlugin();
    const app = makeApp("none");
    const mgr = new PluginLifecycleManager(app, plugin);

    mgr.scheduleStartupRefreshIfNeeded(
      60 * 60 * 1000, // 60-minute interval in ms
      0,              // delay = 0 → call immediately
      0,              // no prior refresh
    );

    expect(plugin.refreshFeeds).toHaveBeenCalledTimes(1);
  });

  it("delays refreshFeeds by the configured seconds", () => {
    const plugin = makePlugin();
    const app = makeApp("none");
    const mgr = new PluginLifecycleManager(app, plugin);

    mgr.scheduleStartupRefreshIfNeeded(60 * 60 * 1000, 5, 0);

    expect(plugin.refreshFeeds).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);

    expect(plugin.refreshFeeds).toHaveBeenCalledTimes(1);
  });

  it("does not refresh when auto-refresh interval is null (disabled)", () => {
    const plugin = makePlugin();
    const app = makeApp("none");
    const mgr = new PluginLifecycleManager(app, plugin);

    mgr.scheduleStartupRefreshIfNeeded(null, 0, 0);

    expect(plugin.refreshFeeds).not.toHaveBeenCalled();
  });

  it("does not refresh when interval has not yet elapsed", () => {
    const plugin = makePlugin();
    const app = makeApp("none");
    const mgr = new PluginLifecycleManager(app, plugin);

    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    mgr.scheduleStartupRefreshIfNeeded(
      60 * 60 * 1000, // 60-minute interval
      0,
      thirtyMinutesAgo,
    );

    expect(plugin.refreshFeeds).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("PluginLifecycleManager — cancelPendingStartupRefresh()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancels a scheduled startup refresh before it fires", () => {
    const plugin = makePlugin();
    const app = makeApp("none");
    const mgr = new PluginLifecycleManager(app, plugin);

    mgr.scheduleStartupRefreshIfNeeded(60 * 60 * 1000, 5, 0);

    mgr.cancelPendingStartupRefresh();
    vi.advanceTimersByTime(10000);

    expect(plugin.refreshFeeds).not.toHaveBeenCalled();
  });

  it("is safe to call even when no timeout is scheduled", () => {
    const plugin = makePlugin();
    const app = makeApp("none");
    const mgr = new PluginLifecycleManager(app, plugin);

    expect(() => mgr.cancelPendingStartupRefresh()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------

describe("PluginLifecycleManager — onUnload()", () => {
  it("flushes progress debounce and triggers auto-backups", () => {
    vi.useFakeTimers();
    const plugin = makePlugin();
    const app = makeApp("none");
    const mgr = new PluginLifecycleManager(app, plugin);

    const fakeDebounceId = window.setTimeout(() => {}, 2000);
    mgr["progressSaveDebounce"] = fakeDebounceId;

    mgr.onUnload();

    expect(mgr["progressSaveDebounce"]).toBeNull();
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.performAutoBackups).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("returns null when no debounce is pending", () => {
    const plugin = makePlugin();
    const app = makeApp("none");
    const mgr = new PluginLifecycleManager(app, plugin);

    mgr.onUnload();

    expect(mgr["progressSaveDebounce"]).toBeNull();
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(plugin.performAutoBackups).toHaveBeenCalledTimes(1);
  });

  it("cancels the startup refresh timeout", () => {
    vi.useFakeTimers();
    const plugin = makePlugin();
    const app = makeApp("none");
    const mgr = new PluginLifecycleManager(app, plugin);

    // Schedule a startup refresh first
    mgr.scheduleStartupRefreshIfNeeded(60 * 60 * 1000, 10, 0);

    mgr.onUnload();
    vi.advanceTimersByTime(20000);

    // refreshFeeds should NOT have fired (was cancelled by onUnload)
    expect(plugin.refreshFeeds).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------

describe("PluginLifecycleManager — performFactoryReset()", () => {
  it("resets settings to defaults and saves", async () => {
    const plugin = makePlugin({
      settings: makeSettings({ refreshInterval: 99 }),
    });
    const app = makeApp("none");
    const mgr = new PluginLifecycleManager(app, plugin);

    await mgr.performFactoryReset();

    expect(plugin.settings.refreshInterval).toBe(DEFAULT_SETTINGS.refreshInterval);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.initializeSettingsBackedServices).toHaveBeenCalledTimes(1);
  });

  it("refreshes open dashboard and discover views after reset", async () => {
    const mockRefresh = vi.fn();
    const mockRender = vi.fn();

    const plugin = makePlugin({
      getActiveDashboardView: vi.fn().mockResolvedValue({ refresh: mockRefresh }),
      getActiveDiscoverView: vi.fn().mockResolvedValue({ render: mockRender }),
    });
    const app = makeApp("none");
    const mgr = new PluginLifecycleManager(app, plugin);

    await mgr.performFactoryReset();

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRender).toHaveBeenCalledTimes(1);
  });

  it("calls settingTab.display() if a settings tab is open", async () => {
    const displayMock = vi.fn();
    const plugin = makePlugin({
      settingTab: { display: displayMock },
    });
    const app = makeApp("none");
    const mgr = new PluginLifecycleManager(app, plugin);

    await mgr.performFactoryReset();

    expect(displayMock).toHaveBeenCalledTimes(1);
  });

  it("clears known local-storage keys from the app", async () => {
    const removeLocalStorage = vi.fn();
    const plugin = makePlugin();
    const app: IAppForLifecycle = {
      workspace: { onLayoutReady: undefined },
      removeLocalStorage,
    };

    const mgr = new PluginLifecycleManager(app, plugin);
    await mgr.performFactoryReset();

    expect(removeLocalStorage).toHaveBeenCalledWith("rss-discover-filters");
    expect(removeLocalStorage).toHaveBeenCalledWith("rss-podcast-progress");
    expect(removeLocalStorage).toHaveBeenCalledWith(
      "rss-first-launch-coachmark-shown",
    );
  });
});
