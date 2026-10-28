import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { DEFAULT_SETTINGS, type Feed } from "../../../src/types/types";
import {
  moveIconOrder,
  normalizeHexColor,
  renderSidebarSettingsTab,
} from "../../../src/settings/tabs/sidebar-settings-tab";
import { SIDEBAR_ICON_IDS } from "../../../src/utils/sidebar-icon-registry";
import { showDomainIconToggleConfirm } from "../../../src/utils/domain-icon-helpers";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { isToggleOn, setToggle } from "../test-toggle-helpers";
import type RssDashboardPlugin from "../../../main";

vi.mock("../../../src/utils/domain-icon-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/utils/domain-icon-helpers")
  >("../../../src/utils/domain-icon-helpers");
  return {
    ...actual,
    fetchDomainFeedIcons: vi.fn(async () => {}),
    showDomainIconToggleConfirm: vi.fn(async () => true),
  };
});

type DashboardViewMock = {
  leaf: object;
  sidebar: { render: ReturnType<typeof vi.fn> };
  render: ReturnType<typeof vi.fn>;
};

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createFixture(
  configure?: (settings: typeof DEFAULT_SETTINGS) => void,
  hasView = true,
) {
  const containerEl = document.body.appendChild(createDiv());
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as typeof DEFAULT_SETTINGS;
  configure?.(settings);
  const app = obsidian.App.createMock();
  const revealLeaf = vi.fn(async () => {});
  (app.workspace as unknown as { revealLeaf: unknown }).revealLeaf = revealLeaf;
  const view: DashboardViewMock = {
    leaf: { id: "leaf" },
    sidebar: { render: vi.fn() },
    render: vi.fn(),
  };
  const calls: string[] = [];
  const saveSettings = vi.fn(async () => {
    calls.push("save");
  });
  view.sidebar.render.mockImplementation(() => {
    calls.push("sidebar.render");
  });
  revealLeaf.mockImplementation(async () => {
    calls.push("revealLeaf");
  });
  const getActiveDashboardView = vi.fn(async () => (hasView ? view : null));
  const plugin = {
    app,
    settings,
    saveSettings,
    getActiveDashboardView,
  } as unknown as RssDashboardPlugin;
  const onRefresh = vi.fn(() => {
    calls.push("onRefresh");
  });
  return {
    containerEl,
    plugin,
    settings,
    view,
    revealLeaf,
    saveSettings,
    onRefresh,
    calls,
  };
}

function settingNames(containerEl: HTMLElement): string[] {
  return Array.from(containerEl.querySelectorAll(".setting-item-name")).map(
    (el) => el.textContent ?? "",
  );
}

function getSetting(containerEl: HTMLElement, name: string): HTMLElement {
  const match = Array.from(containerEl.querySelectorAll(".setting-item")).find(
    (el) => el.querySelector(".setting-item-name")?.textContent === name,
  );
  if (!match) throw new Error(`Setting not found: ${name}`);
  return match as HTMLElement;
}

function getToggle(containerEl: HTMLElement, name: string): HTMLInputElement {
  const toggle = getSetting(containerEl, name).querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  if (!toggle) throw new Error(`Toggle not found: ${name}`);
  return toggle;
}

function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

function getIconRow(containerEl: HTMLElement, id: string): HTMLElement {
  const row = containerEl.querySelector<HTMLElement>(
    `.rss-dashboard-icon-visibility-row[data-icon-id="${id}"]`,
  );
  if (!row) throw new Error(`Icon row not found: ${id}`);
  return row;
}

function iconRowIds(containerEl: HTMLElement): string[] {
  return Array.from(
    containerEl.querySelectorAll<HTMLElement>(
      ".rss-dashboard-icon-visibility-row",
    ),
  ).map((row) => row.dataset.iconId ?? "");
}

function dragEvent(
  type: string,
  init: { clientY?: number; relatedTarget?: EventTarget | null } = {},
  dataTransfer?: Record<string, unknown>,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clientY", { value: init.clientY ?? 0 });
  Object.defineProperty(event, "relatedTarget", {
    value: init.relatedTarget ?? null,
  });
  if (dataTransfer) {
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  }
  return event;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.clearAllMocks();
  // 1.8.7 through 1.12.x use the legacy settings controls; pin that branch.
  obsidian.__setObsidianVersion("1.8.7");
});

afterEach(() => {
  obsidian.__resetObsidianVersion();
  vi.useRealTimers();
  document.body.empty();
});

describe("Sidebar settings tab characterization: pure helpers", () => {
  it("moves an icon before or after its target without mutating the input", () => {
    const order = ["a", "b", "c", "d"];
    expect(moveIconOrder(order, "a", "c", false)).toEqual(["b", "a", "c", "d"]);
    expect(moveIconOrder(order, "a", "c", true)).toEqual(["b", "c", "a", "d"]);
    expect(moveIconOrder(order, "d", "b", false)).toEqual(["a", "d", "b", "c"]);
    expect(moveIconOrder(order, "d", "b", true)).toEqual(["a", "b", "d", "c"]);
    expect(order).toEqual(["a", "b", "c", "d"]);
  });

  it("returns the same array for a missing or identical id", () => {
    const order = ["a", "b"];
    expect(moveIconOrder(order, "x", "a", false)).toBe(order);
    expect(moveIconOrder(order, "a", "x", false)).toBe(order);
    expect(moveIconOrder(order, "a", "a", true)).toBe(order);
  });

  it("normalizes hex colors", () => {
    expect(normalizeHexColor("  #ABC ")).toBe("#abc");
    expect(normalizeHexColor("A1B2C3")).toBe("#a1b2c3");
    expect(normalizeHexColor("")).toBeNull();
    expect(normalizeHexColor("#abcd")).toBeNull();
    expect(normalizeHexColor("ggg")).toBeNull();
  });
});

describe("Sidebar settings tab characterization: layout", () => {
  it("renders the sections in a fixed order", () => {
    const { containerEl, plugin, onRefresh } = createFixture();
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    const names = settingNames(containerEl);
    const iconNames = Array.from(
      containerEl.querySelectorAll(
        ".rss-dashboard-icon-visibility-row .setting-item-name",
      ),
    ).map((el) => el.textContent ?? "");
    expect(iconNames.length).toBe(SIDEBAR_ICON_IDS.length);
    const withoutIconRows = names.filter((name) => !iconNames.includes(name));
    expect(withoutIconRows).toEqual([
      "Sidebar",
      "Hide default RSS icon",
      "All feeds badge",
      "Folders badge",
      "Feeds badge",
      "Hide empty feeds/no unread articles",
      "Show feed fetch error badges",
      "Icon visibility",
      "Hide toolbar entirely",
      "Reset icon order & visibility",
      "Sidebar padding",
      "Left padding",
      "Right padding",
      "Row spacing",
      "Sidebar row spacing",
      "Sidebar row indentation",
      "Feed icons",
      "YouTube profile images",
      "Use site icons/favicons for RSS feeds",
      "Use album/show artwork for Podcast feeds",
      "Use profile images for Mastodon feeds",
    ]);
    expect(
      names.indexOf("Hide toolbar entirely") <
        names.indexOf(iconNames[0] ?? ""),
    ).toBe(true);
    expect(
      names.indexOf(iconNames[iconNames.length - 1] ?? "") <
        names.indexOf("Reset icon order & visibility"),
    ).toBe(true);
    expect(containerEl.lastElementChild?.tagName).toBe("HR");
    expect(containerEl.lastElementChild?.className).toBe(
      "rss-dashboard-settings-separator",
    );
  });

  it("appends a note to the hide-RSS-icon description", () => {
    const { containerEl, plugin, onRefresh } = createFixture();
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    expect(
      getSetting(containerEl, "Hide default RSS icon").querySelector(
        ".setting-item-description",
      )?.textContent,
    ).toBe(
      "Hide the default RSS icon for regular feeds in the sidebar. This also hides the fallback icon on Mastodon feeds.",
    );
  });

  it("marks the section headings and scrolls to the requested one", () => {
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    for (const [target, key] of [
      ["Icon visibility", "icon-visibility"],
      ["Sidebar padding", "sidebar-padding"],
      ["Row spacing", "row-spacing"],
    ] as const) {
      document.body.empty();
      scrollIntoView.mockClear();
      const { containerEl, plugin, onRefresh } = createFixture();
      renderSidebarSettingsTab(containerEl, plugin, onRefresh, target);

      const heading = containerEl.querySelector<HTMLElement>(
        `[data-rss-settings-section="${key}"]`,
      );
      expect(heading?.querySelector(".setting-item-name")?.textContent).toBe(
        target,
      );
      expect(scrollIntoView).not.toHaveBeenCalled();
      vi.advanceTimersByTime(0);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "center",
        behavior: "auto",
      });
    }
  });

  it("does not scroll without a matching target section", () => {
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { containerEl, plugin, onRefresh } = createFixture();
    renderSidebarSettingsTab(containerEl, plugin, onRefresh, "Unknown");
    vi.advanceTimersByTime(10);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("Sidebar settings tab characterization: simple toggles", () => {
  it("saves, reveals the dashboard leaf, then re-renders the sidebar", async () => {
    const {
      containerEl,
      plugin,
      onRefresh,
      settings,
      calls,
      revealLeaf,
      view,
    } = createFixture();
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    setToggle(getToggle(containerEl, "Hide default RSS icon"), true);
    await flushPromises();

    expect(settings.display.hideDefaultRssIcon).toBe(true);
    expect(calls).toEqual(["save", "revealLeaf", "sidebar.render"]);
    expect(revealLeaf).toHaveBeenCalledWith(view.leaf);
  });

  it("saves without touching a missing dashboard view", async () => {
    const {
      containerEl,
      plugin,
      onRefresh,
      settings,
      saveSettings,
      revealLeaf,
    } = createFixture(undefined, false);
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    setToggle(
      getToggle(containerEl, "Hide empty feeds/no unread articles"),
      true,
    );
    await flushPromises();

    expect(settings.display.hideEmptyFeeds).toBe(true);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(revealLeaf).not.toHaveBeenCalled();
  });

  it("stores the fetch error badge toggle inverted", async () => {
    const { containerEl, plugin, onRefresh, settings } = createFixture();
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);
    const toggle = getToggle(containerEl, "Show feed fetch error badges");
    expect(isToggleOn(toggle)).toBe(true);

    setToggle(toggle, false);
    await flushPromises();
    expect(settings.display.hideFeedFetchErrorBadges).toBe(true);

    setToggle(toggle, true);
    await flushPromises();
    expect(settings.display.hideFeedFetchErrorBadges).toBe(false);
  });

  it("reflects stored values when rendering the toggles", () => {
    const { containerEl, plugin, onRefresh } = createFixture((settings) => {
      settings.display.hideDefaultRssIcon = true;
      settings.display.hideEmptyFeeds = true;
      settings.display.hideFeedFetchErrorBadges = true;
      settings.display.hideToolbarEntirely = true;
    });
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    expect(isToggleOn(getToggle(containerEl, "Hide default RSS icon"))).toBe(
      true,
    );
    expect(
      isToggleOn(getToggle(containerEl, "Hide empty feeds/no unread articles")),
    ).toBe(true);
    expect(
      isToggleOn(getToggle(containerEl, "Show feed fetch error badges")),
    ).toBe(false);
    expect(isToggleOn(getToggle(containerEl, "Hide toolbar entirely"))).toBe(
      true,
    );
  });
});

describe("Sidebar settings tab characterization: unread badges", () => {
  const badges = [
    ["All feeds badge", "showAllFeedsUnreadBadges", "allFeedsUnreadBadgeColor"],
    ["Folders badge", "showFolderUnreadBadges", "folderUnreadBadgeColor"],
    ["Feeds badge", "showFeedUnreadBadges", "feedUnreadBadgeColor"],
  ] as const;

  it("labels each badge control and shows the configured placeholder", () => {
    const { containerEl, plugin, onRefresh } = createFixture();
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    const expected = [
      ["All feeds badge", "the All feeds row", "#8e44ad"],
      ["Folders badge", "folder rows", "#d85b9f"],
      ["Feeds badge", "feed rows", "#8e44ad"],
    ] as const;
    for (const [name, rows, placeholder] of expected) {
      const setting = getSetting(containerEl, name);
      expect(setting.classList.contains("rss-dashboard-settings-two-row")).toBe(
        true,
      );
      expect(
        setting.classList.contains("rss-dashboard-sidebar-badge-setting"),
      ).toBe(true);
      expect(
        setting.querySelector(".setting-item-description")?.textContent,
      ).toBe(
        `Show the unread count badge on ${rows}. Use the switch to turn it on or off, then pick its color or type a hex value.`,
      );
      expect(
        setting
          .querySelector(".checkbox-container")
          ?.getAttribute("aria-label"),
      ).toBe(`Show ${name}`);
      expect(
        setting
          .querySelector('input[type="color"]')
          ?.getAttribute("aria-label"),
      ).toBe(`${name} color`);
      const text =
        setting.querySelector<HTMLInputElement>('input[type="text"]');
      expect(text?.getAttribute("aria-label")).toBe(`${name} hex color`);
      expect(text?.placeholder).toBe(placeholder);
      expect(text?.classList.contains("rss-dashboard-color-hex-input")).toBe(
        true,
      );
    }
  });

  it.each(badges)(
    "%s toggles its flag and defaults to shown",
    async (name, enabledKey) => {
      const { containerEl, plugin, onRefresh, settings, calls } =
        createFixture();
      renderSidebarSettingsTab(containerEl, plugin, onRefresh);
      const toggle = getToggle(containerEl, name);

      setToggle(toggle, false);
      await flushPromises();

      expect(settings.display[enabledKey]).toBe(false);
      expect(calls).toEqual(["save", "revealLeaf", "sidebar.render"]);
    },
  );

  it.each(badges)(
    "%s syncs the picker into the hex field and saves once",
    async (name, _enabledKey, colorKey) => {
      const { containerEl, plugin, onRefresh, settings, calls, saveSettings } =
        createFixture();
      renderSidebarSettingsTab(containerEl, plugin, onRefresh);
      const setting = getSetting(containerEl, name);
      const picker = setting.querySelector<HTMLInputElement>(
        'input[type="color"]',
      ) as HTMLInputElement;
      const text = setting.querySelector<HTMLInputElement>(
        'input[type="text"]',
      ) as HTMLInputElement;

      picker.value = "#123456";
      picker.dispatchEvent(new Event("input"));
      await flushPromises();

      expect(text.value).toBe("#123456");
      expect(settings.display[colorKey]).toBe("#123456");
      expect(saveSettings).toHaveBeenCalledTimes(1);
      expect(calls).toEqual(["save", "revealLeaf", "sidebar.render"]);
    },
  );

  it("normalizes a typed hex color, syncs the picker, and ignores invalid text", async () => {
    const { containerEl, plugin, onRefresh, settings, saveSettings } =
      createFixture();
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);
    const setting = getSetting(containerEl, "Folders badge");
    const picker = setting.querySelector<HTMLInputElement>(
      'input[type="color"]',
    ) as HTMLInputElement;
    const text = setting.querySelector<HTMLInputElement>(
      'input[type="text"]',
    ) as HTMLInputElement;

    typeInto(text, "nothex");
    await flushPromises();
    expect(saveSettings).not.toHaveBeenCalled();
    expect(settings.display.folderUnreadBadgeColor).toBe("#d85b9f");

    typeInto(text, "ABCDEF");
    await flushPromises();
    expect(settings.display.folderUnreadBadgeColor).toBe("#abcdef");
    expect(picker.value).toBe("#abcdef");
    // The typed value itself is left as typed.
    expect(text.value).toBe("ABCDEF");
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });
});

describe("Sidebar settings tab characterization: padding and spacing", () => {
  const rows = [
    ["Left padding", "sidebarItemPaddingLeft", 0, 40],
    ["Right padding", "sidebarItemPaddingRight", 0, 40],
    ["Sidebar row spacing", "sidebarRowSpacing", 0, 44],
    ["Sidebar row indentation", "sidebarRowIndentation", 0, 50],
  ] as const;

  it("configures each number input from its limits", () => {
    const { containerEl, plugin, onRefresh } = createFixture();
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    for (const [name, , min, max] of rows) {
      const setting = getSetting(containerEl, name);
      const number = setting.querySelector<HTMLInputElement>(
        'input[type="number"]',
      );
      expect(number?.min).toBe(String(min));
      expect(number?.max).toBe(String(max));
      expect(number?.step).toBe("1");
      expect(
        number?.classList.contains("rss-dashboard-settings-number-input"),
      ).toBe(true);
      expect(setting.classList.contains("rss-dashboard-settings-two-row")).toBe(
        true,
      );
      const slider = setting.querySelector<HTMLInputElement>(
        'input[type="range"]',
      );
      expect(slider?.min).toBe(String(min));
      expect(slider?.max).toBe(String(max));
    }
  });

  it.each(rows)(
    "%s clamps typed numbers, syncs the slider, and saves",
    async (name, key, min, max) => {
      const { containerEl, plugin, onRefresh, settings, saveSettings, view } =
        createFixture();
      renderSidebarSettingsTab(containerEl, plugin, onRefresh);
      const setting = getSetting(containerEl, name);
      const number = setting.querySelector<HTMLInputElement>(
        'input[type="number"]',
      ) as HTMLInputElement;
      const slider = setting.querySelector<HTMLInputElement>(
        'input[type="range"]',
      ) as HTMLInputElement;

      typeInto(number, "9999");
      await flushPromises();
      expect(settings.display[key]).toBe(max);
      expect(number.value).toBe(String(max));
      expect(slider.value).toBe(String(max));

      typeInto(number, "-5");
      await flushPromises();
      expect(settings.display[key]).toBe(min);
      expect(number.value).toBe(String(min));

      expect(saveSettings).toHaveBeenCalledTimes(2);
      expect(view.sidebar.render).toHaveBeenCalledTimes(2);
    },
  );

  it("ignores non-numeric text and does not reveal the dashboard leaf", async () => {
    const {
      containerEl,
      plugin,
      onRefresh,
      settings,
      saveSettings,
      revealLeaf,
    } = createFixture();
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);
    const number = getSetting(containerEl, "Left padding").querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;

    typeInto(number, "abc");
    await flushPromises();
    expect(saveSettings).not.toHaveBeenCalled();

    typeInto(number, "7");
    await flushPromises();
    expect(settings.display.sidebarItemPaddingLeft).toBe(7);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(revealLeaf).not.toHaveBeenCalled();
  });

  it("applies the slider value to the setting and the number input", async () => {
    const { containerEl, plugin, onRefresh, settings, view } = createFixture();
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);
    const setting = getSetting(containerEl, "Sidebar row spacing");
    const slider = setting.querySelector(
      'input[type="range"]',
    ) as HTMLInputElement;
    const number = setting.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;

    slider.value = "30";
    slider.dispatchEvent(new Event("input"));
    await flushPromises();

    expect(settings.display.sidebarRowSpacing).toBe(30);
    expect(number.value).toBe("30");
    expect(view.sidebar.render).toHaveBeenCalledTimes(1);
  });

  it("shows stored values and falls back to the defaults", () => {
    const { containerEl, plugin, onRefresh } = createFixture((settings) => {
      settings.display.sidebarItemPaddingLeft = 12;
      delete (settings.display as Partial<typeof settings.display>)
        .sidebarRowIndentation;
    });
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    expect(
      (
        getSetting(containerEl, "Left padding").querySelector(
          'input[type="number"]',
        ) as HTMLInputElement
      ).value,
    ).toBe("12");
    expect(
      (
        getSetting(containerEl, "Sidebar row indentation").querySelector(
          'input[type="number"]',
        ) as HTMLInputElement
      ).value,
    ).toBe("20");
  });
});

describe("Sidebar settings tab characterization: icon visibility and order", () => {
  it("renders one row per icon in the stored order with its controls", () => {
    const { containerEl, plugin, onRefresh } = createFixture((settings) => {
      settings.display.iconOrder = ["sort", "search", "discover"];
    });
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    expect(iconRowIds(containerEl)).toEqual(["sort", "search", "discover"]);
    const first = getIconRow(containerEl, "sort");
    expect(first.querySelector(".rss-settings-icon-preview")).not.toBeNull();
    expect(
      first
        .querySelector(".rss-dashboard-icon-drag-handle")
        ?.getAttribute("aria-label"),
    ).toBe("Drag to reorder Sort");
    expect(
      first
        .querySelector(".rss-dashboard-icon-drag-handle")
        ?.getAttribute("draggable"),
    ).toBe("true");
    const buttons = Array.from(
      first.querySelectorAll<HTMLButtonElement>(
        ".rss-dashboard-icon-order-btn",
      ),
    );
    expect(buttons.map((b) => b.textContent)).toEqual(["↑", "↓"]);
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Move Sort up",
      "Move Sort down",
    ]);
    // First row cannot move up; last row cannot move down.
    expect(buttons.map((b) => b.disabled)).toEqual([true, false]);
    const last = getIconRow(containerEl, "discover");
    expect(
      Array.from(
        last.querySelectorAll<HTMLButtonElement>(
          ".rss-dashboard-icon-order-btn",
        ),
      ).map((b) => b.disabled),
    ).toEqual([false, true]);
    expect(first.querySelector(".setting-item-description")?.textContent).toBe(
      "Show the Sort icon in the sidebar header",
    );
  });

  it("skips ids that are not registered icons", () => {
    const { containerEl, plugin, onRefresh } = createFixture((settings) => {
      settings.display.iconOrder = ["nope", "search"];
    });
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);
    expect(iconRowIds(containerEl)).toEqual(["search"]);
  });

  it("falls back to the registry order for an empty stored order", () => {
    const { containerEl, plugin, onRefresh } = createFixture((settings) => {
      settings.display.iconOrder = [];
    });
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);
    expect(iconRowIds(containerEl)).toEqual([...SIDEBAR_ICON_IDS]);
  });

  it("stores the icon visibility toggle inverted and reveals the leaf", async () => {
    const { containerEl, plugin, onRefresh, settings, calls } = createFixture();
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);
    const toggle = getIconRow(containerEl, "search").querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(isToggleOn(toggle)).toBe(true);

    setToggle(toggle, false);
    await flushPromises();

    expect(settings.display.hideIconSearch).toBe(true);
    expect(calls).toEqual(["save", "revealLeaf", "sidebar.render"]);
  });

  it("moves a row down with its arrow, re-renders, and saves without revealing the leaf", async () => {
    const { containerEl, plugin, onRefresh, settings, calls, revealLeaf } =
      createFixture((s) => {
        s.display.iconOrder = ["a1", "search", "sort", "tags"];
      });
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    // Unknown ids are skipped when rendering; only registered ones appear.
    expect(iconRowIds(containerEl)).toEqual(["search", "sort", "tags"]);
    getIconRow(containerEl, "search")
      .querySelector<HTMLButtonElement>('[aria-label="Move Search down"]')
      ?.click();
    expect(iconRowIds(containerEl)).toEqual(["sort", "search", "tags"]);
    expect(settings.display.iconOrder).toEqual([
      "a1",
      "sort",
      "search",
      "tags",
    ]);
    await flushPromises();

    expect(calls).toEqual(["save", "sidebar.render"]);
    expect(revealLeaf).not.toHaveBeenCalled();
  });

  it("moves a row up with its arrow and keeps the arrows' end-of-list state", async () => {
    const { containerEl, plugin, onRefresh, settings } = createFixture((s) => {
      s.display.iconOrder = ["search", "sort", "tags"];
    });
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    getIconRow(containerEl, "tags")
      .querySelector<HTMLButtonElement>('[aria-label="Move Tags up"]')
      ?.click();
    await flushPromises();

    expect(settings.display.iconOrder).toEqual(["search", "tags", "sort"]);
    const disabled = Array.from(
      getIconRow(containerEl, "search").querySelectorAll<HTMLButtonElement>(
        ".rss-dashboard-icon-order-btn",
      ),
    ).map((b) => b.disabled);
    expect(disabled).toEqual([true, false]);
  });

  it("falls back to the registry order when moving with no stored order", async () => {
    const { containerEl, plugin, onRefresh, settings } = createFixture((s) => {
      delete (s.display as Partial<typeof s.display>).iconOrder;
    });
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);
    const [first, second] = SIDEBAR_ICON_IDS;
    if (!first || !second) throw new Error("expected icons");

    getIconRow(containerEl, first)
      .querySelectorAll<HTMLButtonElement>(".rss-dashboard-icon-order-btn")[1]
      ?.click();
    await flushPromises();

    expect(settings.display.iconOrder?.slice(0, 2)).toEqual([second, first]);
  });

  it("reorders on drop using the pointer's half of the target row", async () => {
    const { containerEl, plugin, onRefresh, settings, calls } = createFixture(
      (s) => {
        s.display.iconOrder = ["search", "sort", "tags", "discover"];
      },
    );
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100,
      height: 40,
    } as DOMRect);

    // Dropped on the lower half of "tags": after it.
    getIconRow(containerEl, "tags").dispatchEvent(
      dragEvent("drop", { clientY: 130 }, { getData: () => "search" }),
    );
    expect(settings.display.iconOrder).toEqual([
      "sort",
      "tags",
      "search",
      "discover",
    ]);
    await flushPromises();
    // Dropped on the upper half of "sort": before it.
    getIconRow(containerEl, "sort").dispatchEvent(
      dragEvent("drop", { clientY: 110 }, { getData: () => "discover" }),
    );
    expect(settings.display.iconOrder).toEqual([
      "discover",
      "sort",
      "tags",
      "search",
    ]);
    await flushPromises();
    expect(calls).toEqual(["save", "sidebar.render", "save", "sidebar.render"]);
  });

  it("ignores a drop of a row onto itself or with no source", async () => {
    const { containerEl, plugin, onRefresh, settings, saveSettings } =
      createFixture((s) => {
        s.display.iconOrder = ["search", "sort"];
      });
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    getIconRow(containerEl, "sort").dispatchEvent(
      dragEvent("drop", {}, { getData: () => "sort" }),
    );
    getIconRow(containerEl, "sort").dispatchEvent(
      dragEvent("drop", {}, { getData: () => "" }),
    );
    getIconRow(containerEl, "sort").dispatchEvent(dragEvent("drop"));
    await flushPromises();

    expect(settings.display.iconOrder).toEqual(["search", "sort"]);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("shows a drop marker while dragging and clears it on dragend", () => {
    const { containerEl, plugin, onRefresh } = createFixture((s) => {
      s.display.iconOrder = ["search", "sort", "tags"];
    });
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);
    const source = getIconRow(containerEl, "search");
    const target = getIconRow(containerEl, "sort");
    target.getBoundingClientRect = () => ({ top: 100, height: 40 }) as DOMRect;
    const setData = vi.fn();
    const setDragImage = vi.fn();
    const dataTransfer: Record<string, unknown> = {
      setData,
      setDragImage,
      effectAllowed: "",
      dropEffect: "",
    };

    const handle = source.querySelector(
      ".rss-dashboard-icon-drag-handle",
    ) as HTMLElement;
    const start = dragEvent("dragstart", {}, dataTransfer);
    handle.dispatchEvent(start);
    expect(start.defaultPrevented).toBe(false);
    expect(source.classList.contains("rss-dashboard-icon-row-dragging")).toBe(
      true,
    );
    expect(setData).toHaveBeenCalledWith("rss-dashboard-icon-id", "search");
    expect(dataTransfer.effectAllowed).toBe("move");
    expect(setDragImage).toHaveBeenCalledWith(source, 0, 0);

    const over = dragEvent("dragover", { clientY: 130 }, dataTransfer);
    target.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(dataTransfer.dropEffect).toBe("move");
    expect(target.classList.contains("rss-dashboard-icon-drop-after")).toBe(
      true,
    );
    expect(target.classList.contains("rss-dashboard-icon-drop-before")).toBe(
      false,
    );

    target.dispatchEvent(dragEvent("dragover", { clientY: 101 }, dataTransfer));
    expect(target.classList.contains("rss-dashboard-icon-drop-before")).toBe(
      true,
    );
    expect(target.classList.contains("rss-dashboard-icon-drop-after")).toBe(
      false,
    );

    // Leaving into a child of the same row keeps the marker; leaving it clears.
    target.dispatchEvent(
      dragEvent("dragleave", {
        relatedTarget: target.querySelector(".setting-item-name"),
      }),
    );
    expect(target.classList.contains("rss-dashboard-icon-drop-before")).toBe(
      true,
    );
    target.dispatchEvent(dragEvent("dragleave", { relatedTarget: null }));
    expect(target.classList.contains("rss-dashboard-icon-drop-before")).toBe(
      false,
    );

    target.classList.add("rss-dashboard-icon-drop-after");
    handle.dispatchEvent(dragEvent("dragend"));
    expect(source.classList.contains("rss-dashboard-icon-row-dragging")).toBe(
      false,
    );
    expect(target.classList.contains("rss-dashboard-icon-drop-after")).toBe(
      false,
    );
  });

  it("ignores dragover on the dragged row itself and without a drag in progress", () => {
    const { containerEl, plugin, onRefresh } = createFixture((s) => {
      s.display.iconOrder = ["search", "sort"];
    });
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);
    const target = getIconRow(containerEl, "sort");

    const idle = dragEvent("dragover", { clientY: 1 });
    target.dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);

    const handle = getIconRow(containerEl, "sort").querySelector(
      ".rss-dashboard-icon-drag-handle",
    ) as HTMLElement;
    handle.dispatchEvent(
      dragEvent("dragstart", {}, { setData: vi.fn(), setDragImage: vi.fn() }),
    );
    const self = dragEvent("dragover", { clientY: 1 });
    target.dispatchEvent(self);
    expect(self.defaultPrevented).toBe(false);
  });

  it("cancels a drag start while the toolbar is hidden", () => {
    const { containerEl, plugin, onRefresh } = createFixture((s) => {
      s.display.hideToolbarEntirely = true;
    });
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);
    const handle = containerEl.querySelector(
      ".rss-dashboard-icon-drag-handle",
    ) as HTMLElement;

    const start = dragEvent("dragstart", {}, { setData: vi.fn() });
    handle.dispatchEvent(start);

    expect(start.defaultPrevented).toBe(true);
    expect(
      containerEl.querySelector(".rss-dashboard-icon-row-dragging"),
    ).toBeNull();
  });

  it("disables the icon rows when the toolbar toggle changes, then re-renders the sidebar", async () => {
    const { containerEl, plugin, onRefresh, settings, calls } = createFixture();
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    setToggle(getToggle(containerEl, "Hide toolbar entirely"), true);
    await flushPromises();

    expect(settings.display.hideToolbarEntirely).toBe(true);
    expect(calls).toEqual(["save", "revealLeaf", "sidebar.render"]);
    expect(
      getIconRow(containerEl, "search").classList.contains("is-disabled"),
    ).toBe(true);
  });

  it("re-renders keep the row controls in sync with the new toolbar state", async () => {
    const { containerEl, plugin, onRefresh } = createFixture((s) => {
      s.display.iconOrder = ["search", "sort", "tags"];
    });
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    setToggle(getToggle(containerEl, "Hide toolbar entirely"), true);
    await flushPromises();
    // Reordering is blocked, then allowed again once the toolbar is shown.
    getIconRow(containerEl, "search")
      .querySelector<HTMLButtonElement>('[aria-label="Move Search down"]')
      ?.click();
    expect(iconRowIds(containerEl)).toEqual(["search", "sort", "tags"]);

    setToggle(getToggle(containerEl, "Hide toolbar entirely"), false);
    await flushPromises();
    getIconRow(containerEl, "search")
      .querySelector<HTMLButtonElement>('[aria-label="Move Search down"]')
      ?.click();
    expect(iconRowIds(containerEl)).toEqual(["sort", "search", "tags"]);
  });

  it("resets the order and visibility, refreshes the panel, then re-renders the sidebar", async () => {
    const { containerEl, plugin, onRefresh, settings, calls } = createFixture(
      (s) => {
        s.display.iconOrder = ["sort", "search"];
        s.display.hideToolbarEntirely = true;
        s.display.hideIconSearch = true;
        s.display.hideIconSort = true;
      },
    );
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    const reset = getSetting(
      containerEl,
      "Reset icon order & visibility",
    ).querySelector("button") as HTMLButtonElement;
    expect(reset.textContent).toBe("Reset");
    reset.click();
    await flushPromises();

    expect(settings.display.iconOrder).toEqual([...SIDEBAR_ICON_IDS]);
    expect(settings.display.hideToolbarEntirely).toBe(false);
    expect(settings.display.hideIconSearch).toBe(false);
    expect(settings.display.hideIconSort).toBe(false);
    expect(calls).toEqual(["save", "onRefresh", "sidebar.render"]);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe("Sidebar settings tab characterization: feed icon toggles", () => {
  const toggles = [
    ["Use site icons/favicons for RSS feeds", "useDomainIconsRss", "RSS"],
    [
      "Use album/show artwork for Podcast feeds",
      "useDomainIconsPodcast",
      "Podcast",
    ],
    [
      "Use profile images for Mastodon feeds",
      "useDomainIconsMastodon",
      "Mastodon",
    ],
  ] as const;

  function feed(url: string, iconUrl: string, mediaType?: Feed["mediaType"]) {
    return {
      url,
      title: url,
      iconUrl,
      mediaType,
      items: [],
    } as unknown as Feed;
  }

  it("turning on saves immediately, looks up icons, notifies, and re-renders the dashboard", async () => {
    const { containerEl, plugin, onRefresh, settings, calls, view } =
      createFixture((s) => {
        s.display.useDomainIconsRss = false;
        (s as unknown as { feeds: Feed[] }).feeds = [
          feed("https://a.example/feed.xml", ""),
        ];
      });
    const helpers = await import("../../../src/utils/domain-icon-helpers");
    const notice = vi.spyOn(console, "debug");
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    setToggle(
      getToggle(containerEl, "Use site icons/favicons for RSS feeds"),
      true,
    );
    await flushPromises();

    expect(settings.display.useDomainIconsRss).toBe(true);
    expect(helpers.fetchDomainFeedIcons).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["save", "save"]);
    expect(view.render).toHaveBeenCalledTimes(1);
    expect(notice).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Looked up profile images for 1 RSS feed.",
    );
  });

  it.each(toggles)(
    "%s turning off asks for confirmation naming the cached icons",
    async (name, key, domainName) => {
      const { containerEl, plugin, onRefresh } = createFixture((s) => {
        s.display[key] = true;
        (s as unknown as { feeds: Feed[] }).feeds = [
          feed("https://a.example/feed.xml", "https://a.example/icon.png"),
          feed("https://b.example/feed.xml", ""),
          feed(
            "https://c.example/pod.xml",
            "https://c.example/art.png",
            "podcast",
          ),
        ];
      });
      renderSidebarSettingsTab(containerEl, plugin, onRefresh);

      setToggle(getToggle(containerEl, name), false);
      await flushPromises();

      const confirm = vi.mocked(showDomainIconToggleConfirm);
      expect(confirm).toHaveBeenCalledTimes(1);
      const params = confirm.mock.calls[0]?.[1];
      expect(params?.domainName).toBe(domainName);
      expect(params?.cancelLabel).toBe("Cancel");
    },
  );

  it("confirming the RSS toggle off clears cached icons, saves, and re-renders", async () => {
    const { containerEl, plugin, onRefresh, settings, calls, view } =
      createFixture((s) => {
        s.display.useDomainIconsRss = true;
        (s as unknown as { feeds: Feed[] }).feeds = [
          feed("https://a.example/feed.xml", "https://a.example/icon.png"),
          feed(
            "https://c.example/pod.xml",
            "https://c.example/art.png",
            "podcast",
          ),
          feed("https://youtube.com/feeds/videos.xml?channel_id=1", "yt.png"),
        ];
      });
    vi.mocked(showDomainIconToggleConfirm).mockImplementationOnce(
      async (_app, params) => {
        params.onConfirm?.();
        return true;
      },
    );
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    setToggle(
      getToggle(containerEl, "Use site icons/favicons for RSS feeds"),
      false,
    );
    await flushPromises();

    const feeds = (settings as unknown as { feeds: Feed[] }).feeds;
    // BUG: pinned, see #1629 (clears the icon of every feed, not only RSS ones)
    expect(feeds.map((f) => f.iconUrl)).toEqual(["", "", ""]);
    expect(settings.display.useDomainIconsRss).toBe(false);
    expect(calls).toEqual(["save"]);
    expect(view.render).toHaveBeenCalledTimes(1);
    const params = vi.mocked(showDomainIconToggleConfirm).mock.calls[0]?.[1];
    expect(params?.heading).toBe("Clear RSS site icons?");
    expect(params?.confirmLabel).toBe("Clear site icons");
    expect(params?.description).toBe(
      "1 RSS feed currently use a profile image. Cached profile-image URLs in your feeds will be cleared. Cached favicons or domain images already shown in the feeds list are unaffected.",
    );
  });

  it("confirming the Podcast toggle off clears every feed's cached icon", async () => {
    const { containerEl, plugin, onRefresh, settings } = createFixture((s) => {
      s.display.useDomainIconsPodcast = true;
      (s as unknown as { feeds: Feed[] }).feeds = [
        feed("https://c.example/pod.xml", "art.png", "podcast"),
        feed("https://a.example/feed.xml", "icon.png"),
      ];
    });
    vi.mocked(showDomainIconToggleConfirm).mockImplementationOnce(
      async (_app, params) => {
        params.onConfirm?.();
        return true;
      },
    );
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    setToggle(
      getToggle(containerEl, "Use album/show artwork for Podcast feeds"),
      false,
    );
    await flushPromises();

    const feeds = (settings as unknown as { feeds: Feed[] }).feeds;
    // BUG: pinned, see #1629 (clears the icon of every feed, not only podcasts)
    expect(feeds.map((f) => f.iconUrl)).toEqual(["", ""]);
  });

  it("describes the case with no cached icons", async () => {
    const { containerEl, plugin, onRefresh } = createFixture((s) => {
      s.display.useDomainIconsPodcast = true;
      (s as unknown as { feeds: Feed[] }).feeds = [];
    });
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    setToggle(
      getToggle(containerEl, "Use album/show artwork for Podcast feeds"),
      false,
    );
    await flushPromises();

    const params = vi.mocked(showDomainIconToggleConfirm).mock.calls[0]?.[1];
    expect(params?.description).toBe(
      "Existing feeds may have cached profile-image URLs from when the setting was enabled. Cleared feeds will revert to the standard RSS or domain/favicon icon.",
    );
    expect(params?.heading).toBe("Clear podcast artwork?");
    expect(params?.confirmLabel).toBe("Clear artwork");
  });

  it("pluralizes the cached-icon count", async () => {
    const { containerEl, plugin, onRefresh } = createFixture((s) => {
      s.display.useDomainIconsPodcast = true;
      (s as unknown as { feeds: Feed[] }).feeds = [
        feed("https://c.example/1.xml", "1.png", "podcast"),
        feed("https://c.example/2.xml", "2.png", "podcast"),
      ];
    });
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    setToggle(
      getToggle(containerEl, "Use album/show artwork for Podcast feeds"),
      false,
    );
    await flushPromises();

    expect(
      vi.mocked(showDomainIconToggleConfirm).mock.calls[0]?.[1].description,
    ).toBe(
      "2 Podcast feeds currently use a profile image. Cached profile-image URLs in your feeds will be cleared. Cached favicons or domain images already shown in the feeds list are unaffected.",
    );
  });

  it("cancelling reverts the toggle on the next tick without saving", async () => {
    vi.useFakeTimers();
    const { containerEl, plugin, onRefresh, settings, saveSettings } =
      createFixture((s) => {
        s.display.useDomainIconsMastodon = true;
      });
    vi.mocked(showDomainIconToggleConfirm).mockResolvedValueOnce(false);
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);
    const toggle = getToggle(
      containerEl,
      "Use profile images for Mastodon feeds",
    );

    setToggle(toggle, false);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(settings.display.useDomainIconsMastodon).toBe(true);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(isToggleOn(toggle)).toBe(true);
  });

  it("only clears the matching icons when confirming the Mastodon toggle off", async () => {
    const { containerEl, plugin, onRefresh, settings } = createFixture((s) => {
      s.display.useDomainIconsMastodon = true;
      (s as unknown as { feeds: Feed[] }).feeds = [
        feed("https://mastodon.social/@a.rss", "a.png"),
        feed("https://example.com/feed.xml", "b.png"),
      ];
    });
    vi.mocked(showDomainIconToggleConfirm).mockImplementationOnce(
      async (_app, params) => {
        params.onConfirm?.();
        return true;
      },
    );
    renderSidebarSettingsTab(containerEl, plugin, onRefresh);

    setToggle(
      getToggle(containerEl, "Use profile images for Mastodon feeds"),
      false,
    );
    await flushPromises();

    const feeds = (settings as unknown as { feeds: Feed[] }).feeds;
    expect(feeds.map((f) => f.iconUrl)).toEqual(["", "b.png"]);
  });
});
