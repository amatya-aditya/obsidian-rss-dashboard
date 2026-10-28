import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import {
  type RssDashboardSettings,
  type Feed,
  type Folder,
  type Tag,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { renderTagsSettingsTab } from "../../../src/settings/tabs/tags-settings-tab";
import {
  ApplyTagDefaultsModal,
  ConfirmActionModal,
} from "../../../src/settings/modals/settings-modals";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type RssDashboardPlugin from "../../../main";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const settingsStylesheet = postcss.parse(
  readFileSync(
    path.resolve(testDir, "../../../src/styles/settings.css"),
    "utf8",
  ),
);

/** Resolve the modal's accessible name from the heading it points at. */
function dialogName(dialog: Element | null): string | null {
  const container = dialog?.closest("[role='dialog']");
  const id = container?.getAttribute("aria-labelledby");
  if (!container || !id) return null;
  return container.querySelector(`#${id}`)?.textContent?.trim() ?? null;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Resolve the shared confirmation dialog without a real interaction. */
function stubConfirm(result: boolean): void {
  vi.spyOn(ConfirmActionModal.prototype, "open").mockImplementation(() => {});
  vi.spyOn(ConfirmActionModal.prototype, "waitForClose").mockResolvedValue(
    result,
  );
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

/** Find a control by the accessible name Obsidian's setTooltip writes. */
function findButtonByName(
  container: ParentNode,
  name: string,
): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.getAttribute("aria-label") === name,
    ) ?? null
  );
}

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function getTagTrigger(settingEl: HTMLElement): HTMLButtonElement {
  const trigger = settingEl.querySelector(
    ".rss-dashboard-tag-multi-select-trigger",
  );
  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error("Tag trigger not found");
  }
  return trigger;
}

function getOpenTagMenu(): HTMLElement {
  const menu = document.body.querySelector(
    ".rss-dashboard-tag-multi-select-menu",
  );
  if (!(menu instanceof HTMLElement)) {
    throw new Error("Tag menu not found");
  }
  return menu;
}

function getTagOption(name: string): HTMLButtonElement {
  const option = Array.from(
    getOpenTagMenu().querySelectorAll<HTMLButtonElement>(
      ".rss-dashboard-tag-multi-select-menu-option",
    ),
  ).find((el) => el.getAttribute("data-tag-name") === name);
  if (!(option instanceof HTMLButtonElement)) {
    throw new Error(`Tag option not found: ${name}`);
  }
  return option;
}

const autoTagRows = [
  "Tag for video articles",
  "Default Mastodon tag",
  "Default YouTube tag",
  "Default podcast tag",
  "Default RSS tag",
  "Default smallweb tag",
] as const;

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("renderTagsSettingsTab()", () => {
  it("renders Auto Tagging before the tag list and add-tag section", () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [{ name: "Video", color: "#d04747" }];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    const names = Array.from(
      containerEl.querySelectorAll(".setting-item-name"),
    ).map((el) => el.textContent?.trim());

    expect(names[0]).toBe("Auto tagging");
    expect(names.slice(1, 7)).toEqual(autoTagRows);
    expect(names.indexOf("Add new tag")).toBeGreaterThan(
      names.indexOf("Reset tag names"),
    );
  });

  it("starts the 'Add new tag' color picker at the default tag color", () => {
    const containerEl = document.body.appendChild(createDiv());
    const plugin = {
      app: obsidian.App.createMock(),
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    expect(
      getSettingByName(
        containerEl,
        "Tag color",
      ).querySelector<HTMLInputElement>("input[type='color']")?.value,
    ).toBe("#8a5cf5");
  });

  it("offers palette controls beside both Add new tag color pickers", () => {
    const containerEl = document.body.appendChild(createDiv());
    const plugin = {
      app: obsidian.App.createMock(),
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    for (const name of ["Tag color", "Tag text color"]) {
      const setting = getSettingByName(containerEl, name);
      expect(
        setting.querySelector(
          ".rss-dashboard-tag-color-palette-control select",
        ),
      ).not.toBeNull();
      expect(
        setting.querySelector(
          ".rss-dashboard-tag-color-palette-control-color-trigger",
        ),
      ).not.toBeNull();
    }
  });

  it("shows no hex readout in the color rows, with the picker first after the label", () => {
    const containerEl = document.body.appendChild(createDiv());
    const plugin = {
      app: obsidian.App.createMock(),
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;
    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    const rows = containerEl.querySelectorAll<HTMLElement>(
      ".rss-dashboard-tag-color-setting",
    );
    expect(rows).toHaveLength(4);
    for (const row of Array.from(rows)) {
      expect(
        row.querySelector(
          ".rss-dashboard-tag-color-palette-control-value-readout",
        ),
      ).toBeNull();
      const control = row.querySelector(".setting-item-control")!;
      expect(control.firstElementChild?.matches("input[type='color']")).toBe(
        true,
      );
      // The dice sits right after the picker, then the palette control.
      expect(
        control.children[1]?.classList.contains(
          "rss-dashboard-tag-color-randomize",
        ),
      ).toBe(true);
      expect(control.children[2]?.className).toContain(
        "rss-dashboard-tag-color-palette-control",
      );
    }
    for (const selector of [
      ".rss-dashboard-tag-default-background",
      ".rss-dashboard-tag-default-text",
    ]) {
      expect(
        containerEl
          .querySelector(selector)
          ?.closest(".setting-item")
          ?.classList.contains("rss-dashboard-tag-default-color-setting"),
      ).toBe(true);
    }
  });

  it("renders all auto-tag rows as tag multi-select triggers instead of native selects", () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [
      { name: "Video", color: "#d04747" },
      { name: "News", color: "#3498db" },
    ];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    for (const name of autoTagRows) {
      const setting = getSettingByName(containerEl, name);
      expect(setting.querySelector("select")).toBeNull();
      expect(
        setting.querySelector(".rss-dashboard-tag-multi-select-trigger"),
      ).not.toBeNull();
    }
  });

  it("renders selected summaries for single, multiple, and empty selections", () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [
      { name: "Video", color: "#d04747" },
      { name: "News", color: "#3498db" },
      { name: "Tech", color: "#2ecc71" },
    ];
    settings.media.defaultVideoTags = ["Video"];
    settings.media.defaultYouTubeTags = ["Video", "News"];
    settings.media.defaultRssTags = [];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    expect(
      getTagTrigger(getSettingByName(containerEl, "Tag for video articles"))
        .textContent,
    ).toContain("Video");
    expect(
      getTagTrigger(getSettingByName(containerEl, "Default YouTube tag"))
        .textContent,
    ).toContain("2 tags selected");
    expect(
      getTagTrigger(getSettingByName(containerEl, "Default RSS tag"))
        .textContent,
    ).toContain("None");
  });

  it("toggles auto-tag selections, persists array settings, and updates aria state", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [
      { name: "Video", color: "#d04747" },
      { name: "News", color: "#3498db" },
      { name: "Tech", color: "#2ecc71" },
    ];
    settings.media.defaultVideoTags = ["Video"];
    settings.media.defaultYouTubeTags = ["Video", "News"];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    const videoTrigger = getTagTrigger(
      getSettingByName(containerEl, "Tag for video articles"),
    );
    videoTrigger.click();
    expect(getTagOption("Video").getAttribute("aria-pressed")).toBe("true");
    expect(getTagOption("News").getAttribute("aria-pressed")).toBe("false");

    getTagOption("News").click();
    await flushPromises();

    expect(plugin.settings.media.defaultVideoTags).toEqual(["Video", "News"]);
    expect(videoTrigger.textContent).toContain("2 tags selected");

    const youtubeTrigger = getTagTrigger(
      getSettingByName(containerEl, "Default YouTube tag"),
    );
    youtubeTrigger.click();
    getTagOption("Video").click();
    await flushPromises();

    expect(plugin.settings.media.defaultYouTubeTags).toEqual(["News"]);
    expect(youtubeTrigger.textContent).toContain("News");
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(2);
  });

  it("shows a disabled empty-state trigger when availableTags is empty", () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    const tagSetting = getSettingByName(containerEl, "Tag for video articles");
    const wrapper = tagSetting.querySelector(".rss-dashboard-tag-multi-select");
    const trigger = getTagTrigger(tagSetting);

    expect(wrapper).not.toBeNull();
    expect(
      wrapper?.classList.contains("rss-dashboard-tag-multi-select--empty"),
    ).toBe(true);
    expect(trigger.disabled).toBe(true);
    expect(trigger.textContent?.toLowerCase()).toContain("none");
  });

  it("restores default tag arrays on reset and refreshes the tab", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [{ name: "Custom", color: "#123456" }];
    settings.media.defaultVideoTag = "Custom";
    settings.media.defaultVideoTags = ["Custom"];
    settings.media.defaultYouTubeTags = ["Custom"];
    const onRefresh = vi.fn();

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, onRefresh);

    const resetSetting = getSettingByName(containerEl, "Reset tag names");
    const resetButton = resetSetting.querySelector(
      "button",
    ) as HTMLButtonElement;
    resetButton.click();
    await flushPromises();

    expect(plugin.settings.media.defaultVideoTag).toBe("Video");
    expect(plugin.settings.media.defaultVideoTags).toEqual(["Video"]);
    expect(plugin.settings.media.defaultYouTubeTags).toEqual(["Video"]);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows each tag as a read-only chip with edit and delete controls", () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [{ name: "tag1", color: "#000000" }];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    const row = getSettingByName(containerEl, "tag1");
    const chip = row.querySelector<HTMLElement>(".rss-dashboard-tag-badge");

    expect(chip?.textContent).toBe("tag1");
    expect(chip?.style.getPropertyValue("--tag-color")).toBe("#000000");
    expect(row.querySelector('input[type="color"]')).toBeNull();
    expect(findButtonByName(row, "Edit tag")).not.toBeNull();
    expect(findButtonByName(row, "Delete tag")).not.toBeNull();
  });

  it("renames and recolors a tag from the Edit tag dialog, including folder rules and auto-tag defaults", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [{ name: "tag1", color: "#000000" }];
    settings.feeds = [
      {
        name: "Feed 1",
        url: "https://example.com/feed.xml",
        folder: "",
        items: [
          {
            title: "Article 1",
            link: "https://example.com/article-1",
            pubDate: new Date().toISOString(),
            content: "",
            description: "",
            guid: "article-1",
            read: false,
            feedUrl: "https://example.com/feed.xml",
            feedTitle: "Feed 1",
            tags: [{ name: "tag1", color: "#000000" }],
            saved: false,
            starred: false,
          },
        ],
      } as unknown as Feed,
    ];
    settings.folders = [
      {
        name: "Tech",
        subfolders: [],
        autoTags: [{ name: "tag1", color: "#000000" }],
      } as Folder,
    ];
    settings.media.defaultVideoTag = "tag1";
    settings.media.defaultVideoTags = ["tag1"];
    settings.dashboardMultiFilters.tagFilters = ["tag1"];

    const trigger = vi.fn();
    const mockApp = obsidian.App.createMock();
    (mockApp.workspace as unknown as { trigger: typeof trigger }).trigger =
      trigger;

    const plugin = {
      app: mockApp,
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;
    const onRefresh = vi.fn();

    renderTagsSettingsTab(containerEl, plugin, onRefresh);

    findButtonByName(
      getSettingByName(containerEl, "tag1"),
      "Edit tag",
    )?.click();

    const dialog = document.querySelector(".rss-dashboard-edit-tag-modal");
    expect(dialog).not.toBeNull();
    expect(dialogName(dialog)).toBe("Add/edit tag");

    const nameInput = dialog?.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-modal-name-input",
    );
    const colorInput = dialog?.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-modal-color-picker",
    );
    expect(nameInput?.value).toBe("tag1");

    if (nameInput) nameInput.value = "renamed";
    if (colorInput) colorInput.value = "#ff0000";
    dialog
      ?.querySelector<HTMLButtonElement>("button.rss-dashboard-primary-button")
      ?.click();
    await flushPromises();

    expect(plugin.settings.availableTags).toEqual([
      { name: "renamed", color: "#ff0000" },
    ]);
    expect(plugin.settings.feeds[0].items[0].tags).toEqual([
      { name: "renamed", color: "#ff0000" },
    ]);
    expect(plugin.settings.folders[0].autoTags).toEqual([
      { name: "renamed", color: "#ff0000" },
    ]);
    expect(plugin.settings.media.defaultVideoTag).toBe("renamed");
    expect(plugin.settings.media.defaultVideoTags).toEqual(["renamed"]);
    expect(plugin.settings.dashboardMultiFilters.tagFilters).toEqual([]);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(plugin.refreshOpenTagColorViews)).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledWith("rss-dashboard:tags-mutated");
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".rss-dashboard-edit-tag-modal")).toBeNull();
  });

  it("leaves the tag unchanged when the Edit tag dialog is cancelled", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [{ name: "tag1", color: "#000000" }];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;
    const onRefresh = vi.fn();

    renderTagsSettingsTab(containerEl, plugin, onRefresh);

    findButtonByName(
      getSettingByName(containerEl, "tag1"),
      "Edit tag",
    )?.click();
    Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent === "Cancel")
      ?.click();
    await flushPromises();

    expect(plugin.settings.availableTags).toEqual([
      { name: "tag1", color: "#000000" },
    ]);
    expect(vi.mocked(plugin.saveSettings)).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("opens the dialog for the row whose pencil was clicked", () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [
      { name: "tag1", color: "#000000" },
      { name: "tag2", color: "#ffffff" },
    ];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    findButtonByName(
      getSettingByName(containerEl, "tag2"),
      "Edit tag",
    )?.click();

    expect(
      document.querySelector<HTMLInputElement>(
        ".rss-dashboard-tag-modal-name-input",
      )?.value,
    ).toBe("tag2");
  });

  it("returns focus to the renamed row's Edit tag button after saving", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [{ name: "tag1", color: "#000000" }];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;
    const onRefresh = (): void => {
      containerEl.empty();
      renderTagsSettingsTab(containerEl, plugin, onRefresh);
    };

    renderTagsSettingsTab(containerEl, plugin, onRefresh);

    findButtonByName(
      getSettingByName(containerEl, "tag1"),
      "Edit tag",
    )?.click();
    const nameInput = document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-modal-name-input",
    );
    if (nameInput) nameInput.value = "renamed";
    document
      .querySelector<HTMLButtonElement>("button.rss-dashboard-primary-button")
      ?.click();
    await flushPromises();

    const editButton = findButtonByName(
      getSettingByName(containerEl, "renamed"),
      "Edit tag",
    );
    expect(editButton).not.toBeNull();
    expect(document.activeElement).toBe(editButton);
  });

  it("deletes an existing tag and refreshes", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [{ name: "tag1", color: "#000000" }];
    const onRefresh = vi.fn();
    stubConfirm(true);

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, onRefresh);

    const deleteBtn = findButtonByName(
      containerEl,
      "Delete tag",
    ) as HTMLButtonElement;
    deleteBtn.click();
    await flushPromises();

    expect(plugin.settings.availableTags).toHaveLength(0);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("leaves the tag and everything using it unchanged when deletion is cancelled", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [{ name: "tag1", color: "#000000" }];
    const onRefresh = vi.fn();
    stubConfirm(false);

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, onRefresh);

    const deleteBtn = findButtonByName(
      containerEl,
      "Delete tag",
    ) as HTMLButtonElement;
    deleteBtn.click();
    await flushPromises();

    expect(plugin.settings.availableTags).toHaveLength(1);
    expect(vi.mocked(plugin.saveSettings)).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("adds a new tag and refreshes", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [];
    const onRefresh = vi.fn();

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, onRefresh);

    const tagNameSetting = getSettingByName(containerEl, "Tag name");
    const nameInput = tagNameSetting.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    nameInput.value = "newTag";
    nameInput.dispatchEvent(new Event("input"));

    const tagColorSetting = getSettingByName(containerEl, "Tag color");
    const colorInput = tagColorSetting.querySelector(
      'input[type="color"]',
    ) as HTMLInputElement;
    colorInput.value = "#123456";
    colorInput.dispatchEvent(new Event("input"));

    const addBtn = Array.from(containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Add tag",
    ) as HTMLButtonElement;
    addBtn.click();
    await flushPromises();

    expect(plugin.settings.availableTags).toHaveLength(1);
    expect(plugin.settings.availableTags[0]).toEqual({
      name: "newTag",
      color: "#123456",
    });
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("trims the new tag name before storing it", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [];

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    const nameInput = getSettingByName(containerEl, "Tag name").querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    nameInput.value = "  spaced  ";

    const addBtn = Array.from(containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Add tag",
    ) as HTMLButtonElement;
    addBtn.click();
    await flushPromises();

    expect(plugin.settings.availableTags).toEqual([{ name: "spaced" }]);
  });

  it("stores only explicitly changed tag appearance values", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [];
    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;
    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    getSettingByName(containerEl, "Tag name").querySelector<HTMLInputElement>(
      'input[type="text"]',
    )!.value = "Inherited";
    getSettingByName(containerEl, "Tag text color")
      .querySelector<HTMLInputElement>('input[type="color"]')!
      .dispatchEvent(new Event("change", { bubbles: true }));
    Array.from(containerEl.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "Add tag")!
      .click();
    await flushPromises();

    expect(settings.availableTags).toEqual([{ name: "Inherited" }]);
  });

  it("rejects a whitespace-only tag name", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [];
    const logSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    const nameInput = getSettingByName(containerEl, "Tag name").querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    nameInput.value = "   ";

    const addBtn = Array.from(containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Add tag",
    ) as HTMLButtonElement;
    addBtn.click();
    await flushPromises();

    expect(plugin.settings.availableTags).toHaveLength(0);
    expect(vi.mocked(plugin.saveSettings)).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Please enter a tag name!",
    );
  });

  it("rejects a tag whose name already exists case-insensitively", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [{ name: "Video", color: "#d04747" }];
    const logSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    const nameInput = getSettingByName(containerEl, "Tag name").querySelector(
      'input[type="text"]',
    ) as HTMLInputElement;
    nameInput.value = "video";

    const addBtn = Array.from(containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Add tag",
    ) as HTMLButtonElement;
    addBtn.click();
    await flushPromises();

    expect(plugin.settings.availableTags).toHaveLength(1);
    expect(vi.mocked(plugin.saveSettings)).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "A tag with this name already exists!",
    );
  });

  describe("deleting a tag definition", () => {
    function makeFeedWithTags(url: string, tagNames: string[][]): Feed {
      return {
        title: url,
        url,
        folder: "",
        lastUpdated: 0,
        items: tagNames.map((names, index) => ({
          title: `Item ${index}`,
          link: `${url}/${index}`,
          description: "",
          pubDate: "",
          guid: `${url}#${index}`,
          read: false,
          starred: false,
          tags: names.map((name) => ({ name, color: "#d04747" })),
          feedTitle: url,
          feedUrl: url,
          coverImage: "",
        })),
      } as Feed;
    }

    function renderWithTags() {
      const containerEl = document.body.appendChild(createDiv());
      const settings = cloneSettings();
      settings.availableTags = [
        { name: "Video", color: "#d04747" },
        { name: "News", color: "#3498db" },
      ];
      settings.feeds = [
        makeFeedWithTags("https://a.example/feed", [
          ["Video", "News"],
          ["News"],
        ]),
        makeFeedWithTags("https://b.example/feed", [["Video"], []]),
      ];
      const trigger = vi.fn();
      const plugin = {
        app: { ...obsidian.App.createMock(), workspace: { trigger } },
        settings,
        saveSettings: vi.fn(async () => {}),
        refreshOpenTagColorViews: vi.fn(async () => {}),
      } as unknown as RssDashboardPlugin;
      const onRefresh = vi.fn();
      stubConfirm(true);
      renderTagsSettingsTab(containerEl, plugin, onRefresh);
      return { containerEl, settings, plugin, onRefresh, trigger };
    }

    function clickDelete(containerEl: HTMLElement, tagName: string): void {
      const row = getSettingByName(containerEl, tagName);
      const button = findButtonByName(row, "Delete tag");
      if (!button) throw new Error("Delete button not found");
      button.click();
    }

    it("removes the definition and its assignments from every article", async () => {
      const { containerEl, settings, plugin, onRefresh } = renderWithTags();

      clickDelete(containerEl, "Video");
      await flushPromises();

      expect(settings.availableTags.map((t) => t.name)).toEqual(["News"]);
      const assigned = settings.feeds.flatMap((feed) =>
        feed.items.map((item) => (item.tags ?? []).map((t) => t.name)),
      );
      expect(assigned).toEqual([["News"], ["News"], [], []]);
      expect(plugin.saveSettings).toHaveBeenCalled();
      expect(onRefresh).toHaveBeenCalled();
    });

    it("tells open views so an inline Reader drops the deleted chip", async () => {
      const { containerEl, plugin, trigger } = renderWithTags();

      clickDelete(containerEl, "News");
      await flushPromises();

      expect(plugin.refreshOpenTagColorViews).toHaveBeenCalled();
      expect(trigger).toHaveBeenCalledWith("rss-dashboard:tags-mutated");
    });

    it("strips the deleted tag from folder auto-tags", async () => {
      const containerEl = document.body.appendChild(createDiv());
      const settings = cloneSettings();
      settings.availableTags = [
        { name: "Video", color: "#d04747" },
        { name: "News", color: "#3498db" },
      ];
      settings.folders = [
        {
          name: "Tech",
          subfolders: [],
          autoTags: [{ name: "Video", color: "#d04747" }],
        } as Folder,
      ];

      const plugin = {
        app: obsidian.App.createMock(),
        settings,
        saveSettings: vi.fn(async () => {}),
        refreshOpenTagColorViews: vi.fn(async () => {}),
      } as unknown as RssDashboardPlugin;
      stubConfirm(true);
      renderTagsSettingsTab(containerEl, plugin, vi.fn());

      clickDelete(containerEl, "Video");
      await flushPromises();

      expect(settings.folders[0].autoTags).toEqual([]);
    });
  });
});

describe("renderTagsSettingsTab() tag shape control", () => {
  function render(
    radius?: string,
    tweak: (settings: RssDashboardSettings) => void = () => {},
  ) {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    if (radius !== undefined) settings.display.tagChipRadius = radius;
    tweak(settings);
    const app = obsidian.App.createMock();
    const trigger = vi.spyOn(app.workspace, "trigger");
    const saveSettings = vi.fn(async () => {});
    const plugin = {
      app,
      settings,
      saveSettings,
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, vi.fn());
    return { containerEl, settings, trigger, saveSettings };
  }

  const radios = (containerEl: HTMLElement) =>
    Array.from(
      containerEl.querySelectorAll<HTMLButtonElement>("[role='radio']"),
    );
  const press = (el: HTMLElement, key: string) =>
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  const CHANGED = "rss-dashboard:tag-chip-radius-changed";

  it("shows Rectangle, Squircle and Pill previews in one radiogroup with Pill checked by default", () => {
    const { containerEl } = render();

    const group = containerEl.querySelector("[role='radiogroup']");
    expect(group?.getAttribute("aria-label")).toBe("Tag shape");
    expect(
      radios(containerEl).map((el) =>
        el.querySelector(".rss-dashboard-tag-badge")?.textContent?.trim(),
      ),
    ).toEqual(["Rectangle", "Squircle", "Pill"]);
    expect(
      radios(containerEl).map((el) => el.getAttribute("aria-checked")),
    ).toEqual(["false", "false", "true"]);
    // Each preview chip carries its own radius through the shared variable.
    expect(
      radios(containerEl).map((el) =>
        el.style.getPropertyValue("--rss-dashboard-tag-chip-radius"),
      ),
    ).toEqual(["0px", "6px", "999px"]);
  });

  it("is rendered after Reset tag names and before the tag list heading", () => {
    const { containerEl } = render();
    const names = Array.from(
      containerEl.querySelectorAll(".setting-item-name"),
    ).map((el) => el.textContent?.trim());

    expect(names.indexOf("Tag shape")).toBeGreaterThan(
      names.indexOf("Reset tag names"),
    );
    expect(names.indexOf("Tag shape")).toBeLessThan(
      names.indexOf("Tag appearance defaults"),
    );
  });

  it("marks the selected preview with a check indicator in addition to its accent outline", () => {
    const { containerEl } = render("6px");

    const [rectangle, squircle] = radios(containerEl);
    expect(squircle?.getAttribute("aria-checked")).toBe("true");
    expect(squircle?.classList.contains("is-selected")).toBe(true);
    expect(rectangle?.classList.contains("is-selected")).toBe(false);
    expect(
      squircle?.querySelector(".rss-dashboard-tag-shape-check")?.textContent,
    ).toBe("✓");
  });

  it("applies a clicked preset immediately, saves it, and announces the change", () => {
    const { containerEl, settings, trigger, saveSettings } = render();

    radios(containerEl)[0]?.click();

    expect(settings.display.tagChipRadius).toBe("0px");
    expect(trigger).toHaveBeenCalledWith(CHANGED);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(radios(containerEl)[0]?.getAttribute("aria-checked")).toBe("true");
    expect(radios(containerEl)[2]?.getAttribute("aria-checked")).toBe("false");
  });

  it("keeps one roving tab stop on the checked preset and moves selection with the arrow keys", () => {
    const { containerEl, settings } = render();
    const [rectangle, squircle, pill] = radios(containerEl) as unknown as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect([rectangle, squircle, pill].map((el) => el.tabIndex)).toEqual([
      -1, -1, 0,
    ]);

    press(pill, "ArrowRight");
    expect(settings.display.tagChipRadius).toBe("0px");
    expect(rectangle.tabIndex).toBe(0);
    expect(pill.tabIndex).toBe(-1);

    press(rectangle, "ArrowDown");
    expect(settings.display.tagChipRadius).toBe("6px");

    press(squircle, "ArrowLeft");
    expect(settings.display.tagChipRadius).toBe("0px");

    press(rectangle, "End");
    expect(settings.display.tagChipRadius).toBe("999px");

    press(pill, "Home");
    expect(settings.display.tagChipRadius).toBe("0px");
  });

  it.each(["Enter", " "])("selects the focused preset with %j", (key) => {
    const { containerEl, settings } = render();

    press(radios(containerEl)[1] as HTMLElement, key);

    expect(settings.display.tagChipRadius).toBe("6px");
  });

  it("has no custom radius field and no reset button", () => {
    const { containerEl } = render();

    expect(
      containerEl.querySelector(".rss-dashboard-tag-shape input"),
    ).toBeNull();
    expect(
      containerEl.querySelector(".rss-dashboard-tag-shape-custom"),
    ).toBeNull();
    expect(containerEl.textContent).not.toContain("Custom radius");
    expect(
      Array.from(containerEl.querySelectorAll("button")).some((el) =>
        el.textContent?.startsWith("Reset to"),
      ),
    ).toBe(false);
  });

  it("ships no styles for the removed custom radius field", () => {
    const css = settingsStylesheet.toString();

    for (const removed of [
      "tag-shape-custom",
      "tag-shape-input",
      "tag-shape-error",
      "tag-shape-reset",
    ]) {
      expect(css).not.toContain(removed);
    }
  });

  it("shows no preset checked for a stored custom radius, keeping the first reachable by Tab", () => {
    const { containerEl, settings } = render("12px 4px / 2px");

    expect(
      radios(containerEl).map((el) => el.getAttribute("aria-checked")),
    ).toEqual(["false", "false", "false"]);
    expect(radios(containerEl)[0]?.tabIndex).toBe(0);
    expect(settings.display.tagChipRadius).toBe("12px 4px / 2px");

    radios(containerEl)[2]?.click();
    expect(settings.display.tagChipRadius).toBe("999px");
    expect(radios(containerEl)[2]?.getAttribute("aria-checked")).toBe("true");
  });

  it("starts from Pill when the stored radius is unusable", () => {
    const { containerEl } = render("broken");

    expect(radios(containerEl)[2]?.getAttribute("aria-checked")).toBe("true");
  });

  it("draws every shape preview in the global default tag colors", () => {
    const { containerEl, settings } = render();

    const chips = Array.from(
      containerEl.querySelectorAll<HTMLElement>(
        ".rss-dashboard-tag-shape-chip",
      ),
    );
    expect(chips).toHaveLength(3);
    for (const chip of chips) {
      expect(chip.style.getPropertyValue("--tag-color")).toBe(
        settings.defaultTagColor,
      );
      expect(chip.style.getPropertyValue("--tag-text-color")).toBe(
        settings.defaultTagTextColor,
      );
    }
  });

  it("uses the stored default colors when they differ from the built-in ones", () => {
    const { containerEl } = render(undefined, (s) => {
      s.defaultTagColor = "#123456";
      s.defaultTagTextColor = "#abcdef";
    });

    const chip = containerEl.querySelector<HTMLElement>(
      ".rss-dashboard-tag-shape-chip",
    )!;
    expect(chip.style.getPropertyValue("--tag-color")).toBe("#123456");
    expect(chip.style.getPropertyValue("--tag-text-color")).toBe("#abcdef");
  });
});

describe("renderTagsSettingsTab() tag appearance defaults", () => {
  const render = (
    overrides: (settings: RssDashboardSettings) => void = () => {},
  ) => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    overrides(settings);
    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;
    renderTagsSettingsTab(containerEl, plugin, vi.fn());
    return { containerEl, settings, plugin };
  };

  const backgroundPicker = (containerEl: HTMLElement) =>
    containerEl.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-default-background",
    )!;
  const textPicker = (containerEl: HTMLElement) =>
    containerEl.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-default-text",
    )!;
  const pick = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const applyCard = (containerEl: HTMLElement) =>
    getSettingByName(containerEl, "Apply tag defaults");
  const previewCard = (containerEl: HTMLElement) =>
    getSettingByName(containerEl, "Preview");
  const defaultsPreviewChip = (containerEl: HTMLElement) =>
    previewCard(containerEl).querySelector<HTMLElement>(
      ".rss-dashboard-tag-defaults-preview",
    )!;
  const applyButton = (containerEl: HTMLElement) =>
    Array.from(applyCard(containerEl).querySelectorAll("button")).find(
      (button) => button.textContent === "Apply",
    )!;
  const stubApplyChoice = (choice: "cancel" | "all" | "future") => {
    vi.spyOn(ApplyTagDefaultsModal.prototype, "open").mockImplementation(
      () => {},
    );
    vi.spyOn(ApplyTagDefaultsModal.prototype, "waitForClose").mockResolvedValue(
      choice,
    );
  };
  const clickApply = async (containerEl: HTMLElement) => {
    applyButton(containerEl).click();
    await flushPromises();
  };

  it("keeps editing a draft: pickers change nothing saved and recolor no tag", async () => {
    const { containerEl, settings, plugin } = render((s) => {
      s.availableTags = [{ name: "Plain" }];
    });
    const listChip = containerEl.querySelector<HTMLElement>(
      ".rss-dashboard-settings-tag-chip",
    )!;
    const chipBefore = listChip.style.getPropertyValue("--tag-color");

    pick(backgroundPicker(containerEl), "#123456");
    pick(textPicker(containerEl), "#abcdef");
    await flushPromises();

    expect(settings.defaultTagColor).toBe(DEFAULT_SETTINGS.defaultTagColor);
    expect(settings.defaultTagTextColor).toBe(
      DEFAULT_SETTINGS.defaultTagTextColor,
    );
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(plugin.refreshOpenTagColorViews).not.toHaveBeenCalled();
    expect(listChip.style.getPropertyValue("--tag-color")).toBe(chipBefore);
  });

  it("previews the draft only on the chip in the Preview card", () => {
    const { containerEl } = render();
    const chip = defaultsPreviewChip(containerEl);
    expect(chip.textContent).toBe("Preview");

    pick(backgroundPicker(containerEl), "#123456");
    pick(textPicker(containerEl), "#abcdef");

    expect(chip.style.getPropertyValue("--tag-color")).toBe("#123456");
    expect(chip.style.getPropertyValue("--tag-text-color")).toBe("#abcdef");
  });

  it("enables Apply only while the draft differs from the saved defaults", () => {
    const { containerEl } = render();
    expect(applyButton(containerEl).disabled).toBe(true);

    pick(backgroundPicker(containerEl), "#123456");
    expect(applyButton(containerEl).disabled).toBe(false);

    pick(
      backgroundPicker(containerEl),
      DEFAULT_SETTINGS.defaultTagColor!.toUpperCase(),
    );
    expect(applyButton(containerEl).disabled).toBe(true);
  });

  it("puts the Preview card, then the Apply card, directly before 'Reset all tags to defaults'", () => {
    const { containerEl } = render();
    const names = Array.from(
      containerEl.querySelectorAll(".setting-item-name"),
    ).map((el) => el.textContent?.trim());

    const preview = names.indexOf("Preview");
    expect(preview).toBeGreaterThan(names.indexOf("Text"));
    expect(names[preview + 1]).toBe("Apply tag defaults");
    expect(names[preview + 2]).toBe("Reset all tags to defaults");
  });

  it("leaves everything alone when the Apply dialog is cancelled", async () => {
    const { containerEl, settings, plugin } = render();
    stubApplyChoice("cancel");
    pick(backgroundPicker(containerEl), "#123456");

    await clickApply(containerEl);

    expect(settings.defaultTagColor).toBe(DEFAULT_SETTINGS.defaultTagColor);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(applyButton(containerEl).disabled).toBe(false);
  });

  it("saves both defaults and pins nothing when applying to all tags", async () => {
    const { containerEl, settings, plugin } = render((s) => {
      s.availableTags = [{ name: "Plain" }, { name: "Own", color: "#111111" }];
    });
    stubApplyChoice("all");
    pick(backgroundPicker(containerEl), "#123456");
    pick(textPicker(containerEl), "#abcdef");

    await clickApply(containerEl);

    expect(settings.defaultTagColor).toBe("#123456");
    expect(settings.defaultTagTextColor).toBe("#abcdef");
    expect(settings.availableTags).toEqual([
      { name: "Plain" },
      { name: "Own", color: "#111111" },
    ]);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.refreshOpenTagColorViews).toHaveBeenCalledTimes(1);
    expect(applyButton(containerEl).disabled).toBe(true);
  });

  it("pins existing inheriting tags to the old defaults when applying to future tags only", async () => {
    const oldBackground = DEFAULT_SETTINGS.defaultTagColor;
    const oldText = DEFAULT_SETTINGS.defaultTagTextColor;
    const { containerEl, settings, plugin } = render((s) => {
      s.availableTags = [
        { name: "Plain" },
        { name: "Own", color: "#111111" },
        { name: "OwnText", textColor: "#222222" },
      ];
      s.feeds = [
        {
          title: "F",
          url: "https://f.test",
          items: [{ title: "A", tags: [{ name: "Plain" }] }],
        },
      ] as unknown as RssDashboardSettings["feeds"];
      s.folders = [
        {
          name: "Tech",
          subfolders: [
            {
              name: "Deep",
              subfolders: [],
              autoTags: [{ name: "Plain" }],
            },
          ],
          autoTags: [{ name: "Plain" }],
        },
      ] as unknown as RssDashboardSettings["folders"];
    });
    stubApplyChoice("future");
    pick(backgroundPicker(containerEl), "#123456");
    pick(textPicker(containerEl), "#abcdef");

    await clickApply(containerEl);

    expect(settings.availableTags).toEqual([
      { name: "Plain", color: oldBackground, textColor: oldText },
      { name: "Own", color: "#111111", textColor: oldText },
      { name: "OwnText", color: oldBackground, textColor: "#222222" },
    ]);
    expect(settings.feeds[0]?.items[0]?.tags).toEqual([
      { name: "Plain", color: oldBackground, textColor: oldText },
    ]);
    expect(settings.folders[0]?.autoTags).toEqual([
      { name: "Plain", color: oldBackground, textColor: oldText },
    ]);
    expect(settings.folders[0]?.subfolders[0]?.autoTags).toEqual([
      { name: "Plain", color: oldBackground, textColor: oldText },
    ]);
    expect(settings.defaultTagColor).toBe("#123456");
    expect(settings.defaultTagTextColor).toBe("#abcdef");
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("pins only the property whose default is changing", async () => {
    const oldText = DEFAULT_SETTINGS.defaultTagTextColor;
    const { containerEl, settings } = render((s) => {
      s.availableTags = [{ name: "Plain" }];
    });
    stubApplyChoice("future");
    pick(textPicker(containerEl), "#abcdef");

    await clickApply(containerEl);

    expect(settings.availableTags).toEqual([
      { name: "Plain", textColor: oldText },
    ]);
    expect(settings.defaultTagColor).toBe(DEFAULT_SETTINGS.defaultTagColor);
    expect(settings.defaultTagTextColor).toBe("#abcdef");
  });

  it("starts Add new tag pickers from the applied defaults, not the draft", async () => {
    const { containerEl } = render();
    const addBackground = getSettingByName(
      containerEl,
      "Tag color",
    ).querySelector<HTMLInputElement>("input[type='color']")!;
    const before = addBackground.value;
    stubApplyChoice("all");

    pick(backgroundPicker(containerEl), "#123456");
    expect(addBackground.value).toBe(before);

    await clickApply(containerEl);
    expect(addBackground.value).toBe("#123456");
  });

  it("changes only the selected draft color when choosing a palette preset", async () => {
    const { containerEl, settings, plugin } = render();
    const backgroundRow =
      backgroundPicker(containerEl).closest(".setting-item")!;
    const chip = defaultsPreviewChip(containerEl);

    backgroundRow
      .querySelector<HTMLButtonElement>(
        ".rss-dashboard-tag-color-palette-control-color-trigger",
      )!
      .click();
    Array.from(containerEl.querySelectorAll<HTMLButtonElement>("[role=option]"))
      .find((option) => option.getAttribute("aria-label") === "Red #FF383C")
      ?.click();
    await flushPromises();

    expect(chip.style.getPropertyValue("--tag-color")).toBe("#ff383c");
    expect(chip.style.getPropertyValue("--tag-text-color")).toBe(
      DEFAULT_SETTINGS.defaultTagTextColor,
    );
    expect(settings.defaultTagColor).toBe(DEFAULT_SETTINGS.defaultTagColor);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });

  describe("Randomize buttons", () => {
    const dice = (row: Element) =>
      row.querySelector<HTMLButtonElement>(
        ".rss-dashboard-tag-color-randomize",
      )!;
    const rowFor = (containerEl: HTMLElement, name: string) =>
      getSettingByName(containerEl, name);

    it("puts one named dice beside the picker in all four color rows", () => {
      const { containerEl } = render();

      for (const name of [
        "Background",
        "Text",
        "Tag color",
        "Tag text color",
      ]) {
        const button = dice(rowFor(containerEl, name));
        expect(button.getAttribute("aria-label")).toBe("Randomize");
        expect(
          button.previousElementSibling?.matches('input[type="color"]'),
        ).toBe(true);
      }
    });

    it("rolls a color into the draft only, with no readability check", async () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const { containerEl, settings, plugin } = render();
      const chip = defaultsPreviewChip(containerEl);

      dice(rowFor(containerEl, "Background")).click();
      expect(backgroundPicker(containerEl).value).toBe("#808080");
      expect(chip.style.getPropertyValue("--tag-color")).toBe("#808080");

      dice(rowFor(containerEl, "Text")).click();
      expect(textPicker(containerEl).value).toBe("#808080");
      expect(chip.style.getPropertyValue("--tag-text-color")).toBe("#808080");

      expect(settings.defaultTagColor).toBe(DEFAULT_SETTINGS.defaultTagColor);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      expect(applyButton(containerEl).disabled).toBe(false);
    });

    it("rolls the new tag colors and updates its preview", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.25);
      const { containerEl } = render();
      const colorInput = (name: string) =>
        getSettingByName(containerEl, name).querySelector<HTMLInputElement>(
          'input[type="color"]',
        )!;
      const preview = getSettingByName(
        containerEl,
        "Tag name",
      ).querySelector<HTMLElement>(".rss-dashboard-tag-new-preview")!;

      dice(rowFor(containerEl, "Tag color")).click();
      dice(rowFor(containerEl, "Tag text color")).click();

      expect(colorInput("Tag color").value).toBe("#404040");
      expect(colorInput("Tag text color").value).toBe("#404040");
      expect(preview.style.getPropertyValue("--tag-color")).toBe("#404040");
      expect(preview.style.getPropertyValue("--tag-text-color")).toBe(
        "#404040",
      );
    });
  });

  describe("tag shape previews", () => {
    const shapeChip = (containerEl: HTMLElement) =>
      containerEl.querySelector<HTMLElement>(".rss-dashboard-tag-shape-chip")!;

    it("keep the applied colors while a draft is being edited", () => {
      const { containerEl, settings } = render();

      pick(backgroundPicker(containerEl), "#123456");
      pick(textPicker(containerEl), "#abcdef");

      expect(shapeChip(containerEl).style.getPropertyValue("--tag-color")).toBe(
        settings.defaultTagColor,
      );
    });

    it.each(["all", "future"] as const)(
      "pick up the new defaults once they are applied to %s tags",
      async (choice) => {
        const { containerEl } = render();
        stubApplyChoice(choice);
        pick(backgroundPicker(containerEl), "#123456");
        pick(textPicker(containerEl), "#abcdef");

        await clickApply(containerEl);

        const chips = Array.from(
          containerEl.querySelectorAll<HTMLElement>(
            ".rss-dashboard-tag-shape-chip",
          ),
        );
        expect(chips).toHaveLength(3);
        for (const chip of chips) {
          expect(chip.style.getPropertyValue("--tag-color")).toBe("#123456");
          expect(chip.style.getPropertyValue("--tag-text-color")).toBe(
            "#abcdef",
          );
        }
      },
    );

    it("keep the old colors when the Apply dialog is cancelled", async () => {
      const { containerEl, settings } = render();
      stubApplyChoice("cancel");
      pick(backgroundPicker(containerEl), "#123456");

      await clickApply(containerEl);

      expect(shapeChip(containerEl).style.getPropertyValue("--tag-color")).toBe(
        settings.defaultTagColor,
      );
    });
  });

  describe("Add new tag preview", () => {
    const nameField = (containerEl: HTMLElement) =>
      getSettingByName(containerEl, "Tag name").querySelector<HTMLInputElement>(
        'input[type="text"]',
      )!;
    const newPreview = (containerEl: HTMLElement) =>
      getSettingByName(containerEl, "Tag name").querySelector<HTMLElement>(
        ".rss-dashboard-tag-new-preview",
      )!;
    const newColorInput = (containerEl: HTMLElement, name: string) =>
      getSettingByName(containerEl, name).querySelector<HTMLInputElement>(
        "input[type='color']",
      )!;

    it("sits between the name input and the Add tag button", () => {
      const { containerEl } = render();

      const control = getSettingByName(containerEl, "Tag name").querySelector(
        ".setting-item-control",
      )!;
      const order = Array.from(control.children).map((el) =>
        el.matches(".rss-input-clear")
          ? "input"
          : el.classList.contains("rss-dashboard-tag-new-preview")
            ? "preview"
            : (el.textContent ?? ""),
      );
      expect(order).toEqual(["input", "preview", "Add tag"]);
    });

    it("reads Preview while the name is empty and follows what is typed", () => {
      const { containerEl } = render();
      expect(newPreview(containerEl).textContent).toBe("Preview");

      const field = nameField(containerEl);
      field.value = "  Later ";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      expect(newPreview(containerEl).textContent).toBe("Later");

      field.value = "";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      expect(newPreview(containerEl).textContent).toBe("Preview");
    });

    it("shows the colors chosen for the new tag", () => {
      const { containerEl } = render();

      pick(newColorInput(containerEl, "Tag color"), "#445566");
      pick(newColorInput(containerEl, "Tag text color"), "#fedcba");

      const chip = newPreview(containerEl);
      expect(chip.style.getPropertyValue("--tag-color")).toBe("#445566");
      expect(chip.style.getPropertyValue("--tag-text-color")).toBe("#fedcba");
    });

    it("is not overridden by an existing tag that has the same name", () => {
      const { containerEl } = render((s) => {
        s.availableTags = [{ name: "News", color: "#ff0000" }];
      });

      const field = nameField(containerEl);
      field.value = "News";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      pick(newColorInput(containerEl, "Tag color"), "#445566");

      expect(
        newPreview(containerEl).style.getPropertyValue("--tag-color"),
      ).toBe("#445566");
    });

    it("follows the defaults once they are applied", async () => {
      const { containerEl } = render();
      stubApplyChoice("all");
      pick(backgroundPicker(containerEl), "#123456");

      await clickApply(containerEl);

      expect(
        newPreview(containerEl).style.getPropertyValue("--tag-color"),
      ).toBe("#123456");
    });
  });

  describe("layout", () => {
    const renderEl = () => render().containerEl;

    it("keeps the defaults Preview chip and its description in their own card above Apply", () => {
      const containerEl = renderEl();

      expect(
        containerEl.querySelector(".rss-dashboard-tag-default-preview"),
      ).toBeNull();
      const card = getSettingByName(containerEl, "Preview");
      expect(
        card.querySelector(".rss-dashboard-tag-defaults-preview")?.textContent,
      ).toBe("Preview");
      expect(card.querySelector(".setting-item-description")?.textContent).toBe(
        "Preview the new defaults here. Nothing changes until you apply.",
      );
      const apply = getSettingByName(containerEl, "Apply tag defaults");
      expect(apply.querySelector(".rss-dashboard-tag-badge")).toBeNull();
      expect(
        apply.querySelector(".setting-item-description")?.textContent,
      ).toBe("Choose whether existing tags change too, or only new ones.");
    });

    it("no longer has a 'Tags' heading above the defaults", () => {
      const containerEl = renderEl();
      const names = Array.from(
        containerEl.querySelectorAll(".setting-item-name"),
      ).map((el) => el.textContent?.trim());

      expect(names).not.toContain("Tags");
      expect(names).toContain("Tag appearance defaults");
    });

    it("drops the Palette and Color captions from every Background and Text row", () => {
      const containerEl = renderEl();

      const rows = containerEl.querySelectorAll(
        ".rss-dashboard-tag-color-setting",
      );
      expect(rows).toHaveLength(4);
      for (const row of Array.from(rows)) {
        expect(
          row.querySelector(".rss-dashboard-tag-color-palette-control"),
        ).not.toBeNull();
        expect(
          row.querySelector(".rss-dashboard-tag-color-palette-control-label"),
        ).toBeNull();
        expect(row.querySelector("select")?.getAttribute("aria-label")).toMatch(
          /^Palette for /,
        );
      }
    });

    it("puts the tag name, its field and Add tag on the last row, below the colors", () => {
      const containerEl = renderEl();

      const rows = Array.from(
        containerEl.querySelectorAll(".setting-item"),
      ).slice(-3);
      expect(
        rows.map((row) => row.querySelector(".setting-item-name")?.textContent),
      ).toEqual(["Tag color", "Tag text color", "Tag name"]);
      const last = rows[2];
      expect(last.querySelector('input[type="text"]')).not.toBeNull();
      expect(
        Array.from(last.querySelectorAll("button")).some(
          (button) => button.textContent === "Add tag",
        ),
      ).toBe(true);
      expect(
        Array.from(containerEl.querySelectorAll("button")).filter(
          (button) => button.textContent === "Add tag",
        ),
      ).toHaveLength(1);
    });

    it("shows the up/down chevron on every Palette select", () => {
      const containerEl = renderEl();

      const selects = containerEl.querySelectorAll(
        ".rss-dashboard-tag-color-palette-control select",
      );
      expect(selects.length).toBeGreaterThan(0);
      for (const select of Array.from(selects)) {
        const chevron = select.parentElement?.querySelector(
          ".rss-dashboard-tag-color-palette-control-select-chevron",
        );
        expect(chevron?.getAttribute("aria-hidden")).toBe("true");
        expect(chevron?.querySelector("svg")).not.toBeNull();
      }
    });
  });

  describe("reset confirmation preview", () => {
    const openReset = async (tags: Tag[], defaults = {}) => {
      const containerEl = document.body.appendChild(createDiv());
      const settings = cloneSettings();
      settings.availableTags = tags;
      Object.assign(settings, defaults);
      const plugin = {
        app: obsidian.App.createMock(),
        settings,
        saveSettings: vi.fn(async () => {}),
        refreshOpenTagColorViews: vi.fn(async () => {}),
      } as unknown as RssDashboardPlugin;
      let content: HTMLElement | null = null;
      vi.spyOn(ConfirmActionModal.prototype, "open").mockImplementation(
        function (this: ConfirmActionModal) {
          this.onOpen();
          content = this.contentEl;
        },
      );
      vi.spyOn(ConfirmActionModal.prototype, "waitForClose").mockResolvedValue(
        false,
      );
      renderTagsSettingsTab(containerEl, plugin, vi.fn());
      Array.from(containerEl.querySelectorAll("button"))
        .find((button) => button.textContent === "Reset all tags to defaults")!
        .click();
      await flushPromises();
      return (content as HTMLElement | null)!.querySelector<HTMLElement>(
        ".rss-dashboard-confirm-preview",
      );
    };

    it("lists each overridden tag as it is now and as it will look after the reset", async () => {
      const preview = await openReset(
        [
          { name: "One", color: "#111111", textColor: "#aaaaaa" },
          { name: "Plain" },
        ],
        { defaultTagColor: "#123456", defaultTagTextColor: "#abcdef" },
      );

      const rows = preview!.querySelectorAll<HTMLElement>(
        ".rss-dashboard-confirm-preview-row",
      );
      expect(rows).toHaveLength(1);
      const [before, after] = Array.from(
        rows[0].querySelectorAll<HTMLElement>(".rss-dashboard-tag-badge"),
      );
      expect(before?.textContent).toBe("One");
      expect(before?.style.getPropertyValue("--tag-color")).toBe("#111111");
      expect(after?.textContent).toBe("One");
      expect(after?.style.getPropertyValue("--tag-color")).toBe("#123456");
      expect(after?.style.getPropertyValue("--tag-text-color")).toBe("#abcdef");
    });

    it("caps a long list and says how many are not shown", async () => {
      const tags = Array.from({ length: 11 }, (_, index) => ({
        name: `Tag ${index}`,
        color: "#111111",
      }));

      const preview = await openReset(tags);

      expect(
        preview!.querySelectorAll(".rss-dashboard-confirm-preview-row"),
      ).toHaveLength(8);
      expect(
        preview!.querySelector(".rss-dashboard-confirm-preview-more")
          ?.textContent,
      ).toBe("and 3 more");
    });

    it("says nothing will change when no tag has custom colors", async () => {
      const preview = await openReset([{ name: "Plain" }]);

      expect(
        preview!.querySelector(".rss-dashboard-confirm-preview-row"),
      ).toBeNull();
      expect(preview!.textContent).toContain("nothing will change");
    });
  });

  it("clears every override only when reset is confirmed", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [
      { name: "One", color: "#111111", textColor: "#aaaaaa" },
      { name: "Two", color: "#222222", textColor: "#bbbbbb" },
    ];
    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;
    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    const resetButton = Array.from(
      containerEl.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Reset all tags to defaults")!;
    stubConfirm(false);
    resetButton.click();
    await flushPromises();
    expect(settings.availableTags[0]).toEqual({
      name: "One",
      color: "#111111",
      textColor: "#aaaaaa",
    });
    expect(plugin.saveSettings).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    stubConfirm(true);
    resetButton.click();
    await flushPromises();
    expect(settings.availableTags).toEqual([{ name: "One" }, { name: "Two" }]);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.refreshOpenTagColorViews).toHaveBeenCalledTimes(1);
  });
});
