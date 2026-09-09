import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../../../src/types/types";

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

describe("FreshRSS connection activation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("stores only a connected scope sidecar after the non-mutating connection checks succeed", async () => {
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
    vi.spyOn(obsidian, "requestUrl")
      .mockResolvedValueOnce({ status: 200, text: "Auth=opaque-session" })
      .mockResolvedValueOnce({ status: 200, text: '{"userId":"opaque-user"}' })
      .mockResolvedValueOnce({ status: 200, text: "opaque-modification-token" });
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
    vi.spyOn(plugin, "saveSettings").mockResolvedValue();

    await expect(plugin.testFreshRssConnection()).resolves.toBe("connected");

    expect(plugin.settings.freshRss).toEqual({
      endpoint: "https://reader.example.test/api/greader.php",
      credentialReference: "freshrss-primary",
      status: "connected",
    });
    await expect(
      app.vault.adapter.read(".rss-dashboard-data/freshrss-state.json"),
    ).resolves.toContain('"remoteUserId": "opaque-user"');
    await expect(
      app.vault.adapter.read(".rss-dashboard-data/freshrss-state.json"),
    ).resolves.not.toContain("test-password");
  });

  it("leaves FreshRSS disabled without SecretStorage or network access when the storage migration is required", async () => {
    vi.spyOn(obsidian, "requireApiVersion").mockReturnValue(true);
    const requestUrl = vi.spyOn(obsidian, "requestUrl");
    const app = obsidian.App.createMock();
    const secretStorageApp = app as unknown as {
      secretStorage: { getSecret(reference: string): string | null; listSecrets(): string[] };
    };
    const getSecret = vi.fn(() => '{"username":"test-user","apiPassword":"test-password"}');
    secretStorageApp.secretStorage = {
      getSecret,
      listSecrets: () => ["freshrss-primary"],
    };
    const plugin = new RssDashboardPlugin(app, {
      id: "rss-dashboard",
      name: "RSS Dashboard",
      version: "2.6.0",
    });
    plugin.settings = cloneSettings();
    plugin.settings.storageMode = "legacy-json";
    plugin.settings.freshRss.endpoint = "https://reader.example.test/api/greader.php";
    plugin.settings.freshRss.credentialReference = "freshrss-primary";
    vi.spyOn(plugin, "saveSettings").mockResolvedValue();

    await expect(plugin.testFreshRssConnection()).resolves.toBe(
      "storage-migration-required",
    );

    expect(getSecret).not.toHaveBeenCalled();
    expect(requestUrl).not.toHaveBeenCalled();
  });
});
