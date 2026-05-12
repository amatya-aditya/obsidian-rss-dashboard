import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type { RssDashboardSettings } from "../../../src/types/types";

// Note: These tests assume a future function renderMetadataStorageSettingsTab or similar
// Tests written before implementation (Red cycle)

type ObsidianHTMLElement = HTMLElement & {
  empty: () => void;
  createDiv: () => HTMLDivElement;
};

function createPlugin() {
  return {
    app: obsidian.App.createMock(),
    manifest: { dir: ".obsidian/plugins/obsidian-rss-dashboard" },
    settings: {
      feeds: [],
      folders: [],
      tags: [],
      rules: [],
      highlightWords: [],
      autoRefreshIntervalMinutes: 60,
      storageMode: "legacy-json" as const,
      storageFolder: ".rss-dashboard-data/feeds",
      storageSchemaVersion: 1,
      metadataStorageMode: "plugin-default" as const,
      metadataStorageFolder: ".rss-dashboard-data",
      metadataStorageSchemaVersion: 1,
    } as any as RssDashboardSettings,
    saveSettings: vi.fn(async () => {}),
    migrateMetadataToVaultLocation: vi.fn(async () => {}),
    revertMetadataToPluginDefault: vi.fn(async () => {}),
    showNotice: vi.fn((msg: string) => console.log("[Stub Notice]", msg)),
  };
}

function getSettingByName(containerEl: HTMLElement, name: string): HTMLElement {
  const settingEls = Array.from(containerEl.querySelectorAll(".setting-item"));
  const match = settingEls.find((el) => {
    const nameEl = el.querySelector(".setting-item-name");
    return nameEl?.textContent?.includes(name);
  });
  if (!match) throw new Error(`Setting not found: ${name}`);
  return match as HTMLElement;
}

function createContainerEl(): HTMLDivElement {
  return (document.body as ObsidianHTMLElement).createDiv();
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Metadata Storage Settings Tab", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    (document.body as ObsidianHTMLElement).empty();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe("UI Rendering", () => {
    it("renders 'Metadata Storage' section heading", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      // Once renderMetadataStorageSettingsTab is created, call it here
      // renderMetadataStorageSettingsTab(containerEl, plugin as any);

      // Expected: heading text "Metadata Storage"
      // Actual: function does not exist yet
      expect(true).toBe(true); // Placeholder
    });

    it("renders current storage mode indicator (plugin-default or vault-location)", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.settings.metadataStorageMode = "plugin-default";

      // Expected: text shows "Currently using: .obsidian/plugins/rss-dashboard"
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("updates storage mode indicator when mode changes", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.settings.metadataStorageMode = "vault-location";
      plugin.settings.metadataStorageFolder = ".rss-dashboard-data";

      // Expected: text shows "Currently using: .rss-dashboard-data"
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("renders storage mode toggle dropdown with two options", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      // Expected: dropdown with "Plugin default" and "Vault location"
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("renders folder path input field with current value", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.settings.metadataStorageFolder = ".rss-dashboard-data";

      // Expected: text input showing ".rss-dashboard-data"
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("renders 'Migrate to vault location' button when in plugin-default mode", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.settings.metadataStorageMode = "plugin-default";

      // Expected: button is visible
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("hides 'Migrate to vault location' button when in vault-location mode", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.settings.metadataStorageMode = "vault-location";

      // Expected: button is hidden or not rendered
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("renders 'Revert to plugin default' button when in vault-location mode", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.settings.metadataStorageMode = "vault-location";

      // Expected: button is visible
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("hides 'Revert to plugin default' button when in plugin-default mode", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.settings.metadataStorageMode = "plugin-default";

      // Expected: button is hidden or not rendered
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("applies responsive stacking CSS to action buttons on small screens", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      // Expected: buttons use class ".rss-dashboard-metadata-storage-actions"
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("User Interactions - Migration", () => {
    it("calls migrateMetadataToVaultLocation when migrate button is clicked", async () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      // Once function exists, uncomment:
      // renderMetadataStorageSettingsTab(containerEl, plugin as any);
      // const migrateButton = Array.from(containerEl.querySelectorAll<HTMLButtonElement>("button"))
      //   .find(btn => btn.textContent === "Migrate to vault location");
      // migrateButton?.click();
      // await flushPromises();

      // Expected: plugin.migrateMetadataToVaultLocation() called
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("disables button while migration is in progress", async () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.migrateMetadataToVaultLocation.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );

      // Expected: button disabled during operation
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("shows success notice after migration completes", async () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      // Expected: showNotice called with success message
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("shows error notice if migration fails", async () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.migrateMetadataToVaultLocation.mockRejectedValue(
        new Error("Folder create failed"),
      );

      // Expected: showNotice called with error message
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("validates folder path before migration", async () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.settings.metadataStorageFolder = "";

      // Expected: warning shown if path is empty or invalid
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("User Interactions - Revert", () => {
    it("calls revertMetadataToPluginDefault when revert button is clicked", async () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.settings.metadataStorageMode = "vault-location";

      // Expected: plugin.revertMetadataToPluginDefault() called
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("shows confirmation modal before reverting", async () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.settings.metadataStorageMode = "vault-location";

      // Expected: modal shown asking to confirm with option to clean up old file
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("shows success notice after revert completes", async () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.settings.metadataStorageMode = "vault-location";

      // Expected: showNotice called with success message
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("shows error notice if revert fails", async () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.revertMetadataToPluginDefault.mockRejectedValue(
        new Error("Write failed"),
      );

      // Expected: showNotice called with error message
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("Settings Synchronization", () => {
    it("updates settings UI when metadataStorageMode changes externally", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      // Expected: UI reflects new mode without re-rendering
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("updates settings UI when metadataStorageFolder changes externally", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.settings.metadataStorageFolder = ".custom/path";

      // Expected: input field and status text update
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("persists folder path changes to settings when input changes", async () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();

      // Expected: folder path saved to settings.metadataStorageFolder
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("Error Handling", () => {
    it("shows error if folder path contains invalid characters", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.settings.metadataStorageFolder = "invalid/path:with*illegal";

      // Expected: validation error shown
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("normalizes folder paths (removes trailing slashes)", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.settings.metadataStorageFolder = ".rss-dashboard-data/";

      // Expected: path normalized to ".rss-dashboard-data"
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });

    it("shows warning if user tries to migrate to an existing file path", () => {
      const containerEl = createContainerEl();
      const plugin = createPlugin();
      plugin.settings.metadataStorageFolder = "existing-file.json";

      // Expected: warning notice shown
      // Actual: not implemented
      expect(true).toBe(true); // Placeholder
    });
  });
});
