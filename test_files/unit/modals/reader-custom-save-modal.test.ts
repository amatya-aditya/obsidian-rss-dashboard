// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { App } from "obsidian";
import {
  ReaderCustomSaveModal,
  type ReaderCustomSaveModalContext,
} from "../../../src/modals/reader-custom-save-modal";
import { ConfirmTemplateReplacementModal } from "../../../src/settings/modals/settings-modals";

vi.mock("../../../src/components/folder-suggest", () => ({
  VaultFolderSuggest: class {
    constructor() {}
  },
}));

function createItem(): FeedItem {
  return {
    title: "Fixture article",
    link: "https://example.com/article",
    description: "Fixture article body",
    pubDate: "2026-08-07",
    guid: "fixture-article",
    feedTitle: "Example feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
  };
}

function createHarness(options?: {
  saveResult?: { path: string } | null;
  displayTitle?: string;
  savedTemplates?: RssDashboardSettings["articleSaving"]["savedTemplates"];
  feedTemplate?: string;
  globalDefaultTemplateId?: string;
}): {
  item: FeedItem;
  feed: Feed;
  settings: RssDashboardSettings;
  saveArticle: ReturnType<typeof vi.fn>;
  getFilenamePreview: ReturnType<typeof vi.fn>;
  onArticleSave: ReturnType<typeof vi.fn>;
  updateSavedLabel: ReturnType<typeof vi.fn>;
  open: () => void;
} {
  const item = createItem();
  const feed: Feed = {
    title: "Example feed",
    url: item.feedUrl,
    folder: "Feeds",
    items: [item],
    lastUpdated: 0,
    ...(options?.feedTemplate ? { customTemplate: options.feedTemplate } : {}),
  };
  const settings: RssDashboardSettings = {
    ...DEFAULT_SETTINGS,
    feeds: [feed],
    articleSaving: {
      ...DEFAULT_SETTINGS.articleSaving,
      defaultFolder: "Reading/Queue",
      defaultTemplate: "Default: {{title}}",
      savedTemplates: options?.savedTemplates ?? [],
      globalDefaultTemplateId: options?.globalDefaultTemplateId,
    },
  };
  const saveArticle = vi
    .fn()
    .mockResolvedValue(
      options?.saveResult === undefined
        ? { path: "Saved/Fixture article.md" }
        : options.saveResult,
    );
  const getFilenamePreview = vi.fn(
    (item: FeedItem, _folder: string, pattern?: string) =>
      `${pattern || item.title}.md`,
  );
  const onArticleSave = vi.fn();
  const updateSavedLabel = vi.fn();
  const context: ReaderCustomSaveModalContext = {
    getSettings: () => settings,
    getArticleSaver: () => ({ saveArticle, getFilenamePreview }) as never,
    displayTitle: options?.displayTitle,
    getSavedTemplateForArticle: () =>
      settings.articleSaving.savedTemplates.find(
        (template) => template.id === feed.customTemplate,
      ) ||
      settings.articleSaving.savedTemplates.find(
        (template) =>
          template.id === settings.articleSaving.globalDefaultTemplateId,
      ),
    saveSettings: vi.fn(async () => {}),
    buildReaderSaveMarkdown: () => "Reader body",
    onArticleSave,
    updateSavedLabel,
  };
  return {
    item,
    feed,
    settings,
    saveArticle,
    getFilenamePreview,
    onArticleSave,
    updateSavedLabel,
    open: () => new ReaderCustomSaveModal(new App(), item, context).open(),
  };
}

function modal(): HTMLElement {
  const element = activeDocument.querySelector<HTMLElement>(
    ".rss-dashboard-custom-save-modal",
  );
  if (!element) throw new Error("Custom save modal was not rendered");
  return element;
}

afterEach(() => {
  activeDocument.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("ReaderCustomSaveModal", () => {
  it("shows the default-template guidance above the buttons only for that template", () => {
    const harness = createHarness();
    harness.settings.articleSaving.defaultTemplate =
      DEFAULT_SETTINGS.articleSaving.defaultTemplate;
    harness.open();

    const root = modal();
    const hint = root.querySelector<HTMLElement>(
      ".rss-dashboard-custom-save-template-hint",
    );
    const template = root.querySelector<HTMLTextAreaElement>("textarea");

    expect(hint?.textContent).toBe(
      "The prefilled template is ready to use: its frontmatter properties already have the required indentation.",
    );
    expect(
      hint?.nextElementSibling?.classList.contains(
        "rss-dashboard-modal-buttons",
      ),
    ).toBe(true);

    if (!hint || !template)
      throw new Error("Template guidance was not rendered");
    template.value = "Custom: {{title}}";
    template.dispatchEvent(new Event("input"));
    expect(hint.hidden).toBe(true);

    template.value = DEFAULT_SETTINGS.articleSaving.defaultTemplate;
    template.dispatchEvent(new Event("input"));
    expect(hint.hidden).toBe(false);
  });

  it("renders the established fields, defaults, and saved template choices", () => {
    const harness = createHarness({
      savedTemplates: [
        { id: "one", name: "First", template: "First: {{content}}" },
        { id: "two", name: "Second", template: "Second: {{content}}" },
      ],
    });
    harness.open();
    const root = modal();

    expect(root.querySelector(".setting-item-name")?.textContent).toBe(
      "Save article",
    );
    expect(
      Array.from(root.querySelectorAll("label"), (label) => label.textContent),
    ).toEqual([
      "Save to folder:",
      "Saved template:",
      "Use template:",
      "Filename pattern override (optional):",
    ]);
    expect(root.querySelector<HTMLInputElement>("input")?.value).toBe(
      "Reading/Queue",
    );
    const folderInput = root.querySelector<HTMLInputElement>("input");
    const templateInput = root.querySelector<HTMLTextAreaElement>("textarea");
    expect(folderInput?.id).toBe("rss-dashboard-save-folder");
    expect(
      root.querySelector<HTMLLabelElement>(
        'label[for="rss-dashboard-save-folder"]',
      )?.textContent,
    ).toBe("Save to folder:");
    expect(templateInput?.id).toBe("rss-dashboard-save-template");
    expect(
      root.querySelector<HTMLLabelElement>(
        'label[for="rss-dashboard-save-template"]',
      )?.textContent,
    ).toBe("Use template:");
    expect(
      Array.from(root.querySelectorAll("select option"), (option) => [
        option.textContent,
        (option as HTMLOptionElement).value,
      ]),
    ).toEqual([
      ["Current template", ""],
      ["First", "one"],
      ["Second", "two"],
    ]);
    expect(root.querySelector("textarea")?.value).toBe("Default: {{title}}");
    expect(
      root.querySelector<HTMLElement>(
        ".rss-dashboard-custom-save-template-hint",
      )?.hidden,
    ).toBe(true);
    const actionButtons = Array.from(
      root.querySelectorAll<HTMLButtonElement>(
        ".rss-dashboard-modal-buttons button",
      ),
    );
    expect(actionButtons.map((button) => button.textContent)).toEqual([
      "Cancel",
      "Save",
      "Save as new template",
    ]);
    expect(actionButtons.map((button) => button.type)).toEqual([
      "button",
      "button",
      "button",
    ]);
    expect(actionButtons.map((button) => button.tabIndex)).toEqual([0, 0, 0]);
    expect(
      root.querySelector<HTMLSelectElement>("#rss-dashboard-saved-template")
        ?.tabIndex,
    ).toBe(0);
    expect(
      root
        .querySelector<HTMLElement>(".rss-dashboard-clear-icon")
        ?.getAttribute("aria-label"),
    ).toBe("Clear save folder");
    expect(
      actionButtons.map((button) => {
        const icon = button.querySelector<HTMLElement>(
          ".rss-dashboard-custom-save-button-icon",
        );
        return [icon?.dataset.icon, icon?.getAttribute("aria-hidden")];
      }),
    ).toEqual([
      ["x", "true"],
      ["save", "true"],
      ["file-plus", "true"],
    ]);
  });

  it("previews the selected pattern and supports a one-save override with reset", async () => {
    const harness = createHarness({
      globalDefaultTemplateId: "one",
      savedTemplates: [
        {
          id: "one",
          name: "One",
          template: "First: {{content}}",
          filenamePattern: "{{source}}-{{title}}",
        },
        {
          id: "two",
          name: "Two",
          template: "Second: {{content}}",
          filenamePattern: "{{dateShort}}-{{title}}",
        },
      ],
    });
    harness.open();
    const root = modal();
    const patternInput = root.querySelector<HTMLInputElement>(
      "#rss-dashboard-filename-pattern",
    );
    const select = root.querySelector<HTMLSelectElement>(
      "#rss-dashboard-saved-template",
    );
    const reset = root.querySelector<HTMLButtonElement>(
      ".rss-dashboard-use-template-filename-pattern-button",
    );
    if (!patternInput || !select || !reset)
      throw new Error("Filename override controls were not rendered");

    expect(
      root.querySelector<HTMLElement>(
        ".rss-dashboard-template-filename-pattern",
      )?.textContent,
    ).toContain("{{source}}-{{title}}");
    expect(
      root.querySelector<HTMLElement>(".rss-dashboard-filename-preview")
        ?.textContent,
    ).toContain("{{source}}-{{title}}.md");

    patternInput.value = "{{title}}-manual";
    patternInput.dispatchEvent(new Event("input", { bubbles: true }));
    select.value = "two";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(patternInput.value).toBe("{{title}}-manual");

    reset.click();
    expect(patternInput.value).toBe("");
    expect(
      root.querySelector<HTMLElement>(
        ".rss-dashboard-template-filename-pattern",
      )?.textContent,
    ).toContain("{{dateShort}}-{{title}}");
    root
      .querySelector<HTMLButtonElement>(
        ".rss-dashboard-custom-save-confirm-button",
      )
      ?.click();
    await vi.waitFor(() => expect(harness.saveArticle).toHaveBeenCalledOnce());
    expect(harness.saveArticle).toHaveBeenCalledWith(
      expect.anything(),
      "Reading/Queue",
      "Second: {{content}}",
      "Reader body",
      {
        id: "two",
        name: "Two",
        template: "Second: {{content}}",
        filenamePattern: "{{dateShort}}-{{title}}",
      },
    );
  });

  it("uses a typed override only for the current save", async () => {
    const originalPattern = "{{source}}-{{title}}";
    const harness = createHarness({
      feedTemplate: "one",
      savedTemplates: [
        {
          id: "one",
          name: "One",
          template: "Saved {{title}}",
          filenamePattern: originalPattern,
        },
      ],
    });
    harness.open();
    const root = modal();
    const patternInput = root.querySelector<HTMLInputElement>(
      "#rss-dashboard-filename-pattern",
    );
    if (!patternInput) throw new Error("Filename override was not rendered");
    patternInput.value = "  {{dateShort}} - {{title}}  ";
    patternInput.dispatchEvent(new Event("input", { bubbles: true }));
    root
      .querySelector<HTMLButtonElement>(
        ".rss-dashboard-custom-save-confirm-button",
      )
      ?.click();
    await vi.waitFor(() => expect(harness.saveArticle).toHaveBeenCalledOnce());
    expect(harness.saveArticle).toHaveBeenCalledWith(
      expect.anything(),
      "Reading/Queue",
      "Saved {{title}}",
      "Reader body",
      {
        id: "one",
        name: "One",
        template: "Saved {{title}}",
        filenamePattern: "{{dateShort}} - {{title}}",
      },
    );
    expect(
      harness.settings.articleSaving.savedTemplates[0]?.filenamePattern,
    ).toBe(originalPattern);
  });

  it("selects a feed assignment before the global default, and the global default otherwise", () => {
    const templates = [
      { id: "feed", name: "Feed", template: "Feed body" },
      { id: "global", name: "Global", template: "Global body" },
    ];
    const feedHarness = createHarness({
      savedTemplates: templates,
      feedTemplate: "feed",
      globalDefaultTemplateId: "global",
    });
    feedHarness.open();
    expect(
      modal().querySelector<HTMLSelectElement>("#rss-dashboard-saved-template")
        ?.value,
    ).toBe("feed");
    expect(modal().querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "Feed body",
    );
    activeDocument.body.replaceChildren();

    const globalHarness = createHarness({
      savedTemplates: templates,
      globalDefaultTemplateId: "global",
    });
    globalHarness.open();
    expect(
      modal().querySelector<HTMLSelectElement>("#rss-dashboard-saved-template")
        ?.value,
    ).toBe("global");
    expect(modal().querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "Global body",
    );
  });

  it("keeps an intentionally empty global-template body empty in the editor", () => {
    const harness = createHarness({
      savedTemplates: [{ id: "empty", name: "Empty", template: "" }],
      globalDefaultTemplateId: "empty",
    });

    harness.open();

    expect(
      modal().querySelector<HTMLSelectElement>("#rss-dashboard-saved-template")
        ?.value,
    ).toBe("empty");
    expect(modal().querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "",
    );
  });

  it("keeps the previous feed assignment when replacement is declined but saves with the selected template", async () => {
    const harness = createHarness({
      feedTemplate: "one",
      savedTemplates: [
        { id: "one", name: "Current", template: "Current body" },
        { id: "two", name: "Selected", template: "Selected body" },
      ],
    });
    vi.spyOn(
      ConfirmTemplateReplacementModal.prototype,
      "open",
    ).mockImplementation(() => {});
    vi.spyOn(
      ConfirmTemplateReplacementModal.prototype,
      "waitForClose",
    ).mockResolvedValue(false);
    harness.open();
    const root = modal();
    const select = root.querySelector<HTMLSelectElement>(
      "#rss-dashboard-saved-template",
    );
    if (!select) throw new Error("Template selector was not rendered");
    select.value = "two";
    select.dispatchEvent(new Event("change"));
    await Promise.resolve();

    root
      .querySelector<HTMLButtonElement>(
        ".rss-dashboard-custom-save-confirm-button",
      )
      ?.click();
    await vi.waitFor(() => expect(harness.saveArticle).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(harness.item.saved).toBe(true));

    expect(harness.saveArticle).toHaveBeenCalledWith(
      expect.anything(),
      "Reading/Queue",
      "Selected body",
      "Reader body",
      { id: "two", name: "Selected", template: "Selected body" },
    );
    expect(harness.feed.customTemplate).toBe("one");
  });

  it("clears the folder field by click or keyboard and closes when cancelled", () => {
    createHarness().open();
    const root = modal();
    const folder = root.querySelector<HTMLInputElement>("input");
    const clear = root.querySelector<HTMLElement>(".rss-dashboard-clear-icon");
    if (!folder || !clear) throw new Error("Folder controls were not rendered");
    clear.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(folder.value).toBe("");
    for (const key of ["Enter", " "]) {
      folder.value = "Again";
      clear.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      expect(folder.value).toBe("");
    }
    root
      .querySelector<HTMLButtonElement>(
        ".rss-dashboard-custom-save-cancel-button",
      )
      ?.click();
    expect(
      activeDocument.querySelector(".rss-dashboard-custom-save-modal"),
    ).toBeNull();
  });

  it("saves with trimmed fields and updates article state only after a successful save", async () => {
    const harness = createHarness({ displayTitle: "Display title" });
    harness.open();
    const root = modal();
    const folder = root.querySelector<HTMLInputElement>("input");
    const template = root.querySelector<HTMLTextAreaElement>("textarea");
    if (!folder || !template) throw new Error("Save fields were not rendered");
    folder.value = "  Articles  ";
    template.value = "  Custom {{title}}  ";
    root
      .querySelector<HTMLButtonElement>(
        ".rss-dashboard-custom-save-confirm-button",
      )
      ?.click();
    await vi.waitFor(() => expect(harness.saveArticle).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(harness.item.saved).toBe(true));

    expect(harness.saveArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        guid: "fixture-article",
        title: "Display title",
      }),
      "Articles",
      "Custom {{title}}",
      "Reader body",
    );
    expect(harness.item.saved).toBe(true);
    expect(harness.item.savedFilePath).toBe("Saved/Fixture article.md");
    expect(harness.onArticleSave).toHaveBeenCalledWith(harness.item);
    expect(harness.updateSavedLabel).toHaveBeenCalledWith(true);
    expect(harness.feed.customTemplate).toBeUndefined();
    await vi.waitFor(() =>
      expect(
        activeDocument.querySelector(".rss-dashboard-custom-save-modal"),
      ).toBeNull(),
    );
  });

  it("closes without marking the article saved when the saver returns no file", async () => {
    const harness = createHarness({ saveResult: null });
    harness.open();
    modal()
      .querySelector<HTMLButtonElement>(
        ".rss-dashboard-custom-save-confirm-button",
      )
      ?.click();
    await vi.waitFor(() => expect(harness.saveArticle).toHaveBeenCalledOnce());
    expect(harness.item.saved).toBeUndefined();
    expect(harness.onArticleSave).not.toHaveBeenCalled();
    expect(harness.updateSavedLabel).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(
        activeDocument.querySelector(".rss-dashboard-custom-save-modal"),
      ).toBeNull(),
    );
  });

  it("opens inside an Obsidian modal container", () => {
    createHarness().open();

    expect(modal().closest(".modal-container")).not.toBeNull();
  });

  it("keeps the dialog open until the save has finished, and does not save on Cancel", async () => {
    const harness = createHarness();
    let finishSave: (file: { path: string }) => void = () => {};
    harness.saveArticle.mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    harness.open();
    modal()
      .querySelector<HTMLButtonElement>(
        ".rss-dashboard-custom-save-confirm-button",
      )
      ?.click();
    await vi.waitFor(() => expect(harness.saveArticle).toHaveBeenCalledOnce());
    expect(
      activeDocument.querySelector(".rss-dashboard-custom-save-modal"),
    ).not.toBeNull();

    finishSave({ path: "Saved/Fixture article.md" });
    await vi.waitFor(() =>
      expect(
        activeDocument.querySelector(".rss-dashboard-custom-save-modal"),
      ).toBeNull(),
    );
    expect(harness.saveArticle).toHaveBeenCalledOnce();

    const second = createHarness();
    second.open();
    modal()
      .querySelector<HTMLButtonElement>(
        ".rss-dashboard-custom-save-cancel-button",
      )
      ?.click();
    expect(second.saveArticle).not.toHaveBeenCalled();
  });
  describe("going back to the default template", () => {
    const saved = [
      {
        id: "t1",
        name: "Custom one",
        template: "Custom: {{title}}",
        defaultFolder: "",
      },
    ];

    function choose(root: HTMLElement, value: string): void {
      const select = root.querySelector<HTMLSelectElement>(
        "#rss-dashboard-saved-template",
      );
      if (!select) throw new Error("Template select was not rendered");
      select.value = value;
      select.dispatchEvent(new Event("change"));
    }

    it("puts the default template back in the editor when 'Current template' is chosen", () => {
      const harness = createHarness({ savedTemplates: saved });
      harness.open();
      const root = modal();
      const editor = root.querySelector<HTMLTextAreaElement>("textarea");

      choose(root, "t1");
      expect(editor?.value).toBe("Custom: {{title}}");

      choose(root, "");
      expect(editor?.value).toBe("Default: {{title}}");
    });

    it("unassigns the feed's saved template when saved with 'Current template' chosen", async () => {
      const harness = createHarness({
        savedTemplates: saved,
        feedTemplate: "t1",
      });
      harness.open();
      const root = modal();
      const select = root.querySelector<HTMLSelectElement>(
        "#rss-dashboard-saved-template",
      );
      expect(select?.value).toBe("t1");

      choose(root, "");
      root
        .querySelector<HTMLButtonElement>(
          ".rss-dashboard-custom-save-confirm-button",
        )
        ?.click();
      await vi.waitFor(() =>
        expect(harness.saveArticle).toHaveBeenCalledOnce(),
      );

      expect(harness.saveArticle).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        "Default: {{title}}",
        "Reader body",
      );
      expect(harness.feed.customTemplate).toBeUndefined();
    });

    it("keeps the feed's saved template when it stays chosen", async () => {
      const harness = createHarness({
        savedTemplates: saved,
        feedTemplate: "t1",
      });
      harness.open();
      modal()
        .querySelector<HTMLButtonElement>(
          ".rss-dashboard-custom-save-confirm-button",
        )
        ?.click();
      await vi.waitFor(() =>
        expect(harness.saveArticle).toHaveBeenCalledOnce(),
      );

      expect(harness.feed.customTemplate).toBe("t1");
    });
  });
});
