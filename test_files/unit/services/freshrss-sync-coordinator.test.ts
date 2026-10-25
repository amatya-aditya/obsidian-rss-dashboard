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
import { queueFreshRssArticleStateChanges } from "../../../src/services/freshrss-article-state";
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
  responses.splice(1, 0, {
    status: 200,
    text: JSON.stringify({ userId: scope.remoteUserId }),
  });
  const request = vi.fn<FreshRssHttpClient["request"]>(async ({ url }) => {
    if (url.endsWith("/tag/list?output=json")) {
      return { status: 200, text: JSON.stringify({ tags: [] }) };
    }
    if (
      url.includes("/stream/items/ids?") &&
      new URL(url).searchParams.get("s") === "user/-/state/com.google/starred"
    ) {
      return { status: 200, text: JSON.stringify({ itemRefs: [] }) };
    }
    return responses.shift() ?? { status: 500, text: "unexpected request" };
  });
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
    const sidecar = createSidecar();
    sidecar.pendingFacetMutations.push({
      operationId: "operation-read-1",
      remoteArticleId: "article/42",
      facet: "read",
      desiredState: true,
      createdAtMs: 100,
      attemptCount: 0,
      lastError: null,
    });
    sidecar.pendingFacetMutations.push(
      {
        operationId: "operation-starred-1",
        remoteArticleId: "article/42",
        facet: "starred",
        desiredState: true,
        createdAtMs: 101,
        attemptCount: 0,
        lastError: null,
      },
      {
        operationId: "operation-labels-1",
        remoteArticleId: "article/42",
        facet: "labels",
        desiredState: ["News"],
        createdAtMs: 102,
        attemptCount: 0,
        lastError: null,
      },
    );
    const read = vi.fn(async () => sidecar);
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
    expect(sidecar.pendingFacetMutations).toMatchObject([
      { operationId: "operation-read-1", desiredState: true },
      {
        operationId: "operation-starred-1",
        facet: "starred",
        desiredState: true,
      },
      {
        operationId: "operation-labels-1",
        facet: "labels",
        desiredState: ["News"],
      },
    ]);
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
    expect(request).toHaveBeenCalledTimes(5);
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
      { status: 200, text: JSON.stringify({ itemRefs: [] }) },
      { status: 200, text: JSON.stringify({ itemRefs: [] }) },
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

    expect(request).toHaveBeenCalledTimes(9);
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
          return { status: 200, text: JSON.stringify({ tags: [] }) };
        if (requestCount === 4)
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

  it("keeps pending read state when cancellation follows an in-flight mutation", async () => {
    const settings = makeSettings();
    const sidecar = createSidecar();
    sidecar.pendingFacetMutations.push({
      operationId: "operation-read-1",
      remoteArticleId: "article/42",
      facet: "read",
      desiredState: true,
      createdAtMs: 100,
      attemptCount: 0,
      lastError: null,
    });
    const controller = new AbortController();
    const request = vi.fn<FreshRssHttpClient["request"]>(async ({ url }) => {
      if (url.endsWith("/accounts/ClientLogin"))
        return { status: 200, text: "Auth=session-token" };
      if (url.includes("/user-info?"))
        return {
          status: 200,
          text: JSON.stringify({ userId: scope.remoteUserId }),
        };
      if (url.endsWith("/tag/list?output=json"))
        return { status: 200, text: JSON.stringify({ tags: [] }) };
      if (url.endsWith("/token")) return { status: 200, text: "write-token" };
      if (url.endsWith("/edit-tag")) {
        controller.abort();
        return { status: 200, text: "OK" };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const httpClient: FreshRssHttpClient = { request };
    const write = vi.fn(async (next: FreshRssSidecarFile) => {
      Object.assign(sidecar, next);
    });
    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings: async () => {},
      sidecarRepository: {
        read: async () => sidecar,
        write,
      },
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

    expect(sidecar.pendingFacetMutations).toMatchObject([
      {
        operationId: "operation-read-1",
        desiredState: true,
      },
    ]);
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

  it("flushes durable read changes before importing read state for bound articles", async () => {
    const settings = makeSettings();
    settings.freshRss.stateSyncMode = "receive-only";
    settings.freshRss.endpoint = endpoint;
    settings.feeds = [
      {
        feedId: "local-feed",
        title: "Feed",
        url: "https://feed.example.test/rss.xml",
        folder: "RSS",
        lastUpdated: 10,
        items: [
          {
            title: "Article",
            link: "https://article.example.test/42",
            description: "",
            pubDate: "2026-10-24T00:00:00.000Z",
            guid: "article/42",
            read: false,
            feedTitle: "Feed",
            feedUrl: "https://feed.example.test/rss.xml",
            coverImage: "",
          },
        ],
      },
    ];
    const sidecar = createSidecar();
    sidecar.articleBindings.push({
      feedId: "local-feed",
      guid: "article/42",
      remoteArticleId: "article/42",
    });
    const sidecarRepository = {
      readActiveScope: async () => scope,
      read: async () => sidecar,
      write: async (next: FreshRssSidecarFile) => {
        Object.assign(sidecar, next);
      },
    };
    await queueFreshRssArticleStateChanges({
      settings,
      changes: [
        {
          feedUrl: "https://feed.example.test/rss.xml",
          guid: "article/42",
          changes: { read: true },
        },
      ],
      sidecarRepository,
    });
    expect(sidecar.pendingFacetMutations).toHaveLength(1);
    settings.freshRss.stateSyncMode = "two-way";
    const { request, httpClient } = createClient([
      { status: 200, text: "Auth=session-token" },
      { status: 200, text: "write-token" },
      { status: 200, text: "OK" },
      { status: 200, text: subscriptionList() },
      { status: 200, text: JSON.stringify({ itemRefs: [] }) },
      {
        status: 200,
        text: JSON.stringify({ itemRefs: [{ id: "article/42" }] }),
      },
      { status: 200, text: JSON.stringify({ itemRefs: [] }) },
    ]);
    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings: async () => {},
      sidecarRepository,
      getView: async () => null,
    });

    const syncOutcome = await coordinator.run({
      endpoint,
      credentials: { username: "reader", apiPassword: "secret" },
      scope,
      owner: createOwner(),
    });
    expect(syncOutcome).toMatchObject({ outcome: "synced", partial: false });

    expect(request).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        url: `${endpoint}/reader/api/0/edit-tag`,
        body: expect.stringContaining("i=article%2F42"),
      }),
    );
    expect(settings.feeds[0]?.items[0]?.read).toBe(true);
    expect(sidecar.pendingFacetMutations).toEqual([]);
  });

  it("keeps read state local and pending mutations untouched in Receive-only mode", async () => {
    const settings = makeSettings();
    settings.freshRss.stateSyncMode = "receive-only";
    settings.feeds = [
      {
        feedId: "local-feed",
        title: "Feed",
        url: "https://feed.example.test/rss.xml",
        folder: "RSS",
        lastUpdated: 10,
        items: [],
      },
    ];
    const sidecar = createSidecar();
    sidecar.pendingFacetMutations.push({
      operationId: "operation-read-1",
      remoteArticleId: "article/42",
      facet: "read",
      desiredState: false,
      createdAtMs: 100,
      attemptCount: 0,
      lastError: null,
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
              title: "Remote read article",
              categories: ["user/-/state/com.google/read"],
            },
          ],
        }),
      },
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

    const syncOutcome = await coordinator.run({
      endpoint,
      credentials: { username: "reader", apiPassword: "secret" },
      scope,
      owner: createOwner(),
    });
    expect(syncOutcome).toMatchObject({ outcome: "synced" });

    expect(settings.feeds[0]?.items[0]?.read).toBe(false);
    expect(sidecar.pendingFacetMutations).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(5);
    expect(
      request.mock.calls.some(([input]) => input.url.endsWith("/token")),
    ).toBe(false);
  });

  it("reconciles duplicate and reordered normalized labels without changing local colors", async () => {
    const settings = makeSettings();
    settings.availableTags = [
      { name: "News", color: "#123456" },
      { name: "Later", color: "#abcdef" },
    ];
    settings.feeds = [
      {
        feedId: "local-feed",
        title: "Feed",
        url: "https://feed.example.test/rss.xml",
        folder: "RSS",
        lastUpdated: 10,
        items: [
          {
            title: "Article",
            link: "https://article.example.test/42",
            description: "",
            pubDate: "2026-10-24T00:00:00.000Z",
            guid: "article/42",
            read: false,
            starred: false,
            tags: [
              { name: "Later", color: "#abcdef" },
              { name: " news ", color: "#fedcba" },
            ],
            feedTitle: "Feed",
            feedUrl: "https://feed.example.test/rss.xml",
            coverImage: "",
          },
        ],
      },
    ];
    const sidecar = createSidecar();
    sidecar.feedBindings.push({
      feedId: "local-feed",
      remoteSubscriptionId: "feed/6",
    });
    sidecar.articleBindings.push({
      feedId: "local-feed",
      guid: "article/42",
      remoteArticleId: "article/42",
    });
    const request = vi.fn<FreshRssHttpClient["request"]>(async ({ url }) => {
      if (url.endsWith("/accounts/ClientLogin"))
        return { status: 200, text: "Auth=session-token" };
      if (url.includes("/user-info?"))
        return {
          status: 200,
          text: JSON.stringify({ userId: scope.remoteUserId }),
        };
      if (url.endsWith("/tag/list?output=json"))
        return {
          status: 200,
          text: JSON.stringify({
            tags: [
              { id: "user/-/label/news", label: "news" },
              { id: "user/-/label/News", label: " News " },
              { id: "user/-/label/Later", label: "Later" },
            ],
          }),
        };
      if (url.endsWith("/subscription/list?output=json"))
        return { status: 200, text: subscriptionList() };
      if (url.includes("/stream/items/ids?")) {
        const streamId = new URL(url).searchParams.get("s");
        if (streamId === "user/-/label/news")
          return {
            status: 200,
            text: JSON.stringify({ itemRefs: [{ id: "article/42" }] }),
          };
        if (streamId === "user/-/label/Later")
          return {
            status: 200,
            text: JSON.stringify({ itemRefs: [{ id: "article/42" }] }),
          };
        return { status: 200, text: JSON.stringify({ itemRefs: [] }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const saveSettings = vi.fn(async () => {});
    const coordinator = new FreshRssSyncCoordinator({
      httpClient: { request },
      getSettings: () => settings,
      saveSettings,
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
    ).resolves.toMatchObject({ outcome: "synced", partial: false });

    expect(settings.feeds[0]?.items[0]?.tags).toEqual([
      { name: "Later", color: "#abcdef" },
      { name: " news ", color: "#fedcba" },
    ]);
    expect(settings.availableTags).toEqual([
      { name: "News", color: "#123456" },
      { name: "Later", color: "#abcdef" },
    ]);
    expect(sidecar.labelMappings).toEqual([
      { remoteLabelId: "label/1", localTagName: "Keep" },
      { remoteLabelId: "user/-/label/news", localTagName: "News" },
      { remoteLabelId: "user/-/label/News", localTagName: "News" },
      { remoteLabelId: "user/-/label/Later", localTagName: "Later" },
    ]);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("does not read or write starred and label state in Receive-only mode", async () => {
    const settings = makeSettings();
    settings.freshRss.endpoint = endpoint;
    settings.freshRss.stateSyncMode = "receive-only";
    settings.feeds = [
      {
        feedId: "local-feed",
        title: "Feed",
        url: "https://feed.example.test/rss.xml",
        folder: "RSS",
        lastUpdated: 10,
        items: [
          {
            title: "Article",
            link: "https://article.example.test/42",
            description: "",
            pubDate: "2026-10-24T00:00:00.000Z",
            guid: "article/42",
            read: false,
            starred: true,
            tags: [{ name: "Local", color: "#123456" }],
            feedTitle: "Feed",
            feedUrl: "https://feed.example.test/rss.xml",
            coverImage: "",
          },
        ],
      },
    ];
    const sidecar = createSidecar();
    sidecar.feedBindings.push({
      feedId: "local-feed",
      remoteSubscriptionId: "feed/6",
    });
    sidecar.articleBindings.push({
      feedId: "local-feed",
      guid: "article/42",
      remoteArticleId: "article/42",
    });
    sidecar.pendingFacetMutations.push(
      {
        operationId: "operation-starred-local",
        remoteArticleId: "article/42",
        facet: "starred",
        desiredState: true,
        createdAtMs: 100,
        attemptCount: 0,
        lastError: null,
      },
      {
        operationId: "operation-label-local",
        remoteArticleId: "article/42",
        facet: "labels",
        desiredState: ["Local"],
        createdAtMs: 101,
        attemptCount: 0,
        lastError: null,
      },
    );
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
    ).resolves.toMatchObject({ outcome: "synced" });

    expect(settings.feeds[0]?.items[0]).toMatchObject({
      starred: true,
      tags: [{ name: "Local", color: "#123456" }],
    });
    expect(sidecar.pendingFacetMutations).toHaveLength(2);
    expect(
      request.mock.calls.some(([input]) => {
        const url = new URL(input.url);
        return (
          url.pathname.endsWith("/tag/list") ||
          url.pathname.endsWith("/token") ||
          url.pathname.endsWith("/edit-tag") ||
          (url.pathname.endsWith("/stream/items/ids") &&
            url.searchParams.get("s")?.startsWith("user/-/"))
        );
      }),
    ).toBe(false);
  });

  it("retains Receive-only star and label changes through a failed write and sends them after re-enable", async () => {
    const settings = makeSettings();
    settings.freshRss.endpoint = endpoint;
    settings.freshRss.stateSyncMode = "receive-only";
    settings.availableTags = [{ name: "News", color: "#123456" }];
    settings.feeds = [
      {
        feedId: "local-feed",
        title: "Feed",
        url: "https://feed.example.test/rss.xml",
        folder: "RSS",
        lastUpdated: 10,
        items: [
          {
            title: "Article",
            link: "https://article.example.test/42",
            description: "",
            pubDate: "2026-10-24T00:00:00.000Z",
            guid: "article/42",
            read: false,
            starred: true,
            tags: [{ name: "News", color: "#123456" }],
            feedTitle: "Feed",
            feedUrl: "https://feed.example.test/rss.xml",
            coverImage: "",
          },
        ],
      },
    ];
    const sidecar = createSidecar();
    sidecar.feedBindings.push({
      feedId: "local-feed",
      remoteSubscriptionId: "feed/6",
    });
    sidecar.articleBindings.push({
      feedId: "local-feed",
      guid: "article/42",
      remoteArticleId: "article/42",
    });
    sidecar.pendingFacetMutations.push(
      {
        operationId: "operation-starred-receive-only",
        remoteArticleId: "article/42",
        facet: "starred",
        desiredState: true,
        createdAtMs: 100,
        attemptCount: 0,
        lastError: null,
      },
      {
        operationId: "operation-labels-receive-only",
        remoteArticleId: "article/42",
        facet: "labels",
        desiredState: ["News"],
        createdAtMs: 101,
        attemptCount: 0,
        lastError: null,
      },
    );
    const sidecarRepository = {
      read: async () => sidecar,
      write: async (next: FreshRssSidecarFile) => {
        Object.assign(sidecar, next);
      },
    };
    const receiveOnlyClient = createClient([
      { status: 200, text: "Auth=session-token" },
      { status: 200, text: subscriptionList() },
      { status: 200, text: JSON.stringify({ itemRefs: [] }) },
    ]);
    const coordinator = new FreshRssSyncCoordinator({
      httpClient: receiveOnlyClient.httpClient,
      getSettings: () => settings,
      saveSettings: async () => {},
      sidecarRepository,
      getView: async () => null,
    });

    await expect(
      coordinator.run({
        endpoint,
        credentials: { username: "reader", apiPassword: "secret" },
        scope,
        owner: createOwner(),
      }),
    ).resolves.toMatchObject({ outcome: "synced" });
    expect(sidecar.pendingFacetMutations).toHaveLength(2);

    settings.freshRss.stateSyncMode = "two-way";
    let rejectNextWrite = true;
    const writeRequest = vi.fn<FreshRssHttpClient["request"]>(
      async ({ url }) => {
        if (url.endsWith("/accounts/ClientLogin"))
          return { status: 200, text: "Auth=session-token" };
        if (url.includes("/user-info?"))
          return {
            status: 200,
            text: JSON.stringify({ userId: scope.remoteUserId }),
          };
        if (url.endsWith("/tag/list?output=json"))
          return {
            status: 200,
            text: JSON.stringify({
              tags: [{ id: "user/-/label/News", label: "News" }],
            }),
          };
        if (url.endsWith("/token")) return { status: 200, text: "write-token" };
        if (url.endsWith("/edit-tag")) {
          if (rejectNextWrite) {
            rejectNextWrite = false;
            return { status: 503, text: "temporary failure" };
          }
          return { status: 200, text: "OK" };
        }
        if (url.endsWith("/subscription/list?output=json"))
          return { status: 200, text: subscriptionList() };
        if (url.includes("/stream/items/ids?")) {
          const streamId = new URL(url).searchParams.get("s");
          if (
            streamId === "user/-/state/com.google/starred" ||
            streamId === "user/-/label/News"
          ) {
            return {
              status: 200,
              text: JSON.stringify({ itemRefs: [{ id: "article/42" }] }),
            };
          }
          return { status: 200, text: JSON.stringify({ itemRefs: [] }) };
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    const writeCoordinator = new FreshRssSyncCoordinator({
      httpClient: { request: writeRequest },
      getSettings: () => settings,
      saveSettings: async () => {},
      sidecarRepository,
      getView: async () => null,
    });

    await expect(
      writeCoordinator.run({
        endpoint,
        credentials: { username: "reader", apiPassword: "secret" },
        scope,
        owner: createOwner(),
      }),
    ).resolves.toEqual({ outcome: "server-unavailable" });
    expect(sidecar.pendingFacetMutations).toHaveLength(2);
    expect(sidecar.pendingFacetMutations[0]).toMatchObject({ attemptCount: 1 });

    await expect(
      writeCoordinator.run({
        endpoint,
        credentials: { username: "reader", apiPassword: "secret" },
        scope,
        owner: createOwner(),
      }),
    ).resolves.toMatchObject({ outcome: "synced", partial: false });
    expect(sidecar.pendingFacetMutations).toEqual([]);
    const mutationBodies = writeRequest.mock.calls
      .filter(([input]) => input.url.endsWith("/edit-tag"))
      .map(([input]) => input.body ?? "");
    expect(mutationBodies[1]).toContain(
      "a=user%2F-%2Fstate%2Fcom.google%2Fstarred",
    );
    expect(mutationBodies[2]).toContain("a=user%2F-%2Flabel%2FNews");
  });

  it("keeps a local read choice made during the inbound pull over remote state", async () => {
    const settings = makeSettings();
    settings.feeds = [
      {
        feedId: "local-feed",
        title: "Feed",
        url: "https://feed.example.test/rss.xml",
        folder: "RSS",
        lastUpdated: 10,
        items: [
          {
            title: "Article",
            link: "https://article.example.test/42",
            description: "",
            pubDate: "2026-10-24T00:00:00.000Z",
            guid: "article/42",
            read: false,
            feedTitle: "Feed",
            feedUrl: "https://feed.example.test/rss.xml",
            coverImage: "",
          },
        ],
      },
    ];
    const sidecar = createSidecar();
    sidecar.feedBindings.push({
      feedId: "local-feed",
      remoteSubscriptionId: "feed/6",
    });
    sidecar.articleBindings.push({
      feedId: "local-feed",
      guid: "article/42",
      remoteArticleId: "article/42",
    });
    const request = vi.fn<FreshRssHttpClient["request"]>(async ({ url }) => {
      if (url.endsWith("/accounts/ClientLogin"))
        return { status: 200, text: "Auth=session-token" };
      if (url.includes("/user-info?"))
        return {
          status: 200,
          text: JSON.stringify({ userId: scope.remoteUserId }),
        };
      if (url.endsWith("/tag/list?output=json"))
        return { status: 200, text: JSON.stringify({ tags: [] }) };
      if (url.endsWith("/subscription/list?output=json"))
        return { status: 200, text: subscriptionList() };
      if (url.includes("/stream/items/ids?")) {
        const query = new URL(url).searchParams;
        if (query.get("s") === "user/-/state/com.google/read") {
          settings.feeds[0].items[0].read = true;
          sidecar.pendingFacetMutations.push({
            operationId: "operation-read-during-pull",
            remoteArticleId: "article/42",
            facet: "read",
            desiredState: true,
            createdAtMs: 200,
            attemptCount: 0,
            lastError: null,
          });
          return {
            status: 200,
            text: JSON.stringify({ itemRefs: [{ id: "article/42" }] }),
          };
        }
        return { status: 200, text: JSON.stringify({ itemRefs: [] }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const httpClient: FreshRssHttpClient = { request };
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
    ).resolves.toMatchObject({ outcome: "synced" });

    expect(request.mock.calls.map(([input]) => input.url).join("\n")).toContain(
      "s=user%2F-%2Fstate%2Fcom.google%2Fread",
    );
    expect(sidecar.pendingFacetMutations).toMatchObject([
      {
        operationId: "operation-read-during-pull",
        desiredState: true,
      },
    ]);
    expect(settings.feeds[0]?.items[0]?.read).toBe(true);
  });

  it("reconciles bound read state from paged FreshRSS ID streams", async () => {
    const settings = makeSettings();
    settings.feeds = [
      {
        feedId: "local-feed",
        title: "Feed",
        url: "https://feed.example.test/rss.xml",
        folder: "RSS",
        lastUpdated: 10,
        items: [
          {
            title: "Read remotely",
            link: "https://article.example.test/42",
            description: "",
            pubDate: "2026-10-24T00:00:00.000Z",
            guid: "article/42",
            read: false,
            feedTitle: "Feed",
            feedUrl: "https://feed.example.test/rss.xml",
            coverImage: "",
          },
          {
            title: "Unread remotely",
            link: "https://article.example.test/43",
            description: "",
            pubDate: "2026-10-24T00:00:00.000Z",
            guid: "article/43",
            read: true,
            feedTitle: "Feed",
            feedUrl: "https://feed.example.test/rss.xml",
            coverImage: "",
          },
        ],
      },
    ];
    const sidecar = createSidecar();
    sidecar.articleBindings.push(
      {
        feedId: "local-feed",
        guid: "article/42",
        remoteArticleId: "article/42",
      },
      {
        feedId: "local-feed",
        guid: "article/43",
        remoteArticleId: "article/43",
      },
    );
    const statePageCalls: URL[] = [];
    const request = vi.fn<FreshRssHttpClient["request"]>(async ({ url }) => {
      if (url.endsWith("/accounts/ClientLogin"))
        return { status: 200, text: "Auth=session-token" };
      if (url.includes("/user-info?"))
        return {
          status: 200,
          text: JSON.stringify({ userId: scope.remoteUserId }),
        };
      if (url.endsWith("/tag/list?output=json"))
        return { status: 200, text: JSON.stringify({ tags: [] }) };
      if (url.endsWith("/subscription/list?output=json"))
        return { status: 200, text: subscriptionList() };
      if (url.includes("/stream/items/ids?")) {
        const requestUrl = new URL(url);
        const streamId = requestUrl.searchParams.get("s");
        if (streamId === "user/-/state/com.google/unread") {
          return {
            status: 200,
            text: JSON.stringify({ itemRefs: [{ id: "article/43" }] }),
          };
        }
        if (streamId !== "user/-/state/com.google/read") {
          return { status: 200, text: JSON.stringify({ itemRefs: [] }) };
        }
        statePageCalls.push(requestUrl);
        if (requestUrl.searchParams.get("c") === null) {
          return {
            status: 200,
            text: JSON.stringify({
              itemRefs: [{ id: "article/42" }],
              continuation: "12345",
            }),
          };
        }
        return {
          status: 200,
          text: JSON.stringify({ itemRefs: [{ id: "article/other" }] }),
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const coordinator = new FreshRssSyncCoordinator({
      httpClient: { request },
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
    ).resolves.toMatchObject({ outcome: "synced", partial: false });

    expect(statePageCalls).toHaveLength(2);
    expect(statePageCalls[0]?.searchParams.get("n")).toBe("1000");
    expect(statePageCalls[0]?.searchParams.get("c")).toBeNull();
    expect(statePageCalls[1]?.searchParams.get("c")).toBe("12345");
    expect(
      request.mock.calls.some(([input]) =>
        input.url.endsWith("/stream/items/contents"),
      ),
    ).toBe(false);
    expect(settings.feeds[0]?.items.map((item) => item.read)).toEqual([
      true,
      false,
    ]);
    expect(sidecar.checkpoints).toMatchObject([
      { remoteSubscriptionId: "feed/6" },
    ]);
  });

  it("does not clear absent read state or advance checkpoints at the ID scan cap", async () => {
    const settings = makeSettings();
    settings.feeds = [
      {
        feedId: "local-feed",
        title: "Feed",
        url: "https://feed.example.test/rss.xml",
        folder: "RSS",
        lastUpdated: 10,
        items: [
          {
            title: "Unknown beyond cap",
            link: "https://article.example.test/42",
            description: "",
            pubDate: "2026-10-24T00:00:00.000Z",
            guid: "article/42",
            read: true,
            feedTitle: "Feed",
            feedUrl: "https://feed.example.test/rss.xml",
            coverImage: "",
          },
        ],
      },
    ];
    const sidecar = createSidecar();
    sidecar.articleBindings.push({
      feedId: "local-feed",
      guid: "article/42",
      remoteArticleId: "article/42",
    });
    sidecar.checkpoints.push({
      remoteSubscriptionId: "feed/6",
      completedAtMs: 100,
    });
    let statePageCalls = 0;
    const request = vi.fn<FreshRssHttpClient["request"]>(async ({ url }) => {
      if (url.endsWith("/accounts/ClientLogin"))
        return { status: 200, text: "Auth=session-token" };
      if (url.includes("/user-info?"))
        return {
          status: 200,
          text: JSON.stringify({ userId: scope.remoteUserId }),
        };
      if (url.endsWith("/tag/list?output=json"))
        return { status: 200, text: JSON.stringify({ tags: [] }) };
      if (url.endsWith("/subscription/list?output=json"))
        return { status: 200, text: subscriptionList() };
      if (url.includes("/stream/items/ids?")) {
        const requestUrl = new URL(url);
        if (
          requestUrl.searchParams.get("s") !== "user/-/state/com.google/read"
        ) {
          return { status: 200, text: JSON.stringify({ itemRefs: [] }) };
        }
        statePageCalls++;
        const itemRefs = Array.from({ length: 1000 }, (_, index) => ({
          id: `remote-${statePageCalls}-${index}`,
        }));
        return {
          status: 200,
          text: JSON.stringify({
            itemRefs,
            continuation: `cursor-${statePageCalls}`,
          }),
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const coordinator = new FreshRssSyncCoordinator({
      httpClient: { request },
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
    ).resolves.toMatchObject({ outcome: "synced", partial: true });

    expect(statePageCalls).toBe(25);
    expect(settings.feeds[0]?.items[0]?.read).toBe(true);
    expect(sidecar.checkpoints).toEqual([
      { remoteSubscriptionId: "feed/6", completedAtMs: 100 },
    ]);
  });

  it("keeps the prior checkpoint when a remote read-state page fails", async () => {
    const settings = makeSettings();
    settings.feeds = [
      {
        feedId: "local-feed",
        title: "Feed",
        url: "https://feed.example.test/rss.xml",
        folder: "RSS",
        lastUpdated: 10,
        items: [
          {
            title: "Keep local read state until the scan completes",
            link: "https://article.example.test/42",
            description: "",
            pubDate: "2026-10-24T00:00:00.000Z",
            guid: "article/42",
            read: true,
            feedTitle: "Feed",
            feedUrl: "https://feed.example.test/rss.xml",
            coverImage: "",
          },
        ],
      },
    ];
    const sidecar = createSidecar();
    sidecar.articleBindings.push({
      feedId: "local-feed",
      guid: "article/42",
      remoteArticleId: "article/42",
    });
    sidecar.checkpoints.push({
      remoteSubscriptionId: "feed/6",
      completedAtMs: 100,
    });
    const { httpClient } = createClient([
      { status: 200, text: "Auth=session-token" },
      { status: 200, text: subscriptionList() },
      { status: 200, text: JSON.stringify({ itemRefs: [] }) },
      {
        status: 200,
        text: JSON.stringify({ itemRefs: [], continuation: "12345" }),
      },
      { status: 503, text: "temporary failure" },
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
    ).resolves.toMatchObject({ outcome: "synced", partial: true });

    expect(settings.feeds[0]?.items[0]?.read).toBe(true);
    expect(sidecar.checkpoints).toEqual([
      { remoteSubscriptionId: "feed/6", completedAtMs: 100 },
    ]);
  });

  it("does not drop a newer local read choice during an older acknowledgement", async () => {
    const settings = makeSettings();
    settings.freshRss.endpoint = endpoint;
    settings.feeds = [
      {
        feedId: "local-feed",
        title: "Feed",
        url: "https://feed.example.test/rss.xml",
        folder: "RSS",
        lastUpdated: 10,
        items: [
          {
            title: "Article",
            link: "https://article.example.test/42",
            description: "",
            pubDate: "2026-10-24T00:00:00.000Z",
            guid: "article/42",
            read: true,
            feedTitle: "Feed",
            feedUrl: "https://feed.example.test/rss.xml",
            coverImage: "",
          },
        ],
      },
    ];
    const sidecar = createSidecar();
    sidecar.feedBindings.push({
      feedId: "local-feed",
      remoteSubscriptionId: "feed/6",
    });
    sidecar.articleBindings.push({
      feedId: "local-feed",
      guid: "article/42",
      remoteArticleId: "article/42",
    });
    sidecar.pendingFacetMutations.push({
      operationId: "older-read-operation",
      remoteArticleId: "article/42",
      facet: "read",
      desiredState: true,
      createdAtMs: 100,
      attemptCount: 0,
      lastError: null,
    });

    let mutationAcknowledged = false;
    const request = vi.fn<FreshRssHttpClient["request"]>(async ({ url }) => {
      if (url.endsWith("/accounts/ClientLogin"))
        return { status: 200, text: "Auth=session-token" };
      if (url.includes("/user-info?"))
        return {
          status: 200,
          text: JSON.stringify({ userId: scope.remoteUserId }),
        };
      if (url.endsWith("/tag/list?output=json"))
        return { status: 200, text: JSON.stringify({ tags: [] }) };
      if (url.endsWith("/token")) return { status: 200, text: "write-token" };
      if (url.endsWith("/edit-tag")) {
        mutationAcknowledged = true;
        return { status: 200, text: "OK" };
      }
      if (url.endsWith("/tag/list?output=json"))
        return { status: 200, text: JSON.stringify({ tags: [] }) };
      if (url.endsWith("/subscription/list?output=json"))
        return { status: 200, text: subscriptionList() };
      if (url.includes("/stream/items/ids?"))
        return { status: 200, text: JSON.stringify({ itemRefs: [] }) };
      if (url.endsWith("/stream/items/contents"))
        return {
          status: 200,
          text: JSON.stringify({
            items: [
              {
                id: "article/42",
                categories: ["user/-/state/com.google/read"],
              },
            ],
          }),
        };
      throw new Error(`Unexpected request: ${url}`);
    });

    let signalAcknowledgementWriteStarted: (() => void) | undefined;
    const acknowledgementWriteStarted = new Promise<void>((resolve) => {
      signalAcknowledgementWriteStarted = resolve;
    });
    let releaseAcknowledgementWrite: (() => void) | undefined;
    const acknowledgementWriteGate = new Promise<void>((resolve) => {
      releaseAcknowledgementWrite = resolve;
    });
    let pausedAcknowledgementWrite = false;
    let sidecarRepository: {
      readActiveScope: () => Promise<FreshRssConnectionScope>;
      read: () => Promise<FreshRssSidecarFile>;
      write: (next: FreshRssSidecarFile) => Promise<void>;
    };
    sidecarRepository = {
      readActiveScope: async () => scope,
      read: async () => sidecar,
      write: async (next) => {
        if (mutationAcknowledged && !pausedAcknowledgementWrite) {
          pausedAcknowledgementWrite = true;
          signalAcknowledgementWriteStarted?.();
          await acknowledgementWriteGate;
        }
        Object.assign(sidecar, next);
      },
    };

    const coordinator = new FreshRssSyncCoordinator({
      httpClient: { request },
      getSettings: () => settings,
      saveSettings: async () => {},
      sidecarRepository,
      getView: async () => null,
    });

    const syncPromise = coordinator.run({
      endpoint,
      credentials: { username: "reader", apiPassword: "secret" },
      scope,
      owner: createOwner(),
    });
    await acknowledgementWriteStarted;
    settings.feeds[0].items[0].read = false;
    const newChoicePromise = queueFreshRssArticleStateChanges({
      settings,
      changes: [
        {
          feedUrl: "https://feed.example.test/rss.xml",
          guid: "article/42",
          changes: { read: false },
        },
      ],
      sidecarRepository,
    });
    releaseAcknowledgementWrite?.();
    await expect(syncPromise).resolves.toMatchObject({ outcome: "synced" });
    await newChoicePromise;

    expect(pausedAcknowledgementWrite).toBe(true);
    expect(sidecar.pendingFacetMutations).toMatchObject([
      { remoteArticleId: "article/42", desiredState: false },
    ]);
  });

  it("retains an unacknowledged read mutation after a FreshRSS write failure", async () => {
    const settings = makeSettings();
    const sidecar = createSidecar();
    sidecar.pendingFacetMutations.push({
      operationId: "operation-read-1",
      remoteArticleId: "article/42",
      facet: "read",
      desiredState: true,
      createdAtMs: 100,
      attemptCount: 0,
      lastError: null,
    });
    const { httpClient } = createClient([
      { status: 200, text: "Auth=session-token" },
      { status: 200, text: subscriptionList() },
      { status: 200, text: "write-token" },
      { status: 503, text: "unavailable" },
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
    ).resolves.toEqual({ outcome: "server-unavailable" });

    expect(sidecar.pendingFacetMutations).toMatchObject([
      {
        operationId: "operation-read-1",
        desiredState: true,
        attemptCount: 1,
      },
    ]);
    expect(settings.feeds).toEqual([]);
  });

  it("does not automatically replay a terminal FreshRSS read mutation", async () => {
    const settings = makeSettings();
    const sidecar = createSidecar();
    sidecar.pendingFacetMutations.push({
      operationId: "operation-read-terminal",
      remoteArticleId: "article/42",
      facet: "read",
      desiredState: true,
      createdAtMs: 100,
      attemptCount: 0,
      lastError: null,
    });
    const request = vi.fn<FreshRssHttpClient["request"]>(async ({ url }) => {
      if (url.endsWith("/accounts/ClientLogin"))
        return { status: 200, text: "Auth=session-token" };
      if (url.includes("/user-info?"))
        return {
          status: 200,
          text: JSON.stringify({ userId: scope.remoteUserId }),
        };
      if (url.endsWith("/tag/list?output=json"))
        return { status: 200, text: JSON.stringify({ tags: [] }) };
      if (url.endsWith("/token")) return { status: 200, text: "write-token" };
      if (url.endsWith("/edit-tag"))
        return { status: 422, text: "invalid article" };
      if (url.endsWith("/tag/list?output=json"))
        return { status: 200, text: JSON.stringify({ tags: [] }) };
      if (url.endsWith("/subscription/list?output=json"))
        return { status: 200, text: subscriptionList() };
      if (url.includes("/stream/items/ids?"))
        return { status: 200, text: JSON.stringify({ itemRefs: [] }) };
      throw new Error(`Unexpected request: ${url}`);
    });
    const coordinator = new FreshRssSyncCoordinator({
      httpClient: { request },
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
    ).resolves.toEqual({ outcome: "server-unavailable" });
    expect(sidecar.pendingFacetMutations).toMatchObject([
      {
        operationId: "operation-read-terminal",
        retryDisposition: "manual",
        lastError: expect.stringContaining("422"),
      },
    ]);

    await expect(
      coordinator.run({
        endpoint,
        credentials: { username: "reader", apiPassword: "secret" },
        scope,
        owner: createOwner(),
      }),
    ).resolves.toMatchObject({ outcome: "synced" });
    expect(
      request.mock.calls.filter(([input]) => input.url.endsWith("/edit-tag")),
    ).toHaveLength(1);
  });
});
