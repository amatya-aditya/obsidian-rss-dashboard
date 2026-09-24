import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import {
  buildDefaultAutoBackupSettings,
  FactoryResetConfirmModal,
  getBackupFilename,
  renderImportExportSettingsTab,
} from "../../../src/settings/tabs/import-export-settings-tab";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import {
  FACTORY_RESET_LOCAL_STORAGE_KEYS,
  buildFactoryResetSettings,
} from "../../../src/utils/settings-loader";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type RssDashboardPlugin from "../../../main";

type ObsidianHTMLElement = HTMLElement & {
  empty: () => void;
  createDiv: () => HTMLDivElement;
};

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function cloneSettings(): typeof DEFAULT_SETTINGS {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
}

function createContainerEl(): HTMLDivElement {
  return (document.body as ObsidianHTMLElement).createDiv();
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
    settings: cloneSettings(),
    saveSettings: vi.fn(async () => {}),
    exportDataJson: vi.fn(async () => {}),
    copyDataJsonToClipboard: vi.fn(async () => {}),
    importUserSettingsJsonFromFile: vi.fn(async () => {}),
    exportUserSettingsJson: vi.fn(async () => {}),
    copyUserSettingsJsonToClipboard: vi.fn(async () => {}),
    exportOpml: vi.fn(async () => {}),
    copyOpmlToClipboard: vi.fn(async () => {}),
    exportPortableDataBundle: vi.fn(async () => {}),
    importPortableDataBundleFromFile: vi.fn(async () => {}),
    copyPortableDataBundleToClipboard: vi.fn(async () => {}),
    exportFeedBundle: vi.fn(async () => {}),
    importFeedBundleFromFile: vi.fn(async () => {}),
    copyFeedBundleToClipboard: vi.fn(async () => {}),
    exportSettingsBundle: vi.fn(async () => {}),
    importSettingsBundleFromFile: vi.fn(async () => {}),
    copySettingsBundleToClipboard: vi.fn(async () => {}),
    getActiveDashboardView: vi.fn(async () => null),
    performFactoryReset: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  installObsidianDomPolyfills();
  (document.body as ObsidianHTMLElement).empty();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("Auto Backup Helpers", () => {
  describe("buildDefaultAutoBackupSettings()", () => {
    it("returns the expected default values (OPML/Userdata true, DataJson false)", () => {
      const defaults = buildDefaultAutoBackupSettings();
      expect(defaults).toEqual({
        backupDataJson: false,
        backupOpml: true,
        backupUserdata: true,
      });
    });

    it("returns a fresh object on each call", () => {
      const a = buildDefaultAutoBackupSettings();
      const b = buildDefaultAutoBackupSettings();
      expect(a).not.toBe(b);

      // Mutate a, b should be unchanged
      a.backupDataJson = true;
      expect(b.backupDataJson).toBe(false);
    });
  });

  describe("getBackupFilename()", () => {
    it("appends .backup to standard filenames", () => {
      expect(getBackupFilename("data.json")).toBe("data.json.backup");
      expect(getBackupFilename("feeds.opml")).toBe("feeds.opml.backup");
      expect(getBackupFilename("userdata.json")).toBe("userdata.json.backup");
    });

    it("handles filenames without extensions", () => {
      expect(getBackupFilename("myfile")).toBe("myfile.backup");
    });

    it("handles empty string", () => {
      expect(getBackupFilename("")).toBe(".backup");
    });

    it("appends .backup even if it already ends in .backup", () => {
      expect(getBackupFilename("data.json.backup")).toBe(
        "data.json.backup.backup",
      );
    });
  });

  describe("Factory reset helpers", () => {
    it("returns the expected plugin-managed local storage keys", () => {
      expect(FACTORY_RESET_LOCAL_STORAGE_KEYS).toEqual([
        "rss-discover-filters",
        "rss-podcast-progress",
        "rss-first-launch-coachmark-shown",
      ]);
    });

    it("builds a fresh factory-reset settings object with fresh folder timestamps", () => {
      vi.spyOn(Date, "now").mockReturnValue(123456789);

      const a = buildFactoryResetSettings();
      const b = buildFactoryResetSettings();

      expect(a).toEqual({
        ...DEFAULT_SETTINGS,
        folders: DEFAULT_SETTINGS.folders.map((folder) => ({
          ...folder,
          subfolders: [],
          createdAt: 123456789,
          modifiedAt: 123456789,
        })),
      });
      expect(a).not.toBe(b);
      expect(a.display).not.toBe(DEFAULT_SETTINGS.display);
      expect(a.availableTags).not.toBe(DEFAULT_SETTINGS.availableTags);
      expect(a.folders).not.toBe(DEFAULT_SETTINGS.folders);

      a.display.showSummary = false;
      a.availableTags[0].name = "Changed";
      expect(DEFAULT_SETTINGS.display.showSummary).toBe(true);
      expect(DEFAULT_SETTINGS.availableTags[0]?.name).toBe("Important");
    });
  });

  describe("renderImportExportSettingsTab() factory reset section", () => {
    it("renders shard data actions", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      renderImportExportSettingsTab(containerEl, plugin as unknown as RssDashboardPlugin);

      const portableSetting = getSettingByName(
        containerEl,
        "Shard data",
      );
      expect(portableSetting.textContent).toContain(
        "cross-device migration",
      );

      const buttons = Array.from(
        containerEl.querySelectorAll<HTMLButtonElement>("button"),
      ).map((button) => button.textContent?.trim());
      expect(buttons).toContain("Import shard data");
      expect(buttons).toContain("Export shard data");
    });

    it("calls shard data export when Export shard data is clicked", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      renderImportExportSettingsTab(containerEl, plugin as unknown as RssDashboardPlugin);

      const exportButton = Array.from(
        containerEl.querySelectorAll<HTMLButtonElement>("button"),
      ).find(
        (button) => button.textContent === "Export shard data",
      ) as HTMLButtonElement;

      exportButton.click();
      expect(plugin.exportPortableDataBundle).toHaveBeenCalledTimes(1);
    });

    it("calls shard data clipboard copy when its copy button is clicked", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      renderImportExportSettingsTab(containerEl, plugin as unknown as RssDashboardPlugin);

      const copyButton = containerEl.querySelector<HTMLButtonElement>(
        'button[aria-label="Copy shard data to clipboard"]',
      );
      expect(copyButton).not.toBeNull();

      copyButton?.click();
      expect(plugin.copyPortableDataBundleToClipboard).toHaveBeenCalledTimes(1);
    });

    it("renders Feed bundle actions", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      renderImportExportSettingsTab(containerEl, plugin as unknown as RssDashboardPlugin);

      const feedBundleSetting = getSettingByName(containerEl, "Feed bundle");
      expect(feedBundleSetting.textContent).toContain("no app settings");
      expect(feedBundleSetting.textContent).toContain(
        "rss-dashboard-feed-bundle.json",
      );

      const buttons = Array.from(
        containerEl.querySelectorAll<HTMLButtonElement>("button"),
      ).map((button) => button.textContent?.trim());
      expect(buttons).toContain("Import feed bundle");
      expect(buttons).toContain("Export feed bundle");
    });

    it("calls Feed bundle clipboard copy when its copy button is clicked", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      renderImportExportSettingsTab(containerEl, plugin as unknown as RssDashboardPlugin);

      const copyButton = containerEl.querySelector<HTMLButtonElement>(
        'button[aria-label="Copy feed bundle to clipboard"]',
      );
      expect(copyButton).not.toBeNull();

      copyButton?.click();
      expect(plugin.copyFeedBundleToClipboard).toHaveBeenCalledTimes(1);
    });

    it("calls Feed bundle export when Export Feed bundle is clicked", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      renderImportExportSettingsTab(containerEl, plugin as unknown as RssDashboardPlugin);

      const exportButton = Array.from(
        containerEl.querySelectorAll<HTMLButtonElement>("button"),
      ).find(
        (button) => button.textContent === "Export feed bundle",
      ) as HTMLButtonElement;

      exportButton.click();
      expect(plugin.exportFeedBundle).toHaveBeenCalledTimes(1);
    });

    it("renders Settings bundle actions", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      renderImportExportSettingsTab(containerEl, plugin as unknown as RssDashboardPlugin);

      const settingsBundleSetting = getSettingByName(
        containerEl,
        "Settings bundle",
      );
      expect(settingsBundleSetting.textContent).toContain("app preferences");
      expect(settingsBundleSetting.textContent).toContain(
        "rss-dashboard-settings-bundle.json",
      );

      const buttons = Array.from(
        containerEl.querySelectorAll<HTMLButtonElement>("button"),
      ).map((button) => button.textContent?.trim());
      expect(buttons).toContain("Import settings bundle");
      expect(buttons).toContain("Export settings bundle");
    });

    it("calls Settings bundle clipboard copy when its copy button is clicked", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      renderImportExportSettingsTab(containerEl, plugin as unknown as RssDashboardPlugin);

      const copyButton = containerEl.querySelector<HTMLButtonElement>(
        'button[aria-label="Copy settings bundle to clipboard"]',
      );
      expect(copyButton).not.toBeNull();

      copyButton?.click();
      expect(plugin.copySettingsBundleToClipboard).toHaveBeenCalledTimes(1);
    });

    it("calls Settings bundle export when Export Settings bundle is clicked", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      renderImportExportSettingsTab(containerEl, plugin as unknown as RssDashboardPlugin);

      const exportButton = Array.from(
        containerEl.querySelectorAll<HTMLButtonElement>("button"),
      ).find(
        (button) => button.textContent === "Export settings bundle",
      ) as HTMLButtonElement;

      exportButton.click();
      expect(plugin.exportSettingsBundle).toHaveBeenCalledTimes(1);
    });

    it("renders User preferences file actions naming rss-dashboard-user-preferences.json", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      renderImportExportSettingsTab(containerEl, plugin as unknown as RssDashboardPlugin);

      const userPreferencesSetting = getSettingByName(
        containerEl,
        "User preferences file",
      );
      expect(userPreferencesSetting.textContent).toContain(
        "rss-dashboard-user-preferences.json",
      );

      const buttons = Array.from(
        containerEl.querySelectorAll<HTMLButtonElement>("button"),
      ).map((button) => button.textContent?.trim());
      expect(buttons).toContain("Import user preferences");
      expect(buttons).toContain("Export user preferences");
    });

    it("calls user preferences import/export/copy when their buttons are used", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      renderImportExportSettingsTab(containerEl, plugin as unknown as RssDashboardPlugin);

      const exportButton = Array.from(
        containerEl.querySelectorAll<HTMLButtonElement>("button"),
      ).find(
        (button) => button.textContent === "Export user preferences",
      ) as HTMLButtonElement;
      exportButton.click();
      expect(plugin.exportUserSettingsJson).toHaveBeenCalledTimes(1);

      const copyButton = containerEl.querySelector<HTMLButtonElement>(
        'button[aria-label="Copy user preferences to clipboard"]',
      );
      expect(copyButton).not.toBeNull();
      copyButton?.click();
      expect(plugin.copyUserSettingsJsonToClipboard).toHaveBeenCalledTimes(1);
    });

    it("renders the Import starred articles entry point next to Import OPML", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      renderImportExportSettingsTab(containerEl, plugin as unknown as RssDashboardPlugin);

      const starredSetting = getSettingByName(
        containerEl,
        "Starred imports",
      );
      expect(starredSetting.textContent).toContain("starred.json");

      const buttons = Array.from(
        containerEl.querySelectorAll<HTMLButtonElement>("button"),
      ).map((button) => button.textContent?.trim());
      expect(buttons).toContain("Import starred articles");

      const settingNames = Array.from(
        containerEl.querySelectorAll<HTMLElement>(".setting-item-name"),
      ).map((el) => el.textContent?.trim());
      expect(settingNames.indexOf("Starred imports")).toBeGreaterThan(
        settingNames.indexOf("OPML"),
      );
    });

    it("renders Factory Reset after the Auto backups section", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      renderImportExportSettingsTab(containerEl, plugin as unknown as RssDashboardPlugin);

      const settingNames = Array.from(
        containerEl.querySelectorAll<HTMLElement>(".setting-item-name"),
      ).map((el) => el.textContent?.trim());

      expect(settingNames.indexOf("Auto backups")).toBeGreaterThan(-1);
      expect(settingNames.indexOf("Factory reset")).toBeGreaterThan(
        settingNames.indexOf("Auto backups"),
      );

      const resetSetting = getSettingByName(containerEl, "Factory reset");
      expect(resetSetting.textContent).toContain(
        "Restore all plugin settings to their default values",
      );
    });

    it("does not reset when the confirmation modal is cancelled", async () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      const openSpy = vi
        .spyOn(FactoryResetConfirmModal.prototype, "open")
        .mockImplementation(() => {});
      vi.spyOn(
        FactoryResetConfirmModal.prototype,
        "waitForClose",
      ).mockResolvedValue(false);

      renderImportExportSettingsTab(containerEl, plugin as unknown as RssDashboardPlugin);

      const resetButton = Array.from(
        containerEl.querySelectorAll<HTMLButtonElement>("button"),
      ).find(
        (button) => button.textContent === "Factory reset",
      ) as HTMLButtonElement;
      expect(resetButton).toBeTruthy();

      resetButton.click();
      await flushPromises();

      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(plugin.performFactoryReset).not.toHaveBeenCalled();
    });

    it("runs the factory reset when the confirmation modal is confirmed", async () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      const openSpy = vi
        .spyOn(FactoryResetConfirmModal.prototype, "open")
        .mockImplementation(() => {});
      vi.spyOn(
        FactoryResetConfirmModal.prototype,
        "waitForClose",
      ).mockResolvedValue(true);

      renderImportExportSettingsTab(containerEl, plugin as unknown as RssDashboardPlugin);

      const resetButton = Array.from(
        containerEl.querySelectorAll<HTMLButtonElement>("button"),
      ).find(
        (button) => button.textContent === "Factory reset",
      ) as HTMLButtonElement;

      resetButton.click();
      await flushPromises();

      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(plugin.performFactoryReset).toHaveBeenCalledTimes(1);
    });
  });
});
