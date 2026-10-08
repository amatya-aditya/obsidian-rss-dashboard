import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import {
  type RssDashboardSettings,
  type Feed,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { renderTagsSettingsTab } from "../../../src/settings/tabs/tags-settings-tab";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type RssDashboardPlugin from "../../../main";

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

  it("persists color changes, updates applied tags, and refreshes open tag views", async () => {
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

    renderTagsSettingsTab(containerEl, plugin, vi.fn());

    const tagSetting = getSettingByName(containerEl, "tag1");
    const picker = tagSetting.querySelector(
      'input[type="color"]',
    ) as HTMLInputElement;
    picker.value = "#ff0000";
    picker.dispatchEvent(new Event("input"));
    await flushPromises();

    expect(plugin.settings.availableTags[0].color).toBe("#ff0000");
    expect(plugin.settings.feeds[0].items[0].tags?.[0].color).toBe("#ff0000");
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(plugin.refreshOpenTagColorViews)).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledWith("rss-dashboard:tags-mutated");
  });

  it("deletes an existing tag and refreshes", async () => {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    settings.availableTags = [{ name: "tag1", color: "#000000" }];
    const onRefresh = vi.fn();

    const plugin = {
      app: obsidian.App.createMock(),
      settings,
      saveSettings: vi.fn(async () => {}),
      refreshOpenTagColorViews: vi.fn(async () => {}),
    } as unknown as RssDashboardPlugin;

    renderTagsSettingsTab(containerEl, plugin, onRefresh);

    const deleteBtn = containerEl.querySelector(
      'button[data-icon="trash"]',
    ) as HTMLButtonElement;
    deleteBtn.click();
    await flushPromises();

    expect(plugin.settings.availableTags).toHaveLength(0);
    expect(vi.mocked(plugin.saveSettings)).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
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
      renderTagsSettingsTab(containerEl, plugin, onRefresh);
      return { containerEl, settings, plugin, onRefresh, trigger };
    }

    function clickDelete(containerEl: HTMLElement, tagName: string): void {
      const row = getSettingByName(containerEl, tagName);
      const button = row.querySelector<HTMLElement>("button");
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
  });
});

describe("renderTagsSettingsTab() tag shape control", () => {
  function render(radius?: string) {
    const containerEl = document.body.appendChild(createDiv());
    const settings = cloneSettings();
    if (radius !== undefined) settings.display.tagChipRadius = radius;
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
  const customInput = (containerEl: HTMLElement) =>
    containerEl.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-shape-input",
    ) as HTMLInputElement;
  const sampleRadius = (containerEl: HTMLElement) =>
    containerEl
      .querySelector<HTMLElement>(".rss-dashboard-tag-shape-sample")
      ?.style.getPropertyValue("--rss-dashboard-tag-chip-radius");
  const press = (el: HTMLElement, key: string) =>
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
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
    ).toEqual(["0px", "10px", "999px"]);
  });

  it("is rendered after Reset tag names and before the tag list heading", () => {
    const { containerEl } = render();
    const names = Array.from(
      containerEl.querySelectorAll(".setting-item-name"),
    ).map((el) => el.textContent?.trim());

    expect(names.indexOf("Tag shape")).toBeGreaterThan(
      names.indexOf("Reset tag names"),
    );
    expect(names.indexOf("Tag shape")).toBeLessThan(names.indexOf("Tags"));
  });

  it("marks the selected preview with a check indicator in addition to its accent outline", () => {
    const { containerEl } = render("10px");

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
    expect(customInput(containerEl).value).toBe("0px");
  });

  it("keeps one roving tab stop on the checked preset and moves selection with the arrow keys", () => {
    const { containerEl, settings } = render();
    const [rectangle, squircle, pill] = radios(containerEl) as [
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
    expect(settings.display.tagChipRadius).toBe("10px");

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

    expect(settings.display.tagChipRadius).toBe("10px");
  });

  it("applies, saves and previews a valid custom radius", () => {
    const { containerEl, settings, trigger, saveSettings } = render();
    const input = customInput(containerEl);

    type(input, "12px 4px / 2px");

    expect(settings.display.tagChipRadius).toBe("12px 4px / 2px");
    expect(trigger).toHaveBeenCalledWith(CHANGED);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(sampleRadius(containerEl)).toBe("12px 4px / 2px");
    expect(
      radios(containerEl).map((el) => el.getAttribute("aria-checked")),
    ).toEqual(["false", "false", "false"]);
    // With no preset checked the first radio stays reachable by Tab.
    expect(radios(containerEl)[0]?.tabIndex).toBe(0);
  });

  it("flags invalid input accessibly and keeps the last valid radius", () => {
    const { containerEl, settings, trigger, saveSettings } = render("10px");
    const input = customInput(containerEl);

    type(input, "red");

    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby") as string;
    const message = containerEl.querySelector(`#${describedBy}`);
    expect(message?.textContent).toContain("non-negative");
    expect(settings.display.tagChipRadius).toBe("10px");
    expect(trigger).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
    expect(sampleRadius(containerEl)).toBe("10px");

    type(input, "-4px");
    expect(settings.display.tagChipRadius).toBe("10px");

    type(input, "8px");
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(message?.textContent).toBe("");
    expect(settings.display.tagChipRadius).toBe("8px");
  });

  it("selects the matching preset when a custom value equals one", () => {
    const { containerEl, settings } = render();

    type(customInput(containerEl), "0PX");

    expect(settings.display.tagChipRadius).toBe("0px");
    expect(radios(containerEl)[0]?.getAttribute("aria-checked")).toBe("true");
  });

  it("restores Pill and clears an error from the reset button", () => {
    const { containerEl, settings } = render("0px");
    const input = customInput(containerEl);
    type(input, "nope");

    const reset = Array.from(
      containerEl.querySelectorAll<HTMLButtonElement>("button"),
    ).find((el) => el.textContent === "Reset to pill");
    reset?.click();

    expect(settings.display.tagChipRadius).toBe("999px");
    expect(input.value).toBe("999px");
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(radios(containerEl)[2]?.getAttribute("aria-checked")).toBe("true");
  });

  it("starts from Pill when the stored radius is unusable", () => {
    const { containerEl } = render("broken");

    expect(radios(containerEl)[2]?.getAttribute("aria-checked")).toBe("true");
    expect(customInput(containerEl).value).toBe("999px");
  });
});
