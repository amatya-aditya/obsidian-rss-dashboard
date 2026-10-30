/**
 * Characterization tests for renderDisplaySettingsTab (#1251, umbrella #1094).
 *
 * Pin the current behavior of the Display tab before it is split: the order
 * of its settings, the startup filters menu, the synced slider/text controls,
 * and the returned disposer. Read-only during the extraction.
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

function createPlugin(overrides: Record<string, unknown> = {}) {
  const view = { leaf: {}, render: vi.fn() };
  const plugin = {
    app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
    settings: cloneSettings(),
    saveSettings: vi.fn(async () => {}),
    notifyFiltersUpdated: vi.fn(),
    getImageCacheSizeBytes: vi.fn(() => 0),
    getActiveDashboardView: vi.fn(async () => view),
    getActiveReaderView: vi.fn(async () => null),
    ...overrides,
  };
  return { plugin: plugin as unknown as RssDashboardPlugin, raw: plugin, view };
}

function renderTab(plugin: RssDashboardPlugin) {
  const containerEl = document.body.appendChild(createDiv());
  const dispose = renderDisplaySettingsTab(containerEl, plugin, () => {});
  return { containerEl, dispose };
}

function startupButton(containerEl: HTMLElement): HTMLButtonElement {
  return getSettingByName(containerEl, "Startup filters").querySelector(
    "button",
  ) as HTMLButtonElement;
}

function menuPortal(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(
    ".rss-dashboard-startup-filters-menu-portal",
  );
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
  if (!item) {
    throw new Error(`Menu item not found: ${label}`);
  }
  return item;
}

function checkboxOf(item: HTMLElement): HTMLInputElement {
  return item.querySelector("input") as HTMLInputElement;
}

function allCheckbox(): HTMLInputElement {
  return checkboxOf(menuItem("All"));
}

function applyButton(): HTMLButtonElement {
  return document.body.querySelector(
    ".rss-dashboard-filter-apply-btn",
  ) as HTMLButtonElement;
}

async function openMenu(containerEl: HTMLElement): Promise<void> {
  startupButton(containerEl).click();
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

describe("renderDisplaySettingsTab() characterization", () => {
  it("renders its settings and headings in a fixed order", () => {
    const { plugin } = createPlugin();
    const { containerEl } = renderTab(plugin);

    const names = Array.from(
      containerEl.querySelectorAll(".setting-item-name"),
    ).map((el) => el.textContent);

    expect(names).toEqual([
      "Dashboard",
      "Show cover images",
      "Show fetch all covers button",
      "Allow image caching",
      "Image cache limit",
      "No cache size limit",
      "Clear image cache",
      "Show summary",
      "Cards per row",
      "Card spacing",
      "Article title size",
      "Show filter status bar",
      "Pagination position",
      'Automatically mark article "read" upon opening',
      "Article date display",
      "Left-handed layout",
      "Startup filters",
      "Reader",
      "Font size",
      "Line height",
      "Font",
      "Alignment",
      "Paragraph spacing",
      "Reset reader format",
      "Mobile toolbar",
      "Show toolbar in card view (mobile)",
      "Show toolbar in list view",
      "List toolbar style",
    ]);
    expect(containerEl.querySelectorAll("hr")).toHaveLength(2);
  });

  it("tags the Reader and Mobile toolbar headings for deep links", () => {
    const { plugin } = createPlugin();
    const { containerEl } = renderTab(plugin);

    expect(
      getSettingByName(containerEl, "Reader").dataset.rssSettingsSection,
    ).toBe("reader");
    expect(
      getSettingByName(containerEl, "Mobile toolbar").dataset
        .rssSettingsSection,
    ).toBe("mobile-toolbar");
  });

  it("scrolls the targeted section heading into view on the next tick", () => {
    const { plugin } = createPlugin();
    const containerEl = document.body.appendChild(createDiv());
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    renderDisplaySettingsTab(containerEl, plugin, () => {}, "Mobile toolbar");
    expect(scrollIntoView).not.toHaveBeenCalled();
    vi.runAllTimers();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      behavior: "auto",
    });
  });

  it("syncs the Cards per row text input with clamping and ignores non-numbers", async () => {
    const { plugin, raw } = createPlugin();
    const { containerEl } = renderTab(plugin);
    const input = getSettingByName(containerEl, "Cards per row").querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;

    expect(input.min).toBe("0");
    expect(input.max).toBe("6");
    expect(input.step).toBe("1");

    input.value = "9";
    input.dispatchEvent(new Event("input"));
    await vi.runAllTimersAsync();
    expect(input.value).toBe("6");
    expect(raw.settings.display.cardColumnsPerRow).toBe(6);
    expect(raw.saveSettings).toHaveBeenCalledTimes(1);

    input.value = "abc";
    input.dispatchEvent(new Event("input"));
    await vi.runAllTimersAsync();
    expect(raw.settings.display.cardColumnsPerRow).toBe(6);
    expect(raw.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("clamps Card spacing and re-renders the active dashboard", async () => {
    const { plugin, raw, view } = createPlugin();
    const { containerEl } = renderTab(plugin);
    const input = getSettingByName(containerEl, "Card spacing").querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;

    input.value = "-5";
    input.dispatchEvent(new Event("input"));
    await vi.runAllTimersAsync();

    expect(input.value).toBe("0");
    expect(raw.settings.display.cardSpacing).toBe(0);
    expect(raw.app.workspace.revealLeaf).toHaveBeenCalledWith(view.leaf);
    expect(view.render).toHaveBeenCalledTimes(1);
  });

  it("restores the saved image cache limit when the blur value is invalid", async () => {
    const setImageCacheLimit = vi.fn(async () => {});
    const { plugin, raw } = createPlugin({ setImageCacheLimit });
    const { containerEl } = renderTab(plugin);
    const input = getSettingByName(
      containerEl,
      "Image cache limit",
    ).querySelector('input[type="number"]') as HTMLInputElement;

    input.value = "1.5";
    input.dispatchEvent(new Event("blur"));
    await vi.runAllTimersAsync();

    expect(input.value).toBe(String(raw.settings.display.imageCacheLimitMiB));
    expect(setImageCacheLimit).not.toHaveBeenCalled();

    input.value = "250";
    input.dispatchEvent(new Event("blur"));
    await vi.runAllTimersAsync();

    expect(setImageCacheLimit).toHaveBeenCalledWith(250, false);
  });

  it("returns a disposer that unregisters the cache listener and cancels the pending size refresh", async () => {
    const unregister = vi.fn();
    let onChanged: (() => void) | null = null;
    const getImageCacheSizeBytes = vi.fn(() => 0);
    const { plugin } = createPlugin({
      getImageCacheSizeBytes,
      onImageCacheChanged: vi.fn((cb: () => void) => {
        onChanged = cb;
        return unregister;
      }),
    });
    const { containerEl, dispose } = renderTab(plugin);
    const description = getSettingByName(containerEl, "Clear image cache");
    expect(description.textContent).toContain("Cached image storage: 0 B.");

    getImageCacheSizeBytes.mockReturnValue(2_048);
    onChanged!();
    onChanged!();
    await vi.advanceTimersByTimeAsync(249);
    expect(description.textContent).toContain("0 B");
    await vi.advanceTimersByTimeAsync(1);
    expect(description.textContent).toContain("Cached image storage: 2.0 KB.");

    onChanged!();
    expect(unregister).not.toHaveBeenCalled();
    dispose();
    expect(unregister).toHaveBeenCalledTimes(1);
    getImageCacheSizeBytes.mockReturnValue(4_096);
    await vi.runAllTimersAsync();
    expect(description.textContent).toContain("2.0 KB");
  });
});

describe("renderDisplaySettingsTab() startup filters menu characterization", () => {
  it("shows All on the button when no filters are stored", () => {
    const { plugin } = createPlugin();
    const { containerEl } = renderTab(plugin);

    expect(startupButton(containerEl).textContent).toBe("All");
    expect(
      startupButton(containerEl).classList.contains(
        "rss-dashboard-startup-filters-button",
      ),
    ).toBe(true);
  });

  it("lists the status options in order with All checked first", async () => {
    const { plugin } = createPlugin();
    const { containerEl } = renderTab(plugin);
    await openMenu(containerEl);

    const labels = Array.from(
      menuPortal()!.querySelectorAll(
        ":scope > .rss-dashboard-filter-menu-item .rss-dashboard-filter-menu-text",
      ),
    ).map((el) => el.textContent);
    expect(labels).toEqual([
      "All",
      "Unread",
      "Read",
      "Saved",
      "Starred",
      "Podcast",
      "Videos",
      "Tagged",
      "Untagged",
    ]);
    expect(allCheckbox().checked).toBe(true);
    expect(
      menuPortal()!.querySelector(".rss-dashboard-filter-logic-btn.active")
        ?.textContent,
    ).toBe("Or");
  });

  it("reopening replaces a stale menu instead of stacking portals", async () => {
    const { plugin } = createPlugin();
    const { containerEl } = renderTab(plugin);
    await openMenu(containerEl);
    await openMenu(containerEl);

    expect(
      document.body.querySelectorAll(
        ".rss-dashboard-startup-filters-menu-portal",
      ),
    ).toHaveLength(1);
  });

  it("pre-selects stored filters and logic", async () => {
    const settings = cloneSettings();
    settings.dashboardMultiFilters = {
      statusFilters: ["starred"],
      tagFilters: [],
      logic: "AND",
    };
    const { plugin } = createPlugin({ settings });
    const { containerEl } = renderTab(plugin);
    await openMenu(containerEl);

    expect(allCheckbox().checked).toBe(false);
    expect(checkboxOf(menuItem("Starred")).checked).toBe(true);
    expect(checkboxOf(menuItem("Unread")).checked).toBe(false);
    expect(
      menuPortal()!.querySelector(".rss-dashboard-filter-logic-btn.active")
        ?.textContent,
    ).toBe("And");
  });

  it("keeps All and the status checkboxes mutually consistent", async () => {
    const { plugin } = createPlugin();
    const { containerEl } = renderTab(plugin);
    await openMenu(containerEl);

    // Row click toggles the checkbox, which unchecks All.
    menuItem("Unread").click();
    expect(checkboxOf(menuItem("Unread")).checked).toBe(true);
    expect(allCheckbox().checked).toBe(false);

    // Unchecking the last selection re-checks All.
    menuItem("Unread").click();
    expect(checkboxOf(menuItem("Unread")).checked).toBe(false);
    expect(allCheckbox().checked).toBe(true);

    // Checking All clears every status checkbox.
    menuItem("Read").click();
    menuItem("Saved").click();
    menuItem("All").click();
    expect(allCheckbox().checked).toBe(true);
    expect(checkboxOf(menuItem("Read")).checked).toBe(false);
    expect(checkboxOf(menuItem("Saved")).checked).toBe(false);
  });

  it("applies the selection, resets the default filter and closes the menu", async () => {
    const { plugin, raw, view } = createPlugin();
    raw.settings.display.defaultFilter = "unread";
    const { containerEl } = renderTab(plugin);
    await openMenu(containerEl);

    menuItem("Unread").click();
    menuItem("Starred").click();
    menuPortal()!
      .querySelectorAll<HTMLElement>(".rss-dashboard-filter-logic-btn")
      .forEach((btn) => {
        if (btn.textContent === "And") btn.click();
      });
    applyButton().click();
    await vi.runAllTimersAsync();

    expect(raw.settings.dashboardMultiFilters).toEqual({
      statusFilters: ["unread", "starred"],
      tagFilters: [],
      logic: "AND",
    });
    expect(raw.settings.display.defaultFilter).toBe("all");
    expect(raw.saveSettings).toHaveBeenCalledTimes(1);
    expect(raw.notifyFiltersUpdated).toHaveBeenCalledWith({
      source: "settings-startup-filters",
      timestamp: expect.any(Number),
    });
    expect(raw.app.workspace.revealLeaf).toHaveBeenCalledWith(view.leaf);
    expect(view.render).toHaveBeenCalledTimes(1);
    expect(menuPortal()).toBeNull();
    expect(startupButton(containerEl).textContent).not.toBe("All");
  });

  it("applies All as empty filter lists even with leftover selections", async () => {
    const settings = cloneSettings();
    settings.dashboardMultiFilters = {
      statusFilters: ["read"],
      tagFilters: [],
      logic: "OR",
    };
    const { plugin, raw } = createPlugin({ settings });
    const { containerEl } = renderTab(plugin);
    await openMenu(containerEl);

    menuItem("All").click();
    applyButton().click();
    await vi.runAllTimersAsync();

    expect(raw.settings.dashboardMultiFilters).toEqual({
      statusFilters: [],
      tagFilters: [],
      logic: "OR",
    });
    expect(startupButton(containerEl).textContent).toBe("All");
  });

  it("opens the tag submenu on Tagged hover and clears it when hovering another row", async () => {
    const settings = cloneSettings();
    settings.availableTags = [
      { name: "alpha", color: "#111111" },
      { name: "beta", color: "#222222" },
    ];
    const { plugin, raw } = createPlugin({ settings });
    const { containerEl } = renderTab(plugin);
    await openMenu(containerEl);

    menuItem("Tagged").dispatchEvent(new MouseEvent("mouseenter"));
    await vi.runAllTimersAsync();
    const submenu = menuPortal()!.querySelector(".rss-dashboard-tag-submenu")!;
    expect(
      Array.from(
        submenu.querySelectorAll(".rss-dashboard-filter-menu-text"),
      ).map((el) => el.textContent),
    ).toEqual(["alpha", "beta"]);

    // Selecting a tag unchecks All and ticks Tagged; Apply stores both.
    (
      submenu.querySelectorAll(
        ".rss-dashboard-filter-menu-item",
      )[1] as HTMLElement
    ).click();
    expect(allCheckbox().checked).toBe(false);
    expect(checkboxOf(menuItem("Tagged")).checked).toBe(true);

    menuItem("Read").dispatchEvent(new MouseEvent("mouseenter"));
    expect(
      menuPortal()!.querySelector(".rss-dashboard-tag-submenu"),
    ).toBeNull();

    applyButton().click();
    await vi.runAllTimersAsync();
    expect(raw.settings.dashboardMultiFilters).toEqual({
      statusFilters: ["tagged"],
      tagFilters: ["beta"],
      logic: "OR",
    });
  });

  it("shows an empty-state row when no tags exist", async () => {
    const settings = cloneSettings();
    settings.availableTags = [];
    const { plugin } = createPlugin({ settings });
    const { containerEl } = renderTab(plugin);
    await openMenu(containerEl);

    menuItem("Tagged").dispatchEvent(new MouseEvent("mouseenter"));
    await vi.runAllTimersAsync();

    expect(
      menuPortal()!.querySelector(
        ".rss-dashboard-tag-submenu .rss-dashboard-filter-menu-item.empty",
      )?.textContent,
    ).toBe("No tags available");
  });

  it("unchecking Tagged drops the selected tag filters", async () => {
    const settings = cloneSettings();
    settings.availableTags = [{ name: "alpha", color: "#111111" }];
    settings.dashboardMultiFilters = {
      statusFilters: ["tagged"],
      tagFilters: ["alpha"],
      logic: "OR",
    };
    const { plugin, raw } = createPlugin({ settings });
    const { containerEl } = renderTab(plugin);
    await openMenu(containerEl);

    menuItem("Tagged").click();
    expect(allCheckbox().checked).toBe(true);
    applyButton().click();
    await vi.runAllTimersAsync();

    expect(raw.settings.dashboardMultiFilters).toEqual({
      statusFilters: [],
      tagFilters: [],
      logic: "OR",
    });
  });

  it("closes on an outside mousedown but not on a mousedown inside the menu or on the button", async () => {
    const { plugin } = createPlugin();
    const { containerEl } = renderTab(plugin);
    await openMenu(containerEl);

    menuPortal()!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    startupButton(containerEl).dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true }),
    );
    expect(menuPortal()).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(menuPortal()).toBeNull();
  });

  it("registers the outside-click listener one tick after opening", () => {
    const { plugin } = createPlugin();
    const { containerEl } = renderTab(plugin);
    startupButton(containerEl).click();

    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(menuPortal()).not.toBeNull();

    vi.advanceTimersByTime(1);
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(menuPortal()).toBeNull();
  });
});
