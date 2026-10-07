// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { Menu } from "obsidian";
import { ReaderView } from "../../../src/views/reader-view";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
  type SavedTemplate,
} from "../../../src/types/types";

type ReaderViewInternals = {
  currentItem: FeedItem | null;
  currentDisplayTitle?: string;
  currentFullContent?: string;
  currentContentIsFullArticle: boolean;
  contentEl?: HTMLElement;
};

type CustomSaveHarness = {
  view: ReaderView;
  item: FeedItem;
  feed: Feed;
  settings: RssDashboardSettings;
  saveArticle: ReturnType<typeof vi.fn>;
  onArticleSave: ReturnType<typeof vi.fn>;
  onArticleUpdate: ReturnType<typeof vi.fn>;
};

function createSaver(saveArticle: ReturnType<typeof vi.fn>) {
  return {
    saveArticle,
    saveArticleWithContentPolicy: vi.fn(
      (
        item: FeedItem,
        folder?: string,
        template?: string,
        savedTemplate?: SavedTemplate,
        readerContent?: { markdown?: string },
      ) => {
        const markdown = readerContent?.markdown ?? item.description;
        return savedTemplate
          ? saveArticle(item, folder, template, markdown, savedTemplate)
          : saveArticle(item, folder, template, markdown);
      },
    ),
    getFilenamePreview: vi.fn(() => "Reading/Fixture article.md"),
  };
}

class MockLeaf {
  constructor(public app: unknown) {}
}

function internals(view: ReaderView): ReaderViewInternals {
  return view as unknown as ReaderViewInternals;
}

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
  defaultFolder?: string;
  defaultTemplate?: string;
  savedTemplates?: RssDashboardSettings["articleSaving"]["savedTemplates"];
  feedTemplate?: string;
  saveResult?: { path: string } | null;
  displayTitle?: string;
}): CustomSaveHarness {
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
      defaultFolder: options?.defaultFolder ?? "",
      defaultTemplate: options?.defaultTemplate ?? "",
      savedTemplates: options?.savedTemplates ?? [],
    },
    useWebViewer: false,
  };
  const saveArticle = vi
    .fn()
    .mockResolvedValue(
      options?.saveResult === undefined
        ? { path: "Saved/Fixture article.md" }
        : options.saveResult,
    );
  const onArticleSave = vi.fn();
  const onArticleUpdate = vi.fn();
  const app = { workspace: {}, vault: {} };
  const view = new ReaderView(
    new MockLeaf(app) as never,
    settings,
    createSaver(saveArticle) as never,
    onArticleSave,
    onArticleUpdate,
  );
  internals(view).currentDisplayTitle = options?.displayTitle;
  return {
    view,
    item,
    feed,
    settings,
    saveArticle,
    onArticleSave,
    onArticleUpdate,
  };
}

async function openCustomSaveDialog(
  input: ReaderView | CustomSaveHarness,
): Promise<HTMLElement> {
  const view = input instanceof ReaderView ? input : input.view;
  const item =
    input instanceof ReaderView ? internals(view).currentItem : input.item;
  if (!item) throw new Error("Reader article was not selected");
  const displayTitle = internals(view).currentDisplayTitle;
  if (!internals(view).contentEl) {
    internals(view).contentEl = view.containerEl.createDiv();
  }
  activeDocument.body.appendChild(view.containerEl);
  await view.onOpen();
  internals(view).currentItem = item;
  internals(view).currentDisplayTitle = displayTitle;

  const saveButton = view.containerEl.querySelector<HTMLElement>(
    '[aria-label="Save article"]',
  );
  if (!saveButton) throw new Error("Reader save button was not rendered");
  saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  expect(Menu.lastItems.map((menuItem) => menuItem.title)).toEqual([
    "Save with default settings",
    "Save to custom folder...",
  ]);
  const customSaveOption = Menu.lastItems.find(
    (menuItem) => menuItem.title === "Save to custom folder...",
  );
  if (!customSaveOption)
    throw new Error("Custom save menu item was not rendered");
  customSaveOption.trigger();

  const modal = activeDocument.querySelector<HTMLElement>(
    ".rss-dashboard-custom-save-modal",
  );
  if (!modal) throw new Error("Custom save dialog was not attached");
  return modal;
}
function getFields(modal: HTMLElement): {
  folder: HTMLInputElement;
  savedTemplate: HTMLSelectElement;
  template: HTMLTextAreaElement;
  saveAsTemplate: HTMLButtonElement;
  cancel: HTMLButtonElement;
  save: HTMLButtonElement;
} {
  const folder = modal.querySelector<HTMLInputElement>(
    ".rss-dashboard-folder-input-container input",
  );
  const savedTemplate = modal.querySelector<HTMLSelectElement>(
    "#rss-dashboard-saved-template",
  );
  const template = modal.querySelector<HTMLTextAreaElement>("textarea");
  const saveAsTemplate = modal.querySelector<HTMLButtonElement>(
    ".rss-dashboard-custom-save-template-button",
  );
  const cancel = modal.querySelector<HTMLButtonElement>(
    ".rss-dashboard-custom-save-cancel-button",
  );
  const save = modal.querySelector<HTMLButtonElement>(
    ".rss-dashboard-custom-save-confirm-button",
  );
  if (
    !folder ||
    !savedTemplate ||
    !template ||
    !saveAsTemplate ||
    !cancel ||
    !save
  ) {
    throw new Error("A custom save dialog field was not rendered");
  }
  return { folder, savedTemplate, template, saveAsTemplate, cancel, save };
}

async function createPendingTemplate(
  modal: HTMLElement,
  name: string,
  assignToFeed: boolean,
  makeGlobalDefault = false,
): Promise<void> {
  const saveAsTemplate = modal.querySelector<HTMLButtonElement>(
    ".rss-dashboard-custom-save-template-button",
  );
  if (!saveAsTemplate)
    throw new Error("Save-as-template button was not rendered");
  saveAsTemplate.click();

  const nameDialog = activeDocument.querySelector<HTMLElement>(
    ".rss-dashboard-template-dialog",
  );
  if (!nameDialog) throw new Error("Saved-template editor was not opened");
  const nameInput = nameDialog.querySelector<HTMLInputElement>(
    "#rss-saved-template-name",
  );
  if (!nameInput) throw new Error("Template-name input was not rendered");
  const globalDefault = nameDialog.querySelector<HTMLInputElement>(
    "#rss-saved-template-global-default",
  );
  expect(globalDefault?.checked).toBe(false);
  if (globalDefault) globalDefault.checked = makeGlobalDefault;
  nameInput.value = name;
  Array.from(nameDialog.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent === "Save")
    ?.click();

  await vi.waitFor(() => {
    expect(
      activeDocument.querySelector(".rss-dashboard-template-dialog"),
    ).not.toBeNull();
  });
  const assignmentDialog = activeDocument.querySelector<HTMLElement>(
    ".rss-dashboard-template-dialog",
  );
  if (!assignmentDialog)
    throw new Error("Template-assignment dialog was not opened");
  const assignmentText = assignToFeed
    ? "Yes, use for this feed"
    : "No, keep unassigned";
  Array.from(assignmentDialog.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent === assignmentText)
    ?.click();
  await vi.waitFor(() => {
    expect(getFields(modal).saveAsTemplate.textContent).toBe(
      "New template will be saved",
    );
  });
}

afterEach(() => {
  activeDocument.body.empty();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("ReaderView custom save dialog behavior", () => {
  it("opens the dialog as an Obsidian modal from the reader save menu", async () => {
    const { view } = createHarness();
    const modal = await openCustomSaveDialog({
      view,
      item: createItem(),
    } as CustomSaveHarness);

    expect(modal.parentElement?.classList.contains("modal-container")).toBe(
      true,
    );
    expect(modal.parentElement?.parentElement).toBe(activeDocument.body);
    expect(modal.className).toBe("modal rss-dashboard-custom-save-modal");
    expect(modal.querySelector(".modal-content")).not.toBeNull();
    expect(modal.querySelector(".setting-item-name")?.textContent).toBe(
      "Save article",
    );
  });

  it("renders every field, default, option, and button in the expected order", async () => {
    const { view } = createHarness({
      defaultFolder: "Reading/Queue",
      defaultTemplate: "Default: {{title}}",
      savedTemplates: [
        { id: "one", name: "First", template: "First: {{content}}" },
        { id: "two", name: "Second", template: "Second: {{content}}" },
      ],
    });
    const modal = await openCustomSaveDialog({
      view,
      item: createItem(),
    } as CustomSaveHarness);
    const { folder, savedTemplate, template, saveAsTemplate, cancel, save } =
      getFields(modal);

    expect(
      Array.from(modal.querySelectorAll("label"), (label) => label.textContent),
    ).toEqual([
      "Save to folder:",
      "Saved template:",
      "Use template:",
      "Filename pattern override (optional):",
    ]);
    expect(folder.type).toBe("text");
    expect(folder.placeholder).toBe("Enter folder path");
    expect(folder.value).toBe("Reading/Queue");
    expect(
      modal
        .querySelector(".rss-dashboard-clear-icon")
        ?.getAttribute("aria-label"),
    ).toBe("Clear save folder");
    expect(
      modal.querySelector(".rss-dashboard-clear-icon")?.getAttribute("role"),
    ).toBe("button");
    expect(
      modal
        .querySelector(".rss-dashboard-clear-icon")
        ?.getAttribute("tabindex"),
    ).toBe("0");
    expect(
      Array.from(savedTemplate.options, (option) => [
        option.text,
        option.value,
      ]),
    ).toEqual([
      ["Current template", ""],
      ["First", "one"],
      ["Second", "two"],
    ]);
    expect(savedTemplate.value).toBe("");
    expect(template.placeholder).toBe("Enter template");
    expect(template.rows).toBe(6);
    expect(template.value).toBe("Default: {{title}}");
    expect(saveAsTemplate.hidden).toBe(true);
    expect(saveAsTemplate.textContent).toBe("Save as new template");
    expect(cancel.textContent).toBe("Cancel");
    expect(save.textContent).toBe("Save");
    expect(
      Array.from(
        modal.querySelectorAll(".rss-dashboard-modal-buttons button"),
        (button) => button.textContent,
      ),
    ).toEqual(["Cancel", "Save", "Save as new template"]);
    expect(modal.querySelector("input[name='filename']")).toBeNull();
    expect(modal.querySelector("input[name='tags']")).toBeNull();
  });

  it("selects a valid feed template and falls back when that template is missing", async () => {
    const valid = createHarness({
      defaultTemplate: "Fallback template",
      feedTemplate: "saved-one",
      savedTemplates: [
        { id: "saved-one", name: "Saved one", template: "Feed template" },
      ],
    });
    const validModal = await openCustomSaveDialog(valid);
    expect(getFields(validModal).savedTemplate.value).toBe("saved-one");
    expect(getFields(validModal).template.value).toBe("Feed template");

    activeDocument.body.empty();
    const missing = createHarness({
      defaultTemplate: "Fallback template",
      feedTemplate: "removed-template",
      savedTemplates: [],
    });
    const missingModal = await openCustomSaveDialog(missing);
    expect(getFields(missingModal).savedTemplate.value).toBe("");
    expect(getFields(missingModal).template.value).toBe("Fallback template");
  });

  it("clears the folder by click or keyboard and returns focus to the input", async () => {
    const { view } = createHarness({ defaultFolder: "Initial" });
    const modal = await openCustomSaveDialog({
      view,
      item: createItem(),
    } as CustomSaveHarness);
    const { folder } = getFields(modal);
    const clearIcon = modal.querySelector<HTMLElement>(
      ".rss-dashboard-clear-icon",
    );
    if (!clearIcon) throw new Error("Folder clear control was not rendered");

    clearIcon.click();
    expect(folder.value).toBe("");
    expect(activeDocument.activeElement).toBe(folder);

    folder.value = "Again";
    clearIcon.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(folder.value).toBe("");
    expect(activeDocument.activeElement).toBe(folder);
  });

  it("trims the folder and template, uses the reader title, and saves the article state", async () => {
    const harness = createHarness({ displayTitle: "Reader display title" });
    const modal = await openCustomSaveDialog(harness);
    const { folder, template, save } = getFields(modal);
    folder.value = "  Pocket/Reading  ";
    template.value = "  {{title}} / {{content}}  ";
    internals(harness.view).currentFullContent = "<p>Reader full text</p>";
    internals(harness.view).currentContentIsFullArticle = true;
    const saveItem = { ...harness.item, title: "Reader display title" };

    save.click();
    await vi.waitFor(() => {
      expect(harness.saveArticle).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => expect(harness.item.saved).toBe(true));

    expect(harness.saveArticle).toHaveBeenCalledWith(
      saveItem,
      "Pocket/Reading",
      "{{title}} / {{content}}",
      "Reader full text",
    );
    expect(harness.item.title).toBe("Fixture article");
    expect(harness.item.saved).toBe(true);
    expect(harness.item.savedFilePath).toBe("Saved/Fixture article.md");
    expect(harness.onArticleSave).toHaveBeenCalledWith(harness.item);
    expect(harness.onArticleUpdate).toHaveBeenCalledWith(harness.item, {
      saved: true,
    });
    await vi.waitFor(() => {
      expect(modal.isConnected).toBe(false);
    });
  });

  it("passes an empty folder and undefined when the template is blank", async () => {
    const harness = createHarness();
    const modal = await openCustomSaveDialog(harness);
    const { folder, template, save } = getFields(modal);
    folder.value = "   ";
    template.value = " \n ";

    save.click();
    await vi.waitFor(() => {
      expect(harness.saveArticle).toHaveBeenCalledTimes(1);
    });

    expect(harness.saveArticle).toHaveBeenCalledWith(
      harness.item,
      "",
      undefined,
      "Fixture article body",
    );
  });

  it("applies a selected saved template to the feed only after a successful save", async () => {
    const harness = createHarness({
      savedTemplates: [
        { id: "one", name: "First", template: "First body" },
        { id: "two", name: "Second", template: "Second body" },
      ],
    });
    const modal = await openCustomSaveDialog(harness);
    const { savedTemplate, template, save } = getFields(modal);
    savedTemplate.value = "two";
    savedTemplate.dispatchEvent(new Event("change"));

    expect(template.value).toBe("Second body");
    expect(getFields(modal).saveAsTemplate.hidden).toBe(true);
    save.click();
    await vi.waitFor(() => {
      expect(harness.saveArticle).toHaveBeenCalledTimes(1);
    });

    expect(harness.feed.customTemplate).toBe("two");
    expect(harness.settings.articleSaving.savedTemplates).toHaveLength(2);
  });

  it("unassigns the feed template when Current template is selected (#814)", async () => {
    const harness = createHarness({
      feedTemplate: "one",
      savedTemplates: [{ id: "one", name: "First", template: "First body" }],
    });
    const modal = await openCustomSaveDialog(harness);
    const { savedTemplate, save } = getFields(modal);
    savedTemplate.value = "";
    savedTemplate.dispatchEvent(new Event("change"));
    save.click();
    await vi.waitFor(() => {
      expect(harness.saveArticle).toHaveBeenCalledTimes(1);
    });

    expect(harness.feed.customTemplate).toBeUndefined();
  });

  it("stays open after a failed save result without marking the article saved", async () => {
    const harness = createHarness({ saveResult: null });
    const modal = await openCustomSaveDialog(harness);
    getFields(modal).save.click();

    await vi.waitFor(() => expect(harness.saveArticle).toHaveBeenCalled());
    expect(modal.isConnected).toBe(true);
    expect(harness.item.saved).toBeUndefined();
    expect(harness.item.savedFilePath).toBeUndefined();
    expect(harness.onArticleSave).not.toHaveBeenCalled();
    expect(harness.onArticleUpdate).not.toHaveBeenCalled();
  });

  it("closes on Cancel without saving or changing the article or feed", async () => {
    const harness = createHarness({
      feedTemplate: "one",
      savedTemplates: [{ id: "one", name: "First", template: "First body" }],
    });
    const modal = await openCustomSaveDialog(harness);
    getFields(modal).cancel.click();

    expect(modal.isConnected).toBe(false);
    expect(harness.saveArticle).not.toHaveBeenCalled();
    expect(harness.item.saved).toBeUndefined();
    expect(harness.item.savedFilePath).toBeUndefined();
    expect(harness.feed.customTemplate).toBe("one");
    expect(harness.onArticleSave).not.toHaveBeenCalled();
    expect(harness.onArticleUpdate).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "saves a new template after article success (assign to feed: %s)",
    async (assignToFeed) => {
      vi.spyOn(Date, "now").mockReturnValue(123);
      const harness = createHarness();
      const modal = await openCustomSaveDialog(harness);
      const { template, savedTemplate, save } = getFields(modal);
      template.value = "New template body";
      template.dispatchEvent(new Event("input"));
      expect(getFields(modal).saveAsTemplate.hidden).toBe(false);

      await createPendingTemplate(modal, "New template", assignToFeed);
      expect(savedTemplate.value).toBe("template-123");
      expect(getFields(modal).saveAsTemplate.textContent).toBe(
        "New template will be saved",
      );
      expect(
        getFields(modal).saveAsTemplate.querySelector<HTMLElement>(
          ".rss-dashboard-custom-save-button-icon",
        )?.dataset.icon,
      ).toBe("file-plus");
      expect(harness.settings.articleSaving.savedTemplates).toHaveLength(0);

      save.click();
      await vi.waitFor(() => {
        expect(harness.settings.articleSaving.savedTemplates).toEqual([
          {
            id: "template-123",
            name: "New template",
            template: "New template body",
            defaultFolder: "",
          },
        ]);
      });
      expect(
        harness.settings.articleSaving.globalDefaultTemplateId,
      ).toBeUndefined();
      expect(harness.feed.customTemplate).toBe(
        assignToFeed ? "template-123" : undefined,
      );
    },
  );

  it("commits a Reader-created global default only after the article saves", async () => {
    vi.spyOn(Date, "now").mockReturnValue(789);
    const failed = createHarness({ saveResult: null });
    const failedModal = await openCustomSaveDialog(failed);
    const failedTemplate = getFields(failedModal).template;
    failedTemplate.value = "New default body";
    failedTemplate.dispatchEvent(new Event("input"));
    await createPendingTemplate(failedModal, "New default", false, true);
    expect(
      failed.settings.articleSaving.globalDefaultTemplateId,
    ).toBeUndefined();
    getFields(failedModal).save.click();
    await vi.waitFor(() => expect(failed.saveArticle).toHaveBeenCalledOnce());
    expect(
      failed.settings.articleSaving.globalDefaultTemplateId,
    ).toBeUndefined();

    activeDocument.body.empty();
    const successful = createHarness();
    const successfulModal = await openCustomSaveDialog(successful);
    const template = getFields(successfulModal).template;
    template.value = "New default body";
    template.dispatchEvent(new Event("input"));
    await createPendingTemplate(successfulModal, "New default", false, true);
    expect(
      successful.settings.articleSaving.globalDefaultTemplateId,
    ).toBeUndefined();
    getFields(successfulModal).save.click();
    await vi.waitFor(() =>
      expect(successful.settings.articleSaving.globalDefaultTemplateId).toBe(
        "template-789",
      ),
    );
  });

  it("discards an unsaved template when its editor is cancelled", async () => {
    const harness = createHarness();
    const modal = await openCustomSaveDialog(harness);
    const { template, savedTemplate, saveAsTemplate } = getFields(modal);
    template.value = "Changed body";
    template.dispatchEvent(new Event("input"));
    saveAsTemplate.click();

    const nameDialog = activeDocument.querySelector<HTMLElement>(
      ".rss-dashboard-template-dialog",
    );
    if (!nameDialog) throw new Error("Saved-template editor was not opened");
    Array.from(nameDialog.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "Cancel")
      ?.click();

    await vi.waitFor(() => {
      expect(
        activeDocument.querySelector(".rss-dashboard-template-dialog"),
      ).toBeNull();
    });
    expect(savedTemplate.options).toHaveLength(1);
    expect(savedTemplate.value).toBe("");
    expect(getFields(modal).saveAsTemplate.hidden).toBe(false);
    expect(harness.settings.articleSaving.savedTemplates).toHaveLength(0);
  });

  it("removes a pending template if its text changes after confirmation", async () => {
    vi.spyOn(Date, "now").mockReturnValue(321);
    const harness = createHarness();
    const modal = await openCustomSaveDialog(harness);
    const { template, savedTemplate } = getFields(modal);
    template.value = "First version";
    template.dispatchEvent(new Event("input"));
    await createPendingTemplate(modal, "Draft", false);

    template.value = "Second version";
    template.dispatchEvent(new Event("input"));
    expect(savedTemplate.options).toHaveLength(1);
    expect(savedTemplate.value).toBe("");
    expect(getFields(modal).saveAsTemplate.hidden).toBe(false);
    expect(getFields(modal).saveAsTemplate.textContent).toBe(
      "Save as new template",
    );
    expect(harness.settings.articleSaving.savedTemplates).toHaveLength(0);
  });

  it("does not save a pending template when the article save returns no file", async () => {
    vi.spyOn(Date, "now").mockReturnValue(456);
    const harness = createHarness({ saveResult: null });
    const modal = await openCustomSaveDialog(harness);
    const { template } = getFields(modal);
    template.value = "Draft template";
    template.dispatchEvent(new Event("input"));
    await createPendingTemplate(modal, "Draft", true);
    getFields(modal).save.click();

    await vi.waitFor(() => expect(harness.saveArticle).toHaveBeenCalled());
    expect(modal.isConnected).toBe(true);
    expect(harness.settings.articleSaving.savedTemplates).toHaveLength(0);
    expect(harness.feed.customTemplate).toBeUndefined();
    expect(harness.item.saved).toBeUndefined();
  });

  it("can open a fresh dialog after cancelling the previous one", async () => {
    const harness = createHarness();
    const first = await openCustomSaveDialog(harness);
    getFields(first).cancel.click();
    const second = await openCustomSaveDialog(harness);

    expect(first.isConnected).toBe(false);
    expect(second).not.toBe(first);
    expect(
      activeDocument.querySelectorAll(".rss-dashboard-custom-save-modal"),
    ).toHaveLength(1);
  });

  it("attaches and removes the dialog in the active popout document", async () => {
    const harness = createHarness();
    if (!internals(harness.view).contentEl) {
      internals(harness.view).contentEl = harness.view.containerEl.createDiv();
    }
    activeDocument.body.appendChild(harness.view.containerEl);
    await harness.view.onOpen();
    internals(harness.view).currentItem = harness.item;
    const popoutDocument =
      document.implementation.createHTMLDocument("reader popout");
    const globalScope = window as Window & { activeDocument?: Document };
    const previousDocument = globalScope.activeDocument;
    globalScope.activeDocument = popoutDocument;

    try {
      const saveButton = harness.view.containerEl.querySelector<HTMLElement>(
        '[aria-label="Save article"]',
      );
      if (!saveButton) throw new Error("Reader save button was not rendered");
      saveButton.click();
      Menu.lastItems
        .find((menuItem) => menuItem.title === "Save to custom folder...")
        ?.trigger();

      const modal = popoutDocument.querySelector<HTMLElement>(
        ".rss-dashboard-custom-save-modal",
      );
      expect(modal?.ownerDocument).toBe(popoutDocument);
      expect(modal?.parentElement?.parentElement).toBe(popoutDocument.body);
      if (!modal) throw new Error("Popout save dialog was not opened");
      const cancel = modal.querySelector<HTMLButtonElement>(
        ".rss-dashboard-custom-save-cancel-button",
      );
      cancel?.click();
      expect(
        popoutDocument.querySelector(".rss-dashboard-custom-save-modal"),
      ).toBeNull();
    } finally {
      globalScope.activeDocument = previousDocument;
      popoutDocument.body.empty();
    }
  });
});
