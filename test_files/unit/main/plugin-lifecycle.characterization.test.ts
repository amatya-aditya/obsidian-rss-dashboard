/**
 * Characterization tests for the plugin lifecycle (#436, phase 4).
 *
 * These pin how RssDashboardPlugin starts up, shuts down and reloads today,
 * so the main.ts extractions can prove they preserve it (#436 rule 9). They
 * are read-only on refactor PRs; see docs/development/architecture.md.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { App, type MockApp, type PluginManifest } from "obsidian";
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

  // The stub vault has no event API; model the three events main.ts watches.
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
const STARTUP_SEQUENCE = [
  "loadData",
  "vault.on:modify",
  "registerEvent",
  "vault.on:create",
  "registerEvent",
  "vault.on:rename",
  "registerEvent",
  // Deferred saved-article validation.
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
  plugin.settings.feeds.push({
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
  } as unknown as Feed);
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

    it("does not stop a refresh that is already running", async () => {
      // BUG: pinned, see #444. A running refresh outlives unload, keeps its
      // timers, and saves from the unloaded instance when it finishes.
      const store = await seedStore(app, 0);
      const { spy, release } = mockFeedRequests({ held: true });
      const { plugin, log } = createHarness(store, app);
      await plugin.onload();
      await vi.advanceTimersByTimeAsync(100);
      expect(spy).toHaveBeenCalled();

      plugin.unload();
      const logLength = log.length;
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      release();
      await vi.advanceTimersByTimeAsync(20_000);

      expect(log.slice(logLength)).toContain("saveData");
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
