import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { DEFAULT_SETTINGS, type SavedTemplate } from "../../../src/types/types";
import { renderArticleSavingSettingsTab } from "../../../src/settings/tabs/article-saving-settings-tab";
import { SavedTemplateEditorModal } from "../../../src/settings/modals/settings-modals";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface TestPlugin {
  app: obsidian.App;
  settings: {
    articleSaving: {
      defaultFolder: string;
      addSavedTag: boolean;
      saveFullContent: boolean;
      fetchTimeout: number | undefined;
      defaultTemplate: string;
      savedTemplates: SavedTemplate[] | undefined;
      globalDefaultTemplateId?: string;
    };
  };
  saveSettings: () => Promise<void>;
  mocks: {
    saveSettings: ReturnType<typeof vi.fn>;
  };
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
  globalDefaultTemplateId?: string;
}): TestPlugin {
  const app = obsidian.App.createMock();
  const saveSettingsMock = vi.fn(async () => {});
  const plugin: TestPlugin = {
    app,
    settings: {
      articleSaving: {
        defaultFolder: overrides?.defaultFolder ?? "Inbox",
        addSavedTag: overrides?.addSavedTag ?? false,
        saveFullContent: overrides?.saveFullContent ?? false,
        fetchTimeout: overrides?.fetchTimeout,
        defaultTemplate: overrides?.defaultTemplate ?? "TEMPLATE",
        savedTemplates: overrides?.savedTemplates,
        globalDefaultTemplateId: overrides?.globalDefaultTemplateId,
      },
    },
    saveSettings: saveSettingsMock,
    mocks: {
      saveSettings: saveSettingsMock,
    },
  };
  return plugin;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("renderArticleSavingSettingsTab()", () => {
  it("explains the default frontmatter template and restores it after reset", async () => {
    const containerEl = createDiv();
    const plugin = createPlugin({
      defaultTemplate: DEFAULT_SETTINGS.articleSaving.defaultTemplate,
    });

    renderArticleSavingSettingsTab(containerEl, plugin, vi.fn());

    const templateSetting = getSettingByName(
      containerEl,
      "Default article template",
    );
    const description = templateSetting.querySelector(
      ".setting-item-description",
    );
    const expectedDefaultHint = "The prefilled template is ready to use.";
    const defaultFrontmatterProperties = [
      ...DEFAULT_SETTINGS.articleSaving.defaultTemplate
        .split("\n")
        .slice(1, 10),
      ...DEFAULT_SETTINGS.articleSaving.frontmatterTemplate
        .split("\n")
        .slice(1, 10),
    ];

    expect(description?.textContent).toBe(expectedDefaultHint);
    expect(defaultFrontmatterProperties).toHaveLength(18);
    expect(
      defaultFrontmatterProperties.every((property) =>
        /^[A-Za-z]+:/.test(property),
      ),
    ).toBe(true);

    const textarea = containerEl.querySelector(
      ".rss-dashboard-template-input",
    ) as HTMLTextAreaElement;
    textarea.value = "---\ntitle: Custom\n---";
    textarea.dispatchEvent(new Event("change"));
    await flushPromises();

    expect(description?.textContent).toBe(
      "Template for saved articles. Frontmatter properties can start at the beginning of each line.",
    );

    const resetBtn = Array.from(containerEl.querySelectorAll("button")).find(
      (button) => button.textContent === "Reset to default",
    );
    resetBtn?.click();
    await flushPromises();

    expect(description?.textContent).toBe(expectedDefaultHint);
  });

  it("persists save path via normalizePath() and saveSettings()", async () => {
    const containerEl = createDiv();
    const plugin = createPlugin({ defaultFolder: "Old" });
    const onRefresh = vi.fn();

    vi.spyOn(obsidian, "normalizePath").mockImplementation(
      (p: string) => `norm:${p}`,
    );

    renderArticleSavingSettingsTab(containerEl, plugin, onRefresh);

    const settingEl = getSettingByName(containerEl, "Save path");
    const input = settingEl.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    expect(input.value).toBe("Old");

    input.value = "New/Path";
    input.dispatchEvent(new Event("input"));
    await flushPromises();

    expect(plugin.settings.articleSaving.defaultFolder).toBe("norm:New/Path");
    expect(plugin.mocks.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("persists toggles (addSavedTag, saveFullContent)", async () => {
    const containerEl = createDiv();
    const plugin = createPlugin({ addSavedTag: false, saveFullContent: false });
    const onRefresh = vi.fn();

    renderArticleSavingSettingsTab(containerEl, plugin, onRefresh);

    const savedTagSetting = getSettingByName(containerEl, "Add 'saved' tag");
    const savedTagToggle = savedTagSetting.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    savedTagToggle.checked = true;
    savedTagToggle.dispatchEvent(new Event("change"));
    await flushPromises();

    expect(plugin.settings.articleSaving.addSavedTag).toBe(true);

    const fullContentSetting = getSettingByName(
      containerEl,
      "Save full content",
    );
    const fullContentToggle = fullContentSetting.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(fullContentSetting.textContent).toContain(
      "Choose what {{content}} saves: the fetched article when on or RSS item content when off.",
    );
    expect(fullContentSetting.textContent).toContain(
      "{{content}} controls placement in the template; {{summary}} keeps its existing output.",
    );
    expect(fullContentToggle.type).toBe("checkbox");
    fullContentToggle.checked = true;
    fullContentToggle.dispatchEvent(new Event("change"));
    await flushPromises();

    expect(plugin.settings.articleSaving.saveFullContent).toBe(true);
    expect(plugin.mocks.saveSettings).toHaveBeenCalledTimes(2);
  });

  it("defaults fetchTimeout to 10 and persists slider changes", async () => {
    const containerEl = createDiv();
    const plugin = createPlugin({ fetchTimeout: undefined });
    const onRefresh = vi.fn();

    renderArticleSavingSettingsTab(containerEl, plugin, onRefresh);

    const settingEl = getSettingByName(containerEl, "Fetch timeout");
    const slider = settingEl.querySelector(
      'input[type="range"]',
    ) as HTMLInputElement;
    expect(slider.value).toBe("10");
    expect(
      settingEl.querySelector(".rss-dashboard-slider-value")?.textContent,
    ).toBe("10 seconds");

    slider.value = "20";
    slider.dispatchEvent(new Event("input"));
    expect(
      settingEl.querySelector(".rss-dashboard-slider-value")?.textContent,
    ).toBe("20 seconds");
    await flushPromises();

    expect(plugin.settings.articleSaving.fetchTimeout).toBe(20);
    expect(plugin.mocks.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("updates defaultTemplate on textarea change; reset restores DEFAULT_SETTINGS + Notice", async () => {
    const containerEl = createDiv();
    const plugin = createPlugin({ defaultTemplate: "A" });
    const onRefresh = vi.fn();

    const logSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    renderArticleSavingSettingsTab(containerEl, plugin, onRefresh);

    const textarea = containerEl.querySelector(
      ".rss-dashboard-template-input",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("A");

    textarea.value = "B";
    textarea.dispatchEvent(new Event("change"));
    await flushPromises();

    expect(plugin.settings.articleSaving.defaultTemplate).toBe("B");
    expect(plugin.mocks.saveSettings).toHaveBeenCalledTimes(1);

    plugin.mocks.saveSettings.mockClear();
    logSpy.mockClear();

    const resetBtn = Array.from(containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Reset to default",
    ) as HTMLButtonElement;
    expect(resetBtn).toBeTruthy();

    resetBtn.click();
    await flushPromises();

    expect(textarea.value).toBe(DEFAULT_SETTINGS.articleSaving.defaultTemplate);
    expect(plugin.settings.articleSaving.defaultTemplate).toBe(
      DEFAULT_SETTINGS.articleSaving.defaultTemplate,
    );
    expect(plugin.mocks.saveSettings).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Template reset to default",
    );
  });

  it("renders empty saved templates note; save-as-template appends, saves, and notifies", async () => {
    const containerEl = createDiv();
    const plugin = createPlugin({
      defaultTemplate: "CURR",
      savedTemplates: undefined,
    });
    const onRefresh = vi.fn();

    const logSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const openSpy = vi
      .spyOn(SavedTemplateEditorModal.prototype, "open")
      .mockImplementation(() => {});

    vi.spyOn(
      SavedTemplateEditorModal.prototype,
      "waitForClose",
    ).mockResolvedValue({
      name: "My template",
      template: "CURR",
      defaultFolder: "",
      filenamePattern: "",
      makeGlobalDefault: false,
    });
    vi.spyOn(Date, "now").mockReturnValue(111);

    renderArticleSavingSettingsTab(containerEl, plugin, onRefresh);

    expect(
      containerEl.querySelector(".rss-dashboard-no-saved-templates")
        ?.textContent,
    ).toContain("No saved templates yet");

    const saveAsBtn = Array.from(containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Save as template",
    ) as HTMLButtonElement;
    expect(saveAsBtn).toBeTruthy();

    const clickPromise = new Promise<void>((resolve) => {
      saveAsBtn.addEventListener("click", () => void resolve(), { once: true });
    });
    saveAsBtn.click();
    await clickPromise;
    await flushPromises();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(plugin.settings.articleSaving.savedTemplates).toHaveLength(1);
    expect(plugin.settings.articleSaving.savedTemplates?.[0]).toMatchObject({
      id: "template-111",
      name: "My template",
      template: "CURR",
      defaultFolder: "",
      filenamePattern: "",
    });
    expect(
      plugin.settings.articleSaving.globalDefaultTemplateId,
    ).toBeUndefined();
    expect(plugin.mocks.saveSettings).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      'Template "My template" saved',
    );
  });

  it("edits all options of a saved template independently and can clear the global default", async () => {
    const containerEl = createDiv();
    const plugin = createPlugin({
      defaultTemplate: "EDITOR",
      savedTemplates: [
        { id: "t1", name: "One", template: "SAVED", defaultFolder: "One" },
        { id: "t2", name: "Two", template: "OTHER", defaultFolder: "Two" },
      ],
      globalDefaultTemplateId: "t1",
    });
    const onRefresh = vi.fn();
    const logSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    renderArticleSavingSettingsTab(containerEl, plugin, onRefresh);

    const editorOpen = vi
      .spyOn(SavedTemplateEditorModal.prototype, "open")
      .mockImplementation(() => {});
    vi.spyOn(
      SavedTemplateEditorModal.prototype,
      "waitForClose",
    ).mockResolvedValue({
      name: "Renamed",
      template: "UPDATED",
      defaultFolder: "Renamed folder",
      filenamePattern: "{{title}}-updated",
      makeGlobalDefault: false,
    });
    const oneSetting = getSettingByName(containerEl, "One");
    (
      Array.from(oneSetting.querySelectorAll("button")).find(
        (button) => button.textContent === "Edit",
      ) as HTMLButtonElement
    ).click();
    await flushPromises();
    expect(editorOpen).toHaveBeenCalledOnce();
    expect(plugin.settings.articleSaving.savedTemplates?.[0]).toMatchObject({
      id: "t1",
      name: "Renamed",
      template: "UPDATED",
      defaultFolder: "Renamed folder",
      filenamePattern: "{{title}}-updated",
    });
    expect(plugin.settings.articleSaving.savedTemplates?.[1].template).toBe(
      "OTHER",
    );
    expect(
      plugin.settings.articleSaving.globalDefaultTemplateId,
    ).toBeUndefined();
    expect(plugin.mocks.saveSettings).toHaveBeenCalledOnce();

    const deleteSetting = getSettingByName(containerEl, "One");
    (
      deleteSetting.querySelector(
        'button[data-icon="trash"]',
      ) as HTMLButtonElement
    ).click();
    await flushPromises();
    expect(plugin.settings.articleSaving.savedTemplates).toHaveLength(1);
    expect(plugin.mocks.saveSettings).toHaveBeenCalledTimes(2);
    expect(onRefresh).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      'Template "Renamed" deleted',
    );
  });
});

describe("Article Saving settings help text", () => {
  it("renders the grouped variable help through the shared renderer", () => {
    const containerEl = createDiv();
    renderArticleSavingSettingsTab(containerEl, createPlugin(), vi.fn());

    const help = containerEl.querySelector(".rss-dashboard-template-help");
    expect(help).not.toBeNull();
    expect(
      Array.from(help?.querySelectorAll("h4") ?? []).map((h) => h.textContent),
    ).toHaveLength(6);
    expect(help?.querySelectorAll("li code").length).toBeGreaterThan(20);
  });

  it("places the template buttons above the variable help", () => {
    const containerEl = createDiv();
    renderArticleSavingSettingsTab(containerEl, createPlugin(), vi.fn());

    const buttons = containerEl.querySelector(
      ".rss-dashboard-template-btn-row",
    );
    const help = containerEl.querySelector(".rss-dashboard-template-help");
    expect(buttons).not.toBeNull();
    expect(help).not.toBeNull();
    expect(
      buttons!.compareDocumentPosition(help!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
