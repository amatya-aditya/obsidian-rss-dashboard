import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import {
  DEFAULT_SETTINGS,
  type Folder,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { renderStorageSettingsTab } from "../../../src/settings/tabs/storage-settings-tab";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type RssDashboardPlugin from "../../../main";

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function getSettingByName(containerEl: HTMLElement, name: string): HTMLElement {
  const settingEls = Array.from(containerEl.querySelectorAll(".setting-item"));
  const match = settingEls.find((el) => {
    const nameEl = el.querySelector(".setting-item-name");
    return nameEl?.textContent === name;
  });

  if (!match) {
    throw new Error(`Setting not found: ${name}`);
  }

  return match as HTMLElement;
}

function sampleFolders(): Folder[] {
  return [
    { name: "YouTube", subfolders: [] },
    { name: "Podcast", subfolders: [] },
  ];
}

function createPlugin() {
  return {
    app: obsidian.App.createMock(),
    settingTab: { display: vi.fn() },
    settings: cloneSettings(),
    saveSettings: vi.fn(async () => {}),
    getActiveDashboardView: vi.fn(async () => null),
    getOrphanedUserStatePath: vi.fn(async () => null),
    getMetadataFilePath: vi.fn(() => "rss-dashboard-data/data.json"),
    getStorageStatus: vi.fn(() => ({
      mode: "legacy-json" as const,
      folder: ".rss-dashboard-data/feeds",
      shardCount: 0,
      feedCount: 0,
      migrationReady: true,
      lastRepairResult: "Not yet run",
    })),
    migrateToVaultStorage: vi.fn(async () => {}),
    previewRepairVaultStorage: vi.fn(async () => ({
      rewriteCount: 1,
      skippedFeedTitles: [],
      shrinkingFeeds: [],
    })),
    repairVaultStorage: vi.fn(async () => ({ skippedFeedCount: 0 })),
    getUnloadedShardFeedCount: vi.fn(() => 0),
    importPortableDataBundleFromFile: vi.fn(async () => {}),
    exportPortableDataBundle: vi.fn(async () => {}),
    exportDataJson: vi.fn(async () => {}),
    revertToLegacyJsonStorageWithOptions: vi.fn(async () => {}),
    isShardFolderDeletionError: vi.fn(() => false),
    openStorageFolderInSystem: vi.fn(async () => {}),
    migrateMetadataToVaultLocation: vi.fn(async () => {}),
    revertMetadataToPluginDefault: vi.fn(async () => {}),
    clearPlaybackProgress: vi.fn(async () => 0),
    getActiveReaderView: vi.fn(async () => null),
  } as unknown as RssDashboardPlugin;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("renderStorageSettingsTab() - default folders and metadata", () => {
  it("renders the storage section headings in the dedicated Storage tab", () => {
    const containerEl = document.body.appendChild(createDiv());
    const plugin = createPlugin();

    renderStorageSettingsTab(containerEl, plugin);

    const names = Array.from(
      containerEl.querySelectorAll(".setting-item-name"),
    ).map((el) => el.textContent?.trim());

    expect(names).toContain("Storage");
    expect(names).toContain("Metadata storage");
    expect(names).toContain("Default folders");
  });

  it("renders and persists the supported default folder settings", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.folders = sampleFolders();
    settings.media.defaultYouTubeFolder = "YouTube";
    settings.media.defaultSmallwebFolder = "Smallweb";

    const plugin = {
      ...createPlugin(),
      settings,
    } as unknown as RssDashboardPlugin;

    vi.spyOn(obsidian, "normalizePath").mockImplementation(
      (value: string) => `norm:${value}`,
    );

    renderStorageSettingsTab(containerEl, plugin);

    const youtubeInput = getSettingByName(
      containerEl,
      "Default YouTube folder",
    ).querySelector('input[type="text"]') as HTMLInputElement;
    youtubeInput.value = "Media/YouTube";
    youtubeInput.dispatchEvent(new Event("input"));

    const smallwebInput = getSettingByName(
      containerEl,
      "Default smallweb folder",
    ).querySelector('input[type="text"]') as HTMLInputElement;
    smallwebInput.value = "Web/Smallweb";
    smallwebInput.dispatchEvent(new Event("input"));

    await flushPromises();

    expect(plugin.settings.media.defaultYouTubeFolder).toBe(
      "norm:Media/YouTube",
    );
    expect(plugin.settings.media.defaultSmallwebFolder).toBe(
      "norm:Web/Smallweb",
    );
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(2);
  });

  it("restores the default folder names from the reset action", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.media.defaultMastodonFolder = "Custom/Mastodon";
    settings.media.defaultYouTubeFolder = "Custom/YouTube";
    settings.media.defaultPodcastFolder = "Custom/Podcast";
    settings.media.defaultRssFolder = "Custom/RSS";
    settings.media.defaultSmallwebFolder = "Custom/Smallweb";

    const plugin = {
      ...createPlugin(),
      settings,
    } as unknown as RssDashboardPlugin;

    renderStorageSettingsTab(containerEl, plugin);

    const resetSetting = getSettingByName(containerEl, "Reset folder names");
    const resetButton = resetSetting.querySelector("button") as HTMLButtonElement;
    resetButton.click();
    await flushPromises();

    const defaults = DEFAULT_SETTINGS.media;
    expect(plugin.settings.media.defaultMastodonFolder).toBe(
      defaults.defaultMastodonFolder,
    );
    expect(plugin.settings.media.defaultYouTubeFolder).toBe(
      defaults.defaultYouTubeFolder,
    );
    expect(plugin.settings.media.defaultPodcastFolder).toBe(
      defaults.defaultPodcastFolder,
    );
    expect(plugin.settings.media.defaultRssFolder).toBe(
      defaults.defaultRssFolder,
    );
    expect(plugin.settings.media.defaultSmallwebFolder).toBe(
      defaults.defaultSmallwebFolder,
    );
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
  });
});

describe("renderStorageSettingsTab() - previous metadata copy cleanup", () => {
  async function applyMetadataLocation(
    containerEl: HTMLElement,
    folder: string,
  ): Promise<void> {
    const input = getSettingByName(
      containerEl,
      "Metadata data.json location",
    ).querySelector('input[type="text"]') as HTMLInputElement;
    input.value = folder;
    input.dispatchEvent(new Event("input"));
    const applyButton = getSettingByName(
      containerEl,
      "Metadata actions",
    ).querySelector("button") as HTMLButtonElement;
    applyButton.click();
    await flushPromises();
  }

  function findCleanupModal(): HTMLElement | null {
    const heading = Array.from(document.querySelectorAll(".modal h2")).find(
      (el) => el.textContent === "Delete previous metadata copy?",
    );
    return (heading?.closest(".modal") as HTMLElement | null) ?? null;
  }

  function clickModalButton(modal: HTMLElement, text: string): void {
    const button = Array.from(modal.querySelectorAll("button")).find(
      (el) => el.textContent === text,
    );
    if (!button) {
      throw new Error(`Button not found: ${text}`);
    }
    button.click();
  }

  function createVaultLocationPlugin(folder: string) {
    const plugin = createPlugin();
    plugin.settings.metadataStorageMode = "vault-location";
    plugin.settings.metadataStorageFolder = folder;
    return plugin;
  }

  it("offers to delete the previous copy in a hidden vault folder and removes it", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const plugin = createVaultLocationPlugin(".rss-meta");
    const { vault } = plugin.app;
    await vault.createFolder(".rss-meta");
    await vault.create(".rss-meta/data.json", "{}");

    renderStorageSettingsTab(containerEl, plugin);
    await applyMetadataLocation(containerEl, "rss-meta2");

    const modal = findCleanupModal();
    expect(modal).not.toBeNull();
    clickModalButton(modal as HTMLElement, "Delete previous copy");
    await flushPromises();

    expect(await vault.adapter.exists(".rss-meta/data.json")).toBe(false);
  });

  it("offers to delete the previous copy in a visible vault folder", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const plugin = createVaultLocationPlugin("rss-meta");
    const { vault } = plugin.app;
    await vault.createFolder("rss-meta");
    await vault.create("rss-meta/data.json", "{}");

    renderStorageSettingsTab(containerEl, plugin);
    await applyMetadataLocation(containerEl, "rss-meta2");

    const modal = findCleanupModal();
    expect(modal).not.toBeNull();
    clickModalButton(modal as HTMLElement, "Delete previous copy");
    await flushPromises();

    expect(await vault.adapter.exists("rss-meta/data.json")).toBe(false);
  });

  it("never offers to delete the plugin-default data.json, which becomes the bootstrap pointer", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const plugin = createPlugin();
    const { vault } = plugin.app;
    const pluginDir = `${vault.configDir}/plugins/rss-dashboard`;
    const bootstrapPath = `${pluginDir}/data.json`;
    await vault.adapter.mkdir(pluginDir);
    await vault.adapter.write(bootstrapPath, "{}");

    renderStorageSettingsTab(containerEl, plugin);
    await applyMetadataLocation(containerEl, "rss-meta");

    expect(findCleanupModal()).toBeNull();
    expect(await vault.adapter.exists(bootstrapPath)).toBe(true);
  });
});
