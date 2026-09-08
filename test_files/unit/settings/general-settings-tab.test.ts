import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import {
  renderGeneralSettingsTab,
  type GeneralSettingsPlugin,
} from "../../../src/settings/tabs/general-settings-tab";
import { RetentionChangeConfirmModal } from "../../../src/settings/modals/settings-modals";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function cloneSettings(): typeof DEFAULT_SETTINGS {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
}

function getSettingByName(containerEl: HTMLElement, name: string): HTMLElement {
  const setting = Array.from(containerEl.querySelectorAll<HTMLElement>(
    ".setting-item",
  )).find(
    (element) =>
      element.querySelector(".setting-item-name")?.textContent === name,
  );

  if (!setting) {
    throw new Error(`Could not find setting: ${name}`);
  }

  return setting;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe("renderGeneralSettingsTab() retention protections", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.restoreAllMocks();
  });

  it("renders retention protection toggles from settings and immediately persists enabled protections", async () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const settings = cloneSettings();
    settings.protectStarred = false;
    settings.protectSaved = false;
    settings.protectTagged = false;
    settings.protectUnread = false;
    const saveSettings = vi.fn(async () => {});
    const plugin = {
      app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
      settings,
      saveSettings,
      getActiveDashboardView: vi.fn(async () => null),
      importPortableDataBundleFromFile: vi.fn(async () => {}),
      exportPortableDataBundle: vi.fn(async () => {}),
      applyFeedLimitsToAllFeeds: vi.fn(async () => {}),
      refreshFeeds: vi.fn(async () => {}),
      settingTab: null,
    } as unknown as GeneralSettingsPlugin;

    renderGeneralSettingsTab(containerEl, plugin);

    expect(containerEl.textContent).toContain("Protected from auto-deletion");

    const protections = [
      ["Protect starred articles", "protectStarred", true],
      ["Protect saved articles", "protectSaved", true],
      ["Protect tagged articles", "protectTagged", true],
      ["Protect unread articles", "protectUnread", true],
    ] as const;

    for (const [label, settingKey, nextValue] of protections) {
      const toggle = getSettingByName(containerEl, label).querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement;
      expect(toggle.checked).toBe(settings[settingKey]);

      toggle.checked = nextValue;
      toggle.dispatchEvent(new Event("change"));
      await flushPromises();

      expect(settings[settingKey]).toBe(nextValue);
    }

    expect(saveSettings).toHaveBeenCalledTimes(4);
  });

  it("confirms and immediately applies a disabled retention protection", async () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const settings = cloneSettings();
    const saveSettings = vi.fn(async () => {});
    const applyFeedLimitsToAllFeeds = vi.fn(async () => {});
    const plugin = {
      app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
      settings,
      saveSettings,
      getActiveDashboardView: vi.fn(async () => null),
      importPortableDataBundleFromFile: vi.fn(async () => {}),
      exportPortableDataBundle: vi.fn(async () => {}),
      applyFeedLimitsToAllFeeds,
      refreshFeeds: vi.fn(async () => {}),
      settingTab: null,
    } as unknown as GeneralSettingsPlugin;
    const openModal = vi
      .spyOn(RetentionChangeConfirmModal.prototype, "open")
      .mockImplementation(() => {});
    vi.spyOn(RetentionChangeConfirmModal.prototype, "waitForClose").mockResolvedValue(
      "apply-now",
    );

    renderGeneralSettingsTab(containerEl, plugin);

    const toggle = getSettingByName(
      containerEl,
      "Protect starred articles",
    ).querySelector('input[type="checkbox"]') as HTMLInputElement;
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    await flushPromises();
    await flushPromises();

    expect(openModal).toHaveBeenCalledTimes(1);
    expect(settings.protectStarred).toBe(false);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(applyFeedLimitsToAllFeeds).toHaveBeenCalledTimes(1);
  });

  it("saves a destructive change for the next refresh without pruning immediately", async () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const settings = cloneSettings();
    const saveSettings = vi.fn(async () => {});
    const applyFeedLimitsToAllFeeds = vi.fn(async () => {});
    const plugin = {
      app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
      settings,
      saveSettings,
      getActiveDashboardView: vi.fn(async () => null),
      importPortableDataBundleFromFile: vi.fn(async () => {}),
      exportPortableDataBundle: vi.fn(async () => {}),
      applyFeedLimitsToAllFeeds,
      refreshFeeds: vi.fn(async () => {}),
      settingTab: null,
    } as unknown as GeneralSettingsPlugin;
    const openModal = vi
      .spyOn(RetentionChangeConfirmModal.prototype, "open")
      .mockImplementation(() => {});
    vi.spyOn(RetentionChangeConfirmModal.prototype, "waitForClose").mockResolvedValue(
      "apply-on-next-refresh",
    );

    renderGeneralSettingsTab(containerEl, plugin);

    const durationSelect = getSettingByName(
      containerEl,
      "Default auto delete duration (new feeds)",
    ).querySelector("select") as HTMLSelectElement;
    durationSelect.value = "7";
    durationSelect.dispatchEvent(new Event("change"));
    await flushPromises();
    await flushPromises();

    expect(openModal).toHaveBeenCalledTimes(1);
    expect(settings.defaultAutoDeleteDuration).toBe(7);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(applyFeedLimitsToAllFeeds).not.toHaveBeenCalled();
  });

  it("rolls back a cancelled destructive protection change without saving", async () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const settings = cloneSettings();
    const saveSettings = vi.fn(async () => {});
    const applyFeedLimitsToAllFeeds = vi.fn(async () => {});
    const plugin = {
      app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
      settings,
      saveSettings,
      getActiveDashboardView: vi.fn(async () => null),
      importPortableDataBundleFromFile: vi.fn(async () => {}),
      exportPortableDataBundle: vi.fn(async () => {}),
      applyFeedLimitsToAllFeeds,
      refreshFeeds: vi.fn(async () => {}),
      settingTab: null,
    } as unknown as GeneralSettingsPlugin;
    const openModal = vi
      .spyOn(RetentionChangeConfirmModal.prototype, "open")
      .mockImplementation(() => {});
    vi.spyOn(RetentionChangeConfirmModal.prototype, "waitForClose").mockResolvedValue(
      "cancel",
    );

    renderGeneralSettingsTab(containerEl, plugin);

    const toggle = getSettingByName(
      containerEl,
      "Protect saved articles",
    ).querySelector('input[type="checkbox"]') as HTMLInputElement;
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    await flushPromises();
    await flushPromises();

    expect(openModal).toHaveBeenCalledTimes(1);
    expect(toggle.checked).toBe(true);
    expect(settings.protectSaved).toBe(true);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(applyFeedLimitsToAllFeeds).not.toHaveBeenCalled();
  });

  it("restores the previous duration when a shorter retention period is cancelled", async () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const settings = cloneSettings();
    const saveSettings = vi.fn(async () => {});
    const plugin = {
      app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
      settings,
      saveSettings,
      getActiveDashboardView: vi.fn(async () => null),
      importPortableDataBundleFromFile: vi.fn(async () => {}),
      exportPortableDataBundle: vi.fn(async () => {}),
      applyFeedLimitsToAllFeeds: vi.fn(async () => {}),
      refreshFeeds: vi.fn(async () => {}),
      settingTab: null,
    } as unknown as GeneralSettingsPlugin;
    vi.spyOn(RetentionChangeConfirmModal.prototype, "open").mockImplementation(
      () => {},
    );
    vi.spyOn(RetentionChangeConfirmModal.prototype, "waitForClose").mockResolvedValue(
      "cancel",
    );

    renderGeneralSettingsTab(containerEl, plugin);

    const durationSelect = getSettingByName(
      containerEl,
      "Default auto delete duration (new feeds)",
    ).querySelector("select") as HTMLSelectElement;
    durationSelect.value = "7";
    durationSelect.dispatchEvent(new Event("change"));
    await flushPromises();
    await flushPromises();

    expect(durationSelect.value).toBe("30");
    expect(settings.defaultAutoDeleteDuration).toBe(30);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("immediately saves non-destructive retention changes without opening a modal", async () => {
    const containerEl = createDiv();
    document.body.appendChild(containerEl);
    const settings = cloneSettings();
    settings.protectUnread = false;
    const saveSettings = vi.fn(async () => {});
    const plugin = {
      app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
      settings,
      saveSettings,
      getActiveDashboardView: vi.fn(async () => null),
      importPortableDataBundleFromFile: vi.fn(async () => {}),
      exportPortableDataBundle: vi.fn(async () => {}),
      applyFeedLimitsToAllFeeds: vi.fn(async () => {}),
      refreshFeeds: vi.fn(async () => {}),
      settingTab: null,
    } as unknown as GeneralSettingsPlugin;
    const openModal = vi.spyOn(RetentionChangeConfirmModal.prototype, "open");

    renderGeneralSettingsTab(containerEl, plugin);

    const durationSelect = getSettingByName(
      containerEl,
      "Default auto delete duration (new feeds)",
    ).querySelector("select") as HTMLSelectElement;
    durationSelect.value = "60";
    durationSelect.dispatchEvent(new Event("change"));
    const unreadToggle = getSettingByName(
      containerEl,
      "Protect unread articles",
    ).querySelector('input[type="checkbox"]') as HTMLInputElement;
    unreadToggle.checked = true;
    unreadToggle.dispatchEvent(new Event("change"));
    await flushPromises();

    expect(openModal).not.toHaveBeenCalled();
    expect(settings.defaultAutoDeleteDuration).toBe(60);
    expect(settings.protectUnread).toBe(true);
    expect(saveSettings).toHaveBeenCalledTimes(2);
  });
});
