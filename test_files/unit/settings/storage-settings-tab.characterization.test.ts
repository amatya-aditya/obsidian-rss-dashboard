import { afterEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { renderStorageSettingsTab } from "../../../src/settings/tabs/storage-settings-tab";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function createPlugin() {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as typeof DEFAULT_SETTINGS;

  return {
    app: obsidian.App.createMock() as unknown as obsidian.App,
    settingTab: { display: vi.fn() },
    settings,
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
    getUnloadedShardFeedCount: vi.fn(() => 0),
    migrateToVaultStorage: vi.fn(async () => {}),
    migrateToVaultShardsV2: vi.fn(async () => {}),
    repairVaultStorage: vi.fn(async () => ({ skippedFeedCount: 0 })),
    previewRepairVaultStorage: vi.fn(async () => ({
      rewriteCount: 0,
      skippedFeedTitles: [],
      shrinkingFeeds: [],
    })),
    importPortableDataBundleFromFile: vi.fn(async () => {}),
    importFeedBundleFromFile: vi.fn(async () => {
      throw new Error("Invalid JSON bundle");
    }),
    importSettingsBundleFromFile: vi.fn(async () => {}),
    exportPortableDataBundle: vi.fn(async () => {}),
    exportFeedBundle: vi.fn(async () => {}),
    exportSettingsBundle: vi.fn(async () => {}),
    exportDataJson: vi.fn(async () => {}),
    revertToLegacyJsonStorageWithOptions: vi.fn(async () => {}),
    isShardFolderDeletionError: vi.fn(() => false),
    openStorageFolderInSystem: vi.fn(async () => {}),
    migrateMetadataToVaultLocation: vi.fn(async () => {}),
    revertMetadataToPluginDefault: vi.fn(async () => {}),
  };
}

function createContainer(): HTMLDivElement {
  const containerEl = createDiv();
  document.body.appendChild(containerEl);
  return containerEl;
}

function getButton(containerEl: HTMLElement, name: string): HTMLButtonElement {
  const button = Array.from(
    containerEl.querySelectorAll<HTMLButtonElement>("button"),
  ).find((candidate) => candidate.textContent === name);
  if (!button) throw new Error(`Button not found: ${name}`);
  return button;
}

afterEach(() => {
  document.body.empty();
  vi.restoreAllMocks();
});

describe("Storage settings characterization", () => {
  it("does nothing for an empty file selection", async () => {
    installObsidianDomPolyfills();
    const containerEl = createContainer();
    const plugin = createPlugin();
    renderStorageSettingsTab(containerEl, plugin as never);

    getButton(containerEl, "Import feed bundle").click();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    Object.defineProperty(input, "files", { configurable: true, value: [] });
    input.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(plugin.importFeedBundleFromFile).not.toHaveBeenCalled();
  });

  it("reports a malformed feed bundle import without leaking its rejection", async () => {
    installObsidianDomPolyfills();
    const containerEl = createContainer();
    const plugin = createPlugin();
    const debug = vi.spyOn(console, "debug");
    renderStorageSettingsTab(containerEl, plugin as never);

    getButton(containerEl, "Import feed bundle").click();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const malformedBundle = new File(["{"], "feeds.json", {
      type: "application/json",
    });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [malformedBundle],
    });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(debug).toHaveBeenCalledWith(
        "[Stub Notice]",
        "Feed bundle import failed: Invalid JSON bundle",
      ),
    );

    expect(plugin.importFeedBundleFromFile).toHaveBeenCalledWith(
      malformedBundle,
    );
  });
});
