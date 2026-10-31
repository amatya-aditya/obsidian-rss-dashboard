/**
 * "Article title size" slider in the Display settings tab (#1640).
 *
 * Covers the control's limits and default, persistence into
 * `settings.display.articleTitleScale`, the reset button, and the load-time
 * default for settings saved before the field existed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetObsidianVersion, __setObsidianVersion } from "obsidian";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { renderDisplaySettingsTab } from "../../../src/settings/tabs/display-settings-tab";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function cloneSettings(): typeof DEFAULT_SETTINGS {
  return JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as typeof DEFAULT_SETTINGS;
}

function getSettingByName(containerEl: HTMLElement, name: string): HTMLElement {
  const match = Array.from(containerEl.querySelectorAll(".setting-item")).find(
    (el) => el.querySelector(".setting-item-name")?.textContent === name,
  );
  if (!match) {
    throw new Error(`Setting not found: ${name}`);
  }
  return match as HTMLElement;
}

function createPlugin(display: Record<string, unknown> = {}) {
  const view = { leaf: {}, render: vi.fn() };
  const settings = cloneSettings();
  Object.assign(settings.display, display);
  const plugin = {
    app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
    settings,
    saveSettings: vi.fn(async () => {}),
    notifyFiltersUpdated: vi.fn(),
    getImageCacheSizeBytes: vi.fn(() => 0),
    getActiveDashboardView: vi.fn(async () => view),
    getActiveReaderView: vi.fn(async () => null),
  };
  return { plugin: plugin as unknown as RssDashboardPlugin, raw: plugin, view };
}

function renderTab(plugin: RssDashboardPlugin) {
  const containerEl = document.body.appendChild(createDiv());
  renderDisplaySettingsTab(containerEl, plugin, () => {});
  return containerEl;
}

function titleSizeSetting(containerEl: HTMLElement): HTMLElement {
  return getSettingByName(containerEl, "Article title size");
}

function slider(containerEl: HTMLElement): HTMLInputElement {
  return titleSizeSetting(containerEl).querySelector(
    'input[type="range"]',
  ) as HTMLInputElement;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(0), 0) as unknown as number,
  );
  __setObsidianVersion("1.8.7");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  __resetObsidianVersion();
});

describe("Display settings: Article title size", () => {
  it("defaults new settings to 100 percent", () => {
    expect(DEFAULT_SETTINGS.display.articleTitleScale).toBe(100);
  });

  it("offers a 50 to 200 percent slider in steps of 5 that starts at 100", () => {
    const { plugin } = createPlugin();
    const input = slider(renderTab(plugin));

    expect(input.min).toBe("50");
    expect(input.max).toBe("200");
    expect(input.step).toBe("5");
    expect(input.value).toBe("100");
  });

  it("starts at the saved value", () => {
    const { plugin } = createPlugin({ articleTitleScale: 135 });
    const input = slider(renderTab(plugin));

    expect(input.value).toBe("135");
  });

  it("shows 100 percent for settings saved before the field existed", () => {
    const { plugin } = createPlugin();
    delete (plugin.settings.display as { articleTitleScale?: number })
      .articleTitleScale;
    const input = slider(renderTab(plugin));

    expect(input.value).toBe("100");
  });

  it("persists the new value and re-renders the active dashboard when the slider moves", async () => {
    const { plugin, raw, view } = createPlugin();
    const input = slider(renderTab(plugin));

    input.value = "150";
    input.dispatchEvent(new Event("input"));
    await vi.runAllTimersAsync();

    expect(raw.settings.display.articleTitleScale).toBe(150);
    expect(raw.saveSettings).toHaveBeenCalledTimes(1);
    expect(raw.app.workspace.revealLeaf).toHaveBeenCalledWith(view.leaf);
    expect(view.render).toHaveBeenCalledTimes(1);
  });

  it("restores 100 percent when the reset button is pressed", async () => {
    const { plugin, raw, view } = createPlugin({ articleTitleScale: 175 });
    const containerEl = renderTab(plugin);

    const reset = titleSizeSetting(containerEl).querySelector(
      ".extra-setting-button",
    ) as HTMLElement;
    reset.click();
    await vi.runAllTimersAsync();

    expect(slider(containerEl).value).toBe("100");
    expect(raw.settings.display.articleTitleScale).toBe(100);
    expect(view.render).toHaveBeenCalledTimes(1);
  });
});
