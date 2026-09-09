import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestUrlResponse } from "obsidian";
import * as obsidian from "obsidian";
import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../../../src/types/types";

/**
 * Plugin-orchestration tests for ticket 08 (automatic FreshRSS sync). These
 * exercise the real coordinator wiring in main.ts -- startup gating on full
 * hydration, sharing the data-sync lease with ordinary refresh, coalescing
 * overlapping triggers into at most one trailing cycle, backoff-aware
 * rearming, and clean unload -- rather than re-testing the coordinator's own
 * cycle logic (covered by freshrss-sync-coordinator.test.ts) or the
 * scheduler/coalescing classes in isolation (covered by
 * freshrss-auto-sync-scheduler.test.ts and
 * freshrss-sync-trigger-coordinator.test.ts).
 */

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function mockRequestUrlResponse(text: string, status = 200): RequestUrlResponse {
  return { status, headers: {}, arrayBuffer: new ArrayBuffer(0), json: {}, text };
}

function requestUrlOf(request: unknown): string {
  return typeof request === "string" ? request : (request as { url: string }).url;
}

function getNoticeMessages(spy: ReturnType<typeof vi.spyOn>): string[] {
  return (spy as unknown as { mock: { calls: Array<Array<unknown>> } }).mock.calls
    .filter((call) => call[0] === "[Stub Notice]")
    .map((call) => String(call[1]));
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function flushMicrotasks(times = 15): Promise<void> {
  for (let index = 0; index < times; index++) {
    await Promise.resolve();
  }
}

function withSecretStorage(app: ReturnType<typeof obsidian.App.createMock>): void {
  (
    app as unknown as {
      secretStorage: { getSecret(reference: string): string | null; listSecrets(): string[] };
    }
  ).secretStorage = {
    getSecret: () => '{"username":"test-user","apiPassword":"test-password"}',
    listSecrets: () => ["freshrss-primary"],
  };
}

function freshRssReadySettings(): RssDashboardSettings {
  const settings = cloneSettings();
  settings.metadataStorageMode = "vault-location";
  settings.metadataStorageFolder = ".rss-dashboard-data";
  settings.metadataStorageSchemaVersion = 2;
  settings.storageMode = "vault-shards-v2";
  settings.freshRss.endpoint = "https://reader.example.test/api/greader.php";
  settings.freshRss.credentialReference = "freshrss-primary";
  settings.freshRss.status = "connected";
  return settings;
}

async function activateSidecar(
  app: ReturnType<typeof obsidian.App.createMock>,
  syncHealth: { consecutiveTransientFailureCount: number; backoffUntilMs: number | null } = {
    consecutiveTransientFailureCount: 0,
    backoffUntilMs: null,
  },
): Promise<void> {
  await app.vault.adapter.write(
    ".rss-dashboard-data/freshrss-state.json",
    JSON.stringify({
      version: 2,
      scope: {
        endpoint: "https://reader.example.test/api/greader.php",
        remoteUserId: "opaque-user",
      },
      pendingFacetMutations: [],
      feedBindings: [],
      articleBindings: [],
      checkpoints: [],
      labelMappings: [],
      syncHealth,
    }),
  );
}

/** An always-succeeding, no-subscriptions FreshRSS responder: a cycle completes fast and cleanly. */
function cleanResponder(): (request: unknown) => Promise<RequestUrlResponse> {
  return async (request) => {
    const url = requestUrlOf(request);
    if (url.includes("/accounts/ClientLogin")) return mockRequestUrlResponse("Auth=opaque-session");
    if (url.includes("/subscription/list")) {
      return mockRequestUrlResponse(JSON.stringify({ subscriptions: [] }));
    }
    if (url.includes("/tag/list")) return mockRequestUrlResponse(JSON.stringify({ tags: [] }));
    throw new Error(`Unexpected request: ${url}`);
  };
}

async function createReadyPlugin(options: {
  automaticSyncEnabled: boolean;
  automaticSyncIntervalMinutes?: number;
  syncHealth?: { consecutiveTransientFailureCount: number; backoffUntilMs: number | null };
  feeds?: RssDashboardSettings["feeds"];
}): Promise<{ plugin: RssDashboardPlugin; app: ReturnType<typeof obsidian.App.createMock> }> {
  const app = obsidian.App.createMock();
  withSecretStorage(app);
  await activateSidecar(app, options.syncHealth);

  const settings = freshRssReadySettings();
  settings.freshRss.automaticSyncEnabled = options.automaticSyncEnabled;
  if (options.automaticSyncIntervalMinutes !== undefined) {
    settings.freshRss.automaticSyncIntervalMinutes = options.automaticSyncIntervalMinutes;
  }
  if (options.feeds) {
    settings.feeds = options.feeds;
  }

  const plugin = new RssDashboardPlugin(app, {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.6.0",
  });
  plugin.loadData = vi.fn().mockResolvedValue(settings);
  plugin.saveData = vi.fn().mockResolvedValue(undefined);

  return { plugin, app };
}

function loginCallCount(requestUrl: ReturnType<typeof vi.spyOn>): number {
  return (requestUrl as unknown as { mock: { calls: Array<Array<unknown>> } }).mock.calls.filter(
    (call) => requestUrlOf(call[0]).includes("/accounts/ClientLogin"),
  ).length;
}

describe("FreshRSS automatic sync orchestration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
  });

  it("does not attempt a FreshRSS cycle on startup while automatic sync is disabled (the default)", async () => {
    const { plugin } = await createReadyPlugin({ automaticSyncEnabled: false });
    const requestUrl = vi.spyOn(obsidian, "requestUrl").mockImplementation(cleanResponder());

    await plugin.onload();
    await flushMicrotasks();

    expect(requestUrl).not.toHaveBeenCalled();
  });

  it("requests a startup FreshRSS cycle only after settings/content-shard/user-state hydration completes", async () => {
    const app = obsidian.App.createMock();
    withSecretStorage(app);
    await activateSidecar(app);
    const settings = freshRssReadySettings();
    settings.freshRss.automaticSyncEnabled = true;

    const plugin = new RssDashboardPlugin(app, {
      id: "rss-dashboard",
      name: "RSS Dashboard",
      version: "2.6.0",
    });
    const pendingLoad = deferred<RssDashboardSettings>();
    plugin.loadData = vi.fn().mockReturnValue(pendingLoad.promise);
    plugin.saveData = vi.fn().mockResolvedValue(undefined);
    const requestUrl = vi.spyOn(obsidian, "requestUrl").mockImplementation(cleanResponder());

    const onloadPromise = plugin.onload();
    await flushMicrotasks();
    // Settings (and, in v2 mode, content shards / user-state.json) have not
    // finished hydrating yet -- no FreshRSS attempt should have started.
    expect(requestUrl).not.toHaveBeenCalled();

    pendingLoad.resolve(settings);
    await onloadPromise;

    await vi.waitFor(() => {
      expect(loginCallCount(requestUrl)).toBeGreaterThan(0);
    });
  });

  it("shares the data-sync lease with ordinary feed refresh: a FreshRSS cycle waits for an in-flight refresh instead of racing it", async () => {
    const { plugin } = await createReadyPlugin({
      automaticSyncEnabled: false,
      feeds: [
        {
          title: "Local feed one",
          url: "https://example.test/local-feed-1.xml",
          folder: "Uncategorized",
          items: [],
          lastUpdated: 0,
        },
        {
          title: "Local feed two",
          url: "https://example.test/local-feed-2.xml",
          folder: "Uncategorized",
          items: [],
          lastUpdated: 0,
        },
      ],
    });
    await plugin.onload();
    vi.spyOn(obsidian, "requestUrl").mockImplementation(cleanResponder());

    const pendingRefresh = deferred<void>();
    let refreshFinished = false;
    plugin.feedParser.refreshFeed = vi.fn().mockImplementation(async (feed) => {
      await pendingRefresh.promise;
      refreshFinished = true;
      return feed;
    });

    const refreshPromise = plugin.refreshFeeds(plugin.settings.feeds);
    await flushMicrotasks();

    const syncPromise = plugin.syncFreshRssNow();
    await flushMicrotasks();

    // The FreshRSS cycle must not start its own work (login) until the
    // ordinary refresh releases the shared lease.
    const requestUrlSpy = obsidian.requestUrl as unknown as ReturnType<typeof vi.spyOn>;
    expect(loginCallCount(requestUrlSpy)).toBe(0);

    pendingRefresh.resolve();
    await refreshPromise;
    await syncPromise;

    expect(refreshFinished).toBe(true);
    await vi.waitFor(() => {
      expect(loginCallCount(requestUrlSpy)).toBe(1);
    });
  });

  it("coalesces manual and retry triggers arriving during an in-flight automatic cycle into exactly one trailing cycle", async () => {
    const { plugin } = await createReadyPlugin({ automaticSyncEnabled: true });
    const loginGate = deferred<RequestUrlResponse>();
    let loginAttempts = 0;
    const requestUrl = vi.spyOn(obsidian, "requestUrl").mockImplementation(async (request) => {
      const url = requestUrlOf(request);
      if (url.includes("/accounts/ClientLogin")) {
        loginAttempts++;
        if (loginAttempts === 1) {
          return loginGate.promise;
        }
        return mockRequestUrlResponse("Auth=opaque-session");
      }
      if (url.includes("/subscription/list")) {
        return mockRequestUrlResponse(JSON.stringify({ subscriptions: [] }));
      }
      if (url.includes("/tag/list")) return mockRequestUrlResponse(JSON.stringify({ tags: [] }));
      throw new Error(`Unexpected request: ${url}`);
    });

    await plugin.onload(); // fires the "startup" trigger, fire-and-forget
    await vi.waitFor(() => expect(loginAttempts).toBe(1));

    // Several more triggers -- including both deliberate-user-action kinds
    // -- arrive while the startup cycle is stuck logging in.
    const manualPromise = plugin.syncFreshRssNow();
    const retryPromise = plugin.retryFreshRssSync();
    const timerPromise = plugin.syncFreshRssNow();
    await flushMicrotasks();

    // Still only the one active cycle -- no concurrent second cycle started.
    expect(loginAttempts).toBe(1);

    loginGate.resolve(mockRequestUrlResponse("Auth=opaque-session"));
    await Promise.all([manualPromise, retryPromise, timerPromise]);

    // Exactly one trailing cycle serviced every coalesced trigger, not three.
    expect(loginAttempts).toBe(2);
    void requestUrl;
  });

  it("stops the FreshRSS timer and prevents a late in-flight automatic cycle from committing after unload", async () => {
    const { plugin } = await createReadyPlugin({ automaticSyncEnabled: true });
    const loginGate = deferred<RequestUrlResponse>();
    const requestUrl = vi.spyOn(obsidian, "requestUrl").mockImplementation(async (request) => {
      const url = requestUrlOf(request);
      if (url.includes("/accounts/ClientLogin")) return loginGate.promise;
      if (url.includes("/subscription/list")) {
        return mockRequestUrlResponse(JSON.stringify({ subscriptions: [] }));
      }
      if (url.includes("/tag/list")) return mockRequestUrlResponse(JSON.stringify({ tags: [] }));
      throw new Error(`Unexpected request: ${url}`);
    });

    await plugin.onload();
    await vi.waitFor(() => expect(loginCallCount(requestUrl)).toBe(1));

    plugin.onunload();
    loginGate.resolve(mockRequestUrlResponse("Auth=opaque-session"));
    await flushMicrotasks(30);

    // The cancelled cycle must never reach the subscription-list phase: the
    // shared lease cut it short at the first ownership check after unload.
    expect(
      requestUrl.mock.calls.some((call) => requestUrlOf(call[0]).includes("/subscription/list")),
    ).toBe(false);
    // Connection status must not have been mutated by the late result either.
    expect(plugin.settings.freshRss.status).toBe("connected");

    const callsRightAfterUnload = requestUrl.mock.calls.length;
    await flushMicrotasks(30);
    // No further attempts: the timer was stopped, and nothing rearmed it.
    expect(requestUrl.mock.calls.length).toBe(callsRightAfterUnload);
  });

  it("keeps automatic success silent but always reports one summary notice for a manual sync", async () => {
    const { plugin } = await createReadyPlugin({ automaticSyncEnabled: true });
    vi.spyOn(obsidian, "requestUrl").mockImplementation(cleanResponder());
    const noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    await plugin.onload();
    await vi.waitFor(() => {
      expect(getNoticeMessages(noticeSpy).length).toBe(0);
    });
    // Give the fire-and-forget startup cycle a further beat to make sure a
    // notice really never arrives, not just hasn't arrived yet.
    await flushMicrotasks();
    expect(getNoticeMessages(noticeSpy)).toEqual([]);

    await plugin.syncFreshRssNow();
    expect(
      getNoticeMessages(noticeSpy).some((message) => message.includes("FreshRSS sync completed")),
    ).toBe(true);
  });
});

describe("FreshRSS automatic sync scheduling (fake timers)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
    vi.useFakeTimers();
  });

  it("rearms the configured interval, counting from a successful cycle's completion", async () => {
    const { plugin } = await createReadyPlugin({
      automaticSyncEnabled: true,
      automaticSyncIntervalMinutes: 3,
    });
    const requestUrl = vi.spyOn(obsidian, "requestUrl").mockImplementation(cleanResponder());

    await plugin.onload();
    await vi.advanceTimersByTimeAsync(0);
    expect(loginCallCount(requestUrl)).toBe(1);

    await vi.advanceTimersByTimeAsync(3 * 60 * 1000 - 1000);
    expect(loginCallCount(requestUrl)).toBe(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(loginCallCount(requestUrl)).toBe(2);
  });

  it("rearms from the coordinator's backoff deadline (not the configured interval) after an exhausted transient failure", async () => {
    const { plugin } = await createReadyPlugin({
      automaticSyncEnabled: true,
      // Deliberately much longer than the 5-minute initial backoff so the
      // two rearm sources are unambiguous.
      automaticSyncIntervalMinutes: 30,
    });
    const requestUrl = vi.spyOn(obsidian, "requestUrl").mockImplementation(async (request) => {
      const url = requestUrlOf(request);
      if (url.includes("/accounts/ClientLogin")) return mockRequestUrlResponse("Auth=opaque-session");
      if (url.includes("/subscription/list")) {
        // Retryable server error on every attempt: the in-cycle retry
        // decorator exhausts three attempts before the coordinator reports
        // "server-unavailable" and persists a 5-minute backoff.
        return mockRequestUrlResponse("", 503);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await plugin.onload();
    // Drain the in-cycle retry sequence (1s, 2s, 4s plus bounded jitter).
    await vi.advanceTimersByTimeAsync(10_000);
    expect(loginCallCount(requestUrl)).toBe(1);

    await vi.advanceTimersByTimeAsync(4 * 60 * 1000 + 50_000);
    expect(loginCallCount(requestUrl)).toBe(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(loginCallCount(requestUrl)).toBe(2);
  });

  it("does not rearm at all after an authentication rejection -- no retry loop, waits for repair or explicit retry", async () => {
    const { plugin } = await createReadyPlugin({
      automaticSyncEnabled: true,
      automaticSyncIntervalMinutes: 1,
    });
    const requestUrl = vi.spyOn(obsidian, "requestUrl").mockImplementation(async (request) => {
      const url = requestUrlOf(request);
      if (url.includes("/accounts/ClientLogin")) return mockRequestUrlResponse("", 403);
      throw new Error(`Unexpected request: ${url}`);
    });

    await plugin.onload();
    await vi.advanceTimersByTimeAsync(0);
    // One initial attempt plus the one built-in reauthentication retry.
    expect(loginCallCount(requestUrl)).toBe(2);

    // Well past what the configured 1-minute interval would have rearmed at.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(loginCallCount(requestUrl)).toBe(2);
    expect(plugin.settings.freshRss.status).toBe("credentials-rejected");
  });
});
