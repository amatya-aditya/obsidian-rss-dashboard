import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";
import type {
  FreshRssConnectionScope,
  FreshRssHttpClient,
} from "../../../src/services/freshrss-connection-service";
import type { FreshRssSidecarFile } from "../../../src/services/freshrss-connection-scope-repository";
import {
  FreshRssSyncCoordinator,
  type FreshRssSyncOwner,
} from "../../../src/services/freshrss-sync-coordinator";

const endpoint = "https://reader.example.test/greader.php";
const scope: FreshRssConnectionScope = {
  endpoint,
  remoteUserId: "remote-user",
};

function createSidecar(): FreshRssSidecarFile {
  return {
    version: 2,
    scope,
    pendingFacetMutations: [],
    feedBindings: [],
    articleBindings: [],
    checkpoints: [],
    labelMappings: [{ remoteLabelId: "label/1", localTagName: "Keep" }],
    syncHealth: { consecutiveTransientFailureCount: 0, backoffUntilMs: null },
  };
}

function createOwner(): FreshRssSyncOwner {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    beginCommit: () => {},
    throwIfInactive: () => {
      if (controller.signal.aborted) throw new Error("cancelled");
    },
  };
}

function createClient(responses: Array<{ status: number; text: string }>) {
  const request = vi.fn<FreshRssHttpClient["request"]>();
  responses.splice(1, 0, {
    status: 200,
    text: JSON.stringify({ userId: scope.remoteUserId }),
  });
  for (const response of responses) request.mockResolvedValueOnce(response);
  return { request, httpClient: { request } };
}

function subscriptionList(url = "https://feed.example.test/rss.xml"): string {
  return JSON.stringify({
    subscriptions: [
      {
        id: "feed/6",
        title: "Remote title",
        url,
        categories: [{ id: "label/remote", label: "Remote folder" }],
      },
    ],
  });
}

function makeSettings(): RssDashboardSettings {
  return structuredClone(DEFAULT_SETTINGS);
}

describe("FreshRSS sync coordinator", () => {
  it("does not sync or reuse sidecar state for a different authenticated account", async () => {
    const request = vi.fn<FreshRssHttpClient["request"]>(async (input) =>
      input.url.endsWith("/accounts/ClientLogin")
        ? { status: 200, text: "Auth=session-token" }
        : {
            status: 200,
            text: JSON.stringify({ userId: "different-user" }),
          },
    );
    const read = vi.fn(async () => createSidecar());
    const saveSettings = vi.fn(async () => {});
    const coordinator = new FreshRssSyncCoordinator({
      httpClient: { request },
      getSettings: makeSettings,
      saveSettings,
      sidecarRepository: { read, write: vi.fn(async () => {}) },
      getView: async () => null,
    });

    await expect(
      coordinator.run({
        endpoint,
        credentials: { username: "reader", apiPassword: "secret" },
        scope,
        owner: createOwner(),
      }),
    ).resolves.toEqual({ outcome: "scope-mismatch" });

    expect(request).toHaveBeenCalledTimes(2);
    expect(read).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("recreates a still-subscribed feed when its stored local binding is stale", async () => {
    const settings = makeSettings();
    const sidecar = createSidecar();
    sidecar.feedBindings.push({
      feedId: "deleted-local-feed",
      remoteSubscriptionId: "feed/6",
    });
    const { request, httpClient } = createClient([
      { status: 200, text: "Auth=session-token" },
      { status: 200, text: subscriptionList() },
      { status: 200, text: JSON.stringify({ itemRefs: [] }) },
    ]);
    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings: async () => {},
      sidecarRepository: {
        read: async () => sidecar,
        write: async (next) => {
          Object.assign(sidecar, next);
        },
      },
      getView: async () => null,
    });

    await expect(
      coordinator.run({
        endpoint,
        credentials: { username: "reader", apiPassword: "secret" },
        scope,
        owner: createOwner(),
      }),
    ).resolves.toMatchObject({ outcome: "synced", createdFeedCount: 1 });

    expect(settings.feeds).toHaveLength(1);
    expect(settings.feeds[0]?.url).toBe("https://feed.example.test/rss.xml");
    expect(sidecar.feedBindings).toEqual([
      { feedId: settings.feeds[0]?.feedId, remoteSubscriptionId: "feed/6" },
    ]);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("imports recent articles while keeping feed placement and retention local", async () => {
    const settings = makeSettings();
    settings.feeds = [
      {
        feedId: "local-feed",
        title: "My local title",
        url: "https://feed.example.test/rss.xml",
        folder: "My local folder",
        autoDeleteDuration: 3,
        maxItemsLimit: 7,
        excludeFromRefresh: false,
        lastUpdated: 10,
        items: [],
      },
      {
        feedId: "unrelated-local-feed",
        title: "Keep this feed",
        url: "https://local-only.example.test/rss.xml",
        folder: "Local folder",
        lastUpdated: 10,
        items: [],
      },
    ];
    const sidecar = createSidecar();
    const read = vi.fn(async () => sidecar);
    const write = vi.fn(async (next: FreshRssSidecarFile) => {
      Object.assign(sidecar, next);
    });
    const { request, httpClient } = createClient([
      { status: 200, text: "Auth=session-token" },
      { status: 200, text: subscriptionList() },
      {
        status: 200,
        text: JSON.stringify({ itemRefs: [{ id: "article/42" }] }),
      },
      {
        status: 200,
        text: JSON.stringify({
          items: [
            {
              id: "article/42",
              title: "New article",
              alternate: [{ href: "https://article.example.test/42" }],
              content: { content: "<p>Article body</p>" },
              published: Math.floor(Date.now() / 1000),
            },
          ],
        }),
      },
    ]);
    const saveSettings = vi.fn(async () => {});
    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings,
      sidecarRepository: { read, write },
      getView: async () => null,
    });

    await expect(
      coordinator.run({
        endpoint,
        credentials: { username: "reader", apiPassword: "secret" },
        scope,
        owner: createOwner(),
      }),
    ).resolves.toMatchObject({
      outcome: "synced",
      linkedFeedCount: 1,
      createdFeedCount: 0,
      importedArticleCount: 1,
      partial: false,
    });

    expect(request).toHaveBeenCalledTimes(5);
    expect(settings.feeds[0]).toMatchObject({
      feedId: "local-feed",
      title: "My local title",
      folder: "My local folder",
      autoDeleteDuration: 3,
      maxItemsLimit: 7,
      excludeFromRefresh: false,
    });
    expect(settings.feeds[0].items[0]).toMatchObject({
      guid: "article/42",
      link: "https://article.example.test/42",
      description: "<p>Article body</p>",
      feedTitle: "My local title",
    });
    expect(settings.feeds).toHaveLength(2);
    expect(sidecar.feedBindings).toEqual([
      { feedId: "local-feed", remoteSubscriptionId: "feed/6" },
    ]);
    expect(sidecar.articleBindings).toEqual([
      {
        feedId: "local-feed",
        guid: "article/42",
        remoteArticleId: "article/42",
      },
    ]);
    expect(sidecar.labelMappings).toEqual([
      { remoteLabelId: "label/1", localTagName: "Keep" },
    ]);
    expect(saveSettings).toHaveBeenCalledOnce();
  });

  it("does not persist local changes when FreshRSS rejects a request mid-cycle", async () => {
    const settings = makeSettings();
    settings.feeds = [];
    const sidecar = createSidecar();
    const write = vi.fn(async () => {});
    const { httpClient } = createClient([
      { status: 200, text: "Auth=session-token" },
      { status: 200, text: subscriptionList() },
      { status: 401, text: "" },
    ]);
    const saveSettings = vi.fn(async () => {});
    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings,
      sidecarRepository: { read: async () => sidecar, write },
      getView: async () => null,
    });

    await expect(
      coordinator.run({
        endpoint,
        credentials: { username: "reader", apiPassword: "secret" },
        scope,
        owner: createOwner(),
      }),
    ).resolves.toEqual({ outcome: "credentials-rejected" });

    expect(settings.feeds).toEqual([]);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("stops before persistence when the shared operation is cancelled", async () => {
    const settings = makeSettings();
    const sidecar = createSidecar();
    const controller = new AbortController();
    let requestCount = 0;
    const httpClient: FreshRssHttpClient = {
      request: vi.fn(async () => {
        requestCount++;
        if (requestCount === 1)
          return { status: 200, text: "Auth=session-token" };
        if (requestCount === 2)
          return {
            status: 200,
            text: JSON.stringify({ userId: scope.remoteUserId }),
          };
        if (requestCount === 3)
          return { status: 200, text: subscriptionList() };
        controller.abort();
        return {
          status: 200,
          text: JSON.stringify({ itemRefs: [{ id: "article/42" }] }),
        };
      }),
    };
    const saveSettings = vi.fn(async () => {});
    const write = vi.fn(async () => {});
    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings,
      sidecarRepository: { read: async () => sidecar, write },
      getView: async () => null,
    });

    await expect(
      coordinator.run({
        endpoint,
        credentials: { username: "reader", apiPassword: "secret" },
        scope,
        owner: {
          signal: controller.signal,
          beginCommit: () => {},
          throwIfInactive: () => {
            if (controller.signal.aborted) throw new Error("cancelled");
          },
        },
      }),
    ).rejects.toThrow("cancelled");

    expect(settings.feeds).toEqual([]);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("finishes durable writes if cancellation arrives after persistence begins", async () => {
    const settings = makeSettings();
    const sidecar = createSidecar();
    const controller = new AbortController();
    let finishSave: (() => void) | undefined;
    const saveSettings = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const write = vi.fn(async (next: FreshRssSidecarFile) => {
      Object.assign(sidecar, next);
    });
    const { httpClient } = createClient([
      { status: 200, text: "Auth=session-token" },
      { status: 200, text: subscriptionList() },
      { status: 200, text: JSON.stringify({ itemRefs: [] }) },
    ]);
    const beginCommit = vi.fn();
    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings,
      sidecarRepository: { read: async () => sidecar, write },
      getView: async () => null,
    });

    const run = coordinator.run({
      endpoint,
      credentials: { username: "reader", apiPassword: "secret" },
      scope,
      owner: {
        signal: controller.signal,
        beginCommit,
        throwIfInactive: () => {
          if (controller.signal.aborted) throw new Error("cancelled");
        },
      },
    });
    await vi.waitFor(() => expect(saveSettings).toHaveBeenCalledOnce());
    controller.abort();
    finishSave?.();

    await expect(run).resolves.toMatchObject({ outcome: "synced" });
    expect(beginCommit).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledOnce();
    expect(settings.feeds).toHaveLength(1);
  });

  it("creates feeds using local defaults and leaves absent remote subscriptions alone", async () => {
    const settings = makeSettings();
    settings.media.defaultRssFolder = "My RSS folder";
    settings.defaultAutoDeleteDuration = 21;
    settings.maxItems = 12;
    settings.feeds = [
      {
        feedId: "local-only",
        title: "Unsubscribed remotely",
        url: "https://still-local.example.test/rss.xml",
        folder: "Keep local placement",
        lastUpdated: 11,
        items: [],
      },
    ];
    const sidecar = createSidecar();
    const { httpClient } = createClient([
      { status: 200, text: "Auth=session-token" },
      { status: 200, text: subscriptionList("https://new.example.test/feed") },
      { status: 200, text: JSON.stringify({ itemRefs: [] }) },
    ]);
    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings: async () => {},
      sidecarRepository: {
        read: async () => sidecar,
        write: async (next) => {
          Object.assign(sidecar, next);
        },
      },
      getView: async () => null,
    });

    await expect(
      coordinator.run({
        endpoint,
        credentials: { username: "reader", apiPassword: "secret" },
        scope,
        owner: createOwner(),
      }),
    ).resolves.toMatchObject({ outcome: "synced", createdFeedCount: 1 });

    expect(settings.feeds[0]).toMatchObject({
      title: "Unsubscribed remotely",
      folder: "Keep local placement",
    });
    expect(settings.feeds[1]).toMatchObject({
      title: "Remote title",
      folder: "My RSS folder",
      autoDeleteDuration: 21,
      maxItemsLimit: 12,
      excludeFromRefresh: true,
    });
  });
});
