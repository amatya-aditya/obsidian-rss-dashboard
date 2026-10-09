import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";

vi.mock("../../../src/modals/whats-new-modal", () => ({
  WhatsNewModal: class {
    open = vi.fn();
  },
}));

vi.mock("../../../src/modals/storage-migration-modal", () => ({
  StorageMigrationModal: class {
    open = vi.fn();
  },
}));

import RssDashboardPlugin from "../../../main";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const metadataFolder = ".rss-dashboard-data";
const storageFolder = `${metadataFolder}/feeds`;

const manifest: PluginManifest = {
  id: "rss-dashboard",
  name: "RSS Dashboard",
  version: "2.7.0",
  minAppVersion: "1.8.7",
  author: "test",
  description: "test",
  dir: ".",
};

describe("Focus mode after an import", () => {
  let plugin: RssDashboardPlugin;
  let applySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.restoreAllMocks();
    const app = App.createMock();
    await app.vault.adapter.mkdir(storageFolder);
    await app.vault.adapter.write(
      `${metadataFolder}/data.json`,
      JSON.stringify({
        ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
        lastShownVersion: "2.7.0",
        storageMode: "vault-shards-v2",
        storageFolder,
        metadataStorageMode: "vault-location",
        metadataStorageFolder: metadataFolder,
        metadataStorageSchemaVersion: 2,
        feeds: [
          {
            feedId: "feed-a",
            title: "Feed A",
            url: "https://example.com/a.xml",
            folder: "RSS",
            lastUpdated: 0,
          },
        ],
      }),
    );
    await app.vault.adapter.write(
      `${storageFolder}/feed-a.json`,
      JSON.stringify({
        version: 1,
        feedId: "feed-a",
        feedUrl: "https://example.com/a.xml",
        updatedAt: 0,
        items: [],
      }),
    );
    await app.vault.adapter.write(
      `${metadataFolder}/user-state.json`,
      JSON.stringify({ version: 3, states: {} }),
    );
    plugin = new RssDashboardPlugin(app, manifest);
    plugin.loadData = vi.fn().mockResolvedValue({
      metadataStorageMode: "vault-location",
      metadataStorageFolder: metadataFolder,
      metadataStorageSchemaVersion: 2,
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);
    await plugin.loadSettings();
    applySpy = vi
      .spyOn(plugin, "applyYouTubeFocusMode")
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("pushes the imported value to every open Reader and dashboard", async () => {
    const bundle = plugin.getSettingsBundle();
    bundle.settings.media.youtubeFocusMode = true;

    installObsidianDomPolyfills();
    const result = plugin.importSettingsBundleFromFile(
      new File([JSON.stringify(bundle)], "settings-bundle.json"),
    );
    await vi.waitFor(() => {
      expect(findButton("Overwrite")).toBeDefined();
    });
    findButton("Overwrite")?.click();

    await expect(result).resolves.toBe("committed");
    expect(plugin.settings.media.youtubeFocusMode).toBe(true);
    expect(applySpy).toHaveBeenLastCalledWith(true);
  });

  it("does not touch open views when the import is canceled", async () => {
    const bundle = plugin.getSettingsBundle();
    bundle.settings.media.youtubeFocusMode = true;

    installObsidianDomPolyfills();
    const result = plugin.importSettingsBundleFromFile(
      new File([JSON.stringify(bundle)], "settings-bundle.json"),
    );
    await vi.waitFor(() => {
      expect(findButton("Cancel")).toBeDefined();
    });
    findButton("Cancel")?.click();

    await expect(result).resolves.toBe("canceled");
    expect(plugin.settings.media.youtubeFocusMode).toBe(false);
    expect(applySpy).not.toHaveBeenCalled();
  });
});

function findButton(label: string): HTMLButtonElement | undefined {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  ).find((button) => button.textContent?.trim() === label);
}
