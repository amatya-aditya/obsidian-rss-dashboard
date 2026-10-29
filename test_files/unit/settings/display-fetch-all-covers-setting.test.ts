// The Display tab's "Show fetch all covers button" toggle (#1702): its default,
// where it sits, what it saves, and how it follows "Show cover images".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetObsidianVersion, __setObsidianVersion } from "obsidian";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { renderDisplaySettingsTab } from "../../../src/settings/tabs/display-settings-tab";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { getToggleLabel, isToggleOn, setToggle } from "../test-toggle-helpers";

const SHOW_COVERS = "Show cover images";
const FETCH_ALL = "Show fetch all covers button";

function cloneSettings(): typeof DEFAULT_SETTINGS {
  return JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as typeof DEFAULT_SETTINGS;
}

function settingNames(containerEl: HTMLElement): string[] {
  return Array.from(containerEl.querySelectorAll(".setting-item-name")).map(
    (el) => el.textContent ?? "",
  );
}

function getSettingByName(containerEl: HTMLElement, name: string): HTMLElement {
  const match = Array.from(containerEl.querySelectorAll(".setting-item")).find(
    (el) => el.querySelector(".setting-item-name")?.textContent === name,
  );
  if (!match) throw new Error(`Setting not found: ${name}`);
  return match as HTMLElement;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Display tab: Show fetch all covers button (#1702)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.restoreAllMocks();
    __setObsidianVersion("1.8.7");
  });

  afterEach(() => {
    __resetObsidianVersion();
  });

  function render(settings = cloneSettings()) {
    const containerEl = document.body.appendChild(createDiv());
    const render = vi.fn();
    const onRefresh = vi.fn();
    const plugin = {
      app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
      settings,
      saveSettings: vi.fn(async () => {}),
      getImageCacheSizeBytes: vi.fn(() => 0),
      getActiveDashboardView: vi.fn(async () => ({ leaf: {}, render })),
      getActiveReaderView: vi.fn(async () => null),
    } as unknown as RssDashboardPlugin;
    renderDisplaySettingsTab(containerEl, plugin, onRefresh);
    return { containerEl, plugin, settings, render, onRefresh };
  }

  it("defaults on and sits directly after Show cover images", () => {
    const { containerEl, settings } = render();

    expect(settings.display.showFetchAllCoversButton).toBe(true);
    expect(isToggleOn(getSettingByName(containerEl, FETCH_ALL))).toBe(true);
    const names = settingNames(containerEl);
    expect(names.indexOf(FETCH_ALL)).toBe(names.indexOf(SHOW_COVERS) + 1);
  });

  it("saves the choice and re-renders the open dashboard", async () => {
    const { containerEl, plugin, settings, render: renderDashboard } = render();

    setToggle(
      getSettingByName(containerEl, FETCH_ALL).querySelector("input"),
      false,
    );
    await flushPromises();

    expect(settings.display.showFetchAllCoversButton).toBe(false);
    expect(plugin.saveSettings).toHaveBeenCalled();
    expect(renderDashboard).toHaveBeenCalled();
  });

  it("is disabled while Show cover images is off", () => {
    const settings = cloneSettings();
    settings.display.showCoverImage = false;

    const { containerEl } = render(settings);

    // Obsidian marks a disabled toggle on its label as well as on the row.
    const row = getSettingByName(containerEl, FETCH_ALL);
    expect(row.classList.contains("is-disabled")).toBe(true);
    expect(getToggleLabel(row)?.classList.contains("is-disabled")).toBe(true);
  });

  it("is enabled while Show cover images is on", () => {
    const { containerEl } = render();

    const row = getSettingByName(containerEl, FETCH_ALL);
    expect(row.classList.contains("is-disabled")).toBe(false);
    expect(getToggleLabel(row)?.classList.contains("is-disabled")).toBe(false);
  });

  it("refreshes the tab when Show cover images changes so the dependent toggle follows", async () => {
    const { containerEl, settings, onRefresh } = render();

    setToggle(
      getSettingByName(containerEl, SHOW_COVERS).querySelector("input"),
      false,
    );
    await flushPromises();

    expect(settings.display.showCoverImage).toBe(false);
    expect(onRefresh).toHaveBeenCalled();
  });
});
