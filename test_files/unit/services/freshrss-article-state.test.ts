import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import {
  queueFreshRssReadStateChanges,
  isFreshRssPendingReadMutation,
} from "../../../src/services/freshrss-article-state";
import type { FreshRssSidecarFile } from "../../../src/services/freshrss-connection-scope-repository";

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
    ],
    checkpoints: [],
  };
}

describe("FreshRSS article state queue", () => {
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

    await queueFreshRssReadStateChanges({
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
      isFreshRssPendingReadMutation(sidecar.pendingFacetMutations[0]),
    ).toBe(true);
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

    await queueFreshRssReadStateChanges({
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
});
