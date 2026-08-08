import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { renderGeneralSettingsTab } from "../../../src/settings/tabs/general-settings-tab";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function createPlugin() {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.corsProxyEnabled = false;

  return {
    app: App.createMock(),
    settingTab: null,
    settings,
    saveSettings: vi.fn(async () => {}),
    getActiveDashboardView: vi.fn(async () => null),
    importPortableDataBundleFromFile: vi.fn(async () => {}),
    exportPortableDataBundle: vi.fn(async () => {}),
    applyFeedLimitsToAllFeeds: vi.fn(async () => {}),
    refreshFeeds: vi.fn(async () => {}),
    showStorageOnboardingWizard: vi.fn(),
  };
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("General settings storage setup", () => {
  it("opens the storage startup wizard without changing settings", () => {
    const containerEl = document.body.createDiv();
    const plugin = createPlugin();

    renderGeneralSettingsTab(containerEl, plugin);

    const setting = Array.from(
      containerEl.querySelectorAll(".setting-item"),
    ).find(
      (candidate) =>
        candidate.querySelector(".setting-item-name")?.textContent ===
        "Show startup wizard",
    );
    const button = setting?.querySelector("button");
    button?.click();

    expect(plugin.showStorageOnboardingWizard).toHaveBeenCalledTimes(1);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });
});
