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

// What the mocked template editor returns and whether the feed prompt accepts.
const editorChoices = vi.hoisted(() => ({
  makeGlobalDefault: false,
  assignToFeed: false,
}));

// The template editor and the assignment prompts resolve at once, so the
// dialog's own wiring is what these tests observe (#817).
vi.mock(
  "../../../src/settings/modals/settings-modals",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    SavedTemplateEditorModal: class {
      open() {}
      waitForClose() {
        return Promise.resolve({
          name: "New one",
          template: "Edited: {{title}}",
          defaultFolder: "",
          filenamePattern: "",
          makeGlobalDefault: editorChoices.makeGlobalDefault,
        });
      }
    },
    ConfirmTemplateReplacementModal: class {
      open() {}
      waitForClose() {
        return Promise.resolve(false);
      }
    },
    ConfirmTemplateAssignmentModal: class {
      open() {}
      waitForClose() {
        return Promise.resolve(editorChoices.assignToFeed);
      }
    },
  }),
);
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
  saveSettings: ReturnType<typeof vi.fn>;
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
  const saveSettings = vi.fn(async () => {});
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
    saveSettings,
    buildReaderSaveMarkdown: () => "Reader body",
    onArticleSave,
    updateSavedLabel,
  };
  return {
    item,
    feed,
    settings,
    saveArticle,
    saveSettings,
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
  editorChoices.makeGlobalDefault = false;
  editorChoices.assignToFeed = false;
  activeDocument.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("ReaderCustomSaveModal after Save as new template (#817)", () => {
  const saved = [
    {
      id: "t1",
      name: "Custom one",
      template: "Custom: {{title}}",
      defaultFolder: "Saved/Custom",
    },
    {
      id: "t2",
      name: "Two",
      template: "Two: {{title}}",
      defaultFolder: "Saved/Two",
    },
  ];

  async function openWithPendingTemplate() {
    const harness = createHarness({
      savedTemplates: saved,
      feedTemplate: "t1",
    });
    harness.open();
    const root = modal();
    const editor = root.querySelector<HTMLTextAreaElement>("textarea");
    const select = root.querySelector<HTMLSelectElement>(
      "#rss-dashboard-saved-template",
    );
    const saveAs = root.querySelector<HTMLButtonElement>(
      ".rss-dashboard-custom-save-template-button",
    );
    if (!editor || !select || !saveAs)
      throw new Error("Dialog was not rendered");
    editor.value = "Edited: {{title}}";
    editor.dispatchEvent(new Event("input"));
    saveAs.click();
    await vi.waitFor(() =>
      expect(select.options).toHaveLength(saved.length + 2),
    );
    return { harness, root, editor, select };
  }

  it("keeps 'Current template' chosen, and a save uses the default and unassigns the feed", async () => {
    const { harness, root, editor, select } = await openWithPendingTemplate();

    select.value = "";
    select.dispatchEvent(new Event("change"));

    expect(select.value).toBe("");
    expect(select.options).toHaveLength(saved.length + 1);
    expect(editor.value).toBe("Default: {{title}}");

    root
      .querySelector<HTMLButtonElement>(
        ".rss-dashboard-custom-save-confirm-button",
      )
      ?.click();
    await vi.waitFor(() => expect(harness.saveArticle).toHaveBeenCalledOnce());
    expect(harness.saveArticle.mock.calls[0]?.[2]).toBe("Default: {{title}}");
    expect(harness.feed.customTemplate).toBeUndefined();
  });

  it("keeps another saved template chosen after the pending one", async () => {
    const { editor, select } = await openWithPendingTemplate();

    select.value = "t2";
    select.dispatchEvent(new Event("change"));

    expect(select.value).toBe("t2");
    expect(select.options).toHaveLength(saved.length + 1);
    expect(editor.value).toBe("Two: {{title}}");
  });

  it("still discards the pending template and restores the previous choice when the body is edited", async () => {
    const { editor, select } = await openWithPendingTemplate();

    editor.value = "Edited again";
    editor.dispatchEvent(new Event("input"));

    expect(select.value).toBe("t1");
    expect(select.options).toHaveLength(saved.length + 1);
  });
});

describe("ReaderCustomSaveModal commits a new template only after the article saves", () => {
  async function saveWithNewTemplate(saveResult: { path: string } | null) {
    editorChoices.makeGlobalDefault = true;
    editorChoices.assignToFeed = true;
    const harness = createHarness({ saveResult });
    harness.open();
    const root = modal();
    const editor = root.querySelector<HTMLTextAreaElement>("textarea");
    const select = root.querySelector<HTMLSelectElement>(
      "#rss-dashboard-saved-template",
    );
    const saveAs = root.querySelector<HTMLButtonElement>(
      ".rss-dashboard-custom-save-template-button",
    );
    if (!editor || !select || !saveAs)
      throw new Error("Dialog was not rendered");
    editor.value = "Edited: {{title}}";
    editor.dispatchEvent(new Event("input"));
    saveAs.click();
    await vi.waitFor(() => expect(select.options).toHaveLength(2));
    root
      .querySelector<HTMLButtonElement>(
        ".rss-dashboard-custom-save-confirm-button",
      )
      ?.click();
    await vi.waitFor(() => expect(harness.saveArticle).toHaveBeenCalledOnce());
    return harness;
  }

  it("adds the template, makes it the global default and assigns the feed once the save succeeds", async () => {
    const harness = await saveWithNewTemplate({ path: "Saved/Fixture.md" });
    await vi.waitFor(() => expect(harness.saveSettings).toHaveBeenCalledOnce());

    const added = harness.settings.articleSaving.savedTemplates;
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      name: "New one",
      template: "Edited: {{title}}",
    });
    expect(harness.settings.articleSaving.globalDefaultTemplateId).toBe(
      added[0]?.id,
    );
    expect(harness.feed.customTemplate).toBe(added[0]?.id);
  });

  it("changes no setting when the save fails", async () => {
    const harness = await saveWithNewTemplate(null);
    // The dialog closes after the failed save, so nothing is still pending.
    await vi.waitFor(() =>
      expect(
        activeDocument.querySelector(".rss-dashboard-custom-save-modal"),
      ).toBeNull(),
    );

    expect(harness.settings.articleSaving.savedTemplates).toEqual([]);
    expect(
      harness.settings.articleSaving.globalDefaultTemplateId,
    ).toBeUndefined();
    expect(harness.feed.customTemplate).toBeUndefined();
    expect(harness.saveSettings).not.toHaveBeenCalled();
    expect(harness.item.saved).toBeUndefined();
  });
});
