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
  it("renders a Reader section without paragraph width", () => {
    const containerEl = document.createElement("div");
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
    const containerEl = document.createElement("div");
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
    const containerEl = document.createElement("div");
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
