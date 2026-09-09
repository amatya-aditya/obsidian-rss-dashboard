import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestUrlResponse } from "obsidian";
import * as obsidian from "obsidian";
import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../../../src/types/types";

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function mockRequestUrlResponse(text: string): RequestUrlResponse {
  return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0), json: {}, text };
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
    }),
  );
}

describe("FreshRSS sync now", () => {
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
  });

  it("does not make a network request when the FreshRSS capability is unavailable", async () => {
    const app = obsidian.App.createMock();
    const plugin = new RssDashboardPlugin(app, {
      id: "rss-dashboard",
      name: "RSS Dashboard",
      version: "2.6.0",
    });
    plugin.settings = cloneSettings();
    const requestUrl = vi.spyOn(obsidian, "requestUrl");

    await plugin.syncFreshRssNow();

    expect(requestUrl).not.toHaveBeenCalled();
    expect(getNoticeMessages(consoleDebugSpy).length).toBeGreaterThan(0);
  });

  it("does not make a network request without a configured credential reference", async () => {
    const { plugin } = createConnectedPlugin();
    plugin.settings.freshRss.credentialReference = "";
    const requestUrl = vi.spyOn(obsidian, "requestUrl");

    await plugin.syncFreshRssNow();

    expect(requestUrl).not.toHaveBeenCalled();
  });

  it("does not make a network request when the sidecar has never been activated for a scope", async () => {
    const { plugin } = createConnectedPlugin();
    const requestUrl = vi.spyOn(obsidian, "requestUrl");

    await plugin.syncFreshRssNow();

    expect(requestUrl).not.toHaveBeenCalled();
    expect(getNoticeMessages(consoleDebugSpy)).toContain(
      "Test the FreshRSS connection before syncing.",
    );
  });

  it("runs a full sync cycle through the shared data-sync lease and reports one summary notice", async () => {
    const { plugin, app } = createConnectedPlugin();
    await activateSidecar(app);
    vi.spyOn(obsidian, "requestUrl").mockImplementation(async (request) => {
      const url = typeof request === "string" ? request : request.url;
      if (url.includes("/accounts/ClientLogin")) {
        return mockRequestUrlResponse("Auth=opaque-session");
      }
      if (url.includes("/subscription/list")) {
        return mockRequestUrlResponse(
          JSON.stringify({
            subscriptions: [
              {
                id: "feed/1",
                title: "Feed One",
                url: "https://example.test/feed.xml",
                categories: [{ id: "user/-/label/Tech", label: "Tech" }],
              },
            ],
          }),
        );
      }
      if (url.includes("/tag/list")) {
        return mockRequestUrlResponse(JSON.stringify({ tags: [] }));
      }
      if (url.includes("/stream/items/ids")) {
        return mockRequestUrlResponse(JSON.stringify({ itemRefs: [{ id: "item-1" }] }));
      }
      if (url.includes("/stream/items/contents")) {
        return mockRequestUrlResponse(
          JSON.stringify({ items: [{ id: "item-1", title: "Hello" }] }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await plugin.syncFreshRssNow();

    expect(plugin.settings.feeds).toHaveLength(1);
    expect(plugin.settings.feeds[0].title).toBe("Feed One");
    expect(plugin.settings.feeds[0].items).toHaveLength(1);
    const notices = getNoticeMessages(consoleDebugSpy);
    expect(notices).toContain(
      "FreshRSS sync completed: 1 feed created, 0 linked, 1 article imported.",
    );
  });
});
