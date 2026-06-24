// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { App, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, RssDashboardSettings } from "../../../src/types/types";
import { SettingsManager } from "../../../src/services/settings-manager";

describe("SettingsManager", () => {
  let mockApp: App;
  let mockPlugin: Plugin;
  let loadDataMock: Mock<() => Promise<unknown>>;
  let saveDataMock: Mock<(data: unknown) => Promise<void>>;
  let adapterWriteMock: Mock<(path: string, data: string) => Promise<void>>;

  beforeEach(() => {
    loadDataMock = vi.fn();
    saveDataMock = vi.fn();
    adapterWriteMock = vi.fn();

    mockApp = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(null), // By default, nothing exists
        createFolder: vi.fn().mockResolvedValue(undefined),
        adapter: {
          read: vi.fn(),
          write: adapterWriteMock,
          exists: vi.fn(),
          mkdir: vi.fn(),
        },
      },
      workspace: {
        on: vi.fn(),
        off: vi.fn(),
      },
    } as unknown as App;

    mockPlugin = {
      loadData: loadDataMock,
      saveData: saveDataMock,
    } as unknown as Plugin;
  });

  describe("Initialization & Loading", () => {
    it("applies default settings if no data exists", async () => {
      loadDataMock.mockResolvedValueOnce(null);

      const manager = new SettingsManager(mockApp, mockPlugin);
      await manager.loadSettings();

      expect(manager.settings).toBeDefined();
      expect(manager.settings.refreshInterval).toBe(
        DEFAULT_SETTINGS.refreshInterval,
      );
    });

    it("migrates legacy settings schemas upon load", async () => {
      const legacySettings = {
        ...DEFAULT_SETTINGS,
        lastRefreshedDate: 123456789, // Very old schema field
        version: "1.0",
      };
      loadDataMock.mockResolvedValueOnce(legacySettings);

      const manager = new SettingsManager(mockApp, mockPlugin);
      await manager.loadSettings();

      // Ensure save was called to persist the migrated version
      expect(saveDataMock).toHaveBeenCalled();
      expect(manager.settings).toBeDefined();
    });
  });

  describe("Saving & Storage Modes", () => {
    it("saves to plugin default when metadataStorageMode is 'plugin-default'", async () => {
      loadDataMock.mockResolvedValueOnce({
        ...DEFAULT_SETTINGS,
        metadataStorageMode: "plugin-default",
      });

      const manager = new SettingsManager(mockApp, mockPlugin);
      await manager.loadSettings();

      manager.settings.refreshInterval = 999;
      await manager.saveSettings();

      expect(saveDataMock).toHaveBeenCalled();
      const savedData = saveDataMock.mock.calls[0][0] as RssDashboardSettings;
      expect(savedData.refreshInterval).toBe(999);
    });

    it("saves to vault location when metadataStorageMode is 'vault-location'", async () => {
      loadDataMock.mockResolvedValueOnce({
        ...DEFAULT_SETTINGS,
        metadataStorageMode: "vault-location",
        metadataStorageFolder: ".custom-folder",
      });

      const manager = new SettingsManager(mockApp, mockPlugin);
      await manager.loadSettings();

      manager.settings.refreshInterval = 888;
      await manager.saveSettings();

      expect(adapterWriteMock).toHaveBeenCalledWith(
        ".custom-folder/data.json",
        expect.any(String),
      );
      // It should save the bootstrap pointer using the plugin default save
      expect(saveDataMock).toHaveBeenCalledWith(
        expect.objectContaining({
          metadataStorageMode: "vault-location",
          metadataStorageFolder: ".custom-folder",
        })
      );
    });
  });
});
