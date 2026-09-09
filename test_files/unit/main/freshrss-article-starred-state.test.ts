import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS, type Feed, type RssDashboardSettings } from "../../../src/types/types";

/**
 * Covers the shared article-facet mutation boundary (main.ts
 * `commitArticleFacetState`, via its `commitArticleStarredState` wrapper)
 * for the `starred` facet: every star/unstar entry point routes through it,
 * a FreshRSS-linked article durably queues a pending sidecar mutation before
 * the local facet commits, local-only articles are unaffected, and a
 * sidecar write failure leaves the local facet uncommitted with an
 * actionable error. Mirrors freshrss-article-read-state.test.ts for the
 * `read` facet.
 */

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    feedId: "feed-1",
    title: "Feed One",
    url: "https://example.test/feed.xml",
    folder: "Uncategorized",
    items: [
      {
        title: "Article One",
        link: "https://example.test/a1",
        description: "",
        pubDate: "",
        guid: "guid-1",
        feedTitle: "Feed One",
        feedUrl: "https://example.test/feed.xml",
        coverImage: "",
        starred: false,
      },
    ],
    lastUpdated: 0,
    ...overrides,
  };
}

function createPlugin(): {
  plugin: RssDashboardPlugin;
  app: ReturnType<typeof obsidian.App.createMock>;
} {
  const app = obsidian.App.createMock();
  const plugin = new RssDashboardPlugin(app, {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.6.0",
  });
  plugin.settings = cloneSettings();
  vi.spyOn(plugin, "saveSettings").mockResolvedValue();
  return { plugin, app };
}

function createFreshRssReadyPlugin(): {
  plugin: RssDashboardPlugin;
  app: ReturnType<typeof obsidian.App.createMock>;
} {
  const { plugin, app } = createPlugin();
  const secretStorageApp = app as unknown as {
    secretStorage: { getSecret(reference: string): string | null; listSecrets(): string[] };
  };
  secretStorageApp.secretStorage = {
    getSecret: () => '{"username":"test-user","apiPassword":"test-password"}',
    listSecrets: () => ["freshrss-primary"],
  };
  plugin.settings.metadataStorageMode = "vault-location";
  plugin.settings.metadataStorageFolder = ".rss-dashboard-data";
  plugin.settings.metadataStorageSchemaVersion = 2;
  plugin.settings.storageMode = "vault-shards-v2";
  plugin.settings.freshRss.endpoint = "https://reader.example.test/api/greader.php";
  plugin.settings.freshRss.credentialReference = "freshrss-primary";
  plugin.settings.freshRss.status = "connected";
  return { plugin, app };
}

async function activateSidecar(
  app: ReturnType<typeof obsidian.App.createMock>,
  overrides: Partial<{
    pendingFacetMutations: unknown[];
    articleBindings: unknown[];
  }> = {},
): Promise<void> {
  await app.vault.adapter.write(
    ".rss-dashboard-data/freshrss-state.json",
    JSON.stringify({
      version: 2,
      scope: {
        endpoint: "https://reader.example.test/api/greader.php",
        remoteUserId: "opaque-user",
      },
      pendingFacetMutations: overrides.pendingFacetMutations ?? [],
      feedBindings: [{ feedId: "feed-1", remoteSubscriptionId: "sub-1" }],
      articleBindings:
        overrides.articleBindings ??
        [{ feedId: "feed-1", guid: "guid-1", remoteArticleId: "remote-article-1" }],
      checkpoints: [],
    }),
  );
}

async function readSidecar(
  app: ReturnType<typeof obsidian.App.createMock>,
): Promise<{ pendingFacetMutations: Array<Record<string, unknown>> }> {
  const raw = await app.vault.adapter.read(".rss-dashboard-data/freshrss-state.json");
  return JSON.parse(raw) as { pendingFacetMutations: Array<Record<string, unknown>> };
}

describe("commitArticleStarredState (shared article-facet mutation boundary, starred facet)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
  });

  it("commits a local-only article's starred state directly, with no sidecar record created", async () => {
    const { plugin } = createPlugin();
    plugin.settings.feeds = [makeFeed()];

    const result = await plugin.commitArticleStarredState([
      { articleGuid: "guid-1", feedUrl: "https://example.test/feed.xml", desiredStarred: true },
    ]);

    expect(result).toEqual({ committed: true });
    expect(plugin.settings.feeds[0].items[0].starred).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("leaves a local-only article's starred state untouched when FreshRSS is connected but this article has no binding", async () => {
    const { plugin, app } = createFreshRssReadyPlugin();
    plugin.settings.feeds = [makeFeed()];
    // Sidecar is active for the scope but knows nothing about this article.
    await activateSidecar(app, { articleBindings: [] });

    const result = await plugin.commitArticleStarredState([
      { articleGuid: "guid-1", feedUrl: "https://example.test/feed.xml", desiredStarred: true },
    ]);

    expect(result).toEqual({ committed: true });
    expect(plugin.settings.feeds[0].items[0].starred).toBe(true);
    const sidecar = await readSidecar(app);
    expect(sidecar.pendingFacetMutations).toEqual([]);
  });

  it("durably captures a pending starred facet mutation before committing a FreshRSS-linked article's starred state", async () => {
    const { plugin, app } = createFreshRssReadyPlugin();
    plugin.settings.feeds = [makeFeed()];
    await activateSidecar(app);

    const result = await plugin.commitArticleStarredState([
      { articleGuid: "guid-1", feedUrl: "https://example.test/feed.xml", desiredStarred: true },
    ]);

    expect(result).toEqual({ committed: true });
    expect(plugin.settings.feeds[0].items[0].starred).toBe(true);

    const sidecar = await readSidecar(app);
    expect(sidecar.pendingFacetMutations).toHaveLength(1);
    expect(sidecar.pendingFacetMutations[0]).toMatchObject({
      remoteArticleId: "remote-article-1",
      facet: "starred",
      desiredState: true,
    });
    expect(typeof sidecar.pendingFacetMutations[0].operationId).toBe("string");
  });

  it("replaces the previous pending starred mutation for the same article with a new operation ID rather than stacking history", async () => {
    const { plugin, app } = createFreshRssReadyPlugin();
    plugin.settings.feeds = [makeFeed()];
    await activateSidecar(app);

    await plugin.commitArticleStarredState([
      { articleGuid: "guid-1", feedUrl: "https://example.test/feed.xml", desiredStarred: true },
    ]);
    const firstSidecar = await readSidecar(app);
    const firstOperationId = firstSidecar.pendingFacetMutations[0].operationId;

    await plugin.commitArticleStarredState([
      { articleGuid: "guid-1", feedUrl: "https://example.test/feed.xml", desiredStarred: false },
    ]);
    const secondSidecar = await readSidecar(app);

    expect(secondSidecar.pendingFacetMutations).toHaveLength(1);
    expect(secondSidecar.pendingFacetMutations[0].desiredState).toBe(false);
    expect(secondSidecar.pendingFacetMutations[0].operationId).not.toBe(firstOperationId);
    expect(plugin.settings.feeds[0].items[0].starred).toBe(false);
  });

  it("does not commit the local starred state and reports an actionable error when the sidecar write fails", async () => {
    const { plugin, app } = createFreshRssReadyPlugin();
    plugin.settings.feeds = [makeFeed()];
    await activateSidecar(app);
    vi.spyOn(app.vault.adapter, "write").mockRejectedValue(new Error("disk full"));

    const result = await plugin.commitArticleStarredState([
      { articleGuid: "guid-1", feedUrl: "https://example.test/feed.xml", desiredStarred: true },
    ]);

    expect(result.committed).toBe(false);
    expect(result.error).toBeTruthy();
    // The local facet must remain uncommitted: still unstarred, and
    // saveSettings was never called for this rejected change.
    expect(plugin.settings.feeds[0].items[0].starred).toBe(false);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });

  it("keeps read and starred pending mutations for the same article independent", async () => {
    const { plugin, app } = createFreshRssReadyPlugin();
    plugin.settings.feeds = [
      makeFeed({
        items: [
          {
            title: "Article One",
            link: "https://example.test/a1",
            description: "",
            pubDate: "",
            guid: "guid-1",
            feedTitle: "Feed One",
            feedUrl: "https://example.test/feed.xml",
            coverImage: "",
            read: false,
            starred: false,
          },
        ],
      }),
    ];
    await activateSidecar(app);

    await plugin.commitArticleReadState([
      { articleGuid: "guid-1", feedUrl: "https://example.test/feed.xml", desiredRead: true },
    ]);
    await plugin.commitArticleStarredState([
      { articleGuid: "guid-1", feedUrl: "https://example.test/feed.xml", desiredStarred: true },
    ]);

    expect(plugin.settings.feeds[0].items[0].read).toBe(true);
    expect(plugin.settings.feeds[0].items[0].starred).toBe(true);

    const sidecar = await readSidecar(app);
    expect(sidecar.pendingFacetMutations).toHaveLength(2);
    expect(sidecar.pendingFacetMutations.map((m) => m.facet).sort()).toEqual([
      "read",
      "starred",
    ]);
  });

  it("does not create a FreshRSS label mutation when the local automatic Favorite tag is applied on star", async () => {
    const { plugin, app } = createFreshRssReadyPlugin();
    plugin.settings.feeds = [makeFeed()];
    await activateSidecar(app);

    // Simulate the dashboard's automatic-tag application (applyAutomaticArticleTags)
    // having already added the local "Favorite" tag alongside the starred change,
    // the same way updateArticleFromReader/updateArticleStatus do before calling
    // the facet boundary. The boundary itself only ever receives a `starred`
    // change and must never fabricate a `label:*` pending mutation for it.
    const result = await plugin.commitArticleStarredState([
      { articleGuid: "guid-1", feedUrl: "https://example.test/feed.xml", desiredStarred: true },
    ]);
    expect(result).toEqual({ committed: true });

    const sidecar = await readSidecar(app);
    expect(sidecar.pendingFacetMutations).toHaveLength(1);
    expect(sidecar.pendingFacetMutations[0].facet).toBe("starred");
    expect(
      sidecar.pendingFacetMutations.some((m) =>
        typeof m.facet === "string" && m.facet.startsWith("label:"),
      ),
    ).toBe(false);
  });

  it("batches multiple articles into one sidecar read/write under one lease acquisition", async () => {
    const { plugin, app } = createFreshRssReadyPlugin();
    const feed = makeFeed({
      items: [
        {
          title: "Article One",
          link: "https://example.test/a1",
          description: "",
          pubDate: "",
          guid: "guid-1",
          feedTitle: "Feed One",
          feedUrl: "https://example.test/feed.xml",
          coverImage: "",
          starred: false,
        },
        {
          title: "Article Two",
          link: "https://example.test/a2",
          description: "",
          pubDate: "",
          guid: "guid-2",
          feedTitle: "Feed One",
          feedUrl: "https://example.test/feed.xml",
          coverImage: "",
          starred: false,
        },
      ],
    });
    plugin.settings.feeds = [feed];
    await activateSidecar(app, {
      articleBindings: [
        { feedId: "feed-1", guid: "guid-1", remoteArticleId: "remote-article-1" },
        { feedId: "feed-1", guid: "guid-2", remoteArticleId: "remote-article-2" },
      ],
    });

    const result = await plugin.commitArticleStarredState([
      { articleGuid: "guid-1", feedUrl: "https://example.test/feed.xml", desiredStarred: true },
      { articleGuid: "guid-2", feedUrl: "https://example.test/feed.xml", desiredStarred: true },
    ]);

    expect(result).toEqual({ committed: true });
    expect(plugin.settings.feeds[0].items[0].starred).toBe(true);
    expect(plugin.settings.feeds[0].items[1].starred).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);

    const sidecar = await readSidecar(app);
    expect(sidecar.pendingFacetMutations).toHaveLength(2);
  });
});
