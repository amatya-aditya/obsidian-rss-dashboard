import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import {
  cancelFreshRssMutation,
  queueFreshRssArticleStateChanges,
  isFreshRssPendingFacetMutation,
  retryFreshRssMutation,
} from "../../../src/services/freshrss-article-state";
import {
  FreshRssConnectionScopeRepository,
  type FreshRssConnectionScopeStore,
  type FreshRssSidecarFile,
} from "../../../src/services/freshrss-connection-scope-repository";

const scope = {
  endpoint: "https://reader.example.test/api/greader.php",
  remoteUserId: "reader-user",
};

function createSidecar(): FreshRssSidecarFile {
  return {
    version: 2,
    scope,
    pendingFacetMutations: [],
    feedBindings: [{ feedId: "feed-local", remoteSubscriptionId: "feed/6" }],
    articleBindings: [
      {
        feedId: "feed-local",
        guid: "article-guid",
        remoteArticleId: "opaque-article/42",
      },
      {
        feedId: "feed-local",
        guid: "article-guid-2",
        remoteArticleId: "opaque-article/43",
      },
    ],
    checkpoints: [],
  };
}

describe("FreshRSS article state queue", () => {
  it("retries a terminal mutation durably without changing its desired state", async () => {
    const sidecar = createSidecar();
    sidecar.pendingFacetMutations.push({
      operationId: "retry-me",
      remoteArticleId: "opaque-article/42",
      facet: "read",
      desiredState: true,
      createdAtMs: 100,
      attemptCount: 2,
      retryDisposition: "manual",
      lastError: "rejected",
    });
    const repository = {
      readActiveScope: async () => scope,
      read: async () => sidecar,
      write: async (value: FreshRssSidecarFile) => {
        Object.assign(sidecar, value);
      },
    };

    await retryFreshRssMutation(repository, "retry-me");

    expect(sidecar.pendingFacetMutations).toMatchObject([
      {
        operationId: "retry-me",
        desiredState: true,
        attemptCount: 2,
        retryDisposition: "automatic",
        lastError: null,
      },
    ]);
  });

  it("cancels only one durable mutation in the active scope", async () => {
    const sidecar = createSidecar();
    sidecar.pendingFacetMutations.push(
      {
        operationId: "cancel-me",
        remoteArticleId: "opaque-article/42",
        facet: "read",
        desiredState: true,
        createdAtMs: 100,
        attemptCount: 2,
        retryDisposition: "manual",
        lastError: "rejected",
      },
      {
        operationId: "keep-me",
        remoteArticleId: "opaque-article/43",
        facet: "starred",
        desiredState: true,
        createdAtMs: 101,
        attemptCount: 0,
        lastError: null,
      },
    );
    const repository = {
      readActiveScope: async () => scope,
      read: async () => sidecar,
      write: async (value: FreshRssSidecarFile) => {
        Object.assign(sidecar, value);
      },
    };

    await cancelFreshRssMutation(repository, "cancel-me");

    expect(sidecar.pendingFacetMutations).toMatchObject([
      { operationId: "keep-me", remoteArticleId: "opaque-article/43" },
    ]);
  });
  it("coalesces local read choices into durable scoped mutations", async () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.freshRss = {
      endpoint: scope.endpoint,
      credentialReference: "secret-ref",
      status: "connected",
      stateSyncMode: "receive-only",
    };
    settings.feeds = [
      {
        feedId: "feed-local",
        title: "Feed",
        url: "https://feed.example.test/rss.xml",
        folder: "RSS",
        lastUpdated: 0,
        items: [],
      },
    ];
    const sidecar = createSidecar();
    const write = vi.fn(async (value: FreshRssSidecarFile) => {
      Object.assign(sidecar, value);
    });
    const repository = {
      readActiveScope: async () => scope,
      read: async () => sidecar,
      write,
    };

    await queueFreshRssArticleStateChanges({
      settings,
      changes: [
        {
          feedUrl: "https://feed.example.test/rss.xml",
          guid: "article-guid",
          changes: { read: true },
        },
        {
          feedUrl: "https://feed.example.test/rss.xml",
          guid: "article-guid",
          changes: { read: false },
        },
      ],
      sidecarRepository: repository,
    });

    expect(write).toHaveBeenCalledOnce();
    expect(sidecar.pendingFacetMutations).toHaveLength(1);
    expect(sidecar.pendingFacetMutations[0]).toMatchObject({
      remoteArticleId: "opaque-article/42",
      facet: "read",
      desiredState: false,
      attemptCount: 0,
      lastError: null,
    });
    expect(
      isFreshRssPendingFacetMutation(sidecar.pendingFacetMutations[0]),
    ).toBe(true);
  });

  it("queues starred and normalized label state while Receive-only is active", async () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.freshRss.endpoint = scope.endpoint;
    settings.freshRss.stateSyncMode = "receive-only";
    settings.feeds = [
      {
        feedId: "feed-local",
        title: "Feed",
        url: "https://feed.example.test/rss.xml",
        folder: "RSS",
        lastUpdated: 0,
        items: [],
      },
    ];
    const sidecar = createSidecar();
    const repository = {
      readActiveScope: async () => scope,
      read: async () => structuredClone(sidecar),
      write: async (value: FreshRssSidecarFile) => {
        Object.assign(sidecar, value);
      },
    };

    await queueFreshRssArticleStateChanges({
      settings,
      changes: [
        {
          feedUrl: "https://feed.example.test/rss.xml",
          guid: "article-guid",
          changes: {
            starred: true,
            tags: [
              { name: "  News ", color: "#123456" },
              { name: "news", color: "#abcdef" },
              { name: "Later", color: "#fedcba" },
            ],
          },
        },
      ],
      sidecarRepository: repository,
    });

    expect(sidecar.pendingFacetMutations).toMatchObject([
      {
        remoteArticleId: "opaque-article/42",
        facet: "starred",
        desiredState: true,
      },
      {
        remoteArticleId: "opaque-article/42",
        facet: "labels",
        desiredState: ["News", "Later"],
      },
    ]);
  });

  it("retains failed writes without pretending the mutations were queued", async () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.freshRss.endpoint = scope.endpoint;
    settings.feeds = [
      {
        feedId: "feed-local",
        title: "Feed",
        url: "https://feed.example.test/rss.xml",
        folder: "RSS",
        lastUpdated: 0,
        items: [],
      },
    ];

    await expect(
      queueFreshRssArticleStateChanges({
        settings,
        changes: [
          {
            feedUrl: "https://feed.example.test/rss.xml",
            guid: "article-guid",
            changes: { starred: true },
          },
        ],
        sidecarRepository: {
          readActiveScope: async () => scope,
          read: async () => createSidecar(),
          write: async () => {
            throw new Error("disk full");
          },
        },
      }),
    ).rejects.toThrow("disk full");
  });

  it("does not write mutations into a different endpoint namespace", async () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.freshRss = {
      endpoint: "https://other.example.test/api/greader.php",
      credentialReference: "secret-ref",
      status: "connected",
      stateSyncMode: "two-way",
    };
    const write = vi.fn(async () => {});

    await queueFreshRssArticleStateChanges({
      settings,
      changes: [
        {
          feedUrl: "https://feed.example.test/rss.xml",
          guid: "article-guid",
          changes: { read: true },
        },
      ],
      sidecarRepository: {
        readActiveScope: async () => scope,
        read: async () => createSidecar(),
        write,
      },
    });

    expect(write).not.toHaveBeenCalled();
  });

  it("preserves concurrent read changes for different bound articles", async () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.freshRss.endpoint = scope.endpoint;
    settings.freshRss.stateSyncMode = "receive-only";
    settings.feeds = [
      {
        feedId: "feed-local",
        title: "Feed",
        url: "https://feed.example.test/rss.xml",
        folder: "RSS",
        lastUpdated: 0,
        items: [],
      },
    ];
    const sidecar = createSidecar();
    const repository = {
      readActiveScope: async () => scope,
      read: async () => structuredClone(sidecar),
      write: async (value: FreshRssSidecarFile) => {
        Object.assign(sidecar, value);
      },
    };
    const change = (guid: string) => ({
      feedUrl: "https://feed.example.test/rss.xml",
      guid,
      changes: { read: true },
    });

    await Promise.all(
      ["article-guid", "article-guid-2"].map((guid) =>
        queueFreshRssArticleStateChanges({
          settings,
          changes: [change(guid)],
          sidecarRepository: repository,
        }),
      ),
    );

    expect(sidecar.pendingFacetMutations).toHaveLength(2);
    expect(sidecar.pendingFacetMutations).toMatchObject([
      { remoteArticleId: "opaque-article/42", desiredState: true },
      { remoteArticleId: "opaque-article/43", desiredState: true },
    ]);
  });

  it("recovers queued article facets when the sidecar repository is reopened", async () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.freshRss.endpoint = scope.endpoint;
    settings.freshRss.stateSyncMode = "receive-only";
    settings.feeds = [
      {
        feedId: "feed-local",
        title: "Feed",
        url: "https://feed.example.test/rss.xml",
        folder: "RSS",
        lastUpdated: 0,
        items: [],
      },
    ];
    const files = new Map<string, string>();
    const store: FreshRssConnectionScopeStore = {
      exists: async (path) => files.has(path),
      read: async (path) => {
        const contents = files.get(path);
        if (contents === undefined) throw new Error("missing sidecar");
        return contents;
      },
      write: async (path, contents) => {
        files.set(path, contents);
      },
      list: async (folder) =>
        [...files.keys()].filter((path) => path.startsWith(`${folder}/`)),
      remove: async (path) => {
        files.delete(path);
      },
    };
    const createRepository = () =>
      new FreshRssConnectionScopeRepository(store, {
        sidecarPath: "rss-dashboard-data/freshrss-state.json",
        quarantineFolder: "rss-dashboard-data",
        createQuarantinePath: () => "rss-dashboard-data/quarantine.json",
      });
    const repository = createRepository();
    await repository.activate(scope);
    await repository.write(createSidecar());

    await queueFreshRssArticleStateChanges({
      settings,
      changes: [
        {
          feedUrl: "https://feed.example.test/rss.xml",
          guid: "article-guid",
          changes: {
            read: true,
            starred: true,
            tags: [
              { name: "News", color: "#123456" },
              { name: " news ", color: "#abcdef" },
            ],
          },
        },
      ],
      sidecarRepository: repository,
    });

    const reopenedSidecar = await createRepository().read(scope);
    expect(reopenedSidecar?.pendingFacetMutations).toMatchObject([
      {
        remoteArticleId: "opaque-article/42",
        facet: "read",
        desiredState: true,
      },
      {
        remoteArticleId: "opaque-article/42",
        facet: "starred",
        desiredState: true,
      },
      {
        remoteArticleId: "opaque-article/42",
        facet: "labels",
        desiredState: ["News"],
      },
    ]);
  });
});
