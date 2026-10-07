import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { renderDisplaySettingsTab } from "../../../src/settings/tabs/display-settings-tab";
import { VersionStatusBarFeature } from "../../../src/settings/version-status-bar";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

interface RegisteredCommand {
  id: string;
  name: string;
  callback?: () => void;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
});

afterEach(() => {
  document.body.empty();
  vi.restoreAllMocks();
});

function getSetting(containerEl: HTMLElement, name: string): HTMLElement {
  const setting = Array.from(
    containerEl.querySelectorAll(".setting-item"),
  ).find(
    (element) =>
      element.querySelector(".setting-item-name")?.textContent === name,
  );
  if (!setting) throw new Error(`Setting not found: ${name}`);
  return setting as HTMLElement;
}

describe("version status bar setting and command", () => {
  it("keeps the version readout off by default and enables it from Display settings", async () => {
    let savedPreference: boolean | undefined;
    const statusItems: HTMLElement[] = [];
    let command: RegisteredCommand | undefined;
    const openDashboard = vi.fn();
    const feature = new VersionStatusBarFeature({
      version: "2.7.0",
      enabled: savedPreference ?? false,
      addStatusBarItem: () => {
        const item = document.body.createDiv();
        statusItems.push(item);
        return item;
      },
      openDashboard,
      saveEnabled: async (enabled) => {
        savedPreference = enabled;
      },
      addCommand: (registered) => {
        command = registered;
      },
    });
    const settings = structuredClone(DEFAULT_SETTINGS);
    const plugin = {
      app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
      settings,
      saveSettings: vi.fn(async () => {}),
      getImageCacheSizeBytes: vi.fn(() => 0),
      getActiveDashboardView: vi.fn(async () => null),
      getActiveReaderView: vi.fn(async () => null),
      versionStatusBar: feature,
    } as unknown as RssDashboardPlugin;
    const containerEl = document.body.createDiv();

    renderDisplaySettingsTab(containerEl, plugin, () => {});

    const control = getSetting(containerEl, "Show version in status bar");
    const toggle = control.querySelector("input") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(statusItems).toHaveLength(0);

    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(savedPreference).toBe(true);
    expect(statusItems).toHaveLength(1);
    expect(statusItems[0]?.textContent).toBe("Version 2.7.0 · build unknown");
    expect(statusItems[0]?.getAttribute("tabindex")).toBeNull();

    feature.registerCommand();
    expect(command?.id).toBe("show-version-in-status-bar");
    command?.callback?.();
    await Promise.resolve();
    expect(savedPreference).toBe(false);
    expect(statusItems[0]?.isConnected).toBe(false);
    expect(command?.name).toBe("Toggle version in status bar");

    command?.callback?.();
    await Promise.resolve();
    expect(savedPreference).toBe(true);
    expect(statusItems).toHaveLength(2);
    expect(statusItems[1]?.textContent).toBe("Version 2.7.0 · build unknown");
    expect(statusItems.filter((item) => item.isConnected)).toHaveLength(1);

    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    await Promise.resolve();
    expect(savedPreference).toBe(false);
    expect(statusItems[1]?.isConnected).toBe(false);
  });

  it("saves the preference without a status item when the host does not provide one", async () => {
    let savedPreference = true;
    let command: RegisteredCommand | undefined;
    const feature = new VersionStatusBarFeature({
      version: "2.7.0",
      enabled: savedPreference,
      openDashboard: () => {},
      saveEnabled: async (enabled) => {
        savedPreference = enabled;
      },
      addCommand: (registered) => {
        command = registered;
      },
    });

    feature.renderSetting(document.body.createDiv());
    feature.registerCommand();
    command?.callback?.();
    await Promise.resolve();

    expect(savedPreference).toBe(false);
    expect(
      document.body.querySelectorAll("button, a, [role=alert]"),
    ).toHaveLength(0);

    feature.dispose();
  });

  it("removes the item when the Display toggle is disabled and restores it from saved state", async () => {
    let savedPreference = true;
    const createFeature = () => {
      const statusItems: HTMLElement[] = [];
      const feature = new VersionStatusBarFeature({
        version: "2.7.0",
        enabled: savedPreference,
        openDashboard: () => {},
        addStatusBarItem: () => {
          const item = document.body.createDiv();
          statusItems.push(item);
          return item;
        },
        saveEnabled: async (enabled) => {
          savedPreference = enabled;
        },
        addCommand: () => {},
      });
      return { feature, statusItems };
    };

    const firstLoad = createFeature();
    expect(firstLoad.statusItems).toHaveLength(1);
    await firstLoad.feature.setEnabled(false);
    await Promise.resolve();
    expect(savedPreference).toBe(false);
    expect(firstLoad.statusItems[0]?.isConnected).toBe(false);
    firstLoad.feature.dispose();

    savedPreference = true;
    const reloaded = createFeature();
    expect(reloaded.statusItems).toHaveLength(1);
    expect(reloaded.statusItems[0]?.textContent).toBe(
      "Version 2.7.0 · build unknown",
    );
    reloaded.feature.dispose();
  });

  describe("accessible name, role, and click", () => {
    function createEnabledFeature(enabled = true) {
      const statusItems: HTMLElement[] = [];
      const openDashboard = vi.fn();
      const feature = new VersionStatusBarFeature({
        version: "2.7.0",
        enabled,
        addStatusBarItem: () => {
          const item = document.body.createDiv();
          statusItems.push(item);
          return item;
        },
        openDashboard,
        saveEnabled: async () => {},
        addCommand: () => {},
      });
      return { feature, statusItems, openDashboard };
    }

    it("exposes the item as a status with an accessible name carrying the manifest version", () => {
      const { feature, statusItems } = createEnabledFeature();

      const item = getByRoleAndName("status", "RSS Dashboard version 2.7.0");
      expect(item).toBe(statusItems[0]);
      expect(item.textContent).toBe("Version 2.7.0 · build unknown");
      feature.dispose();
    });

    it("keeps the label text static after creation", () => {
      const { feature, statusItems } = createEnabledFeature();
      const before = statusItems[0]?.textContent;

      statusItems[0]?.click();

      expect(statusItems[0]?.textContent).toBe(before);
      feature.dispose();
    });

    it("opens the dashboard when the item is clicked", () => {
      const { feature, statusItems, openDashboard } = createEnabledFeature();

      statusItems[0]?.click();
      statusItems[0]?.click();

      expect(openDashboard).toHaveBeenCalledTimes(2);
      feature.dispose();
    });

    it("has no item and no click path while the setting is off", () => {
      const { feature, statusItems, openDashboard } =
        createEnabledFeature(false);

      expect(statusItems).toHaveLength(0);
      expect(document.body.querySelector('[role="status"]')).toBeNull();
      expect(openDashboard).not.toHaveBeenCalled();
      feature.dispose();
    });

    it("drops the click path when the item is removed", async () => {
      const { feature, statusItems, openDashboard } = createEnabledFeature();

      await feature.setEnabled(false);
      statusItems[0]?.click();

      expect(statusItems[0]?.isConnected).toBe(false);
      expect(openDashboard).not.toHaveBeenCalled();
    });
  });
});

function getByRoleAndName(role: string, name: string): HTMLElement {
  const match = Array.from(
    document.body.querySelectorAll<HTMLElement>(`[role="${role}"]`),
  ).find((element) => element.getAttribute("aria-label") === name);
  if (!match) throw new Error(`No ${role} named "${name}"`);
  return match;
}
