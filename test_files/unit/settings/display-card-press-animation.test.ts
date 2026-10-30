/**
 * "Card press animation" toggle in the Display settings tab (#1727).
 *
 * Covers the default, persistence, the live root-class update on the active
 * dashboard, and the hint shown while the OS asks for reduced motion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetObsidianVersion, __setObsidianVersion } from "obsidian";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { renderDisplaySettingsTab } from "../../../src/settings/tabs/display-settings-tab";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const SETTING_NAME = "Card press animation";

function createPlugin(display: Record<string, unknown> = {}) {
  const view = {
    leaf: {},
    render: vi.fn(),
    refreshCardPressAnimation: vi.fn(),
  };
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as typeof DEFAULT_SETTINGS;
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

function pressSetting(containerEl: HTMLElement): HTMLElement {
  const match = Array.from(containerEl.querySelectorAll(".setting-item")).find(
    (el) =>
      el.querySelector(".setting-item-name")?.textContent === SETTING_NAME,
  );
  if (!match) throw new Error(`Setting not found: ${SETTING_NAME}`);
  return match as HTMLElement;
}

function toggle(containerEl: HTMLElement): HTMLElement {
  return pressSetting(containerEl).querySelector(
    ".checkbox-container",
  ) as HTMLElement;
}

function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
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
  stubReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  __resetObsidianVersion();
});

describe("Display settings: Card press animation", () => {
  it("defaults to on", () => {
    expect(DEFAULT_SETTINGS.display.cardPressAnimation).toBe(true);
  });

  it("shows the toggle on for settings saved before the field existed", () => {
    const { plugin } = createPlugin();
    delete (plugin.settings.display as { cardPressAnimation?: boolean })
      .cardPressAnimation;

    expect(toggle(renderTab(plugin)).hasClass("is-enabled")).toBe(true);
  });

  it("starts off when saved off", () => {
    const { plugin } = createPlugin({ cardPressAnimation: false });

    expect(toggle(renderTab(plugin)).hasClass("is-enabled")).toBe(false);
  });

  it("persists the value and updates the active dashboard in place when toggled", async () => {
    const { plugin, raw, view } = createPlugin({ cardPressAnimation: false });
    const input = toggle(renderTab(plugin)).querySelector(
      "input",
    ) as HTMLInputElement;
    input.click();
    await vi.runAllTimersAsync();

    expect(raw.settings.display.cardPressAnimation).toBe(true);
    expect(raw.saveSettings).toHaveBeenCalledTimes(1);
    expect(view.refreshCardPressAnimation).toHaveBeenCalledTimes(1);
    expect(view.render).not.toHaveBeenCalled();
  });

  it("shows a hint but leaves the toggle editable when the system reduces motion", () => {
    stubReducedMotion(true);
    const { plugin } = createPlugin();
    const setting = pressSetting(renderTab(plugin));

    expect(setting.textContent).toContain(
      "Off while your system reduces motion",
    );
    expect(setting.querySelector("input")?.disabled).toBeFalsy();
  });

  it("omits the hint when the system does not reduce motion", () => {
    const { plugin } = createPlugin();

    expect(pressSetting(renderTab(plugin)).textContent).not.toContain(
      "Off while your system reduces motion",
    );
  });
});
