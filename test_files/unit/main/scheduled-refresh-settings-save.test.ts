import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { FeedParser } from "../../../src/services/feed-parser";
import * as feedFetch from "../../../src/services/feed-parser/feed-fetch";
import type { FeedRefreshScheduler } from "../../../src/services/feed-refresh-scheduler";
import { FEED_REQUEST_TIMEOUT_MS } from "../../../src/services/feed-timeout";
import { DEFAULT_SETTINGS, type Feed } from "../../../src/types/types";
import { createRefreshFeed } from "../fixtures/refresh-feed";

const FEED_XML = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Example feed</title>
<link>https://example.com</link><description>Example</description>
<item><title>Article</title><link>https://example.com/article</link>
<guid>article-1</guid><description>Content</description></item>
</channel></rss>`;
const INTERVAL_MS = 5 * 60_000;

function createPendingResponse() {
  let resolve!: (xml: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createPlugin(feeds: Feed[] = [createRefreshFeed()]) {
  const plugin = new RssDashboardPlugin(
    new App() as unknown as ConstructorParameters<typeof RssDashboardPlugin>[0],
    {
      id: "rss-dashboard",
      name: "RSS Dashboard",
      version: "1.0.0",
      author: "Test",
      description: "Test plugin",
      minAppVersion: "1.7.2",
    },
  );
  plugin.settings = {
    ...structuredClone(DEFAULT_SETTINGS),
    feeds,
    refreshInterval: 0,
    storageMode: "legacy-json",
    metadataStorageMode: "plugin-default",
    // Exercise real settings persistence without initializing backup services.
    autoBackup: {
      backupDataJson: false,
      backupOpml: false,
      backupUserdata: false,
    },
  };
  plugin.feedParser = new FeedParser(
    plugin.settings.display,
    plugin.settings.availableTags,
    plugin.settings.media,
  );
  const saveData = vi.spyOn(plugin, "saveData").mockResolvedValue(undefined);
  // Use the real plugin's scheduler wiring, runner, parser and SettingsStore.
  const scheduler = (
    plugin as unknown as {
      ensureAutoRefreshScheduler: () => FeedRefreshScheduler;
    }
  ).ensureAutoRefreshScheduler();
  return { plugin, scheduler, saveData };
}

describe("settings saves during an automatic single-feed refresh", () => {
  let scheduler: FeedRefreshScheduler | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    scheduler?.stop();
    scheduler = undefined;
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.empty();
  });

  async function startPendingRefresh(feeds?: Feed[]) {
    const pending = createPendingResponse();
    const fetchXml = vi
      .spyOn(feedFetch, "fetchFeedXml")
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(FEED_XML);
    const harness = createPlugin(feeds);
    scheduler = harness.scheduler;
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchXml).toHaveBeenCalledTimes(1);
    return { ...harness, pending, fetchXml };
  }

  it.each(["success", "network failure", "timeout"] as const)(
    "keeps ten actual settings saves to one request and resumes after %s",
    async (outcome) => {
      const pending = createPendingResponse();
      const fetchXml = vi
        .spyOn(feedFetch, "fetchFeedXml")
        .mockImplementation(() => pending.promise);
      const harness = createPlugin();
      const { plugin, saveData } = harness;
      scheduler = harness.scheduler;
      scheduler.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchXml).toHaveBeenCalledTimes(1);

      for (let index = 0; index < 10; index += 1) {
        plugin.settings.display.showCoverImage =
          !plugin.settings.display.showCoverImage;
        await plugin.saveSettings();
        await vi.advanceTimersByTimeAsync(0);
      }

      expect(saveData).toHaveBeenCalledTimes(10);
      expect(console.error).not.toHaveBeenCalled();
      expect(fetchXml).toHaveBeenCalledTimes(1);
      expect(plugin.settings.feeds[0].lastRefreshAttemptCompletedAt).toBe(0);

      if (outcome === "success") {
        await vi.advanceTimersByTimeAsync(2_000);
        pending.resolve(FEED_XML);
      } else if (outcome === "network failure") {
        await vi.advanceTimersByTimeAsync(2_000);
        pending.reject(new Error("Network unavailable"));
      } else {
        await vi.advanceTimersByTimeAsync(FEED_REQUEST_TIMEOUT_MS);
      }
      await vi.advanceTimersByTimeAsync(0);

      const completedAt = Date.now();
      expect(plugin.settings.feeds[0].lastRefreshAttemptCompletedAt).toBe(
        completedAt,
      );
      if (outcome === "success") {
        expect(plugin.settings.feeds[0].lastFetchError).toBeUndefined();
        expect(plugin.settings.feeds[0].items).toHaveLength(1);
      } else {
        expect(plugin.settings.feeds[0].lastFetchError).toContain(
          outcome === "timeout" ? "Timed out" : "Network unavailable",
        );
      }
      expect(console.error).not.toHaveBeenCalledWith(
        "[RSS Dashboard] Backup after save failed:",
        expect.anything(),
      );
      expect(saveData).toHaveBeenCalledTimes(11);
      expect(vi.getTimerCount()).toBe(1);

      fetchXml.mockResolvedValue(FEED_XML);
      await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1);
      expect(fetchXml).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchXml).toHaveBeenCalledTimes(2);
      expect(plugin.settings.feeds[0].lastRefreshAttemptCompletedAt).toBe(
        completedAt + INTERVAL_MS,
      );
    },
  );

  it("still lets a manual refresh start while the automatic request is pending", async () => {
    const pending = createPendingResponse();
    const fetchXml = vi
      .spyOn(feedFetch, "fetchFeedXml")
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(FEED_XML);
    const harness = createPlugin();
    scheduler = harness.scheduler;
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchXml).toHaveBeenCalledTimes(1);

    await harness.plugin.refreshSelectedFeed(harness.plugin.settings.feeds[0]);
    expect(fetchXml).toHaveBeenCalledTimes(2);
    await harness.plugin.saveSettings();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchXml).toHaveBeenCalledTimes(2);

    pending.resolve(FEED_XML);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("uses an interval changed through saveSettings after the pending refresh settles", async () => {
    const { plugin, pending, fetchXml, saveData } = await startPendingRefresh();
    plugin.settings.feeds[0].scanInterval = 2;
    await plugin.saveSettings();
    expect(saveData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        feeds: [expect.objectContaining({ scanInterval: 2 })],
      }),
    );
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchXml).toHaveBeenCalledTimes(1);

    pending.resolve(FEED_XML);
    await vi.advanceTimersByTimeAsync(0);
    const completedAt = Date.now();
    expect(plugin.settings.feeds[0].lastRefreshAttemptCompletedAt).toBe(
      completedAt,
    );
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(120_000 - 1);
    expect(fetchXml).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchXml).toHaveBeenCalledTimes(2);
    expect(plugin.settings.feeds[0].lastRefreshAttemptCompletedAt).toBe(
      completedAt + 120_000,
    );
    expect(console.error).not.toHaveBeenCalled();
  });

  it("does not restore or rearm a feed removed through saveSettings while pending", async () => {
    const { plugin, pending, fetchXml, saveData } = await startPendingRefresh();
    plugin.settings.feeds = [];
    await plugin.saveSettings();
    expect(saveData).toHaveBeenLastCalledWith(
      expect.objectContaining({ feeds: [] }),
    );
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchXml).toHaveBeenCalledTimes(1);

    pending.resolve(FEED_XML);
    await vi.advanceTimersByTimeAsync(0);
    expect(plugin.settings.feeds).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(fetchXml).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("refreshes the due replacement saved while the previous feed is pending", async () => {
    const { plugin, pending, fetchXml, saveData } = await startPendingRefresh();
    const replacement = createRefreshFeed({
      url: "https://example.com/replacement.xml",
    });
    plugin.settings.feeds = [replacement];
    await plugin.saveSettings();
    expect(saveData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        feeds: [expect.objectContaining({ url: replacement.url })],
      }),
    );
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchXml).toHaveBeenCalledTimes(1);

    pending.resolve(FEED_XML);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchXml.mock.calls.map(([url]) => url)).toEqual([
      "https://example.com/feed.xml",
      replacement.url,
    ]);
    expect(plugin.settings.feeds).toHaveLength(1);
    expect(plugin.settings.feeds[0].url).toBe(replacement.url);
    expect(
      plugin.settings.feeds[0].lastRefreshAttemptCompletedAt,
    ).toBeGreaterThan(0);
    expect(vi.getTimerCount()).toBe(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("resumes after stop/start when a non-abortable network request times out", async () => {
    const {
      plugin,
      fetchXml,
      scheduler: activeScheduler,
    } = await startPendingRefresh();
    // Leave the network promise unresolved even after its abort signal fires.
    const signal = fetchXml.mock.calls[0][2];
    activeScheduler.stop();
    activeScheduler.start();
    await plugin.saveSettings();
    await vi.advanceTimersByTimeAsync(FEED_REQUEST_TIMEOUT_MS - 1);
    expect(fetchXml).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    expect(plugin.settings.feeds[0].lastFetchError).toContain("Timed out");
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1);
    expect(fetchXml).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchXml).toHaveBeenCalledTimes(2);
    expect(console.error).not.toHaveBeenCalledWith(
      "[RSS Dashboard] Backup after save failed:",
      expect.anything(),
    );
  });

  it("refreshes an unrelated feed manually and rearms from its current completion time", async () => {
    const automatic = createRefreshFeed();
    const manual = createRefreshFeed({
      url: "https://example.com/manual.xml",
      scanInterval: 1,
      lastRefreshAttemptCompletedAt: Date.now(),
    });
    const { plugin, pending, fetchXml } = await startPendingRefresh([
      automatic,
      manual,
    ]);
    await vi.advanceTimersByTimeAsync(10_000);
    await plugin.refreshSelectedFeed(manual);
    const manualCompletedAt = Date.now();
    expect(fetchXml.mock.calls.map(([url]) => url)).toEqual([
      automatic.url,
      manual.url,
    ]);
    expect(plugin.settings.feeds[1].lastRefreshAttemptCompletedAt).toBe(
      manualCompletedAt,
    );
    await plugin.saveSettings();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchXml).toHaveBeenCalledTimes(2);

    pending.resolve(FEED_XML);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(50_000 - 1);
    expect(fetchXml).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchXml.mock.calls.map(([url]) => url)).toEqual([
      automatic.url,
      manual.url,
      manual.url,
    ]);
    expect(plugin.settings.feeds[1].lastRefreshAttemptCompletedAt).toBe(
      manualCompletedAt + 60_000,
    );
    expect(console.error).not.toHaveBeenCalled();
  });
});
