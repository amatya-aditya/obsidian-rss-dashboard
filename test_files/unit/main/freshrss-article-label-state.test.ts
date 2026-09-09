import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS, type Feed, type RssDashboardSettings } from "../../../src/types/types";

/**
 * Covers main.ts `commitArticleLabelMembershipChanges`: the mutation-capture
 * boundary for the dynamic `label:<normalized name>` facet family (ticket 06),
 * which extends the shared sidecar-before-commit path proven for `read`
 * (freshrss-article-read-state.test.ts) and `starred`
 * (freshrss-article-starred-state.test.ts) to FreshRSS-mapped dashboard tags.
 *
 * Unlike read/starred, this method never applies the tag change itself --
 * callers (main.ts `updateArticleFromReader`, dashboard-view.ts
 * `updateArticleStatus`) still apply `tags` through their normal flow. It
 * only captures the durable pending mutation for each KNOWN mapped label
 * whose membership changed, before that apply happens.
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
        tags: [],
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
    labelMappings: unknown[];
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
      labelMappings:
        overrides.labelMappings ??
        [{ normalizedName: "tech", remoteTagId: "user/-/label/Tech", kind: "label", displayName: "Tech" }],
    }),
  );
}

async function readSidecar(
  app: ReturnType<typeof obsidian.App.createMock>,
): Promise<{ pendingFacetMutations: Array<Record<string, unknown>> }> {
  const raw = await app.vault.adapter.read(".rss-dashboard-data/freshrss-state.json");
  return JSON.parse(raw) as { pendingFacetMutations: Array<Record<string, unknown>> };
}

describe("commitArticleLabelMembershipChanges (mapped-label facet mutation boundary)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
  });

  it("creates no sidecar record for a local-only article even when FreshRSS is connected", async () => {
    const { plugin, app } = createFreshRssReadyPlugin();
    plugin.settings.feeds = [makeFeed()];
    // Sidecar knows a label mapping but nothing about this article.
    await activateSidecar(app, { articleBindings: [] });

    const result = await plugin.commitArticleLabelMembershipChanges(
      "guid-1",
      "https://example.test/feed.xml",
      [],
      [{ name: "Tech", color: "#111111" }],
    );

    expect(result).toEqual({ committed: true });
    const sidecar = await readSidecar(app);
    expect(sidecar.pendingFacetMutations).toEqual([]);
  });

  it("is a no-op when the FreshRSS capability is unavailable", async () => {
    const { plugin } = createPlugin();
    plugin.settings.feeds = [makeFeed()];

    const result = await plugin.commitArticleLabelMembershipChanges(
      "guid-1",
      "https://example.test/feed.xml",
      [],
      [{ name: "Tech", color: "#111111" }],
    );

    expect(result).toEqual({ committed: true });
  });

  it("durably captures a pending label mutation before the tag change is treated as committed, for a newly added KNOWN mapped label", async () => {
    const { plugin, app } = createFreshRssReadyPlugin();
    plugin.settings.feeds = [makeFeed()];
    await activateSidecar(app);

    const result = await plugin.commitArticleLabelMembershipChanges(
      "guid-1",
      "https://example.test/feed.xml",
      [],
      [{ name: "Tech", color: "#111111" }],
    );

    expect(result).toEqual({ committed: true });
    const sidecar = await readSidecar(app);
    expect(sidecar.pendingFacetMutations).toHaveLength(1);
    expect(sidecar.pendingFacetMutations[0]).toMatchObject({
      remoteArticleId: "remote-article-1",
      facet: "label:tech",
      desiredState: true,
    });
  });

  it("captures a removal mutation when a KNOWN mapped label is removed from local tags", async () => {
    const { plugin, app } = createFreshRssReadyPlugin();
    plugin.settings.feeds = [makeFeed()];
    await activateSidecar(app);

    const result = await plugin.commitArticleLabelMembershipChanges(
      "guid-1",
      "https://example.test/feed.xml",
      [{ name: "Tech", color: "#111111" }],
      [],
    );

    expect(result).toEqual({ committed: true });
    const sidecar = await readSidecar(app);
    expect(sidecar.pendingFacetMutations).toHaveLength(1);
    expect(sidecar.pendingFacetMutations[0]).toMatchObject({
      remoteArticleId: "remote-article-1",
      facet: "label:tech",
      desiredState: false,
    });
  });

  it("normalizes case and surrounding whitespace consistently: adding 'tech' matches a mapping discovered as 'Tech'", async () => {
    const { plugin, app } = createFreshRssReadyPlugin();
    plugin.settings.feeds = [makeFeed()];
    await activateSidecar(app);

    const result = await plugin.commitArticleLabelMembershipChanges(
      "guid-1",
      "https://example.test/feed.xml",
      [],
      [{ name: " TECH ", color: "#111111" }],
    );

    expect(result).toEqual({ committed: true });
    const sidecar = await readSidecar(app);
    expect(sidecar.pendingFacetMutations[0]).toMatchObject({ facet: "label:tech" });
  });

  it("creates no sidecar record and no remote intent for an UNMAPPED local tag", async () => {
    const { plugin, app } = createFreshRssReadyPlugin();
    plugin.settings.feeds = [makeFeed()];
    await activateSidecar(app);

    const result = await plugin.commitArticleLabelMembershipChanges(
      "guid-1",
      "https://example.test/feed.xml",
      [],
      [{ name: "Some Local Only Tag", color: "#222222" }],
    );

    expect(result).toEqual({ committed: true });
    const sidecar = await readSidecar(app);
    expect(sidecar.pendingFacetMutations).toEqual([]);
  });

  it("creates no sidecar record for the automatic Favorite tag, which has no FreshRSS label mapping", async () => {
    const { plugin, app } = createFreshRssReadyPlugin();
    plugin.settings.feeds = [makeFeed()];
    await activateSidecar(app);

    const result = await plugin.commitArticleLabelMembershipChanges(
      "guid-1",
      "https://example.test/feed.xml",
      [],
      [{ name: "Favorite", color: "#f1c40f" }],
    );

    expect(result).toEqual({ committed: true });
    const sidecar = await readSidecar(app);
    expect(sidecar.pendingFacetMutations).toEqual([]);
  });

  it("captures only the KNOWN mapped label's change when both a known and an unmapped tag are added together", async () => {
    const { plugin, app } = createFreshRssReadyPlugin();
    plugin.settings.feeds = [makeFeed()];
    await activateSidecar(app);

    const result = await plugin.commitArticleLabelMembershipChanges(
      "guid-1",
      "https://example.test/feed.xml",
      [],
      [
        { name: "Tech", color: "#111111" },
        { name: "Local Only", color: "#333333" },
      ],
    );

    expect(result).toEqual({ committed: true });
    const sidecar = await readSidecar(app);
    expect(sidecar.pendingFacetMutations).toHaveLength(1);
    expect(sidecar.pendingFacetMutations[0]).toMatchObject({ facet: "label:tech", desiredState: true });
  });

  it("replaces the previous pending mutation for the same label with a new operation ID rather than stacking history", async () => {
    const { plugin, app } = createFreshRssReadyPlugin();
    plugin.settings.feeds = [makeFeed()];
    await activateSidecar(app);

    await plugin.commitArticleLabelMembershipChanges(
      "guid-1",
      "https://example.test/feed.xml",
      [],
      [{ name: "Tech", color: "#111111" }],
    );
    const firstSidecar = await readSidecar(app);
    const firstOperationId = firstSidecar.pendingFacetMutations[0].operationId;

    await plugin.commitArticleLabelMembershipChanges(
      "guid-1",
      "https://example.test/feed.xml",
      [{ name: "Tech", color: "#111111" }],
      [],
    );
    const secondSidecar = await readSidecar(app);

    expect(secondSidecar.pendingFacetMutations).toHaveLength(1);
    expect(secondSidecar.pendingFacetMutations[0].desiredState).toBe(false);
    expect(secondSidecar.pendingFacetMutations[0].operationId).not.toBe(firstOperationId);
  });

  it("does not commit and reports an actionable error when the sidecar write fails", async () => {
    const { plugin, app } = createFreshRssReadyPlugin();
    plugin.settings.feeds = [makeFeed()];
    await activateSidecar(app);
    vi.spyOn(app.vault.adapter, "write").mockRejectedValue(new Error("disk full"));

    const result = await plugin.commitArticleLabelMembershipChanges(
      "guid-1",
      "https://example.test/feed.xml",
      [],
      [{ name: "Tech", color: "#111111" }],
    );

    expect(result.committed).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
