import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestUrlResponse } from "obsidian";
import * as obsidian from "obsidian";
import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../../../src/types/types";

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function mockRequestUrlResponse(text: string, status = 200): RequestUrlResponse {
  return { status, headers: {}, arrayBuffer: new ArrayBuffer(0), json: {}, text };
}

function getNoticeMessages(spy: ReturnType<typeof vi.spyOn>): string[] {
  return (spy as unknown as { mock: { calls: Array<Array<unknown>> } }).mock.calls
    .filter((call) => call[0] === "[Stub Notice]")
    .map((call) => String(call[1]));
}

function createConnectedPlugin(): {
  plugin: RssDashboardPlugin;
  app: ReturnType<typeof obsidian.App.createMock>;
} {
  const app = obsidian.App.createMock();
  const secretStorageApp = app as unknown as {
    secretStorage: { getSecret(reference: string): string | null; listSecrets(): string[] };
  };
  secretStorageApp.secretStorage = {
    getSecret: () => '{"username":"test-user","apiPassword":"test-password"}',
    listSecrets: () => ["freshrss-primary"],
  };
  const plugin = new RssDashboardPlugin(app, {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.6.0",
  });
  plugin.settings = cloneSettings();
  plugin.settings.metadataStorageMode = "vault-location";
  plugin.settings.metadataStorageFolder = ".rss-dashboard-data";
  plugin.settings.metadataStorageSchemaVersion = 2;
  plugin.settings.storageMode = "vault-shards-v2";
  plugin.settings.freshRss.endpoint = "https://reader.example.test/api/greader.php";
  plugin.settings.freshRss.credentialReference = "freshrss-primary";
  plugin.settings.freshRss.status = "connected";
  vi.spyOn(plugin, "saveSettings").mockResolvedValue();
  return { plugin, app };
}

async function activateSidecar(
  app: ReturnType<typeof obsidian.App.createMock>,
  overrides: Record<string, unknown> = {},
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
      ...overrides,
    }),
  );
}

describe("FreshRSS fetch more history (plugin wiring)", () => {
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
  });

  it("returns no eligible feeds when the capability is unavailable", async () => {
    const app = obsidian.App.createMock();
    const plugin = new RssDashboardPlugin(app, {
      id: "rss-dashboard",
      name: "RSS Dashboard",
      version: "2.6.0",
    });
    plugin.settings = cloneSettings();

    const feeds = await plugin.getFreshRssHistoryEligibleFeeds();

    expect(feeds).toEqual([]);
  });

  it("lists only the FreshRSS-linked feed whose history import is capped, excluding a local-only feed and a fully-imported one", async () => {
    const { plugin, app } = createConnectedPlugin();
    plugin.settings.feeds = [
      { feedId: "local-only", title: "Local Only", url: "https://local.test/feed.xml", folder: "f", items: [], lastUpdated: 0 },
      { feedId: "capped", title: "Capped Feed", url: "https://capped.test/feed.xml", folder: "f", items: [], lastUpdated: 0 },
      { feedId: "complete", title: "Complete Feed", url: "https://complete.test/feed.xml", folder: "f", items: [], lastUpdated: 0 },
    ];
    await activateSidecar(app, {
      feedBindings: [
        { feedId: "capped", remoteSubscriptionId: "sub/capped" },
        { feedId: "complete", remoteSubscriptionId: "sub/complete" },
      ],
      checkpoints: [{ remoteSubscriptionId: "sub/complete", completedAtMs: 999 }],
    });

    const feeds = await plugin.getFreshRssHistoryEligibleFeeds();

    expect(feeds).toEqual([{ feedId: "capped", title: "Capped Feed" }]);
  });

  it("does not make a network request for an unknown/empty feed id", async () => {
    const { plugin } = createConnectedPlugin();
    const requestUrl = vi.spyOn(obsidian, "requestUrl");

    await plugin.fetchMoreFreshRssHistory("");

    expect(requestUrl).not.toHaveBeenCalled();
  });

  it("extends one selected feed's history through the shared data-sync lease and reports a bounded, feed-named summary notice", async () => {
    const { plugin, app } = createConnectedPlugin();
    plugin.settings.feeds = [
      { feedId: "local-1", title: "Feed One", url: "https://example.test/feed.xml", folder: "Tech", items: [], lastUpdated: 0 },
    ];
    await activateSidecar(app, {
      feedBindings: [{ feedId: "local-1", remoteSubscriptionId: "feed/1" }],
    });
    vi.spyOn(obsidian, "requestUrl").mockImplementation(async (request) => {
      const url = typeof request === "string" ? request : request.url;
      if (url.includes("/accounts/ClientLogin")) {
        return mockRequestUrlResponse("Auth=opaque-session");
      }
      if (url.includes("/stream/items/ids")) {
        return mockRequestUrlResponse(JSON.stringify({ itemRefs: [{ id: "item-1" }] }));
      }
      if (url.includes("/stream/items/contents")) {
        return mockRequestUrlResponse(
          JSON.stringify({
            items: [
              {
                id: "item-1",
                title: "Older article",
                alternate: [{ href: "https://example.test/older" }],
                content: { content: "<p>Body</p>" },
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await plugin.fetchMoreFreshRssHistory("local-1");

    expect(plugin.settings.feeds[0].items).toHaveLength(1);
    expect(plugin.settings.feeds[0].items[0].guid).toBe("item-1");
    const notices = getNoticeMessages(consoleDebugSpy);
    expect(notices).toContain("Feed One: history import complete (1 article imported).");
    // Never exposes a remote ID or secret in the reported notice.
    expect(notices.some((n) => n.includes("item-1"))).toBe(false);
    expect(notices.some((n) => n.includes("test-password"))).toBe(false);
  });

  it("reports an ineligible outcome by name without making a content request when the feed has no active FreshRSS binding", async () => {
    const { plugin, app } = createConnectedPlugin();
    plugin.settings.feeds = [
      { feedId: "local-only", title: "Local Only", url: "https://local.test/feed.xml", folder: "f", items: [], lastUpdated: 0 },
    ];
    await activateSidecar(app);
    vi.spyOn(obsidian, "requestUrl").mockImplementation(async (request) => {
      const url = typeof request === "string" ? request : request.url;
      if (url.includes("/accounts/ClientLogin")) {
        return mockRequestUrlResponse("Auth=opaque-session");
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await plugin.fetchMoreFreshRssHistory("local-only");

    const notices = getNoticeMessages(consoleDebugSpy);
    expect(notices).toContain("Local Only is not eligible for Fetch more history right now.");
  });
});
