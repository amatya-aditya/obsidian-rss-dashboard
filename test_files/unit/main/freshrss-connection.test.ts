import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestUrlResponse } from "obsidian";
import * as obsidian from "obsidian";
import RssDashboardPlugin from "../../../main";
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
    });
    const sidecar = await app.vault.adapter.read(
      ".rss-dashboard-data/freshrss-state.json",
    );
    expect(sidecar).toContain('"remoteUserId": "remote-user"');
    expect(sidecar).not.toContain("secret-value");
    expect(sidecar).not.toContain("session-value");
    expect(sidecar).not.toContain("write-token");
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
});
