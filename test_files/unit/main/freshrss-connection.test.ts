import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestUrlResponse, RequestUrlResponsePromise } from "obsidian";
import * as obsidian from "obsidian";
import RssDashboardPlugin from "../../../main";
import { RssDashboardSettingTab } from "../../../src/settings/settings-tab";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function response(text: string): RequestUrlResponse {
  return {
    status: 200,
    headers: {},
    arrayBuffer: new ArrayBuffer(0),
    json: {},
    text,
  };
}

function responsePromise(text: string): RequestUrlResponsePromise {
  const promise = Promise.resolve(response(text)) as RequestUrlResponsePromise;
  promise.arrayBuffer = promise.then(({ arrayBuffer }) => arrayBuffer);
  promise.json = promise.then(({ json }) => json);
  promise.text = promise.then(({ text: responseText }) => responseText);
  return promise;
}

function neverCompletingRequest(): RequestUrlResponsePromise {
  const never = new Promise<never>(() => {});
  void never.catch(() => {});
  const pending = never as unknown as RequestUrlResponsePromise;
  pending.arrayBuffer = never;
  pending.json = never;
  pending.text = never;
  return pending;
}

function setSecretStorage(
  app: obsidian.App,
  storage: {
    getSecret(reference: string): string | null;
    listSecrets(): string[];
  },
): void {
  (app as unknown as { secretStorage: typeof storage }).secretStorage = storage;
}

function createPlugin(app: obsidian.App): RssDashboardPlugin {
  return new RssDashboardPlugin(app, {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.1",
    minAppVersion: "1.8.7",
    description: "RSS Dashboard test plugin",
    author: "Test",
  });
}

function configureReadyPlugin(plugin: RssDashboardPlugin): void {
  plugin.settings = cloneSettings();
  plugin.settings.storageMode = "vault-shards-v2";
  plugin.settings.metadataStorageMode = "vault-location";
  plugin.settings.metadataStorageSchemaVersion = 2;
  plugin.settings.metadataStorageFolder = ".rss-dashboard-data";
  plugin.settings.freshRss.endpoint =
    "https://reader.example.test/api/greader.php";
  plugin.settings.freshRss.credentialReference = "freshrss-primary";
  vi.spyOn(plugin, "saveSettings").mockResolvedValue();
}

async function seedBoundFreshRssArticle(
  plugin: RssDashboardPlugin,
  app: obsidian.App,
): Promise<void> {
  plugin.settings.feeds = [
    {
      feedId: "local-feed",
      title: "Local feed",
      url: "https://feed.example.test/rss.xml",
      folder: "RSS",
      lastUpdated: 1,
      items: [
        {
          title: "Bound article",
          link: "https://article.example.test/42",
          description: "",
          pubDate: "2026-10-24T00:00:00.000Z",
          guid: "article/42",
          read: false,
          feedTitle: "Local feed",
          feedUrl: "https://feed.example.test/rss.xml",
          coverImage: "",
        },
      ],
    },
  ];
  const sidecarPath = ".rss-dashboard-data/freshrss-state.json";
  const sidecar = JSON.parse(await app.vault.adapter.read(sidecarPath)) as {
    feedBindings: unknown[];
    articleBindings: unknown[];
    checkpoints: unknown[];
  };
  sidecar.feedBindings = [
    { feedId: "local-feed", remoteSubscriptionId: "feed/6" },
  ];
  sidecar.articleBindings = [
    {
      feedId: "local-feed",
      guid: "article/42",
      remoteArticleId: "article/42",
    },
  ];
  sidecar.checkpoints = [{ remoteSubscriptionId: "feed/6", completedAtMs: 1 }];
  await app.vault.adapter.write(sidecarPath, JSON.stringify(sidecar));
}

describe("FreshRSS connection activation", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("does not access SecretStorage or the network below the 1.11.5 floor", async () => {
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(false);
    const requestUrl = vi.spyOn(obsidian, "requestUrl");
    const listSecrets = vi.fn(() => ["freshrss-primary"]);
    const app = obsidian.App.createMock();
    setSecretStorage(app, {
      getSecret: vi.fn(() => "secret-value"),
      listSecrets,
    });
    const plugin = createPlugin(app);
    configureReadyPlugin(plugin);

    await expect(plugin.testFreshRssConnection()).resolves.toBe(
      "capability-unavailable",
    );
    expect(listSecrets).not.toHaveBeenCalled();
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it("does not read credentials or make a request until vault metadata storage is ready", async () => {
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
    const requestUrl = vi.spyOn(obsidian, "requestUrl");
    const getSecret = vi.fn(() => "secret-value");
    const app = obsidian.App.createMock();
    setSecretStorage(app, {
      getSecret,
      listSecrets: () => ["freshrss-primary"],
    });
    const plugin = createPlugin(app);
    plugin.settings = cloneSettings();
    plugin.settings.freshRss.endpoint =
      "https://reader.example.test/api/greader.php";
    plugin.settings.freshRss.credentialReference = "freshrss-primary";
    vi.spyOn(plugin, "saveSettings").mockResolvedValue();

    await expect(plugin.testFreshRssConnection()).resolves.toBe(
      "storage-migration-required",
    );
    expect(getSecret).not.toHaveBeenCalled();
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it("persists only the credential reference and validated connection scope", async () => {
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
    vi.spyOn(obsidian, "requestUrl")
      .mockResolvedValueOnce(response("Auth=session-value"))
      .mockResolvedValueOnce(response('{"userId":"remote-user"}'))
      .mockResolvedValueOnce(response("write-token"));
    const app = obsidian.App.createMock();
    setSecretStorage(app, {
      getSecret: () => '{"username":"reader","apiPassword":"secret-value"}',
      listSecrets: () => ["freshrss-primary"],
    });
    const plugin = createPlugin(app);
    configureReadyPlugin(plugin);

    await expect(plugin.testFreshRssConnection()).resolves.toBe("connected");
    expect(plugin.settings.freshRss).toEqual({
      endpoint: "https://reader.example.test/api/greader.php",
      credentialReference: "freshrss-primary",
      status: "connected",
      stateSyncMode: "two-way",
    });
    const sidecar = await app.vault.adapter.read(
      ".rss-dashboard-data/freshrss-state.json",
    );
    expect(sidecar).toContain('"remoteUserId": "remote-user"');
    expect(sidecar).not.toContain("secret-value");
    expect(sidecar).not.toContain("session-value");
    expect(sidecar).not.toContain("write-token");
  });

  it("keeps the endpoint input mounted while the user types a valid endpoint", async () => {
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
    const app = obsidian.App.createMock();
    setSecretStorage(app, {
      getSecret: () => '{"username":"reader","apiPassword":"secret-value"}',
      listSecrets: () => ["freshrss-primary"],
    });
    const plugin = createPlugin(app);
    configureReadyPlugin(plugin);
    const settingTab = new RssDashboardSettingTab(app, plugin);
    plugin.settingTab = settingTab;
    document.body.appendChild(settingTab.containerEl);
    settingTab.activateTab("FreshRSS");

    const endpointInput = settingTab.containerEl.querySelector("input");
    expect(endpointInput).not.toBeNull();
    endpointInput?.focus();
    if (!endpointInput) return;

    endpointInput.value = "https://r";
    endpointInput.dispatchEvent(new Event("input"));
    await vi.waitFor(() => {
      expect(plugin.settings.freshRss.endpoint).toBe("https://r");
    });

    expect(settingTab.containerEl.querySelector("input")).toBe(endpointInput);
    expect(document.activeElement).toBe(endpointInput);
  });

  it("allows clearing the endpoint without redrawing the settings tab", async () => {
    const app = obsidian.App.createMock();
    const plugin = createPlugin(app);
    configureReadyPlugin(plugin);
    const refresh = vi.fn();
    plugin.settingTab = { refresh } as unknown as RssDashboardSettingTab;

    await plugin.saveFreshRssEndpoint("");

    expect(plugin.settings.freshRss.endpoint).toBe("");
    expect(plugin.settings.freshRss.status).toBe("test-required");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("classifies HTTP 401 responses returned by Obsidian as rejected credentials", async () => {
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
    const requestUrl = vi.spyOn(obsidian, "requestUrl");
    requestUrl.mockResolvedValueOnce({
      ...response("Unauthorized"),
      status: 401,
    });
    const app = obsidian.App.createMock();
    setSecretStorage(app, {
      getSecret: () => '{"username":"reader","apiPassword":"bad-password"}',
      listSecrets: () => ["freshrss-primary"],
    });
    const plugin = createPlugin(app);
    configureReadyPlugin(plugin);

    await expect(plugin.testFreshRssConnection()).resolves.toBe(
      "credentials-rejected",
    );
    expect(requestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        throw: false,
      }),
    );
  });

  it("does not send a request when the selected SecretStorage entry cannot be read", async () => {
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
    const requestUrl = vi.spyOn(obsidian, "requestUrl");
    const app = obsidian.App.createMock();
    setSecretStorage(app, {
      getSecret: () => {
        throw new Error("SecretStorage unavailable");
      },
      listSecrets: () => ["freshrss-primary"],
    });
    const plugin = createPlugin(app);
    configureReadyPlugin(plugin);

    await expect(plugin.testFreshRssConnection()).resolves.toBe(
      "capability-unavailable",
    );
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it("syncs bounded FreshRSS article history through current settings storage", async () => {
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
    const requestUrl = vi
      .spyOn(obsidian, "requestUrl")
      .mockResolvedValueOnce(response("Auth=connection-token"))
      .mockResolvedValueOnce(response('{"userId":"remote-user"}'))
      .mockResolvedValueOnce(response("write-token"))
      .mockResolvedValueOnce(response("Auth=sync-token"))
      .mockResolvedValueOnce(response('{"userId":"remote-user"}'))
      .mockResolvedValueOnce(response(JSON.stringify({ tags: [] })))
      .mockResolvedValueOnce(
        response(
          JSON.stringify({
            subscriptions: [
              {
                id: "feed/6",
                title: "Remote feed",
                url: "https://feed.example.test/rss.xml",
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        response(JSON.stringify({ itemRefs: [{ id: "article/42" }] })),
      )
      .mockResolvedValueOnce(
        response(
          JSON.stringify({
            items: [
              {
                id: "article/42",
                title: "Remote article",
                alternate: [{ href: "https://article.example.test/42" }],
                content: { content: "<p>Remote body</p>" },
                published: Math.floor(Date.now() / 1000),
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(response(JSON.stringify({ itemRefs: [] })))
      .mockResolvedValueOnce(response(JSON.stringify({ itemRefs: [] })))
      .mockResolvedValueOnce(response(JSON.stringify({ itemRefs: [] })));
    const app = obsidian.App.createMock();
    setSecretStorage(app, {
      getSecret: () => '{"username":"reader","apiPassword":"secret-value"}',
      listSecrets: () => ["freshrss-primary"],
    });
    const plugin = createPlugin(app);
    configureReadyPlugin(plugin);

    await expect(plugin.testFreshRssConnection()).resolves.toBe("connected");
    await expect(plugin.syncFreshRssNow()).resolves.toBe("completed");

    expect(plugin.settings.feeds).toHaveLength(1);
    expect(plugin.settings.feeds[0]).toMatchObject({
      title: "Remote feed",
      folder: plugin.settings.media.defaultRssFolder,
      autoDeleteDuration: plugin.settings.defaultAutoDeleteDuration,
      maxItemsLimit: plugin.settings.maxItems,
      items: [
        {
          guid: "article/42",
          title: "Remote article",
          feedTitle: "Remote feed",
        },
      ],
    });
    expect(
      requestUrl.mock.calls
        .slice(3)
        .every(
          ([request]) =>
            typeof request !== "string" &&
            (request.method === "GET" || request.method === "POST"),
        ),
    ).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalled();
    const sidecar = await app.vault.adapter.read(
      ".rss-dashboard-data/freshrss-state.json",
    );
    expect(sidecar).toContain('"remoteSubscriptionId": "feed/6"');
    expect(sidecar).toContain('"remoteArticleId": "article/42"');
    expect(sidecar).not.toContain("secret-value");
    expect(sidecar).not.toContain("sync-token");
  });

  it("reports an incomplete sync when bound article-state reconciliation fails", async () => {
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
    vi.spyOn(obsidian, "requestUrl")
      .mockResolvedValueOnce(response("Auth=connection-token"))
      .mockResolvedValueOnce(response('{"userId":"remote-user"}'))
      .mockResolvedValueOnce(response("write-token"))
      .mockResolvedValueOnce(response("Auth=sync-token"))
      .mockResolvedValueOnce(response('{"userId":"remote-user"}'))
      .mockResolvedValueOnce(response(JSON.stringify({ tags: [] })))
      .mockResolvedValueOnce(
        response(
          JSON.stringify({
            subscriptions: [
              {
                id: "feed/6",
                title: "Remote feed",
                url: "https://feed.example.test/rss.xml",
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(response(JSON.stringify({ itemRefs: [] })))
      .mockResolvedValueOnce({
        ...response("temporary failure"),
        status: 503,
      })
      .mockResolvedValueOnce(response(JSON.stringify({ itemRefs: [] })))
      .mockResolvedValueOnce(response(JSON.stringify({ itemRefs: [] })));
    const app = obsidian.App.createMock();
    setSecretStorage(app, {
      getSecret: () => '{"username":"reader","apiPassword":"secret-value"}',
      listSecrets: () => ["freshrss-primary"],
    });
    const plugin = createPlugin(app);
    configureReadyPlugin(plugin);

    await expect(plugin.testFreshRssConnection()).resolves.toBe("connected");
    await seedBoundFreshRssArticle(plugin, app);

    await expect(plugin.syncFreshRssNow()).resolves.toBe("incomplete");
    expect(plugin.settings.feeds[0]?.items[0]?.read).toBe(false);
    expect(vi.mocked(obsidian.requestUrl)).toHaveBeenCalledTimes(11);
  });

  it("reports failure when reconciled state cannot be saved locally", async () => {
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
    const requestUrl = vi
      .spyOn(obsidian, "requestUrl")
      .mockResolvedValueOnce(response("Auth=connection-token"))
      .mockResolvedValueOnce(response('{"userId":"remote-user"}'))
      .mockResolvedValueOnce(response("write-token"))
      .mockResolvedValueOnce(response("Auth=sync-token"))
      .mockResolvedValueOnce(response('{"userId":"remote-user"}'))
      .mockResolvedValueOnce(response(JSON.stringify({ tags: [] })))
      .mockResolvedValueOnce(
        response(
          JSON.stringify({
            subscriptions: [
              {
                id: "feed/6",
                title: "Remote feed",
                url: "https://feed.example.test/rss.xml",
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(response(JSON.stringify({ itemRefs: [] })))
      .mockResolvedValueOnce(
        response(JSON.stringify({ itemRefs: [{ id: "article/42" }] })),
      )
      .mockResolvedValueOnce(response(JSON.stringify({ itemRefs: [] })))
      .mockResolvedValueOnce(response(JSON.stringify({ itemRefs: [] })));
    const app = obsidian.App.createMock();
    setSecretStorage(app, {
      getSecret: () => '{"username":"reader","apiPassword":"secret-value"}',
      listSecrets: () => ["freshrss-primary"],
    });
    const plugin = createPlugin(app);
    configureReadyPlugin(plugin);

    await expect(plugin.testFreshRssConnection()).resolves.toBe("connected");
    await seedBoundFreshRssArticle(plugin, app);
    vi.mocked(plugin.saveSettings).mockRejectedValueOnce(
      new Error("Core storage unavailable"),
    );

    await expect(plugin.syncFreshRssNow()).resolves.toBe("failed");
    expect(plugin.settings.feeds[0]?.items[0]?.read).toBe(false);
    expect(requestUrl).toHaveBeenCalledTimes(11);
  });

  it("requires a fresh connection test when credentials resolve to another account", async () => {
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
    const requestUrl = vi
      .spyOn(obsidian, "requestUrl")
      .mockResolvedValueOnce(response("Auth=connection-token"))
      .mockResolvedValueOnce(response('{"userId":"remote-user"}'))
      .mockResolvedValueOnce(response("write-token"))
      .mockResolvedValueOnce(response("Auth=sync-token"))
      .mockResolvedValueOnce(response('{"userId":"different-user"}'));
    let credentialBundle =
      '{"username":"reader","apiPassword":"original-secret"}';
    const app = obsidian.App.createMock();
    setSecretStorage(app, {
      getSecret: () => credentialBundle,
      listSecrets: () => ["freshrss-primary"],
    });
    const plugin = createPlugin(app);
    configureReadyPlugin(plugin);

    await expect(plugin.testFreshRssConnection()).resolves.toBe("connected");
    credentialBundle =
      '{"username":"another-reader","apiPassword":"updated-secret"}';

    await plugin.syncFreshRssNow();

    expect(plugin.settings.freshRss.status).toBe("test-required");
    expect(plugin.settings.feeds).toEqual([]);
    expect(requestUrl).toHaveBeenCalledTimes(5);
    const sidecar = await app.vault.adapter.read(
      ".rss-dashboard-data/freshrss-state.json",
    );
    expect(sidecar).toContain('"remoteUserId": "remote-user"');
    expect(sidecar).not.toContain("different-user");
  });

  it("stops a sync when the selected credential reference changes while it is running", async () => {
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
    let plugin: RssDashboardPlugin;
    vi.spyOn(obsidian, "requestUrl").mockImplementation((request) => {
      const url = typeof request === "string" ? request : request.url;
      if (url.endsWith("/accounts/ClientLogin")) {
        return responsePromise("Auth=session-token");
      }
      if (url.includes("/user-info?")) {
        return responsePromise('{"userId":"remote-user"}');
      }
      if (url.endsWith("/reader/api/0/token")) {
        return responsePromise("write-token");
      }
      if (url.endsWith("/subscription/list?output=json")) {
        plugin.settings.freshRss.credentialReference = "freshrss-marc";
        return responsePromise(JSON.stringify({ subscriptions: [] }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const app = obsidian.App.createMock();
    setSecretStorage(app, {
      getSecret: () => '{"username":"reader","apiPassword":"secret-value"}',
      listSecrets: () => ["freshrss-primary", "freshrss-marc"],
    });
    plugin = createPlugin(app);
    configureReadyPlugin(plugin);
    plugin.settings.freshRss.stateSyncMode = "receive-only";

    await expect(plugin.testFreshRssConnection()).resolves.toBe("connected");
    await expect(plugin.syncFreshRssNow()).resolves.toBe("failed");

    expect(plugin.settings.freshRss.credentialReference).toBe("freshrss-marc");
    expect(plugin.settings.freshRss.status).toBe("test-required");
    const sidecar = JSON.parse(
      await app.vault.adapter.read(".rss-dashboard-data/freshrss-state.json"),
    ) as { scope: { remoteUserId: string }; feedBindings: unknown[] };
    expect(sidecar.scope.remoteUserId).toBe("remote-user");
    expect(sidecar.feedBindings).toEqual([]);
  });

  it("stops waiting for an in-flight sync request when the global operation is cancelled", async () => {
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
    const requestUrl = vi
      .spyOn(obsidian, "requestUrl")
      .mockResolvedValueOnce(response("Auth=connection-token"))
      .mockResolvedValueOnce(response('{"userId":"remote-user"}'))
      .mockResolvedValueOnce(response("write-token"))
      .mockResolvedValueOnce(response("Auth=sync-token"))
      .mockResolvedValueOnce(response('{"userId":"remote-user"}'))
      .mockResolvedValueOnce(response(JSON.stringify({ tags: [] })))
      .mockResolvedValueOnce(
        response(
          JSON.stringify({
            subscriptions: [
              {
                id: "feed/6",
                title: "Remote feed",
                url: "https://feed.example.test/rss.xml",
              },
            ],
          }),
        ),
      )
      .mockImplementationOnce(() => neverCompletingRequest());
    const app = obsidian.App.createMock();
    setSecretStorage(app, {
      getSecret: () => '{"username":"reader","apiPassword":"secret-value"}',
      listSecrets: () => ["freshrss-primary"],
    });
    const plugin = createPlugin(app);
    configureReadyPlugin(plugin);
    await expect(plugin.testFreshRssConnection()).resolves.toBe("connected");
    const saveCountBeforeSync = vi.mocked(plugin.saveSettings).mock.calls
      .length;

    const sync = plugin.syncFreshRssNow();
    await vi.waitFor(() => expect(requestUrl).toHaveBeenCalledTimes(8));
    plugin.cancelGlobalRefresh();
    await expect(sync).resolves.toBe("cancelled");

    expect(plugin.settings.feeds).toEqual([]);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(
      saveCountBeforeSync,
    );
    const sidecar = await app.vault.adapter.read(
      ".rss-dashboard-data/freshrss-state.json",
    );
    expect(sidecar).not.toContain('"remoteSubscriptionId": "feed/6"');
  });
});
