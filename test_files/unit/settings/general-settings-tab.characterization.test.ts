import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import {
  renderGeneralSettingsTab,
  type GeneralSettingsPlugin,
} from "../../../src/settings/tabs/general-settings-tab";
import {
  ApplyMaxItemsToExistingFeedsModal,
  RetentionChangeConfirmModal,
} from "../../../src/settings/modals/settings-modals";
import {
  CUSTOM_PROXY_OPTION,
  ProxyCheckStore,
} from "../../../src/utils/proxy-check";
import {
  AUTO_PROXY_URL,
  PREDEFINED_PROXIES,
} from "../../../src/utils/proxy-utils";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { isToggleOn, setToggle } from "../test-toggle-helpers";

type Settings = typeof DEFAULT_SETTINGS;

function cloneSettings(): Settings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Settings;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function createFixture(
  mutate: (settings: Settings) => void = () => {},
  options: { hasDashboard?: boolean } = {},
) {
  const containerEl = document.body.appendChild(createDiv());
  const settings = cloneSettings();
  mutate(settings);
  const calls: string[] = [];
  const revealLeaf = vi.fn(async () => {
    calls.push("revealLeaf");
  });
  const dashboard = {
    leaf: { id: "leaf" },
    render: vi.fn(() => {
      calls.push("dashboard.render");
    }),
  };
  const saveSettings = vi.fn(async () => {
    calls.push("save");
  });
  const openShortcutHelp = vi.fn();
  const applyFeedLimitsToAllFeeds = vi.fn(async () => {
    calls.push("applyFeedLimits");
  });
  const refreshFeeds = vi.fn(async () => {
    calls.push("refreshFeeds");
  });
  const plugin = {
    app: { workspace: { revealLeaf } },
    settings,
    saveSettings,
    getActiveDashboardView: vi.fn(async () =>
      options.hasDashboard === false ? null : dashboard,
    ),
    proxyCheckStore: new ProxyCheckStore(),
    importPortableDataBundleFromFile: vi.fn(async () => {}),
    exportPortableDataBundle: vi.fn(async () => {}),
    applyFeedLimitsToAllFeeds,
    refreshFeeds,
    openShortcutHelp,
    settingTab: null,
  } as unknown as GeneralSettingsPlugin;
  const refreshEvents: Event[] = [];
  containerEl.addEventListener("rss-settings-refresh", (event) =>
    refreshEvents.push(event),
  );
  const dispose = renderGeneralSettingsTab(containerEl, plugin);
  return {
    containerEl,
    settings,
    plugin,
    calls,
    dashboard,
    revealLeaf,
    saveSettings,
    openShortcutHelp,
    applyFeedLimitsToAllFeeds,
    refreshFeeds,
    refreshEvents,
    dispose,
  };
}

function getSetting(containerEl: HTMLElement, name: string): HTMLElement {
  const setting = Array.from(
    containerEl.querySelectorAll<HTMLElement>(".setting-item"),
  ).find(
    (element) =>
      element.querySelector(".setting-item-name")?.textContent === name,
  );
  if (!setting) throw new Error(`Could not find setting: ${name}`);
  return setting;
}

function selectOf(containerEl: HTMLElement, name: string): HTMLSelectElement {
  const select = getSetting(containerEl, name).querySelector("select");
  if (!select) throw new Error(`No dropdown in: ${name}`);
  return select;
}

function chooseOption(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event("change"));
}

function optionValues(select: HTMLSelectElement): string[] {
  return Array.from(select.querySelectorAll("option")).map((o) => o.value);
}

function toggleOf(containerEl: HTMLElement, name: string): HTMLInputElement {
  const input = getSetting(containerEl, name).querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  if (!input) throw new Error(`No toggle in: ${name}`);
  return input;
}

function customInputOf(
  containerEl: HTMLElement,
  name: string,
): HTMLInputElement | null {
  return getSetting(containerEl, name).querySelector<HTMLInputElement>(
    "input.rss-custom-input",
  );
}

function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

function commitCustom(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("change"));
}

function noticeSpy() {
  return vi.spyOn(console, "debug").mockImplementation(() => {});
}

function noticeMessages(spy: ReturnType<typeof noticeSpy>): string[] {
  return spy.mock.calls
    .filter((args) => args[0] === "[Stub Notice]")
    .map((args) => String(args[1]));
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("renderGeneralSettingsTab() characterization: layout", () => {
  it("renders every setting and heading in a fixed order", () => {
    const { containerEl } = createFixture();
    const items = Array.from(
      containerEl.querySelectorAll<HTMLElement>(".setting-item"),
    ).map((element) => ({
      name: element.querySelector(".setting-item-name")?.textContent,
      heading: element.classList.contains("setting-item-heading"),
    }));
    expect(items).toEqual([
      { name: "Keyboard shortcuts", heading: false },
      { name: "View style", heading: false },
      { name: "Dashboard view location", heading: false },
      { name: "Reader view location", heading: false },
      { name: "Saved article open location", heading: false },
      { name: "Use web viewer", heading: false },
      { name: "Results shown per page", heading: false },
      { name: "Global feeds", heading: true },
      { name: "Auto-refresh interval", heading: false },
      { name: "Startup refresh delay", heading: false },
      { name: "Max item limit", heading: false },
      { name: "Data retention", heading: true },
      { name: "Default auto delete duration (new feeds)", heading: false },
      { name: "Protected from auto-deletion", heading: true },
      { name: "Protect starred articles", heading: false },
      { name: "Protect saved articles", heading: false },
      { name: "Protect tagged articles", heading: false },
      { name: "Protect unread articles", heading: false },
      { name: "Use first-seen date for undated items", heading: false },
      { name: "Proxy", heading: true },
      { name: "Enable CORS proxy", heading: false },
      { name: "Proxy URL", heading: false },
      { name: "Test proxy connections", heading: false },
    ]);
  });

  it("returns no disposer and no proxy row while the CORS proxy is off", () => {
    const { containerEl, dispose } = createFixture((s) => {
      s.corsProxyEnabled = false;
    });
    expect(dispose).toBeUndefined();
    expect(containerEl.querySelector(".rss-proxy-setting-item")).toBeNull();
    expect(isToggleOn(toggleOf(containerEl, "Enable CORS proxy"))).toBe(false);
  });
});

describe("renderGeneralSettingsTab() characterization: view settings", () => {
  it("opens the shortcut reference from the View button", () => {
    const { containerEl, openShortcutHelp } = createFixture();
    const button = getSetting(containerEl, "Keyboard shortcuts").querySelector(
      "button",
    );
    expect(button?.textContent).toBe("View");
    button?.click();
    expect(openShortcutHelp).toHaveBeenCalledTimes(1);
  });

  it("changes the view style, saves, then reveals the dashboard and re-renders", async () => {
    const { containerEl, settings, calls, dashboard, revealLeaf } =
      createFixture();
    const select = selectOf(containerEl, "View style");
    expect(optionValues(select)).toEqual(["list", "card", "feed"]);
    expect(select.value).toBe(settings.viewStyle);

    chooseOption(select, "card");
    await flushPromises();

    expect(settings.viewStyle).toBe("card");
    expect(calls).toEqual(["save", "revealLeaf", "dashboard.render"]);
    expect(revealLeaf).toHaveBeenCalledWith(dashboard.leaf);
  });

  it("changes the view style without a dashboard open", async () => {
    const { containerEl, settings, calls } = createFixture(() => {}, {
      hasDashboard: false,
    });
    chooseOption(selectOf(containerEl, "View style"), "feed");
    await flushPromises();
    expect(settings.viewStyle).toBe("feed");
    expect(calls).toEqual(["save"]);
  });

  it("saves the dashboard, reader and saved-article locations", async () => {
    const { containerEl, settings, saveSettings } = createFixture();
    const dashboardSelect = selectOf(containerEl, "Dashboard view location");
    expect(optionValues(dashboardSelect)).toEqual([
      "main",
      "right-sidebar",
      "left-sidebar",
    ]);

    chooseOption(dashboardSelect, "left-sidebar");
    await flushPromises();
    chooseOption(selectOf(containerEl, "Reader view location"), "inline");
    await flushPromises();
    chooseOption(
      selectOf(containerEl, "Saved article open location"),
      "right-sidebar",
    );
    await flushPromises();

    expect(settings.viewLocation).toBe("left-sidebar");
    expect(settings.readerViewLocation).toBe("inline");
    expect(settings.savedArticleOpenLocation).toBe("right-sidebar");
    expect(saveSettings).toHaveBeenCalledTimes(3);
  });

  it("shows main for an unset reader and saved-article location", () => {
    const { containerEl } = createFixture((s) => {
      (s as unknown as Record<string, unknown>).readerViewLocation = undefined;
      (s as unknown as Record<string, unknown>).savedArticleOpenLocation =
        undefined;
    });
    expect(selectOf(containerEl, "Reader view location").value).toBe("main");
    expect(selectOf(containerEl, "Saved article open location").value).toBe(
      "main",
    );
  });

  it("toggles the web viewer and saves", async () => {
    const { containerEl, settings, saveSettings } = createFixture((s) => {
      s.useWebViewer = false;
    });
    const toggle = toggleOf(containerEl, "Use web viewer");
    expect(isToggleOn(toggle)).toBe(false);
    setToggle(toggle, true);
    await flushPromises();
    expect(settings.useWebViewer).toBe(true);
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });
});

describe("renderGeneralSettingsTab() characterization: page size", () => {
  const sizeKeys = [
    "allArticlesPageSize",
    "unreadArticlesPageSize",
    "readArticlesPageSize",
    "savedArticlesPageSize",
    "starredArticlesPageSize",
  ] as const;

  it("applies the chosen size to all five views, saves, and re-renders", async () => {
    const { containerEl, settings, calls } = createFixture();
    const select = selectOf(containerEl, "Results shown per page");
    expect(optionValues(select)).not.toContain("mixed");

    chooseOption(select, "0");
    await flushPromises();

    for (const key of sizeKeys) expect(settings[key]).toBe(0);
    expect(select.querySelector("option[value='0']")?.textContent).toBe("All");
    expect(calls).toEqual(["save", "revealLeaf", "dashboard.render"]);
  });

  it("offers a Mixed option first when the views differ, and ignores choosing it", async () => {
    const { containerEl, settings, saveSettings } = createFixture((s) => {
      s.allArticlesPageSize = 20;
      s.unreadArticlesPageSize = 40;
    });
    const select = selectOf(containerEl, "Results shown per page");
    expect(optionValues(select)[0]).toBe("mixed");
    expect(select.value).toBe("mixed");

    chooseOption(select, "mixed");
    await flushPromises();

    expect(settings.allArticlesPageSize).toBe(20);
    expect(settings.unreadArticlesPageSize).toBe(40);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("labels a non-standard current size and selects it", () => {
    const { containerEl } = createFixture((s) => {
      for (const key of sizeKeys) s[key] = 37;
    });
    const select = selectOf(containerEl, "Results shown per page");
    expect(select.value).toBe("37");
    expect(select.querySelector("option[value='37']")?.textContent).toBe(
      "Current (37)",
    );
  });
});

describe("renderGeneralSettingsTab() characterization: refresh interval", () => {
  it("shows a preset interval without a custom input", () => {
    const { containerEl } = createFixture((s) => {
      s.refreshInterval = 30;
    });
    expect(selectOf(containerEl, "Auto-refresh interval").value).toBe("30");
    expect(customInputOf(containerEl, "Auto-refresh interval")).toBeNull();
  });

  it("selects Custom for a non-preset interval", () => {
    const { containerEl } = createFixture((s) => {
      s.refreshInterval = 45;
    });
    expect(selectOf(containerEl, "Auto-refresh interval").value).toBe("custom");
  });

  it("saves a preset choice normalised to minutes", async () => {
    const { containerEl, settings, saveSettings } = createFixture();
    chooseOption(selectOf(containerEl, "Auto-refresh interval"), "120");
    await flushPromises();
    expect(settings.refreshInterval).toBe(120);
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("builds the custom input once, seeds it, and saves normalised values", async () => {
    const { containerEl, settings, saveSettings } = createFixture((s) => {
      s.refreshInterval = 45;
    });
    const select = selectOf(containerEl, "Auto-refresh interval");
    chooseOption(select, "custom");
    const input = customInputOf(containerEl, "Auto-refresh interval");
    expect(input).not.toBeNull();
    expect(input?.type).toBe("number");
    expect(input?.min).toBe("0");
    expect(input?.placeholder).toBe("Enter minutes");
    expect(input?.value).toBe("45");
    expect(input?.classList.contains("visible")).toBe(true);

    chooseOption(select, "custom");
    expect(
      getSetting(containerEl, "Auto-refresh interval").querySelectorAll(
        "input.rss-custom-input",
      ),
    ).toHaveLength(1);

    commitCustom(input as HTMLInputElement, "90.7");
    await flushPromises();
    expect(settings.refreshInterval).toBe(90);
    expect(input?.value).toBe("90");

    commitCustom(input as HTMLInputElement, "abc");
    await flushPromises();
    expect(settings.refreshInterval).toBe(0);
    expect(input?.value).toBe("0");
    expect(saveSettings).toHaveBeenCalledTimes(2);
  });

  it("starts the custom input empty when the interval is off and hides it again for a preset", async () => {
    const { containerEl, settings } = createFixture();
    const select = selectOf(containerEl, "Auto-refresh interval");
    chooseOption(select, "custom");
    const input = customInputOf(
      containerEl,
      "Auto-refresh interval",
    ) as HTMLInputElement;
    expect(input.value).toBe("");

    chooseOption(select, "60");
    await flushPromises();
    expect(input.classList.contains("hidden")).toBe(true);
    expect(input.classList.contains("visible")).toBe(false);
    expect(settings.refreshInterval).toBe(60);
  });
});

describe("renderGeneralSettingsTab() characterization: startup delay", () => {
  function delayInput(containerEl: HTMLElement): HTMLInputElement {
    return getSetting(
      containerEl,
      "Startup refresh delay",
    ).querySelector<HTMLInputElement>("input[type=text]") as HTMLInputElement;
  }

  it("shows the saved delay and floors a valid value before saving", async () => {
    const { containerEl, settings, saveSettings } = createFixture();
    const input = delayInput(containerEl);
    expect(input.value).toBe(String(settings.startupRefreshDelaySeconds));

    typeInto(input, "12.9");
    await flushPromises();

    expect(settings.startupRefreshDelaySeconds).toBe(12);
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("ignores negative and non-numeric values", async () => {
    const { containerEl, settings, saveSettings } = createFixture();
    const before = settings.startupRefreshDelaySeconds;
    typeInto(delayInput(containerEl), "-3");
    typeInto(delayInput(containerEl), "soon");
    await flushPromises();
    expect(settings.startupRefreshDelaySeconds).toBe(before);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("accepts zero and treats an empty field as zero", async () => {
    const { containerEl, settings } = createFixture();
    typeInto(delayInput(containerEl), "0");
    await flushPromises();
    expect(settings.startupRefreshDelaySeconds).toBe(0);

    typeInto(delayInput(containerEl), "7");
    await flushPromises();
    typeInto(delayInput(containerEl), "");
    await flushPromises();
    expect(settings.startupRefreshDelaySeconds).toBe(0);
  });
});

describe("renderGeneralSettingsTab() characterization: max items", () => {
  let openModal: ReturnType<typeof vi.spyOn>;
  let closeWith: "cancel" | "apply" | "apply-refresh";

  beforeEach(() => {
    vi.useFakeTimers();
    closeWith = "cancel";
    openModal = vi
      .spyOn(ApplyMaxItemsToExistingFeedsModal.prototype, "open")
      .mockImplementation(() => {});
    vi.spyOn(
      ApplyMaxItemsToExistingFeedsModal.prototype,
      "waitForClose",
    ).mockImplementation(() => Promise.resolve(closeWith));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a preset and Custom for other limits", () => {
    expect(
      selectOf(
        createFixture((s) => (s.maxItems = 100)).containerEl,
        "Max item limit",
      ).value,
    ).toBe("100");
    document.body.empty();
    expect(
      selectOf(
        createFixture((s) => (s.maxItems = 77)).containerEl,
        "Max item limit",
      ).value,
    ).toBe("custom");
  });

  it("saves, re-renders, then asks to apply after 700 ms and applies without refreshing", async () => {
    closeWith = "apply";
    const notices = noticeSpy();
    const {
      containerEl,
      settings,
      calls,
      applyFeedLimitsToAllFeeds,
      refreshFeeds,
    } = createFixture((s) => {
      s.maxItems = 50;
      s.feeds = [
        { maxItemsLimit: 10 },
        { maxItemsLimit: 20 },
      ] as unknown as Settings["feeds"];
    });

    chooseOption(selectOf(containerEl, "Max item limit"), "200");
    await vi.advanceTimersByTimeAsync(0);
    expect(settings.maxItems).toBe(200);
    expect(calls).toEqual(["save", "revealLeaf", "dashboard.render"]);
    expect(openModal).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(699);
    expect(openModal).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0);

    expect(openModal).toHaveBeenCalledTimes(1);
    expect(settings.feeds.map((f) => f.maxItemsLimit)).toEqual([200, 200]);
    expect(applyFeedLimitsToAllFeeds).toHaveBeenCalledTimes(1);
    expect(refreshFeeds).not.toHaveBeenCalled();
    expect(noticeMessages(notices)).toEqual([
      "Max item limit applied to all feeds. Refresh all feeds to fetch additional items.",
    ]);
  });

  it("refreshes feeds on apply-refresh and shows no notice", async () => {
    closeWith = "apply-refresh";
    const notices = noticeSpy();
    const { containerEl, refreshFeeds, applyFeedLimitsToAllFeeds } =
      createFixture();
    chooseOption(selectOf(containerEl, "Max item limit"), "500");
    await vi.advanceTimersByTimeAsync(800);
    expect(applyFeedLimitsToAllFeeds).toHaveBeenCalledTimes(1);
    expect(refreshFeeds).toHaveBeenCalledTimes(1);
    expect(noticeMessages(notices)).toEqual([]);
  });

  it("does not notice a lowered limit and leaves feeds alone on cancel", async () => {
    const { containerEl, settings, applyFeedLimitsToAllFeeds } = createFixture(
      (s) => {
        s.maxItems = 100;
        s.feeds = [{ maxItemsLimit: 5 }] as unknown as Settings["feeds"];
      },
    );
    chooseOption(selectOf(containerEl, "Max item limit"), "25");
    await vi.advanceTimersByTimeAsync(800);
    expect(openModal).toHaveBeenCalledTimes(1);
    expect(settings.feeds[0].maxItemsLimit).toBe(5);
    expect(applyFeedLimitsToAllFeeds).not.toHaveBeenCalled();
  });

  it("applies a lowered limit without the additional-items notice", async () => {
    closeWith = "apply";
    const notices = noticeSpy();
    const { containerEl, settings } = createFixture((s) => {
      s.maxItems = 100;
      s.feeds = [{ maxItemsLimit: 5 }] as unknown as Settings["feeds"];
    });
    chooseOption(selectOf(containerEl, "Max item limit"), "25");
    await vi.advanceTimersByTimeAsync(800);
    expect(settings.feeds[0].maxItemsLimit).toBe(25);
    expect(noticeMessages(notices)).toEqual([]);
  });

  it("debounces rapid changes into one prompt for the latest pair", async () => {
    const { containerEl } = createFixture((s) => {
      s.maxItems = 50;
    });
    const select = selectOf(containerEl, "Max item limit");
    chooseOption(select, "100");
    await vi.advanceTimersByTimeAsync(300);
    chooseOption(select, "200");
    await vi.advanceTimersByTimeAsync(800);
    expect(openModal).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the chosen limit equals the current one", async () => {
    const { containerEl, saveSettings } = createFixture((s) => {
      s.maxItems = 50;
    });
    chooseOption(selectOf(containerEl, "Max item limit"), "50");
    await vi.advanceTimersByTimeAsync(800);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(openModal).not.toHaveBeenCalled();
  });

  it("still prompts once when the limit returns to its start within the delay", async () => {
    const { containerEl, settings } = createFixture((s) => {
      s.maxItems = 50;
    });
    const select = selectOf(containerEl, "Max item limit");
    chooseOption(select, "100");
    await vi.advanceTimersByTimeAsync(100);
    chooseOption(select, "50");
    await vi.advanceTimersByTimeAsync(800);
    expect(settings.maxItems).toBe(50);
    expect(openModal).toHaveBeenCalledTimes(1);
  });

  it("builds a custom input, seeds it, and applies typed values (empty means unlimited)", async () => {
    const { containerEl, settings } = createFixture((s) => {
      s.maxItems = 77;
    });
    const select = selectOf(containerEl, "Max item limit");
    chooseOption(select, "custom");
    const input = customInputOf(containerEl, "Max item limit");
    expect(input?.min).toBe("1");
    expect(input?.placeholder).toBe("Enter number");
    expect(input?.value).toBe("77");

    commitCustom(input as HTMLInputElement, "150");
    await vi.advanceTimersByTimeAsync(0);
    expect(settings.maxItems).toBe(150);

    commitCustom(input as HTMLInputElement, "");
    await vi.advanceTimersByTimeAsync(0);
    expect(settings.maxItems).toBe(0);

    chooseOption(select, "10");
    await vi.advanceTimersByTimeAsync(0);
    expect(input?.classList.contains("hidden")).toBe(true);
    expect(settings.maxItems).toBe(10);
  });
});

describe("renderGeneralSettingsTab() characterization: auto-delete duration", () => {
  const label = "Default auto delete duration (new feeds)";

  function mockRetentionModal(action: string) {
    const open = vi
      .spyOn(RetentionChangeConfirmModal.prototype, "open")
      .mockImplementation(() => {});
    vi.spyOn(
      RetentionChangeConfirmModal.prototype,
      "waitForClose",
    ).mockResolvedValue(action as never);
    return open;
  }

  it("shows presets and Custom", () => {
    expect(
      selectOf(
        createFixture((s) => (s.defaultAutoDeleteDuration = 14)).containerEl,
        label,
      ).value,
    ).toBe("14");
    document.body.empty();
    expect(
      selectOf(
        createFixture((s) => (s.defaultAutoDeleteDuration = 20)).containerEl,
        label,
      ).value,
    ).toBe("custom");
  });

  it("applies a longer duration immediately without a modal", async () => {
    const open = mockRetentionModal("cancel");
    const { containerEl, settings, saveSettings } = createFixture((s) => {
      s.defaultAutoDeleteDuration = 7;
    });
    chooseOption(selectOf(containerEl, label), "30");
    await flushPromises();
    expect(open).not.toHaveBeenCalled();
    expect(settings.defaultAutoDeleteDuration).toBe(30);
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("applies a shorter duration and prunes now when the user chooses apply-now", async () => {
    const open = mockRetentionModal("apply-now");
    const { containerEl, settings, applyFeedLimitsToAllFeeds } = createFixture(
      (s) => {
        s.defaultAutoDeleteDuration = 30;
      },
    );
    chooseOption(selectOf(containerEl, label), "7");
    await flushPromises();
    await flushPromises();
    expect(open).toHaveBeenCalledTimes(1);
    expect(settings.defaultAutoDeleteDuration).toBe(7);
    expect(applyFeedLimitsToAllFeeds).toHaveBeenCalledTimes(1);
  });

  it("treats moving from Disabled to a duration as destructive", async () => {
    const open = mockRetentionModal("apply-on-next-refresh");
    const { containerEl, settings } = createFixture((s) => {
      s.defaultAutoDeleteDuration = 0;
    });
    chooseOption(selectOf(containerEl, label), "90");
    await flushPromises();
    await flushPromises();
    expect(open).toHaveBeenCalledTimes(1);
    expect(settings.defaultAutoDeleteDuration).toBe(90);
  });

  it("applies Disabled without a modal", async () => {
    const open = mockRetentionModal("cancel");
    const { containerEl, settings } = createFixture((s) => {
      s.defaultAutoDeleteDuration = 30;
    });
    chooseOption(selectOf(containerEl, label), "0");
    await flushPromises();
    expect(open).not.toHaveBeenCalled();
    expect(settings.defaultAutoDeleteDuration).toBe(0);
  });

  it("does nothing when the same duration is chosen", async () => {
    const { containerEl, saveSettings } = createFixture((s) => {
      s.defaultAutoDeleteDuration = 30;
    });
    chooseOption(selectOf(containerEl, label), "30");
    await flushPromises();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("builds a custom input and reverts its value when a shorter duration is cancelled", async () => {
    mockRetentionModal("cancel");
    const { containerEl, settings, saveSettings } = createFixture((s) => {
      s.defaultAutoDeleteDuration = 20;
    });
    chooseOption(selectOf(containerEl, label), "custom");
    const input = customInputOf(containerEl, label) as HTMLInputElement;
    expect(input.min).toBe("1");
    expect(input.placeholder).toBe("Enter days");
    expect(input.value).toBe("20");

    commitCustom(input, "5");
    await flushPromises();
    await flushPromises();
    expect(input.value).toBe("20");
    expect(settings.defaultAutoDeleteDuration).toBe(20);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("saves a longer custom duration and hides the input for a preset", async () => {
    const { containerEl, settings } = createFixture((s) => {
      s.defaultAutoDeleteDuration = 20;
    });
    const select = selectOf(containerEl, label);
    chooseOption(select, "custom");
    const input = customInputOf(containerEl, label) as HTMLInputElement;
    commitCustom(input, "45");
    await flushPromises();
    expect(settings.defaultAutoDeleteDuration).toBe(45);

    chooseOption(select, "60");
    await flushPromises();
    expect(input.classList.contains("hidden")).toBe(true);
    expect(settings.defaultAutoDeleteDuration).toBe(60);
  });
});

describe("renderGeneralSettingsTab() characterization: protections and first-seen date", () => {
  it("reflects the saved state of each protection toggle", () => {
    const { containerEl } = createFixture((s) => {
      s.protectStarred = true;
      s.protectSaved = false;
      s.protectTagged = true;
      s.protectUnread = false;
    });
    expect(isToggleOn(toggleOf(containerEl, "Protect starred articles"))).toBe(
      true,
    );
    expect(isToggleOn(toggleOf(containerEl, "Protect saved articles"))).toBe(
      false,
    );
    expect(isToggleOn(toggleOf(containerEl, "Protect tagged articles"))).toBe(
      true,
    );
    expect(isToggleOn(toggleOf(containerEl, "Protect unread articles"))).toBe(
      false,
    );
  });

  it("does not save when a toggle fires with the value it already has", async () => {
    const { containerEl, saveSettings } = createFixture((s) => {
      s.protectUnread = true;
    });
    setToggle(toggleOf(containerEl, "Protect unread articles"), true);
    await flushPromises();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("asks before dropping a protection and applies it on apply-now", async () => {
    const open = vi
      .spyOn(RetentionChangeConfirmModal.prototype, "open")
      .mockImplementation(() => {});
    vi.spyOn(
      RetentionChangeConfirmModal.prototype,
      "waitForClose",
    ).mockResolvedValue("apply-now");
    const { containerEl, settings, applyFeedLimitsToAllFeeds } = createFixture(
      (s) => {
        s.protectTagged = true;
      },
    );
    setToggle(toggleOf(containerEl, "Protect tagged articles"), false);
    await flushPromises();
    await flushPromises();
    expect(open).toHaveBeenCalledTimes(1);
    expect(settings.protectTagged).toBe(false);
    expect(applyFeedLimitsToAllFeeds).toHaveBeenCalledTimes(1);
  });

  it("puts the toggle back when a dropped protection is cancelled", async () => {
    vi.spyOn(RetentionChangeConfirmModal.prototype, "open").mockImplementation(
      () => {},
    );
    vi.spyOn(
      RetentionChangeConfirmModal.prototype,
      "waitForClose",
    ).mockResolvedValue("cancel");
    const { containerEl, settings, saveSettings } = createFixture((s) => {
      s.protectSaved = true;
    });
    const toggle = toggleOf(containerEl, "Protect saved articles");
    setToggle(toggle, false);
    await flushPromises();
    await flushPromises();
    expect(settings.protectSaved).toBe(true);
    expect(isToggleOn(toggle)).toBe(true);
    expect(saveSettings).not.toHaveBeenCalled();
  });
});

describe("renderGeneralSettingsTab() characterization: CORS proxy", () => {
  it("saves the toggle and asks the host tab to refresh", async () => {
    const { containerEl, settings, saveSettings, refreshEvents } =
      createFixture((s) => {
        s.corsProxyEnabled = false;
      });
    setToggle(toggleOf(containerEl, "Enable CORS proxy"), true);
    await flushPromises();
    expect(settings.corsProxyEnabled).toBe(true);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(refreshEvents).toHaveLength(1);
    expect(refreshEvents[0].type).toBe("rss-settings-refresh");
  });

  it("renders the Proxy URL row, the check controls, and a disposer when enabled", () => {
    const { containerEl, dispose } = createFixture((s) => {
      s.corsProxyEnabled = true;
    });
    const row = containerEl.querySelector(".rss-proxy-setting-item");
    expect(row).not.toBeNull();
    expect(row?.querySelector(".setting-item-name")?.textContent).toBe(
      "Proxy URL",
    );
    expect(typeof dispose).toBe("function");
    expect(() => dispose?.()).not.toThrow();
  });
});

describe("renderGeneralSettingsTab() characterization: proxy URL row", () => {
  const CUSTOM = "https://proxy.test/?url=";

  function renderRow(corsProxyUrl: string) {
    const fixture = createFixture((s) => {
      s.corsProxyEnabled = true;
      s.corsProxyUrl = corsProxyUrl;
    });
    const row = fixture.containerEl.querySelector<HTMLElement>(
      ".rss-proxy-setting-item",
    ) as HTMLElement;
    const select = row.querySelector("select") as HTMLSelectElement;
    const field = row.querySelector<HTMLInputElement>(
      "input[type=text]",
    ) as HTMLInputElement;
    const saveButton = row.querySelector<HTMLButtonElement>(
      'button[aria-label="Save proxy URL"]',
    ) as HTMLButtonElement;
    const clearButton = row.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear proxy URL"]',
    ) as HTMLButtonElement;
    return { ...fixture, row, select, field, saveButton, clearButton };
  }

  it("offers the empty, auto, built-in and custom options in order", () => {
    const { select } = renderRow(AUTO_PROXY_URL);
    expect(optionValues(select)).toEqual(
      [
        "",
        AUTO_PROXY_URL,
        ...PREDEFINED_PROXIES.map((proxy) => proxy.url),
        CUSTOM_PROXY_OPTION,
      ].map((value) => value),
    );
    expect(select.querySelector("option[value='']")?.textContent).toBe(
      "Select a proxy...",
    );
  });

  it("puts the saved URL in the field and hides Save for a built-in proxy", () => {
    const builtIn = PREDEFINED_PROXIES[0].url;
    const { field, saveButton, select } = renderRow(builtIn);
    expect(field.value).toBe(builtIn);
    expect(select.value).toBe(builtIn);
    expect(saveButton.style.display).toBe("none");
  });

  it("shows Save for a custom saved URL", () => {
    const { saveButton } = renderRow(CUSTOM);
    expect(saveButton.style.display).toBe("");
  });

  it("saves a chosen built-in proxy straight away and mirrors it in the field", async () => {
    const builtIn = PREDEFINED_PROXIES[0].url;
    const { select, field, settings, saveSettings, saveButton } = renderRow("");
    chooseOption(select, builtIn);
    await flushPromises();
    expect(settings.corsProxyUrl).toBe(builtIn);
    expect(field.value).toBe(builtIn);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(saveButton.style.display).toBe("none");
  });

  it("shows Save without saving when the custom option is chosen", async () => {
    const { select, settings, saveSettings, saveButton } =
      renderRow(AUTO_PROXY_URL);
    chooseOption(select, CUSTOM_PROXY_OPTION);
    await flushPromises();
    expect(saveButton.style.display).toBe("");
    expect(settings.corsProxyUrl).toBe(AUTO_PROXY_URL);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("choosing the empty option keeps the saved proxy", async () => {
    const { select, settings, saveSettings } = renderRow(AUTO_PROXY_URL);
    chooseOption(select, "");
    await flushPromises();
    expect(settings.corsProxyUrl).toBe(AUTO_PROXY_URL);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("commits a typed valid URL on blur and syncs the dropdown to custom", async () => {
    const { field, select, settings, saveSettings, saveButton } =
      renderRow(AUTO_PROXY_URL);
    typeInto(field, CUSTOM);
    field.dispatchEvent(new Event("blur"));
    await flushPromises();
    expect(settings.corsProxyUrl).toBe(CUSTOM);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(select.value).toBe(CUSTOM_PROXY_OPTION);
    expect(saveButton.style.display).toBe("");
  });

  it("commits on Enter once, then the blur it triggers adds nothing", async () => {
    const { field, settings, saveSettings } = renderRow("");
    typeInto(field, CUSTOM);
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    await flushPromises();
    expect(saveSettings).not.toHaveBeenCalled();

    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flushPromises();
    expect(settings.corsProxyUrl).toBe(CUSTOM);
    expect(saveSettings).toHaveBeenCalledTimes(1);

    field.dispatchEvent(new Event("blur"));
    await flushPromises();
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid URL with a notice and restores the saved value", async () => {
    const notices = noticeSpy();
    const { field, settings, saveSettings } = renderRow(CUSTOM);
    typeInto(field, "not a url");
    field.dispatchEvent(new Event("blur"));
    await flushPromises();
    expect(settings.corsProxyUrl).toBe(CUSTOM);
    expect(field.value).toBe(CUSTOM);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(noticeMessages(notices)).toHaveLength(1);
  });

  it("clears the setting when the field is emptied and committed", async () => {
    const { field, select, settings, saveSettings } = renderRow(CUSTOM);
    typeInto(field, "   ");
    field.dispatchEvent(new Event("blur"));
    await flushPromises();
    expect(settings.corsProxyUrl).toBe("");
    expect(select.value).toBe("");
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("ignores a blur when the value is unchanged", async () => {
    const { field, saveSettings } = renderRow(CUSTOM);
    field.dispatchEvent(new Event("blur"));
    await flushPromises();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("Clear empties the saved URL, saves, and resets the dropdown", async () => {
    const { clearButton, field, select, settings, saveSettings } =
      renderRow(AUTO_PROXY_URL);
    field.value = AUTO_PROXY_URL;
    clearButton.click();
    await flushPromises();
    expect(settings.corsProxyUrl).toBe("");
    expect(select.value).toBe("");
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("Save validates the typed URL, saves, shows a notice and refreshes the tab", async () => {
    const notices = noticeSpy();
    const { saveButton, field, settings, saveSettings, refreshEvents } =
      renderRow("");
    typeInto(field, CUSTOM);
    saveButton.click();
    await flushPromises();
    expect(settings.corsProxyUrl).toBe(CUSTOM);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(noticeMessages(notices)).toEqual(["Proxy URL saved"]);
    expect(refreshEvents).toHaveLength(1);
  });

  it("Save with an invalid URL shows a notice and saves nothing", async () => {
    const notices = noticeSpy();
    const { saveButton, field, settings, saveSettings, refreshEvents } =
      renderRow(CUSTOM);
    typeInto(field, "nope");
    saveButton.click();
    await flushPromises();
    expect(settings.corsProxyUrl).toBe(CUSTOM);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(refreshEvents).toHaveLength(0);
    expect(noticeMessages(notices)).toHaveLength(1);
  });
});
