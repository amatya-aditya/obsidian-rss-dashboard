/**
 * The Startup filters setting and its popover menu (#1251). These cover the
 * behaviors that were pinned as bugs during the extraction (#1259, #1260,
 * #1261) and are now fixed.
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

function menuPortal(): HTMLElement | null {
  return document.body.querySelector(
    ".rss-dashboard-startup-filters-menu-portal",
  );
}

function tagSubmenu(): HTMLElement | null {
  return document.body.querySelector(".rss-dashboard-tag-submenu");
}

function tagSubmenuItem(label: string): HTMLElement {
  const item = Array.from(
    document.body.querySelectorAll<HTMLElement>(
      ".rss-dashboard-tag-submenu .rss-dashboard-filter-menu-item",
    ),
  ).find(
    (el) =>
      el.querySelector(".rss-dashboard-filter-menu-text")?.textContent ===
      label,
  );
  if (!item) throw new Error(`Tag submenu item not found: ${label}`);
  return item;
}

async function open(button: HTMLButtonElement): Promise<void> {
  button.click();
  await vi.runAllTimersAsync();
}

/** Hovering the Tagged row opens the tag submenu. */
async function openTagSubmenu(): Promise<void> {
  menuItem("Tagged").dispatchEvent(new MouseEvent("mouseenter"));
  await vi.runAllTimersAsync();
}

/** The Notice stub reports each notice through console.debug. */
function spyOnNotices(): () => string[] {
  const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
  return () =>
    spy.mock.calls
      .filter(([tag]) => tag === "[Stub Notice]")
      .map(([, message]) => message as string);
}

function watchUnhandledRejections(): () => unknown[] {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  return () => {
    process.off("unhandledRejection", onUnhandled);
    return unhandled;
  };
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

describe("Startup filters menu", () => {
  it("reopening the menu cleans up the previous menu's document listeners", async () => {
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
    expect(removeSpy).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
      true,
    );
    expect(removeSpy).toHaveBeenCalledWith("mousedown", expect.any(Function));
  });

  it("unchecking Tagged clears the tag submenu and applies no tag filters", async () => {
    const { plugin, raw } = createPlugin();
    const button = renderTab(plugin);
    await open(button);

    menuItem("Tagged").click();
    await openTagSubmenu();
    tagSubmenuItem("a").click();
    expect(checkboxOf(tagSubmenuItem("a")).checked).toBe(true);

    menuItem("Tagged").click();
    expect(checkboxOf(menuItem("Tagged")).checked).toBe(false);
    expect(tagSubmenu()).toBeNull();

    applyButton().click();
    await vi.runAllTimersAsync();
    expect(raw.settings.dashboardMultiFilters).toEqual({
      statusFilters: [],
      tagFilters: [],
      logic: "OR",
    });
  });

  it("ticking a tag also ticks Tagged and saves the tagged status with the tag", async () => {
    const { plugin, raw } = createPlugin();
    const button = renderTab(plugin);
    await open(button);

    await openTagSubmenu();
    tagSubmenuItem("a").click();
    expect(checkboxOf(menuItem("Tagged")).checked).toBe(true);

    applyButton().click();
    await vi.runAllTimersAsync();

    expect(raw.settings.dashboardMultiFilters).toEqual({
      statusFilters: ["tagged"],
      tagFilters: ["a"],
      logic: "OR",
    });
  });

  it("unticking the last tag keeps the Tagged status", async () => {
    const { plugin, raw } = createPlugin();
    const button = renderTab(plugin);
    await open(button);

    await openTagSubmenu();
    tagSubmenuItem("a").click();
    tagSubmenuItem("a").click();
    expect(checkboxOf(menuItem("Tagged")).checked).toBe(true);

    applyButton().click();
    await vi.runAllTimersAsync();

    expect(raw.settings.dashboardMultiFilters).toEqual({
      statusFilters: ["tagged"],
      tagFilters: [],
      logic: "OR",
    });
  });
});

describe("Startup filters Apply", () => {
  it("restores the previous filters, reports the failure and closes the menu when the save rejects", async () => {
    const stopWatching = watchUnhandledRejections();
    const notices = spyOnNotices();
    const { plugin, raw } = createPlugin({
      saveSettings: vi.fn(async () => {
        throw new Error("disk full");
      }),
    });
    raw.settings.dashboardMultiFilters = {
      statusFilters: ["read"],
      tagFilters: [],
      logic: "AND",
    };
    raw.settings.display.defaultFilter = "starred";
    const button = renderTab(plugin);
    await open(button);

    menuItem("Unread").click();
    applyButton().click();
    await vi.runAllTimersAsync();
    const unhandled = stopWatching();

    expect(raw.settings.dashboardMultiFilters).toEqual({
      statusFilters: ["read"],
      tagFilters: [],
      logic: "AND",
    });
    expect(raw.settings.display.defaultFilter).toBe("starred");
    expect(notices()).toContain("Startup filters update failed: disk full");
    expect(raw.notifyFiltersUpdated).not.toHaveBeenCalled();
    expect(menuPortal()).toBeNull();
    expect(unhandled).toHaveLength(0);
  });

  it("keeps the saved filters and reports a failure to refresh the dashboard", async () => {
    const stopWatching = watchUnhandledRejections();
    const notices = spyOnNotices();
    const { plugin, raw } = createPlugin({
      getActiveDashboardView: vi.fn(async () => ({
        leaf: { id: "leaf" },
        render: vi.fn(),
      })),
      app: {
        workspace: {
          revealLeaf: vi.fn(async () => {
            throw new Error("no leaf");
          }),
        },
      },
    });
    const button = renderTab(plugin);
    await open(button);

    menuItem("Unread").click();
    applyButton().click();
    await vi.runAllTimersAsync();
    const unhandled = stopWatching();

    expect(raw.settings.dashboardMultiFilters.statusFilters).toEqual([
      "unread",
    ]);
    expect(raw.notifyFiltersUpdated).toHaveBeenCalledTimes(1);
    expect(notices()).toContain(
      "Dashboard refresh failed after startup filters were saved: no leaf",
    );
    expect(menuPortal()).toBeNull();
    expect(unhandled).toHaveLength(0);
  });

  it("reports no failure when the save and the dashboard refresh both succeed", async () => {
    const notices = spyOnNotices();
    const render = vi.fn();
    const { plugin, raw } = createPlugin({
      getActiveDashboardView: vi.fn(async () => ({
        leaf: { id: "leaf" },
        render,
      })),
    });
    const button = renderTab(plugin);
    await open(button);

    menuItem("Unread").click();
    applyButton().click();
    await vi.runAllTimersAsync();

    expect(raw.settings.dashboardMultiFilters.statusFilters).toEqual([
      "unread",
    ]);
    expect(raw.notifyFiltersUpdated).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
    expect(notices()).toEqual([]);
    expect(menuPortal()).toBeNull();
  });
});
