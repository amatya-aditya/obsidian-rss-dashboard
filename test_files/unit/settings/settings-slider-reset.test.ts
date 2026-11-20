import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import {
  renderArticleTitleSizeSetting,
  renderCardsPerRowSetting,
  renderCardSpacingSetting,
  renderImageCacheLimitSettings,
} from "../../../src/settings/tabs/display-settings-sections";
import { renderSidebarSettingsTab } from "../../../src/settings/tabs/sidebar-settings-tab";
import { renderArticleSavingSettingsTab } from "../../../src/settings/tabs/article-saving-settings-tab";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function settingsRow(parent: HTMLElement, label: string): HTMLElement {
  const row = [...parent.querySelectorAll<HTMLElement>(".setting-item")].find(
    (candidate) =>
      candidate.querySelector(".setting-item-name")?.textContent === label,
  );
  if (!row) throw new Error(`Missing setting ${label}`);
  return row;
}

function resetButton(row: HTMLElement): HTMLButtonElement {
  const button = row.querySelector<HTMLButtonElement>(
    'button[aria-label^="Reset "]',
  );
  if (!button) throw new Error("Missing accessible slider reset");
  return button;
}

function fixture() {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as typeof DEFAULT_SETTINGS;
  const saveSettings = vi.fn(async () => {});
  const setImageCacheLimit = vi.fn(
    async (limit: number, unlimited: boolean) => {
      settings.display.imageCacheLimitMiB = limit;
      settings.display.imageCacheUnlimited = unlimited;
    },
  );
  return {
    app: obsidian.App.createMock(),
    settings,
    saveSettings,
    setImageCacheLimit,
    clearPlaybackProgress: vi.fn(async () => 0),
    getActiveDashboardView: vi.fn(async () => null),
  };
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
});

describe("settings slider resets", () => {
  it("resets each Display slider through its normal mutation path", () => {
    const settingsRoot = document.body.createDiv();
    const plugin = fixture();
    const display = plugin as unknown as Parameters<
      typeof renderImageCacheLimitSettings
    >[1];
    renderImageCacheLimitSettings(settingsRoot, display, vi.fn());
    renderCardsPerRowSetting(settingsRoot, display);
    renderCardSpacingSetting(settingsRoot, display);
    renderArticleTitleSizeSetting(settingsRoot, display);
    for (const [label, edited, expected] of [
      ["Image cache limit", 110, 100],
      ["Cards per row", 2, 0],
      ["Card spacing", 18, 15],
      ["Article title size", 110, 100],
    ] as const) {
      const row = settingsRow(settingsRoot, label);
      const slider = row.querySelector<HTMLInputElement>(
        'input[type="range"]',
      )!;
      const reset = resetButton(row);
      expect(reset.disabled).toBe(true);
      expect(reset.getAttribute("aria-label")).toContain(label);
      slider.value = String(edited);
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      expect(reset.disabled).toBe(false);
      reset.click();
      expect(slider.valueAsNumber).toBe(expected);
      const exact = row.querySelector<HTMLInputElement>('input[type="number"]');
      if (exact) expect(exact.valueAsNumber).toBe(expected);
      expect(reset.disabled).toBe(true);
    }
    expect(plugin.setImageCacheLimit).toHaveBeenLastCalledWith(100, false);
    expect(plugin.settings.display.cardColumnsPerRow).toBe(0);
    expect(plugin.settings.display.cardSpacing).toBe(15);
    expect(plugin.settings.display.articleTitleScale).toBe(100);
  });

  it("disables the changed cache slider, exact input, and reset when unlimited", () => {
    const settingsRoot = document.body.createDiv();
    const plugin = fixture();
    plugin.settings.display.imageCacheUnlimited = true;
    plugin.settings.display.imageCacheLimitMiB = 110;
    renderImageCacheLimitSettings(
      settingsRoot,
      plugin as unknown as Parameters<typeof renderImageCacheLimitSettings>[1],
      vi.fn(),
    );
    const row = settingsRow(settingsRoot, "Image cache limit");
    expect(
      row.querySelector<HTMLInputElement>('input[type="range"]')?.disabled,
    ).toBe(true);
    expect(
      row.querySelector<HTMLInputElement>('input[type="number"]')?.disabled,
    ).toBe(true);
    const reset = resetButton(row);
    expect(reset.disabled).toBe(true);
    reset.click();
    expect(plugin.setImageCacheLimit).not.toHaveBeenCalled();
  });

  it("resets each Sidebar slider and the Article saving timeout independently", () => {
    const settingsRoot = document.body.createDiv();
    const plugin = fixture();
    renderSidebarSettingsTab(
      settingsRoot,
      plugin as unknown as Parameters<typeof renderSidebarSettingsTab>[1],
      vi.fn(),
    );
    renderArticleSavingSettingsTab(
      settingsRoot,
      plugin as unknown as Parameters<typeof renderArticleSavingSettingsTab>[1],
      vi.fn(),
    );
    for (const [label, expected] of [
      ["Left padding", 2],
      ["Right padding", 2],
      ["Sidebar row spacing", 10],
      ["Sidebar row indentation", 20],
      ["Fetch timeout", 10],
    ] as const) {
      const row = settingsRow(settingsRoot, label);
      const slider = row.querySelector<HTMLInputElement>(
        'input[type="range"]',
      )!;
      const reset = resetButton(row);
      expect(reset.disabled).toBe(true);
      slider.value = String(expected + 1);
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      expect(reset.disabled).toBe(false);
      reset.click();
      expect(reset.disabled).toBe(true);
      expect(slider.valueAsNumber).toBe(expected);
    }
    expect(plugin.saveSettings).toHaveBeenCalledTimes(10);
  });
});
