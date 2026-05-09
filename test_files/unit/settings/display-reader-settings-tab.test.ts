import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { renderDisplaySettingsTab } from "../../../src/settings/tabs/display-settings-tab";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function cloneSettings(): typeof DEFAULT_SETTINGS {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
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
    const containerEl = document.body.createDiv();
    const plugin = {
      app: obsidian.App.createMock(),
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      getActiveReaderView: vi.fn(async () => null),
    };

    renderDisplaySettingsTab(containerEl, plugin as any, () => {});

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
    const containerEl = document.body.createDiv();
    const settings = cloneSettings();
    const applyReaderFormat = vi.fn();

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      getActiveReaderView: vi.fn(async () => ({ applyReaderFormat })),
    };

    renderDisplaySettingsTab(containerEl, plugin as any, () => {});

    const fontSetting = getSettingByName(containerEl, "Font");
    const fontSelect = fontSetting.querySelector("select") as HTMLSelectElement;
    expect(fontSelect.options[0]?.textContent).toBe("Theme default");
    fontSelect.value = "serif";
    fontSelect.dispatchEvent(new Event("change"));
    await flushPromises();

    expect(plugin.settings.readerFormat.fontFamily).toBe("serif");
    expect(plugin.saveSettings).toHaveBeenCalled();
    expect(applyReaderFormat).toHaveBeenCalled();
  });

  it("resets reader format settings back to defaults", async () => {
    const containerEl = document.body.createDiv();
    const settings = cloneSettings();
    settings.readerFormat.textAlign = "left";
    settings.readerFormat.fontScalePct = 150;
    settings.readerFormat.lineHeightPct = 180;
    settings.readerFormat.fontFamily = "mono";
    settings.readerFormat.paragraphSpacing = "loose";

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      getActiveReaderView: vi.fn(async () => null),
    };

    renderDisplaySettingsTab(containerEl, plugin as any, () => {});

    const resetSetting = getSettingByName(containerEl, "Reset reader format");
    const resetButton = resetSetting.querySelector("button") as HTMLButtonElement;
    resetButton.click();
    await flushPromises();

    expect(plugin.settings.readerFormat).toEqual(DEFAULT_SETTINGS.readerFormat);
    expect(plugin.saveSettings).toHaveBeenCalled();
  });
});
