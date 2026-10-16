/**
 * Characterization tests for known quirks of the Startup filters menu
 * (#1251, umbrella #1094). Each test pins current behavior; the fixes are
 * tracked separately. Read-only during the extraction.
 */
import process from "node:process";
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

function createPlugin(overrides: Record<string, unknown> = {}) {
  const settings = cloneSettings();
  settings.availableTags = [{ name: "a", color: "#111111" }];
  const plugin = {
    app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
    settings,
    saveSettings: vi.fn(async () => {}),
    notifyFiltersUpdated: vi.fn(),
    getImageCacheSizeBytes: vi.fn(() => 0),
    getActiveDashboardView: vi.fn(async () => null),
    getActiveReaderView: vi.fn(async () => null),
    ...overrides,
  };
  return { plugin: plugin as unknown as RssDashboardPlugin, raw: plugin };
}

function renderTab(plugin: RssDashboardPlugin): HTMLButtonElement {
  const containerEl = document.body.appendChild(createDiv());
  renderDisplaySettingsTab(containerEl, plugin, () => {});
  const setting = Array.from(
    containerEl.querySelectorAll(".setting-item"),
  ).find(
    (el) =>
      el.querySelector(".setting-item-name")?.textContent === "Startup filters",
  );
  return setting!.querySelector("button") as HTMLButtonElement;
}

function menuItem(label: string): HTMLElement {
  const item = Array.from(
    document.body.querySelectorAll<HTMLElement>(
      ".rss-dashboard-filter-menu-item",
    ),
  ).find(
    (el) =>
      el.querySelector(".rss-dashboard-filter-menu-text")?.textContent ===
      label,
  );
  if (!item) throw new Error(`Menu item not found: ${label}`);
  return item;
}

function checkboxOf(item: HTMLElement): HTMLInputElement {
  return item.querySelector("input") as HTMLInputElement;
}

function applyButton(): HTMLButtonElement {
  return document.body.querySelector(
    ".rss-dashboard-filter-apply-btn",
  ) as HTMLButtonElement;
}

async function open(button: HTMLButtonElement): Promise<void> {
  button.click();
  await vi.runAllTimersAsync();
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

describe("Startup filters menu known quirks", () => {
  // BUG: pinned, see #1259
  it("reopening the menu removes the old portal without removing its listeners", async () => {
    const { plugin } = createPlugin();
    const button = renderTab(plugin);
    const removeSpy = vi.spyOn(document, "removeEventListener");

    await open(button);
    await open(button);

    expect(
      document.body.querySelectorAll(
        ".rss-dashboard-startup-filters-menu-portal",
      ),
    ).toHaveLength(1);
    expect(removeSpy).not.toHaveBeenCalledWith(
      "scroll",
      expect.anything(),
      true,
    );
    expect(removeSpy).not.toHaveBeenCalledWith("mousedown", expect.anything());
  });

  // BUG: pinned, see #1260
  it("unchecking Tagged clears the tag filters but leaves the submenu ticked", async () => {
    const { plugin, raw } = createPlugin();
    const button = renderTab(plugin);
    await open(button);

    menuItem("Tagged").click();
    menuItem("Tagged").dispatchEvent(new MouseEvent("mouseenter"));
    await vi.runAllTimersAsync();
    const tagItem = document.body.querySelector(
      ".rss-dashboard-tag-submenu .rss-dashboard-filter-menu-item",
    ) as HTMLElement;
    tagItem.click();
    expect(checkboxOf(tagItem).checked).toBe(true);

    menuItem("Tagged").click();
    expect(checkboxOf(menuItem("Tagged")).checked).toBe(false);
    expect(checkboxOf(tagItem).checked).toBe(true);

    applyButton().click();
    await vi.runAllTimersAsync();
    expect(raw.settings.dashboardMultiFilters).toEqual({
      statusFilters: [],
      tagFilters: [],
      logic: "OR",
    });
  });

  // BUG: pinned, see #1260
  it("a tag ticked without Tagged is stored with no tagged status", async () => {
    const { plugin, raw } = createPlugin();
    const button = renderTab(plugin);
    await open(button);

    menuItem("Tagged").dispatchEvent(new MouseEvent("mouseenter"));
    await vi.runAllTimersAsync();
    (
      document.body.querySelector(
        ".rss-dashboard-tag-submenu .rss-dashboard-filter-menu-item",
      ) as HTMLElement
    ).click();
    applyButton().click();
    await vi.runAllTimersAsync();

    expect(raw.settings.dashboardMultiFilters).toEqual({
      statusFilters: [],
      tagFilters: ["a"],
      logic: "OR",
    });
  });

  // BUG: pinned, see #1261
  it("a failed save leaves the menu open with the filters already changed in memory", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    const { plugin, raw } = createPlugin({
      saveSettings: vi.fn(async () => {
        throw new Error("disk full");
      }),
    });
    const button = renderTab(plugin);
    await open(button);

    menuItem("Unread").click();
    applyButton().click();
    await vi.runAllTimersAsync();
    process.off("unhandledRejection", onUnhandled);

    expect(raw.settings.dashboardMultiFilters.statusFilters).toEqual([
      "unread",
    ]);
    expect(raw.notifyFiltersUpdated).not.toHaveBeenCalled();
    expect(
      document.body.querySelector(".rss-dashboard-startup-filters-menu-portal"),
    ).not.toBeNull();
    expect(unhandled).toHaveLength(1);
  });
});
