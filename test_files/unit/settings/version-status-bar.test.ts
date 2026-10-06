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
    const feature = new VersionStatusBarFeature({
      version: "2.7.0",
      enabled: savedPreference ?? false,
      addStatusBarItem: () => {
        const item = document.body.createDiv();
        statusItems.push(item);
        return item;
      },
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
    expect(statusItems[0]?.textContent).toBe("RSS Dashboard v2.7.0");
    expect(statusItems[0]?.getAttribute("tabindex")).toBeNull();
    expect(statusItems[0]?.getAttribute("role")).toBeNull();
    expect(statusItems[0]?.onclick).toBeNull();

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
    expect(statusItems[1]?.textContent).toBe("RSS Dashboard v2.7.0");
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
    expect(reloaded.statusItems[0]?.textContent).toBe("RSS Dashboard v2.7.0");
    reloaded.feature.dispose();
  });
});
