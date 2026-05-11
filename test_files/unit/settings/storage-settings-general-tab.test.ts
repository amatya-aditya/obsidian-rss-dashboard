import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { renderGeneralSettingsTab } from "../../../src/settings/tabs/general-settings-tab";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function cloneSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
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

function createPlugin() {
  return {
    app: obsidian.App.createMock(),
    settingTab: {
      display: vi.fn(),
    },
    settings: cloneSettings(),
    saveSettings: vi.fn(async () => {}),
    getActiveDashboardView: vi.fn(async () => null),
    getStorageStatus: vi.fn(() => ({
      mode: "legacy-json",
      folder: ".rss-dashboard-data/feeds",
      shardCount: 0,
      feedCount: 0,
      migrationReady: true,
      lastRepairResult: "Not yet run",
    })),
    migrateToVaultStorage: vi.fn(async () => {}),
    repairVaultStorage: vi.fn(async () => {}),
    exportPortableDataBundle: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("General settings storage section", () => {
  it("renders the experimental storage controls in the General tab", () => {
    const containerEl = document.body.createDiv();
    const plugin = createPlugin();

    renderGeneralSettingsTab(containerEl, plugin as any);

    expect(getSettingByName(containerEl, "Storage mode").textContent).toContain(
      "legacy monolithic data.json store",
    );
    expect(getSettingByName(containerEl, "Storage folder").textContent).toContain(
      "cross-device sync tools can access it",
    );
    expect(getSettingByName(containerEl, "Storage status").textContent).toContain(
      "Migration ready",
    );
  });

  it("wires migrate, repair, and export actions to plugin methods", async () => {
    const containerEl = document.body.createDiv();
    const plugin = createPlugin();

    renderGeneralSettingsTab(containerEl, plugin as any);

    const buttons = Array.from(containerEl.querySelectorAll("button"));
    const migrateButton = buttons.find(
      (button) => button.textContent === "Migrate to vault storage",
    ) as HTMLButtonElement;
    const repairButton = buttons.find(
      (button) => button.textContent === "Repair/Rebuild storage",
    ) as HTMLButtonElement;
    const exportButton = buttons.find(
      (button) => button.textContent === "Export portable data bundle",
    ) as HTMLButtonElement;

    migrateButton.click();
    repairButton.click();
    exportButton.click();

    await Promise.resolve();

    expect(plugin.migrateToVaultStorage).toHaveBeenCalledTimes(1);
    expect(plugin.repairVaultStorage).toHaveBeenCalledTimes(1);
    expect(plugin.exportPortableDataBundle).toHaveBeenCalledTimes(1);
  });

  it("updates the storage folder setting through a standard text input", async () => {
    const containerEl = document.body.createDiv();
    const plugin = createPlugin();

    renderGeneralSettingsTab(containerEl, plugin as any);

    const storageFolderSetting = getSettingByName(containerEl, "Storage folder");
    const input = storageFolderSetting.querySelector("input") as HTMLInputElement;

    input.value = "RSS Mirror/Feeds";
    input.dispatchEvent(new Event("input"));

    await Promise.resolve();

    expect(plugin.settings.storageFolder).toBe("RSS Mirror/Feeds");
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });
});
