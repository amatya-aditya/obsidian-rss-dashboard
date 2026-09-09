import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { renderDisplaySettingsTab } from "../../../src/settings/tabs/display-settings-tab";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function cloneSettings(): typeof DEFAULT_SETTINGS {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
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
});

describe("renderDisplaySettingsTab() reader section", () => {
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
      getActiveDashboardView: vi.fn(async () => ({ leaf: {}, render: vi.fn() })),
      getActiveReaderView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;

    renderDisplaySettingsTab(containerEl, plugin, () => {});

    const cacheSetting = getSettingByName(containerEl, "Allow image caching");
    expect(cacheSetting.querySelector(".setting-item-description")?.textContent).toContain(
      "one megabyte",
    );
    const toggle = cacheSetting.querySelector("input") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
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
    limitSlider.value = "512";
    limitSlider.dispatchEvent(new Event("input"));
    await flushPromises();

    expect(limitInput.value).toBe("512");
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

    const unlimitedSetting = getSettingByName(containerEl, "No cache size limit");
    const unlimitedToggle = unlimitedSetting.querySelector("input") as HTMLInputElement;
    unlimitedToggle.checked = true;
    unlimitedToggle.dispatchEvent(new Event("change"));
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
    expect(coverImages.querySelector(".setting-item-description")?.textContent).toBe(
      "Display cover-image previews in dashboard card and feed views. Turning this off reduces remote image loading and can improve browsing performance.",
    );
    const coverToggle = coverImages.querySelector("input") as HTMLInputElement;
    coverToggle.checked = false;
    coverToggle.dispatchEvent(new Event("change"));
    await flushPromises();

    const summaryToggle = getSettingByName(containerEl, "Show summary").querySelector(
      "input",
    ) as HTMLInputElement;
    summaryToggle.checked = false;
    summaryToggle.dispatchEvent(new Event("change"));
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
    expect(() => getSettingByName(containerEl, "Paragraph spacing")).not.toThrow();
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
    const resetButton = resetSetting.querySelector("button") as HTMLButtonElement;
    resetButton.click();
    await flushPromises();

    expect(plugin.settings.readerFormat).toEqual(DEFAULT_SETTINGS.readerFormat);
    expect(saveSettings).toHaveBeenCalled();
  });
});
