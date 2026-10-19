import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { FeedRefreshRunner } from "../../../src/services/feed-refresh-runner";
import type { FeedOperationTracker } from "../../../src/services/feed-operation-tracker";
import type { PreviewImageCache } from "../../../src/services/preview-image-cache";
import type { FeedParser } from "../../../src/services/feed-parser";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type RssDashboardSettings,
} from "../../../src/types/types";

/**
 * The refresh attempt generation is the dismissal epoch for the dashboard's
 * error icon (#1353): it must move once at the entry of every refresh attempt,
 * including attempts that return early, so a dismissal is not mistaken for a
 * fresh failure.
 */
function createFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Feed A",
    url: "https://example.com/a.xml",
    folder: "",
    items: [],
    lastUpdated: 0,
    ...overrides,
  };
}

function createRunner(): FeedRefreshRunner {
  return new FeedRefreshRunner({
    feedOperationTracker: {} as FeedOperationTracker,
    previewImageCache: {} as PreviewImageCache,
    getSettings: () => ({ feeds: [] }) as unknown as RssDashboardSettings,
    getFeedParser: () => undefined as unknown as FeedParser,
    getBackgroundImportService: () => undefined,
    getAutoRefreshScheduler: () => null,
    saveSettings: async () => {},
    clearFeedShardHealth: () => {},
    getActiveDashboardView: async () => null,
    announce: () => {},
    refreshFeeds: async () => {},
  });
}

const MANIFEST = {
  id: "rss-dashboard",
  name: "RSS Dashboard",
  version: "1.0.0",
  author: "Test",
  description: "Test plugin",
  dir: ".",
} as unknown as ConstructorParameters<typeof RssDashboardPlugin>[1];

function createPluginWithNoFeeds(): RssDashboardPlugin {
  const plugin = new RssDashboardPlugin(
    new App() as unknown as ConstructorParameters<typeof RssDashboardPlugin>[0],
    MANIFEST,
  );
  const testPlugin = plugin as unknown as {
    settings: RssDashboardSettings;
    saveData: ReturnType<typeof vi.fn>;
  };
  testPlugin.settings = { ...DEFAULT_SETTINGS, feeds: [] };
  testPlugin.saveData = vi.fn().mockResolvedValue(undefined);
  return plugin;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("feed refresh attempt generation", () => {
  it("starts at zero and moves once per refreshFeeds entry", async () => {
    const runner = createRunner();
    expect(runner.refreshAttemptGeneration).toBe(0);

    await runner.refreshFeeds();
    expect(runner.refreshAttemptGeneration).toBe(1);

    await runner.refreshFeeds([createFeed()]);
    expect(runner.refreshAttemptGeneration).toBe(2);
  });

  it("moves once per refreshSelectedFeed entry, before its early returns", async () => {
    const runner = createRunner();

    await runner.refreshSelectedFeed(createFeed());

    expect(runner.refreshAttemptGeneration).toBe(1);
  });

  it("is exposed read-only through the plugin facade", async () => {
    const plugin = createPluginWithNoFeeds();

    expect(plugin.refreshAttemptGeneration).toBe(0);
    await plugin.refreshFeeds();
    expect(plugin.refreshAttemptGeneration).toBe(1);
  });
});
