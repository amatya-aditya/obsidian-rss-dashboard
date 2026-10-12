import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetObsidianVersion, __setObsidianVersion } from "obsidian";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { renderDisplaySettingsTab } from "../../../src/settings/tabs/display-settings-tab";
import { LEFT_HANDED_LAYOUT_STORAGE_KEY } from "../../../src/utils/left-handed-layout";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { isToggleOn, setToggle } from "../test-toggle-helpers";

function cloneSettings(): typeof DEFAULT_SETTINGS {
  return JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as typeof DEFAULT_SETTINGS;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
  // 1.8.7 through 1.12.x use the legacy settings controls; pin that branch.
  __setObsidianVersion("1.8.7");
});

afterEach(() => {
  __resetObsidianVersion();
});

describe("renderDisplaySettingsTab() reader section", () => {
  it("shows formatted values for dashboard layout sliders", () => {
    const containerEl = document.body.appendChild(createDiv());
    const plugin = {
      app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getImageCacheSizeBytes: vi.fn(() => 0),
      getActiveDashboardView: vi.fn(async () => null),
      getActiveReaderView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderDisplaySettingsTab(containerEl, plugin, () => {});

    expect(
      getSettingByName(containerEl, "Cards per row").querySelector(
        ".rss-dashboard-slider-value",
      )?.textContent,
    ).toBe("Auto");
    expect(
      getSettingByName(containerEl, "Card spacing").querySelector(
        ".rss-dashboard-slider-value",
      )?.textContent,
    ).toBe("15px");
  });

  it("defaults image caching off and delegates enablement to the plugin", async () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const settings = cloneSettings();
    const setImageCachingEnabled = vi.fn(async () => {});
    const plugin = {
      app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
      settings,
      saveSettings: vi.fn(async () => {}),
      setImageCachingEnabled,
      getImageCacheSizeBytes: vi.fn(() => 1_024),
      getActiveDashboardView: vi.fn(async () => ({
        leaf: {},
        render: vi.fn(),
      })),
      getActiveReaderView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderDisplaySettingsTab(containerEl, plugin, () => {});

    const cacheSetting = getSettingByName(containerEl, "Allow image caching");
    expect(
      cacheSetting.querySelector(".setting-item-description")?.textContent,
    ).toContain("one megabyte");
    const toggle = cacheSetting.querySelector("input") as HTMLInputElement;
    expect(isToggleOn(toggle)).toBe(false);
    setToggle(toggle, true);
    await flushPromises();

    expect(setImageCachingEnabled).toHaveBeenCalledWith(true);
    expect(
      getSettingByName(containerEl, "Clear image cache").textContent,
    ).toContain("Cached image storage: 1.0 KB.");
  });

  it("saves a custom finite cache limit and lets users remove the aggregate cap", async () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const settings = cloneSettings();
    const setImageCacheLimit = vi.fn(async () => {});
    const plugin = {
      app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
      settings,
      saveSettings: vi.fn(async () => {}),
      setImageCachingEnabled: vi.fn(async () => {}),
      setImageCacheLimit,
      getImageCacheSizeBytes: vi.fn(() => 0),
      getActiveDashboardView: vi.fn(async () => null),
      getActiveReaderView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderDisplaySettingsTab(containerEl, plugin, () => {});

    const limitSetting = getSettingByName(containerEl, "Image cache limit");
    const limitInput = limitSetting.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    const limitSlider = limitSetting.querySelector(
      'input[type="range"]',
    ) as HTMLInputElement;
    expect(limitInput.value).toBe("100");
    expect(limitSlider.min).toBe("1");
    expect(limitSlider.max).toBe("1024");
    expect(
      limitSetting.querySelector(".rss-dashboard-slider-value")?.textContent,
    ).toBe("100 MiB");
    limitSlider.value = "512";
    limitSlider.dispatchEvent(new Event("input"));
    await flushPromises();

    expect(limitInput.value).toBe("512");
    expect(
      limitSetting.querySelector(".rss-dashboard-slider-value")?.textContent,
    ).toBe("512 MiB");
    expect(setImageCacheLimit).toHaveBeenCalledWith(512, false);
    limitInput.value = "25";
    limitInput.dispatchEvent(new Event("blur"));
    await flushPromises();

    expect(setImageCacheLimit).toHaveBeenLastCalledWith(25, false);

    limitInput.value = "25.5";
    limitInput.dispatchEvent(new Event("blur"));
    await flushPromises();

    expect(setImageCacheLimit).toHaveBeenCalledTimes(2);
    expect(limitInput.value).toBe("100");

    const unlimitedSetting = getSettingByName(
      containerEl,
      "No cache size limit",
    );
    const unlimitedToggle = unlimitedSetting.querySelector(
      "input",
    ) as HTMLInputElement;
    setToggle(unlimitedToggle, true);
    await flushPromises();

    expect(setImageCacheLimit).toHaveBeenLastCalledWith(100, true);
  });

  it("describes dashboard previews and rerenders the active Feed dashboard after either preview preference changes", async () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const settings = cloneSettings();
    settings.viewStyle = "feed";
    const render = vi.fn();
    const saveSettings = vi.fn(async () => {});
    const revealLeaf = vi.fn(async () => {});
    const plugin = {
      app: { workspace: { revealLeaf } },
      settings,
      saveSettings,
      getActiveDashboardView: vi.fn(async () => ({ leaf: {}, render })),
      getActiveReaderView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderDisplaySettingsTab(containerEl, plugin, () => {});

    const coverImages = getSettingByName(containerEl, "Show cover images");
    expect(
      coverImages.querySelector(".setting-item-description")?.textContent,
    ).toBe(
      "Display cover-image previews in dashboard card and feed views. Turning this off reduces remote image loading and can improve browsing performance.",
    );
    const coverToggle = coverImages.querySelector("input") as HTMLInputElement;
    setToggle(coverToggle, false);
    await flushPromises();

    const summaryToggle = getSettingByName(
      containerEl,
      "Show summary",
    ).querySelector("input") as HTMLInputElement;
    setToggle(summaryToggle, false);
    await flushPromises();

    expect(settings.display.showCoverImage).toBe(false);
    expect(settings.display.showSummary).toBe(false);
    expect(saveSettings).toHaveBeenCalledTimes(2);
    expect(revealLeaf).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("renders a Reader section without paragraph width", () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const plugin = {
      app: {},
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      getActiveReaderView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderDisplaySettingsTab(containerEl, plugin, () => {});

    const readerHeading = getSettingByName(containerEl, "Reader");
    expect(readerHeading.dataset.rssSettingsSection).toBe("reader");

    expect(() => getSettingByName(containerEl, "Font size")).not.toThrow();
    expect(() => getSettingByName(containerEl, "Line height")).not.toThrow();
    expect(() => getSettingByName(containerEl, "Font")).not.toThrow();
    expect(() => getSettingByName(containerEl, "Alignment")).not.toThrow();
    expect(() =>
      getSettingByName(containerEl, "Paragraph spacing"),
    ).not.toThrow();
    expect(() => getSettingByName(containerEl, "Paragraph width")).toThrow();
  });

  it("persists reader format changes and refreshes the active reader view", async () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const settings = cloneSettings();
    const applyReaderFormat = vi.fn();
    const saveSettings = vi.fn(async () => {});

    const plugin = {
      app: {},
      settings,
      saveSettings,
      getActiveDashboardView: vi.fn(async () => null),
      getActiveReaderView: vi.fn(async () => ({ applyReaderFormat })),
    } as unknown as RssDashboardPlugin;

    renderDisplaySettingsTab(containerEl, plugin, () => {});

    const fontSetting = getSettingByName(containerEl, "Font");
    const fontSelect = fontSetting.querySelector("select") as HTMLSelectElement;
    expect(fontSelect.options[0]?.textContent).toBe("Theme default");
    fontSelect.value = "serif";
    fontSelect.dispatchEvent(new Event("change"));
    await flushPromises();

    expect(plugin.settings.readerFormat.fontFamily).toBe("serif");
    expect(saveSettings).toHaveBeenCalled();
    expect(applyReaderFormat).toHaveBeenCalled();
  });

  it("resets reader format settings back to defaults", async () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const settings = cloneSettings();
    settings.readerFormat.textAlign = "left";
    settings.readerFormat.fontScalePct = 150;
    settings.readerFormat.lineHeightPct = 180;
    settings.readerFormat.fontFamily = "mono";
    settings.readerFormat.paragraphSpacing = "loose";
    const saveSettings = vi.fn(async () => {});

    const plugin = {
      app: {},
      settings,
      saveSettings,
      getActiveDashboardView: vi.fn(async () => null),
      getActiveReaderView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderDisplaySettingsTab(containerEl, plugin, () => {});

    const resetSetting = getSettingByName(containerEl, "Reset reader format");
    const resetButton = resetSetting.querySelector(
      "button",
    ) as HTMLButtonElement;
    resetButton.click();
    await flushPromises();

    expect(plugin.settings.readerFormat).toEqual(DEFAULT_SETTINGS.readerFormat);
    expect(saveSettings).toHaveBeenCalled();
  });
});

describe("renderDisplaySettingsTab() left-handed layout", () => {
  /** In-memory vault-local storage so the toggle never touches the settings file. */
  function createAppWithStorage(): {
    app: {
      vault: { getName: () => string };
      loadLocalStorage: (key: string) => unknown;
      saveLocalStorage: (key: string, value: unknown) => void;
      workspace: { revealLeaf: ReturnType<typeof vi.fn> };
    };
    store: Map<string, unknown>;
  } {
    const store = new Map<string, unknown>();
    return {
      store,
      app: {
        vault: { getName: () => "left-handed-toggle-test-vault" },
        loadLocalStorage: (key: string) =>
          store.has(key) ? store.get(key) : null,
        saveLocalStorage: (key: string, value: unknown) => {
          store.set(key, value);
        },
        workspace: { revealLeaf: vi.fn(async () => {}) },
      },
    };
  }

  it("sits directly beneath Article date display, defaults off, and says it is per device", () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const { app } = createAppWithStorage();
    const plugin = {
      app,
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      getActiveReaderView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderDisplaySettingsTab(containerEl, plugin, () => {});

    const names = Array.from(
      containerEl.querySelectorAll(".setting-item-name"),
    ).map((el) => el.textContent);
    const dateIndex = names.indexOf("Article date display");
    expect(dateIndex).toBeGreaterThanOrEqual(0);
    expect(names[dateIndex + 1]).toBe("Left-handed layout");

    const setting = getSettingByName(containerEl, "Left-handed layout");
    expect(
      setting.querySelector(".setting-item-description")?.textContent,
    ).toContain("per device");
    expect(isToggleOn(setting.querySelector("input"))).toBe(false);
  });

  it("reflects the stored per-device value", () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const { app } = createAppWithStorage();
    app.saveLocalStorage(LEFT_HANDED_LAYOUT_STORAGE_KEY, true);
    const plugin = {
      app,
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      getActiveReaderView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderDisplaySettingsTab(containerEl, plugin, () => {});

    const toggle = getSettingByName(
      containerEl,
      "Left-handed layout",
    ).querySelector("input") as HTMLInputElement;
    expect(isToggleOn(toggle)).toBe(true);
  });

  it("writes the per-device value, leaves settings untouched, and re-renders the open dashboard", async () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const { app } = createAppWithStorage();
    const settings = cloneSettings();
    const saveSettings = vi.fn(async () => {});
    const render = vi.fn();
    const plugin = {
      app,
      settings,
      saveSettings,
      getActiveDashboardView: vi.fn(async () => ({ leaf: {}, render })),
      getActiveReaderView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderDisplaySettingsTab(containerEl, plugin, () => {});

    const toggle = getSettingByName(
      containerEl,
      "Left-handed layout",
    ).querySelector("input") as HTMLInputElement;
    setToggle(toggle, true);
    await flushPromises();

    expect(app.loadLocalStorage(LEFT_HANDED_LAYOUT_STORAGE_KEY)).toBe(true);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(JSON.stringify(settings)).not.toContain(
      LEFT_HANDED_LAYOUT_STORAGE_KEY,
    );
    expect(app.workspace.revealLeaf).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
