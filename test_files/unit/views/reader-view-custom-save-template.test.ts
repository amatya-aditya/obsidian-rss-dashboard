import { afterEach, describe, expect, it, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

class MockLeaf {
  constructor(public app: unknown) {}
}

type ReaderViewInternals = {
  showCustomSaveModal(item: FeedItem): void;
};

function getInternals(view: ReaderView): ReaderViewInternals {
  return view as unknown as ReaderViewInternals;
}

function createItem(): FeedItem {
  return {
    title: "Saved template article",
    link: "https://example.com/article",
    description: "Article description",
    pubDate: "2026-08-07",
    guid: "saved-template-article",
    feedTitle: "Example feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
  };
}

function createFeed(item: FeedItem): Feed {
  return {
    title: "Example feed",
    url: item.feedUrl,
    folder: "Feeds",
    items: [item],
    lastUpdated: 0,
  };
}

function topModalContainer(): HTMLElement | undefined {
  return Array.from(
    document.querySelectorAll<HTMLElement>(".modal-container"),
  ).pop();
}

afterEach(() => {
  document.body.empty();
  vi.restoreAllMocks();
});

describe("ReaderView custom-folder saved templates", () => {
  it("selects the feed's configured saved template when opening the custom save dialog", () => {
    const item = createItem();
    const feed = createFeed(item);
    feed.customTemplate = "article-template";
    const settings: RssDashboardSettings = {
      ...DEFAULT_SETTINGS,
      feeds: [feed],
      articleSaving: {
        ...DEFAULT_SETTINGS.articleSaving,
        defaultTemplate: "Default template",
        savedTemplates: [
          {
            id: "article-template",
            name: "Article",
            template: "Article template: {{content}}",
            defaultFolder: "Articles/Template",
          },
        ],
      },
      useWebViewer: false,
    };
    const readerView = new ReaderView(
      new MockLeaf({ workspace: {}, vault: {} }) as never,
      settings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );

    getInternals(readerView).showCustomSaveModal(item);

    const templateSelect = document.querySelector<HTMLSelectElement>(
      "#rss-dashboard-saved-template",
    );
    expect(templateSelect?.value).toBe("article-template");
    expect(
      document.querySelector<HTMLInputElement>("#rss-dashboard-save-folder")
        ?.value,
    ).toBe("Articles/Template");
  });

  it("uses Current template when the feed's saved template no longer exists", () => {
    const item = createItem();
    const feed = createFeed(item);
    feed.customTemplate = "missing-template";
    const settings: RssDashboardSettings = {
      ...DEFAULT_SETTINGS,
      feeds: [feed],
      articleSaving: {
        ...DEFAULT_SETTINGS.articleSaving,
        savedTemplates: [],
      },
      useWebViewer: false,
    };
    const readerView = new ReaderView(
      new MockLeaf({ workspace: {}, vault: {} }) as never,
      settings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );

    getInternals(readerView).showCustomSaveModal(item);

    const templateSelect = document.querySelector<HTMLSelectElement>(
      "#rss-dashboard-saved-template",
    );
    expect(templateSelect?.value).toBe("");
  });

  it("prefills a selected template folder and keeps an individual save override", async () => {
    const item = createItem();
    const feed = createFeed(item);
    const settings: RssDashboardSettings = {
      ...DEFAULT_SETTINGS,
      feeds: [feed],
      articleSaving: {
        ...DEFAULT_SETTINGS.articleSaving,
        defaultFolder: "Custom folder",
        defaultTemplate: "Default template",
        savedTemplates: [
          {
            id: "tweet-template",
            name: "Tweet",
            template: "Tweet template: {{content}}",
            defaultFolder: "Template folder",
          },
        ],
      },
      useWebViewer: false,
    };
    const saveArticle = vi.fn().mockResolvedValue({ path: "Feeds/article.md" });
    const onArticleSave = vi.fn();
    const app = {
      workspace: {},
      vault: {},
    };
    const readerView = new ReaderView(
      new MockLeaf(app) as never,
      settings,
      { saveArticle } as never,
      onArticleSave,
      vi.fn(),
    );

    getInternals(readerView).showCustomSaveModal(item);

    const modal = document.querySelector<HTMLElement>(
      ".rss-dashboard-custom-save-modal",
    );
    const templateSelect = modal?.querySelector<HTMLSelectElement>(
      "#rss-dashboard-saved-template",
    );
    const templateInput = modal?.querySelector<HTMLTextAreaElement>("textarea");
    const folderInput = modal?.querySelector<HTMLInputElement>("input");
    const saveButton = modal?.querySelector<HTMLButtonElement>(
      ".rss-dashboard-primary-button",
    );

    expect(templateSelect?.value).toBe("");
    expect(templateInput?.value).toBe("Default template");
    expect(
      modal?.classList.contains("rss-dashboard-custom-save-modal"),
    ).toBe(true);
    expect(
      templateSelect?.classList.contains("rss-dashboard-template-select"),
    ).toBe(true);
    expect(
      templateSelect?.parentElement?.classList.contains(
        "rss-dashboard-template-select-wrapper",
      ),
    ).toBe(true);
    expect(
      modal?.querySelector(".rss-dashboard-custom-save-cancel-button"),
    ).not.toBeNull();
    expect(
      modal?.querySelector(".rss-dashboard-custom-save-template-button"),
    ).not.toBeNull();

    templateSelect!.value = "tweet-template";
    templateSelect!.dispatchEvent(new Event("change"));

    expect(templateInput?.value).toBe("Tweet template: {{content}}");
    expect(folderInput?.value).toBe("Template folder");
    folderInput!.value = "One-off folder";

    saveButton?.click();
    await vi.waitFor(() => {
      expect(saveArticle).toHaveBeenCalledWith(
        item,
        "One-off folder",
        "Tweet template: {{content}}",
        "Article description",
      );
    });

    expect(feed.customTemplate).toBe("tweet-template");
    expect(onArticleSave).toHaveBeenCalledWith(item);
  });

  it("uses the global Save folder for a template without a saved folder", () => {
    const item = createItem();
    const settings: RssDashboardSettings = {
      ...DEFAULT_SETTINGS,
      articleSaving: {
        ...DEFAULT_SETTINGS.articleSaving,
        defaultFolder: "Global Save folder",
        savedTemplates: [
          { id: "legacy", name: "Legacy", template: "Legacy template" },
        ],
      },
      useWebViewer: false,
    };
    const readerView = new ReaderView(
      new MockLeaf({ workspace: {}, vault: {} }) as never,
      settings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );

    getInternals(readerView).showCustomSaveModal(item);

    const modal = document.querySelector<HTMLElement>(
      ".rss-dashboard-custom-save-modal",
    );
    const templateSelect = modal?.querySelector<HTMLSelectElement>(
      "#rss-dashboard-saved-template",
    );
    const folderInput = modal?.querySelector<HTMLInputElement>("input");

    templateSelect!.value = "legacy";
    templateSelect!.dispatchEvent(new Event("change"));

    expect(folderInput?.value).toBe("Global Save folder");
  });

  it("saves an edited template after the article succeeds and assigns it when confirmed", async () => {
    vi.spyOn(Date, "now").mockReturnValue(123);
    const item = createItem();
    const feed = createFeed(item);
    const settings: RssDashboardSettings = {
      ...DEFAULT_SETTINGS,
      feeds: [feed],
      articleSaving: {
        ...DEFAULT_SETTINGS.articleSaving,
        defaultFolder: "Template folder",
        defaultTemplate: "Default template",
        savedTemplates: [],
      },
      useWebViewer: false,
    };
    const saveArticle = vi.fn().mockResolvedValue({ path: "Feeds/article.md" });
    const readerView = new ReaderView(
      new MockLeaf({ workspace: {}, vault: {} }) as never,
      settings,
      { saveArticle } as never,
      vi.fn(),
      vi.fn(),
    );

    getInternals(readerView).showCustomSaveModal(item);

    const modal = document.querySelector<HTMLElement>(
      ".rss-dashboard-custom-save-modal",
    );
    const templateSelect = modal?.querySelector<HTMLSelectElement>(
      "#rss-dashboard-saved-template",
    );
    const templateInput = modal?.querySelector<HTMLTextAreaElement>("textarea");
    const folderInput = modal?.querySelector<HTMLInputElement>("input");
    const saveAsTemplateButton = Array.from(
      modal?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    ).find((button) => button.textContent === "Save as new template");
    const saveButton = modal?.querySelector<HTMLButtonElement>(
      ".rss-dashboard-primary-button",
    );

    expect(folderInput?.value).toBe("Template folder");
    templateInput!.value = "Edited template";
    templateInput!.dispatchEvent(new Event("input"));
    expect(saveAsTemplateButton?.hidden).toBe(false);

    saveAsTemplateButton?.click();
    // Obsidian stacks modals: the template dialogs open above the save dialog.
    const nameModal = topModalContainer();
    expect(
      nameModal?.classList.contains(
        "rss-dashboard-template-dialog-container",
      ),
    ).toBe(true);
    expect(
      nameModal
        ?.querySelector(".modal")
        ?.classList.contains("rss-dashboard-template-dialog"),
    ).toBe(true);
    const nameInput = nameModal?.querySelector<HTMLInputElement>("input");
    nameInput!.value = "Article note";
    Array.from(nameModal?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent === "Save")
      ?.click();

    await vi.waitFor(() => {
      expect(topModalContainer()?.classList).toContain(
        "rss-dashboard-template-dialog-container",
      );
    });
    const assignmentModal = topModalContainer();
    expect(
      assignmentModal?.classList.contains(
        "rss-dashboard-template-dialog-container",
      ),
    ).toBe(true);
    Array.from(
      assignmentModal?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    )
      .find((button) => button.textContent === "Yes, use for this feed")
      ?.click();

    await vi.waitFor(() => {
      expect(saveAsTemplateButton?.textContent).toBe(
        "New template will be saved",
      );
    });
    folderInput!.value = "One-off folder";
    expect(templateSelect?.value).toBe("template-123");
    expect(
      Array.from(templateSelect?.options ?? []).find(
        (option) => option.value === "template-123",
      )?.text,
    ).toBe("Article note");
    expect(settings.articleSaving.savedTemplates).toHaveLength(0);

    saveButton?.click();
    await vi.waitFor(() => {
      expect(settings.articleSaving.savedTemplates).toEqual([
        {
          id: "template-123",
          name: "Article note",
          template: "Edited template",
          defaultFolder: "Template folder",
        },
      ]);
    });
    await vi.waitFor(() => {
      expect(
        document.querySelector(".rss-dashboard-custom-save-modal"),
      ).toBeNull();
    });

    expect(saveArticle).toHaveBeenCalledWith(
      item,
      "One-off folder",
      "Edited template",
      "Article description",
    );

    expect(feed.customTemplate).toBe("template-123");

    const reloadedSettings = JSON.parse(
      JSON.stringify(settings),
    ) as RssDashboardSettings;
    const reloadedReader = new ReaderView(
      new MockLeaf({ workspace: {}, vault: {} }) as never,
      reloadedSettings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );
    getInternals(reloadedReader).showCustomSaveModal(item);
    expect(
      document.querySelector<HTMLInputElement>("#rss-dashboard-save-folder")
        ?.value,
    ).toBe("Template folder");
  });
});
