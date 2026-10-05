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
}): {
  item: FeedItem;
  feed: Feed;
  settings: RssDashboardSettings;
  saveArticle: ReturnType<typeof vi.fn>;
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
    },
  };
  const saveArticle = vi.fn().mockResolvedValue(
    options?.saveResult === undefined ? { path: "Saved/Fixture article.md" } : options.saveResult,
  );
  const onArticleSave = vi.fn();
  const updateSavedLabel = vi.fn();
  const context: ReaderCustomSaveModalContext = {
    getSettings: () => settings,
    getArticleSaver: () => ({ saveArticle } as never),
    displayTitle: options?.displayTitle,
    getCustomTemplateForArticle: () => undefined,
    buildReaderSaveMarkdown: () => "Reader body",
    onArticleSave,
    updateSavedLabel,
  };
  return {
    item,
    feed,
    settings,
    saveArticle,
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
    expect(hint?.nextElementSibling?.classList.contains("rss-dashboard-modal-buttons")).toBe(
      true,
    );

    if (!hint || !template) throw new Error("Template guidance was not rendered");
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

    expect(root.querySelector(".setting-item-name")?.textContent).toBe("Save article");
    expect(Array.from(root.querySelectorAll("label"), (label) => label.textContent)).toEqual([
      "Save to folder:",
      "Saved template:",
      "Use template:",
    ]);
    expect(root.querySelector<HTMLInputElement>("input")?.value).toBe("Reading/Queue");
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
      Array.from(root.querySelectorAll("select option"), (option) => [option.textContent, (option as HTMLOptionElement).value]),
    ).toEqual([
      ["Current template", ""],
      ["First", "one"],
      ["Second", "two"],
    ]);
    expect(root.querySelector("textarea")?.value).toBe("Default: {{title}}");
    expect(
      root.querySelector<HTMLElement>(".rss-dashboard-custom-save-template-hint")?.hidden,
    ).toBe(true);
    const actionButtons = Array.from(root.querySelectorAll("button"));
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
      root.querySelector<HTMLElement>(".rss-dashboard-clear-icon")
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
    root.querySelector<HTMLButtonElement>(".rss-dashboard-custom-save-cancel-button")?.click();
    expect(activeDocument.querySelector(".rss-dashboard-custom-save-modal")).toBeNull();
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
    root.querySelector<HTMLButtonElement>(".rss-dashboard-custom-save-confirm-button")?.click();
    await vi.waitFor(() => expect(harness.saveArticle).toHaveBeenCalledOnce());

    expect(harness.saveArticle).toHaveBeenCalledWith(
      expect.objectContaining({ guid: "fixture-article", title: "Display title" }),
      "Articles",
      "Custom {{title}}",
      "Reader body",
    );
    expect(harness.item.saved).toBe(true);
    expect(harness.item.savedFilePath).toBe("Saved/Fixture article.md");
    expect(harness.onArticleSave).toHaveBeenCalledWith(harness.item);
    expect(harness.updateSavedLabel).toHaveBeenCalledWith(true);
    await vi.waitFor(() =>
      expect(activeDocument.querySelector(".rss-dashboard-custom-save-modal")).toBeNull(),
    );
  });

  it("closes without marking the article saved when the saver returns no file", async () => {
    const harness = createHarness({ saveResult: null });
    harness.open();
    modal().querySelector<HTMLButtonElement>(".rss-dashboard-custom-save-confirm-button")?.click();
    await vi.waitFor(() => expect(harness.saveArticle).toHaveBeenCalledOnce());
    expect(harness.item.saved).toBeUndefined();
    expect(harness.onArticleSave).not.toHaveBeenCalled();
    expect(harness.updateSavedLabel).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(activeDocument.querySelector(".rss-dashboard-custom-save-modal")).toBeNull(),
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
    modal().querySelector<HTMLButtonElement>(".rss-dashboard-custom-save-confirm-button")?.click();
    await vi.waitFor(() => expect(harness.saveArticle).toHaveBeenCalledOnce());
    expect(activeDocument.querySelector(".rss-dashboard-custom-save-modal")).not.toBeNull();

    finishSave({ path: "Saved/Fixture article.md" });
    await vi.waitFor(() =>
      expect(activeDocument.querySelector(".rss-dashboard-custom-save-modal")).toBeNull(),
    );
    expect(harness.saveArticle).toHaveBeenCalledOnce();

    const second = createHarness();
    second.open();
    modal().querySelector<HTMLButtonElement>(".rss-dashboard-custom-save-cancel-button")?.click();
    expect(second.saveArticle).not.toHaveBeenCalled();
  });
});
