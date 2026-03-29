import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { DEFAULT_SETTINGS, type SavedTemplate } from "../../../src/types/types";
import { renderArticleSavingSettingsTab } from "../../../src/settings/tabs/article-saving-settings-tab";
import { TemplateNameModal } from "../../../src/settings/modals/settings-modals";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function getSettingByName(containerEl: HTMLElement, name: string): HTMLElement {
  const settingEls = Array.from(containerEl.querySelectorAll(".setting-item"));
  const match = settingEls.find((el) => {
    const nameEl = el.querySelector(".setting-item-name");
    return nameEl?.textContent === name;
  });
  if (!match) {
    throw new Error(`Setting not found: ${name}`);
  }
  return match as HTMLElement;
}

function createPlugin(overrides?: {
  defaultFolder?: string;
  addSavedTag?: boolean;
  saveFullContent?: boolean;
  fetchTimeout?: number | undefined;
  defaultTemplate?: string;
  savedTemplates?: SavedTemplate[] | undefined;
}) {
  const app = obsidian.App.createMock();
  const plugin = {
    app,
    settings: {
      articleSaving: {
        defaultFolder: overrides?.defaultFolder ?? "Inbox",
        addSavedTag: overrides?.addSavedTag ?? false,
        saveFullContent: overrides?.saveFullContent ?? false,
        fetchTimeout: overrides?.fetchTimeout,
        defaultTemplate: overrides?.defaultTemplate ?? "TEMPLATE",
        savedTemplates: overrides?.savedTemplates,
      },
    },
    saveSettings: vi.fn(async () => {}),
  };
  return plugin;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("renderArticleSavingSettingsTab()", () => {
  it("persists save path via normalizePath() and saveSettings()", async () => {
    const containerEl = document.body.createDiv();
    const plugin = createPlugin({ defaultFolder: "Old" });
    const onRefresh = vi.fn();

    vi.spyOn(obsidian, "normalizePath").mockImplementation((p: string) => `norm:${p}`);

    renderArticleSavingSettingsTab(
      containerEl,
      plugin as any,
      onRefresh,
    );

    const settingEl = getSettingByName(containerEl, "Save path");
    const input = settingEl.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe("Old");

    input.value = "New/Path";
    input.dispatchEvent(new Event("input"));
    await flushPromises();

    expect(plugin.settings.articleSaving.defaultFolder).toBe("norm:New/Path");
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("persists toggles (addSavedTag, saveFullContent)", async () => {
    const containerEl = document.body.createDiv();
    const plugin = createPlugin({ addSavedTag: false, saveFullContent: false });
    const onRefresh = vi.fn();

    renderArticleSavingSettingsTab(containerEl, plugin as any, onRefresh);

    const savedTagSetting = getSettingByName(containerEl, "Add 'saved' tag");
    const savedTagToggle = savedTagSetting.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    savedTagToggle.checked = true;
    savedTagToggle.dispatchEvent(new Event("change"));
    await flushPromises();

    expect(plugin.settings.articleSaving.addSavedTag).toBe(true);

    const fullContentSetting = getSettingByName(containerEl, "Save full content");
    const fullContentToggle = fullContentSetting.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    fullContentToggle.checked = true;
    fullContentToggle.dispatchEvent(new Event("change"));
    await flushPromises();

    expect(plugin.settings.articleSaving.saveFullContent).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
  });

  it("defaults fetchTimeout to 10 and persists slider changes", async () => {
    const containerEl = document.body.createDiv();
    const plugin = createPlugin({ fetchTimeout: undefined });
    const onRefresh = vi.fn();

    renderArticleSavingSettingsTab(containerEl, plugin as any, onRefresh);

    const settingEl = getSettingByName(containerEl, "Fetch timeout");
    const slider = settingEl.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider.value).toBe("10");

    slider.value = "20";
    slider.dispatchEvent(new Event("input"));
    await flushPromises();

    expect(plugin.settings.articleSaving.fetchTimeout).toBe(20);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("updates defaultTemplate on textarea change; reset restores DEFAULT_SETTINGS + Notice", async () => {
    const containerEl = document.body.createDiv();
    const plugin = createPlugin({ defaultTemplate: "A" });
    const onRefresh = vi.fn();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    renderArticleSavingSettingsTab(containerEl, plugin as any, onRefresh);

    const textarea = containerEl.querySelector(
      ".rss-dashboard-template-input",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("A");

    textarea.value = "B";
    textarea.dispatchEvent(new Event("change"));
    await flushPromises();

    expect(plugin.settings.articleSaving.defaultTemplate).toBe("B");
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);

    plugin.saveSettings.mockClear();
    logSpy.mockClear();

    const resetBtn = Array.from(containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Reset to default",
    ) as HTMLButtonElement;
    expect(resetBtn).toBeTruthy();

    await (resetBtn as any).onclick();

    expect(textarea.value).toBe(DEFAULT_SETTINGS.articleSaving.defaultTemplate);
    expect(plugin.settings.articleSaving.defaultTemplate).toBe(
      DEFAULT_SETTINGS.articleSaving.defaultTemplate,
    );
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("[Stub Notice]", "Template reset to default");
  });

  it("renders empty saved templates note; save-as-template appends, saves, notices, and refreshes", async () => {
    const containerEl = document.body.createDiv();
    const plugin = createPlugin({
      defaultTemplate: "CURR",
      savedTemplates: undefined,
    });
    const onRefresh = vi.fn();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const openSpy = vi.spyOn(TemplateNameModal.prototype, "open").mockImplementation(() => {});
    vi.spyOn(TemplateNameModal.prototype, "waitForClose").mockResolvedValue("My template");
    vi.spyOn(Date, "now").mockReturnValue(111);

    renderArticleSavingSettingsTab(containerEl, plugin as any, onRefresh);

    expect(
      containerEl.querySelector(".rss-dashboard-settings-note")?.textContent,
    ).toContain("No saved templates yet");

    const saveAsBtn = Array.from(containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Save as template",
    ) as HTMLButtonElement;
    expect(saveAsBtn).toBeTruthy();

    await (saveAsBtn as any).onclick();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(plugin.settings.articleSaving.savedTemplates).toHaveLength(1);
    expect(plugin.settings.articleSaving.savedTemplates?.[0]).toMatchObject({
      id: "template-111",
      name: "My template",
      template: "CURR",
    });
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      'Template "My template" saved',
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("save-as-template does nothing when modal returns null/empty", async () => {
    const containerEl = document.body.createDiv();
    const plugin = createPlugin({ defaultTemplate: "CURR", savedTemplates: [] });
    const onRefresh = vi.fn();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(TemplateNameModal.prototype, "waitForClose").mockResolvedValue(null);

    renderArticleSavingSettingsTab(containerEl, plugin as any, onRefresh);

    const saveAsBtn = Array.from(containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Save as template",
    ) as HTMLButtonElement;

    await (saveAsBtn as any).onclick();

    expect(plugin.settings.articleSaving.savedTemplates).toHaveLength(0);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(0);
    expect(logSpy).toHaveBeenCalledTimes(0);
    expect(onRefresh).toHaveBeenCalledTimes(0);
  });

  it("supports saved template actions: Load, Update, Delete", async () => {
    const containerEl = document.body.createDiv();
    const plugin = createPlugin({
      defaultTemplate: "EDITOR",
      savedTemplates: [{ id: "t1", name: "One", template: "SAVED" }],
    });
    const onRefresh = vi.fn();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    renderArticleSavingSettingsTab(containerEl, plugin as any, onRefresh);

    const textarea = containerEl.querySelector(
      ".rss-dashboard-template-input",
    ) as HTMLTextAreaElement;

    const templateSetting = getSettingByName(containerEl, "One");
    const loadBtn = Array.from(templateSetting.querySelectorAll("button")).find(
      (b) => b.textContent === "Load",
    ) as HTMLButtonElement;
    const updateBtn = Array.from(templateSetting.querySelectorAll("button")).find(
      (b) => b.textContent === "Update",
    ) as HTMLButtonElement;
    const deleteBtn = templateSetting.querySelector(
      'button[data-icon="trash"]',
    ) as HTMLButtonElement;

    // Load
    plugin.saveSettings.mockClear();
    logSpy.mockClear();
    loadBtn.click();
    await flushPromises();
    expect(textarea.value).toBe("SAVED");
    expect(plugin.settings.articleSaving.defaultTemplate).toBe("SAVED");
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[Stub Notice]', 'Template "One" loaded');

    // Update
    plugin.saveSettings.mockClear();
    logSpy.mockClear();
    plugin.settings.articleSaving.defaultTemplate = "UPDATED_FROM_EDITOR";
    updateBtn.click();
    await flushPromises();
    expect(plugin.settings.articleSaving.savedTemplates?.[0].template).toBe(
      "UPDATED_FROM_EDITOR",
    );
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[Stub Notice]', 'Template "One" updated');

    // Delete
    plugin.saveSettings.mockClear();
    logSpy.mockClear();
    onRefresh.mockClear();
    deleteBtn.click();
    await flushPromises();
    expect(plugin.settings.articleSaving.savedTemplates).toHaveLength(0);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[Stub Notice]', 'Template "One" deleted');
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

