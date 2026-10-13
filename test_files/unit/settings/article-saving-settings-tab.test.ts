import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { DEFAULT_SETTINGS, type SavedTemplate } from "../../../src/types/types";
import { renderArticleSavingSettingsTab } from "../../../src/settings/tabs/article-saving-settings-tab";
import {
  ConfirmActionModal,
  SavedTemplateEditorModal,
} from "../../../src/settings/modals/settings-modals";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { findIconButton, lucideIconId } from "../test-icon-helpers";

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Make the shared confirmation dialog resolve without a real interaction, so a
 * test can exercise the confirm and cancel paths deterministically.
 */
function stubConfirm(result: boolean): void {
  vi.spyOn(ConfirmActionModal.prototype, "open").mockImplementation(() => {});
  vi.spyOn(ConfirmActionModal.prototype, "waitForClose").mockResolvedValue(
    result,
  );
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
    feeds: { url: string; customTemplate?: string }[];
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
  feeds?: { url: string; customTemplate?: string }[];
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
      feeds: overrides?.feeds ?? [],
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
  // 1.8.7 through 1.12.x use the legacy settings controls; pin that branch.
  obsidian.__setObsidianVersion("1.8.7");
});

afterEach(() => {
  obsidian.__resetObsidianVersion();
});

describe("renderArticleSavingSettingsTab()", () => {
  it("explains the default frontmatter template and restores it after reset", async () => {
    const containerEl = createDiv();
    const plugin = createPlugin({
      defaultTemplate: DEFAULT_SETTINGS.articleSaving.defaultTemplate,
    });
    stubConfirm(true);

    renderArticleSavingSettingsTab(containerEl, plugin, vi.fn());

    const templateSetting = getSettingByName(
      containerEl,
      "Default article template",
    );
    const description = templateSetting.querySelector(
      ".setting-item-description",
    );
    const expectedDefaultHint =
      "The built-in template. It is used when neither the feed nor the global default saved template sets one.";
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
      "Your custom template. It is used when neither the feed nor the global default saved template sets one. Frontmatter properties can start at the beginning of each line.",
    );

    const resetBtn = Array.from(containerEl.querySelectorAll("button")).find(
      (button) => button.textContent === "Reset",
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

    const savedTagSetting = getSettingByName(containerEl, "Add saved tag");
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
      "Choose what {{content}} saves: the fetched article when on, or the feed item's content when off.",
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
    stubConfirm(true);

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
      (b) => b.textContent === "Reset",
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
      feeds: [
        { url: "https://a.example/feed", customTemplate: "t1" },
        { url: "https://b.example/feed", customTemplate: "t2" },
      ],
    });
    const onRefresh = vi.fn();
    const logSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    stubConfirm(true);

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
    const deleteButton = findIconButton(
      deleteSetting,
      "trash-2",
    ) as HTMLButtonElement;
    deleteButton.click();
    await flushPromises();
    expect(plugin.settings.articleSaving.savedTemplates).toHaveLength(1);
    expect(plugin.mocks.saveSettings).toHaveBeenCalledTimes(2);
    expect(onRefresh).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      'Template "Renamed" deleted',
    );
  });

  it("clears feed assignments that referenced the deleted template", async () => {
    const containerEl = createDiv();
    const plugin = createPlugin({
      savedTemplates: [
        { id: "t1", name: "One", template: "SAVED" },
        { id: "t2", name: "Two", template: "OTHER" },
      ],
      globalDefaultTemplateId: "t1",
      feeds: [
        { url: "https://a.example/feed", customTemplate: "t1" },
        { url: "https://b.example/feed", customTemplate: "t2" },
        { url: "https://c.example/feed" },
      ],
    });
    const onRefresh = vi.fn();
    stubConfirm(true);

    renderArticleSavingSettingsTab(containerEl, plugin, onRefresh);

    const deleteButton = findIconButton(
      getSettingByName(containerEl, "One"),
      "trash-2",
    ) as HTMLButtonElement;
    deleteButton.click();
    await flushPromises();

    expect(plugin.settings.articleSaving.savedTemplates).toHaveLength(1);
    expect(
      plugin.settings.articleSaving.globalDefaultTemplateId,
    ).toBeUndefined();
    expect(plugin.settings.feeds.map((feed) => feed.customTemplate)).toEqual([
      undefined,
      "t2",
      undefined,
    ]);
    expect(plugin.mocks.saveSettings).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("leaves the template and its feed assignments unchanged when deletion is cancelled", async () => {
    const containerEl = createDiv();
    const plugin = createPlugin({
      savedTemplates: [{ id: "t1", name: "One", template: "SAVED" }],
      globalDefaultTemplateId: "t1",
      feeds: [{ url: "https://a.example/feed", customTemplate: "t1" }],
    });
    const onRefresh = vi.fn();
    stubConfirm(false);

    renderArticleSavingSettingsTab(containerEl, plugin, onRefresh);

    const deleteButton = findIconButton(
      getSettingByName(containerEl, "One"),
      "trash-2",
    ) as HTMLButtonElement;
    deleteButton.click();
    await flushPromises();

    expect(plugin.settings.articleSaving.savedTemplates).toHaveLength(1);
    expect(plugin.settings.articleSaving.globalDefaultTemplateId).toBe("t1");
    expect(plugin.settings.feeds[0].customTemplate).toBe("t1");
    expect(plugin.mocks.saveSettings).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does not reset the template when the reset confirmation is cancelled", async () => {
    const containerEl = createDiv();
    const plugin = createPlugin({ defaultTemplate: "CUSTOM" });
    stubConfirm(false);

    renderArticleSavingSettingsTab(containerEl, plugin, vi.fn());

    const resetBtn = Array.from(containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Reset",
    ) as HTMLButtonElement;
    resetBtn.click();
    await flushPromises();

    const textarea = containerEl.querySelector(
      ".rss-dashboard-template-input",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("CUSTOM");
    expect(plugin.settings.articleSaving.defaultTemplate).toBe("CUSTOM");
    expect(plugin.mocks.saveSettings).not.toHaveBeenCalled();
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

describe("Default article template actions (#1037)", () => {
  function render(overrides?: Parameters<typeof createPlugin>[0]): {
    containerEl: HTMLElement;
    plugin: TestPlugin;
    onRefresh: ReturnType<typeof vi.fn>;
  } {
    const containerEl = createDiv();
    const plugin = createPlugin(overrides);
    const onRefresh = vi.fn();
    renderArticleSavingSettingsTab(containerEl, plugin, onRefresh);
    return { containerEl, plugin, onRefresh };
  }

  function getButton(
    containerEl: HTMLElement,
    label: string,
  ): HTMLButtonElement {
    const button = Array.from(
      containerEl.querySelectorAll<HTMLButtonElement>(
        ".rss-dashboard-template-btn-row button",
      ),
    ).find((b) => b.textContent === label);
    if (!button) throw new Error(`Button not found: ${label}`);
    return button;
  }

  function statusText(containerEl: HTMLElement): string | null | undefined {
    return containerEl.querySelector('[role="status"]')?.textContent;
  }

  function textarea(containerEl: HTMLElement): HTMLTextAreaElement {
    return containerEl.querySelector(
      ".rss-dashboard-template-input",
    ) as HTMLTextAreaElement;
  }

  const savedA: SavedTemplate = {
    id: "a",
    name: "Alpha",
    template: "A",
    defaultFolder: "",
    filenamePattern: "",
  };

  it("renders four icon buttons in order with accessible names equal to labels", () => {
    const { containerEl } = render();
    const buttons = Array.from(
      containerEl.querySelectorAll<HTMLButtonElement>(
        ".rss-dashboard-template-btn-row button",
      ),
    );
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Use as default",
      "Save as template",
      "Reset",
      "Clear",
    ]);
    expect(buttons.map((b) => lucideIconId(b))).toEqual([
      "circle-check-big",
      "save",
      "rotate-ccw",
      "eraser",
    ]);
    for (const button of buttons) {
      expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it("exposes a polite status region before the button row", () => {
    const { containerEl } = render();
    const status = containerEl.querySelector('[role="status"]');
    expect(status?.getAttribute("aria-live")).toBe("polite");
    const row = containerEl.querySelector(".rss-dashboard-template-btn-row");
    expect(
      (status?.compareDocumentPosition(row as Node) ?? 0) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("names the resolved global default template in the status line", () => {
    const { containerEl } = render({
      savedTemplates: [savedA],
      globalDefaultTemplateId: "a",
    });
    expect(statusText(containerEl)).toBe("Default saves use: Alpha");
  });

  it("falls back to the template above when no id or a dangling id is set", () => {
    expect(statusText(render().containerEl)).toBe(
      "Default saves use: the template above",
    );
    const dangling = render({
      savedTemplates: [savedA],
      globalDefaultTemplateId: "gone",
    });
    expect(statusText(dangling.containerEl)).toBe(
      "Default saves use: the template above",
    );
    expect(dangling.plugin.settings.articleSaving.globalDefaultTemplateId).toBe(
      "gone",
    );
    expect(getButton(dangling.containerEl, "Use as default").disabled).toBe(
      true,
    );
  });

  it("Use as default clears the id, saves, and updates in place", async () => {
    const { containerEl, plugin, onRefresh } = render({
      savedTemplates: [savedA],
      globalDefaultTemplateId: "a",
    });
    const button = getButton(containerEl, "Use as default");
    expect(button.disabled).toBe(false);

    button.click();
    await flushPromises();

    expect(
      plugin.settings.articleSaving.globalDefaultTemplateId,
    ).toBeUndefined();
    expect(plugin.mocks.saveSettings).toHaveBeenCalledTimes(1);
    expect(statusText(containerEl)).toBe(
      "Default saves use: the template above",
    );
    expect(button.disabled).toBe(true);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("Reset confirms, restores the shipped template, and updates in place", async () => {
    const { containerEl, plugin, onRefresh } = render({
      defaultTemplate: "CUSTOM",
      savedTemplates: [savedA],
      globalDefaultTemplateId: "a",
    });
    stubConfirm(true);
    const reset = getButton(containerEl, "Reset");
    expect(reset.disabled).toBe(false);

    reset.click();
    await flushPromises();

    expect(textarea(containerEl).value).toBe(
      DEFAULT_SETTINGS.articleSaving.defaultTemplate,
    );
    expect(plugin.settings.articleSaving.defaultTemplate).toBe(
      DEFAULT_SETTINGS.articleSaving.defaultTemplate,
    );
    expect(plugin.mocks.saveSettings).toHaveBeenCalledTimes(1);
    expect(reset.disabled).toBe(true);
    expect(getButton(containerEl, "Clear").disabled).toBe(false);
    expect(plugin.settings.articleSaving.globalDefaultTemplateId).toBe("a");
    expect(statusText(containerEl)).toBe("Default saves use: Alpha");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("Clear confirms, then sets the minimal template and updates in place", async () => {
    const { containerEl, plugin, onRefresh } = render({
      defaultTemplate: "CUSTOM",
    });
    stubConfirm(true);
    const modalSpy = vi.spyOn(ConfirmActionModal.prototype, "open");
    const clear = getButton(containerEl, "Clear");
    expect(clear.disabled).toBe(false);

    clear.click();
    await flushPromises();

    expect(modalSpy).toHaveBeenCalledTimes(1);
    expect(textarea(containerEl).value).toBe("{{content}}");
    expect(plugin.settings.articleSaving.defaultTemplate).toBe("{{content}}");
    expect(plugin.mocks.saveSettings).toHaveBeenCalledTimes(1);
    expect(clear.disabled).toBe(true);
    expect(getButton(containerEl, "Reset").disabled).toBe(false);
    expect(
      getSettingByName(containerEl, "Default article template").querySelector(
        ".setting-item-description",
      )?.textContent,
    ).toContain("Your custom template");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("declining Reset or Clear leaves the box, settings, and status unchanged", async () => {
    const { containerEl, plugin } = render({
      defaultTemplate: "CUSTOM",
      savedTemplates: [savedA],
      globalDefaultTemplateId: "a",
    });
    stubConfirm(false);

    getButton(containerEl, "Reset").click();
    await flushPromises();
    getButton(containerEl, "Clear").click();
    await flushPromises();

    expect(textarea(containerEl).value).toBe("CUSTOM");
    expect(plugin.settings.articleSaving.defaultTemplate).toBe("CUSTOM");
    expect(plugin.settings.articleSaving.globalDefaultTemplateId).toBe("a");
    expect(plugin.mocks.saveSettings).not.toHaveBeenCalled();
    expect(statusText(containerEl)).toBe("Default saves use: Alpha");
  });

  it("disables Reset and Clear exactly when the box already matches, tracking edits", async () => {
    const { containerEl } = render({
      defaultTemplate: DEFAULT_SETTINGS.articleSaving.defaultTemplate,
    });
    expect(getButton(containerEl, "Reset").disabled).toBe(true);
    expect(getButton(containerEl, "Clear").disabled).toBe(false);

    const box = textarea(containerEl);
    box.value = "{{content}}";
    box.dispatchEvent(new Event("change"));
    await flushPromises();

    expect(getButton(containerEl, "Reset").disabled).toBe(false);
    expect(getButton(containerEl, "Clear").disabled).toBe(true);
  });

  it("moves keyboard focus to Save as template when the focused button disables itself", async () => {
    const { containerEl } = render({
      savedTemplates: [savedA],
      globalDefaultTemplateId: "a",
    });
    document.body.appendChild(containerEl);
    try {
      const useAsDefault = getButton(containerEl, "Use as default");
      useAsDefault.focus();
      expect(document.activeElement).toBe(useAsDefault);

      useAsDefault.click();
      await flushPromises();

      expect(useAsDefault.disabled).toBe(true);
      expect(document.activeElement).toBe(
        getButton(containerEl, "Save as template"),
      );
    } finally {
      containerEl.remove();
    }
  });

  it("Save as template still rebuilds the tab through onRefresh", async () => {
    const { containerEl, plugin, onRefresh } = render({ defaultTemplate: "X" });
    vi.spyOn(SavedTemplateEditorModal.prototype, "open").mockImplementation(
      () => {},
    );
    vi.spyOn(
      SavedTemplateEditorModal.prototype,
      "waitForClose",
    ).mockResolvedValue({
      name: "N",
      template: "X",
      defaultFolder: "",
      filenamePattern: "",
      makeGlobalDefault: false,
    });

    getButton(containerEl, "Save as template").click();
    await flushPromises();

    expect(plugin.settings.articleSaving.savedTemplates).toHaveLength(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
