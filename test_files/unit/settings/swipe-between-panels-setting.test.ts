import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Platform } from "obsidian";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import {
  renderGeneralSettingsTab,
  type GeneralSettingsPlugin,
} from "../../../src/settings/tabs/general-settings-tab";
import { ProxyCheckStore } from "../../../src/utils/proxy-check";
import { loadAndNormalizeSettings } from "../../../src/utils/settings-normalization";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { isToggleOn, setToggle } from "../test-toggle-helpers";

function cloneSettings(): typeof DEFAULT_SETTINGS {
  return JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as typeof DEFAULT_SETTINGS;
}

function render(settings: typeof DEFAULT_SETTINGS) {
  const containerEl = createDiv();
  document.body.appendChild(containerEl);
  const saveSettings = vi.fn(async () => {});
  const plugin = {
    app: {
      workspace: {
        revealLeaf: vi.fn(async () => {}),
        getLeavesOfType: vi.fn(() => []),
      },
    },
    settings,
    saveSettings,
    getActiveDashboardView: vi.fn(async () => null),
    proxyCheckStore: new ProxyCheckStore(),
    importPortableDataBundleFromFile: vi.fn(async () => {}),
    exportPortableDataBundle: vi.fn(async () => {}),
    applyFeedLimitsToAllFeeds: vi.fn(async () => {}),
    refreshFeeds: vi.fn(async () => {}),
    settingTab: null,
  } as unknown as GeneralSettingsPlugin;
  renderGeneralSettingsTab(containerEl, plugin);
  return { containerEl, saveSettings };
}

function findSetting(containerEl: HTMLElement, name: string) {
  return Array.from(
    containerEl.querySelectorAll<HTMLElement>(".setting-item"),
  ).find((el) => el.querySelector(".setting-item-name")?.textContent === name);
}

describe("Swipe between panels setting", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  afterEach(() => {
    Platform.isMobile = false;
  });

  it("is off by default", () => {
    expect(DEFAULT_SETTINGS.display.swipeBetweenPanels).toBe(false);
  });

  it("falls back to off when a stored value is not a boolean", () => {
    const raw = cloneSettings() as unknown as {
      display: Record<string, unknown>;
    };
    raw.display.swipeBetweenPanels = "yes";
    const loaded = loadAndNormalizeSettings(raw);
    expect(loaded.display.swipeBetweenPanels).toBe(false);
  });

  it("keeps a stored true", () => {
    const raw = cloneSettings();
    raw.display.swipeBetweenPanels = true;
    expect(loadAndNormalizeSettings(raw).display.swipeBetweenPanels).toBe(true);
  });

  it("fills in off for settings saved before the option existed", () => {
    const raw = cloneSettings() as unknown as {
      display: Record<string, unknown>;
    };
    delete raw.display.swipeBetweenPanels;
    expect(loadAndNormalizeSettings(raw).display.swipeBetweenPanels).toBe(
      false,
    );
  });

  it("shows the Mobile navigation toggle on mobile and saves changes", async () => {
    Platform.isMobile = true;
    const settings = cloneSettings();
    const { containerEl, saveSettings } = render(settings);

    expect(containerEl.textContent).toContain("Mobile navigation");
    const setting = findSetting(containerEl, "Swipe between panels");
    expect(setting).toBeDefined();
    const desc = setting?.querySelector(
      ".setting-item-description",
    )?.textContent;
    expect(desc).toContain("Obsidian internals");
    expect(desc).toContain("left or right sidebar");

    const toggle = setting?.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(isToggleOn(toggle)).toBe(false);
    setToggle(toggle, true);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(settings.display.swipeBetweenPanels).toBe(true);
    expect(saveSettings).toHaveBeenCalled();
  });

  it("hides the section on desktop", () => {
    Platform.isMobile = false;
    const { containerEl } = render(cloneSettings());
    expect(containerEl.textContent).not.toContain("Mobile navigation");
    expect(findSetting(containerEl, "Swipe between panels")).toBeUndefined();
  });
});
