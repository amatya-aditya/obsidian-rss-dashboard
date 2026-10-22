import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type RssDashboardPlugin from "../../../main";
import { SETTINGS_TAB_NAMES } from "../../../src/settings/tab-names";

vi.mock("../../../src/settings/tabs/general-settings-tab", () => ({
  renderGeneralSettingsTab: vi.fn(),
}));
vi.mock("../../../src/settings/tabs/storage-settings-tab", () => ({
  renderStorageSettingsTab: vi.fn(),
}));
vi.mock("../../../src/settings/tabs/display-settings-tab", () => ({
  renderDisplaySettingsTab: vi.fn(),
}));
vi.mock("../../../src/settings/tabs/media-settings-tab", () => ({
  renderMediaSettingsTab: vi.fn(),
}));
vi.mock("../../../src/settings/tabs/article-saving-settings-tab", () => ({
  renderArticleSavingSettingsTab: vi.fn(),
}));
vi.mock("../../../src/settings/tabs/rules-settings-tab", () => ({
  renderRulesSettingsTab: vi.fn(),
}));
vi.mock("../../../src/settings/tabs/highlights-settings-tab", () => ({
  renderHighlightsSettingsTab: vi.fn(),
}));
vi.mock("../../../src/settings/tabs/import-export-settings-tab", () => ({
  renderImportExportSettingsTab: vi.fn(),
}));
vi.mock("../../../src/settings/tabs/tags-settings-tab", () => ({
  renderTagsSettingsTab: vi.fn(),
}));
vi.mock("../../../src/settings/tabs/sidebar-settings-tab", () => ({
  renderSidebarSettingsTab: vi.fn(),
}));
vi.mock("../../../src/settings/tabs/about-settings-tab", () => ({
  renderAboutTab: vi.fn(),
}));

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("RssDashboardSettingTab (orchestrator)", () => {
  it("renders tab bar + default General tab renderer", async () => {
    const { RssDashboardSettingTab } =
      await import("../../../src/settings/settings-tab");
    const general =
      await import("../../../src/settings/tabs/general-settings-tab");

    const app = obsidian.App.createMock();
    const plugin = { app } as unknown as RssDashboardPlugin;
    const tab = new RssDashboardSettingTab(app, plugin);

    tab.containerEl = document.body.appendChild(createDiv());
    tab.refresh();

    const tabButtons = Array.from(
      tab.containerEl.querySelectorAll(".rss-dashboard-settings-tab-btn"),
    );
    expect(tabButtons).toHaveLength(11);
    expect(tabButtons[0].textContent).toBe("General");

    expect(vi.mocked(general.renderGeneralSettingsTab)).toHaveBeenCalledTimes(
      1,
    );
  });

  it("exposes the tab strip as a tablist and marks only the current tab as selected", async () => {
    const { RssDashboardSettingTab } =
      await import("../../../src/settings/settings-tab");

    const app = obsidian.App.createMock();
    const plugin = { app } as unknown as RssDashboardPlugin;
    const tab = new RssDashboardSettingTab(app, plugin);
    tab.containerEl = document.body.appendChild(createDiv());

    const tabButtons = () =>
      Array.from(tab.containerEl.querySelectorAll('[role="tab"]'));
    const selectedLabels = () =>
      tabButtons()
        .filter((btn) => btn.getAttribute("aria-selected") === "true")
        .map((btn) => btn.textContent);
    const activeLabels = () =>
      tabButtons()
        .filter((btn) => btn.classList.contains("active"))
        .map((btn) => btn.textContent);

    tab.refresh();

    const bar = tab.containerEl.querySelector(
      ".rss-dashboard-settings-tab-bar",
    );
    expect(bar?.getAttribute("role")).toBe("tablist");

    // Every tab button is a tab, and the rest report aria-selected="false"
    expect(tabButtons().map((btn) => btn.textContent)).toEqual([
      ...SETTINGS_TAB_NAMES,
    ]);
    expect(
      tab.containerEl.querySelectorAll(
        '.rss-dashboard-settings-tab-btn[aria-selected="false"]',
      ),
    ).toHaveLength(SETTINGS_TAB_NAMES.length - 1);
    expect(selectedLabels()).toEqual(["General"]);
    expect(activeLabels()).toEqual(["General"]);

    // Selecting another tab re-renders the strip with the new tab selected
    (
      Array.from(tab.containerEl.querySelectorAll("button")).find(
        (btn) => btn.textContent === "About",
      ) as HTMLButtonElement
    ).click();
    expect(selectedLabels()).toEqual(["About"]);
    expect(activeLabels()).toEqual(["About"]);

    tab.activateTab("Rules");
    expect(selectedLabels()).toEqual(["Rules"]);
    expect(activeLabels()).toEqual(["Rules"]);
  });

  it("switches tabs on button click and via activateTab()", async () => {
    const { RssDashboardSettingTab } =
      await import("../../../src/settings/settings-tab");
    const rules = await import("../../../src/settings/tabs/rules-settings-tab");
    const about = await import("../../../src/settings/tabs/about-settings-tab");

    const app = obsidian.App.createMock();
    const plugin = { app } as unknown as RssDashboardPlugin;
    const tab = new RssDashboardSettingTab(app, plugin);
    tab.containerEl = document.body.appendChild(createDiv());

    tab.refresh();

    const aboutBtn = Array.from(
      tab.containerEl.querySelectorAll("button"),
    ).find((b) => b.textContent === "About") as HTMLButtonElement;
    aboutBtn.click();
    expect(vi.mocked(about.renderAboutTab)).toHaveBeenCalledTimes(1);

    tab.activateTab("Rules");
    expect(vi.mocked(rules.renderRulesSettingsTab)).toHaveBeenCalledTimes(1);

    const display =
      await import("../../../src/settings/tabs/display-settings-tab");
    tab.activateTab("Display", "Reader");
    expect(
      vi.mocked(display.renderDisplaySettingsTab),
    ).toHaveBeenLastCalledWith(
      expect.any(HTMLDivElement),
      plugin,
      expect.any(Function),
      "Reader",
    );

    // Invalid tab name is ignored
    vi.mocked(rules.renderRulesSettingsTab).mockClear();
    tab.activateTab("Nope");
    expect(vi.mocked(rules.renderRulesSettingsTab)).toHaveBeenCalledTimes(0);
  });

  it("responds to 'rss-settings-refresh' event by re-rendering", async () => {
    const { RssDashboardSettingTab } =
      await import("../../../src/settings/settings-tab");
    const general =
      await import("../../../src/settings/tabs/general-settings-tab");

    const app = obsidian.App.createMock();
    const plugin = { app } as unknown as RssDashboardPlugin;
    const tab = new RssDashboardSettingTab(app, plugin);
    tab.containerEl = document.body.appendChild(createDiv());

    tab.refresh();
    expect(vi.mocked(general.renderGeneralSettingsTab)).toHaveBeenCalledTimes(
      1,
    );

    const contentEl = tab.containerEl.querySelector(
      ".rss-dashboard-settings-tab-content",
    ) as HTMLDivElement;
    expect(contentEl).toBeTruthy();

    contentEl.dispatchEvent(new CustomEvent("rss-settings-refresh"));
    expect(vi.mocked(general.renderGeneralSettingsTab)).toHaveBeenCalledTimes(
      2,
    );
  });

  it("refreshes the legacy settings renderer through its compatibility bridge", async () => {
    const { RssDashboardSettingTab } =
      await import("../../../src/settings/settings-tab");
    const general =
      await import("../../../src/settings/tabs/general-settings-tab");

    const app = obsidian.App.createMock();
    const plugin = { app } as unknown as RssDashboardPlugin;
    const tab = new RssDashboardSettingTab(app, plugin);
    tab.containerEl = document.body.appendChild(createDiv());

    tab.refresh();
    tab.refresh();

    expect(vi.mocked(general.renderGeneralSettingsTab)).toHaveBeenCalledTimes(
      2,
    );
  });
});
