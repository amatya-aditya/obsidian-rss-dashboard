import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import {
  renderGeneralSettingsTab,
  type GeneralSettingsPlugin,
} from "../../../src/settings/tabs/general-settings-tab";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function cloneSettings(): typeof DEFAULT_SETTINGS {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
}

function getSettingByName(containerEl: HTMLElement, name: string): HTMLElement {
  const setting = Array.from(containerEl.querySelectorAll<HTMLElement>(
    ".setting-item",
  )).find(
    (element) =>
      element.querySelector(".setting-item-name")?.textContent === name,
  );

  if (!setting) {
    throw new Error(`Could not find setting: ${name}`);
  }

  return setting;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe("renderGeneralSettingsTab() retention protections", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.restoreAllMocks();
  });

  it("renders retention protection toggles from settings and persists each change", async () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const settings = cloneSettings();
    settings.protectStarred = true;
    settings.protectSaved = false;
    settings.protectTagged = true;
    settings.protectUnread = false;
    const saveSettings = vi.fn(async () => {});
    const plugin = {
      app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
      settings,
      saveSettings,
      getActiveDashboardView: vi.fn(async () => null),
      importPortableDataBundleFromFile: vi.fn(async () => {}),
      exportPortableDataBundle: vi.fn(async () => {}),
      applyFeedLimitsToAllFeeds: vi.fn(async () => {}),
      refreshFeeds: vi.fn(async () => {}),
      settingTab: null,
    } as unknown as GeneralSettingsPlugin;

    renderGeneralSettingsTab(containerEl, plugin);

    expect(containerEl.textContent).toContain("Protected from auto-deletion");

    const protections = [
      ["Protect starred articles", "protectStarred", false],
      ["Protect saved articles", "protectSaved", true],
      ["Protect tagged articles", "protectTagged", false],
      ["Protect unread articles", "protectUnread", true],
    ] as const;

    for (const [label, settingKey, nextValue] of protections) {
      const toggle = getSettingByName(containerEl, label).querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement;
      expect(toggle.checked).toBe(settings[settingKey]);

      toggle.checked = nextValue;
      toggle.dispatchEvent(new Event("change"));
      await flushPromises();

      expect(settings[settingKey]).toBe(nextValue);
    }

    expect(saveSettings).toHaveBeenCalledTimes(4);
  });
});
