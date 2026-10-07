import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import { App, Menu } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
  type SavedTemplate,
} from "../../../src/types/types";
import { RESTRICTED_ARTICLE_REASON } from "../../../src/utils/full-article-fetch";
import type { CustomSaveModalContext } from "../../../src/modals/custom-save-modal";
import { RssDashboardView } from "../../../src/views/dashboard-view";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    destroy(): void {}
    refilter(..._args: unknown[]): void {}
    setSelectedArticle(..._args: unknown[]): void {}
    hasArticle(..._args: unknown[]): boolean {
      return false;
    }
    insertArticleInPlace(..._args: unknown[]): boolean {
      return false;
    }
    removeArticleInPlace(..._args: unknown[]): void {}
    updateArticleInPlace(..._args: unknown[]): void {}
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
    showEditFeedModal(..._args: unknown[]): void {}
  },
}));

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    constructor(..._args: unknown[]) {}
    open(): void {}
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
    constructor(..._args: unknown[]) {}
    open(): void {}
    close(): void {}
  },
}));

vi.mock("../../../src/views/reader-view", () => ({
  ReaderView: class ReaderViewMock {},
  RSS_READER_VIEW_TYPE: "rss-reader-view",
}));

vi.mock("../../../src/services/article-saver", () => ({
  ArticleSaver: class ArticleSaverMock {
    constructor(..._args: unknown[]) {}
    verifyAllSavedArticles(..._args: unknown[]): void {}
  },
}));

const modalOpens = vi.hoisted(() => ({
  contexts: [] as unknown[],
  items: [] as unknown[],
}));

vi.mock("../../../src/modals/custom-save-modal", () => ({
  CustomSaveModal: class CustomSaveModalMock {
    constructor(_app: unknown, item: unknown, context: unknown) {
      modalOpens.items.push(item);
      modalOpens.contexts.push(context);
    }
    open(): void {}
  },
}));

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function summarySettings(): RssDashboardSettings {
  const settings = cloneSettings();
  settings.articleSaving.saveFullContent = false;
  return settings;
}

function makeFeed(url: string): Feed {
  const item: FeedItem = {
    title: "Fixture article",
    link: `${url}#0`,
    description: "<p>Excerpt</p>",
    pubDate: new Date().toISOString(),
    guid: `${url}#0`,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: url,
    coverImage: "",
  };
  return {
    title: "Feed",
    url,
    folder: "",
    items: [item],
    lastUpdated: Date.now(),
  };
}

interface DashboardViewInternal {
  inlineArticle: FeedItem | null;
  selectedArticle: FeedItem | null;
  saver: {
    saveArticleWithContentPolicy: Mock<(...args: any[]) => unknown>;
    saveArticleWithFullContent: Mock<(...args: any[]) => unknown>;
    saveArticle: Mock<(...args: any[]) => unknown>;
  };
  handleArticleCustomSave(
    article: FeedItem,
    hooks?: { onSavingChange: (saving: boolean) => void },
  ): void;
  actionSaveSelectedArticle(): Promise<void>;
  renderInlineArticle(container: HTMLElement): void;
  render: ReturnType<typeof vi.fn>;
}

async function makeView(settings: RssDashboardSettings) {
  const app = new App();
  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    updateArticle: vi.fn(async () => {}),
  };
  const leaf = { app } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(
    leaf,
    plugin as never,
  ) as unknown as DashboardViewInternal;
  view.render = vi.fn();
  const saver: DashboardViewInternal["saver"] = {
    saveArticleWithContentPolicy: vi.fn(),
    saveArticleWithFullContent: vi.fn(async () => ({ path: "Full/a.md" })),
    saveArticle: vi.fn(async () => ({ path: "Summary/a.md" })),
  };
  saver.saveArticleWithContentPolicy = vi.fn(
    (
      item: FeedItem,
      folder?: string,
      template?: string,
      savedTemplate?: SavedTemplate,
    ) =>
      settings.articleSaving.saveFullContent
        ? saver.saveArticleWithFullContent(
            item,
            folder,
            template,
            savedTemplate,
          )
        : saver.saveArticle(item, folder, template, undefined, savedTemplate),
  );
  view.saver = saver;
  return { view, plugin };
}

function lastContext(): CustomSaveModalContext {
  const context = modalOpens.contexts[modalOpens.contexts.length - 1];
  if (!context) throw new Error("The custom save dialog was not opened");
  return context as CustomSaveModalContext;
}

const NO_OVERRIDES = {
  folder: "",
  template: undefined,
  savedTemplate: undefined,
};

describe("Dashboard Custom save", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    modalOpens.contexts.length = 0;
    modalOpens.items.length = 0;
  });

  it("opens the shared dialog for the article without saving anything", async () => {
    const settings = cloneSettings();
    settings.feeds = [makeFeed("https://example.com/feed")];
    const { view } = await makeView(settings);
    const article = settings.feeds[0].items[0];

    view.handleArticleCustomSave(article);

    expect(modalOpens.items).toEqual([article]);
    expect(view.saver.saveArticle).not.toHaveBeenCalled();
    expect(view.saver.saveArticleWithFullContent).not.toHaveBeenCalled();
    expect(article.saved).toBeUndefined();
  });

  it("saves the full article with the dialog choices when saveFullContent is on, and shows saving state", async () => {
    const settings = cloneSettings();
    settings.articleSaving.saveFullContent = true;
    settings.feeds = [makeFeed("https://example.com/feed")];
    const { view } = await makeView(settings);
    const article = settings.feeds[0].items[0];
    const states: boolean[] = [];

    view.handleArticleCustomSave(article, {
      onSavingChange: (saving) => states.push(saving),
    });
    const savedTemplate = { id: "t", name: "T", template: "Body" };
    const file = await lastContext().saveArticle(article, {
      folder: "Custom/Folder",
      template: "Body",
      savedTemplate,
    });

    expect(file).toEqual({ path: "Full/a.md" });
    expect(view.saver.saveArticleWithFullContent).toHaveBeenCalledWith(
      article,
      "Custom/Folder",
      "Body",
      savedTemplate,
    );
    expect(view.saver.saveArticle).not.toHaveBeenCalled();
    expect(states).toEqual([true, false]);
  });

  it("saves the summary with the dialog choices when saveFullContent is off", async () => {
    const settings = cloneSettings();
    settings.articleSaving.saveFullContent = false;
    settings.feeds = [makeFeed("https://example.com/feed")];
    const { view } = await makeView(settings);
    const article = settings.feeds[0].items[0];

    view.handleArticleCustomSave(article);
    await lastContext().saveArticle(article, {
      folder: "Custom/Folder",
      template: "Body",
      savedTemplate: undefined,
    });

    expect(view.saver.saveArticle).toHaveBeenCalledWith(
      article,
      "Custom/Folder",
      "Body",
      undefined,
      undefined,
    );
    expect(view.saver.saveArticleWithFullContent).not.toHaveBeenCalled();
  });

  it("clears the saving state and saves nothing when the full-content save fails", async () => {
    const settings = cloneSettings();
    settings.articleSaving.saveFullContent = true;
    settings.feeds = [makeFeed("https://example.com/feed")];
    const { view } = await makeView(settings);
    const article = settings.feeds[0].items[0];
    view.saver.saveArticleWithFullContent.mockResolvedValue(null);
    const states: boolean[] = [];

    view.handleArticleCustomSave(article, {
      onSavingChange: (saving) => states.push(saving),
    });
    const file = await lastContext().saveArticle(article, NO_OVERRIDES);

    expect(file).toBeNull();
    expect(states).toEqual([true, false]);
    expect(article.saved).toBeUndefined();
  });

  it("marks the article saved with its file path after the dialog saves", async () => {
    const settings = cloneSettings();
    settings.feeds = [makeFeed("https://example.com/feed")];
    const { view, plugin } = await makeView(settings);
    const article = settings.feeds[0].items[0];

    view.handleArticleCustomSave(article);
    article.saved = true;
    article.savedFilePath = "Custom/Folder/a.md";
    lastContext().onArticleSave(article);

    await vi.waitFor(() => expect(plugin.updateArticle).toHaveBeenCalled());
    expect(settings.feeds[0].items[0]).toMatchObject({
      saved: true,
      savedFilePath: "Custom/Folder/a.md",
    });
  });

  it("propagates restrictedReason from a full-content Custom save", async () => {
    const settings = cloneSettings();
    settings.articleSaving.saveFullContent = true;
    settings.feeds = [makeFeed("https://example.com/feed")];
    const { view } = await makeView(settings);
    const article = settings.feeds[0].items[0];
    view.inlineArticle = { ...article };
    view.selectedArticle = { ...article };
    view.saver.saveArticleWithFullContent = vi.fn((item: FeedItem) => {
      item.restrictedReason = RESTRICTED_ARTICLE_REASON;
      return Promise.resolve({ path: "Full/a.md" });
    });

    view.handleArticleCustomSave(article);
    await lastContext().saveArticle(article, NO_OVERRIDES);

    expect(view.inlineArticle?.restrictedReason).toBe(
      RESTRICTED_ARTICLE_REASON,
    );
    expect(view.selectedArticle?.restrictedReason).toBe(
      RESTRICTED_ARTICLE_REASON,
    );
  });

  it("keeps the keyboard save action a Default save", async () => {
    const settings = summarySettings();
    settings.feeds = [makeFeed("https://example.com/feed")];
    const { view } = await makeView(settings);
    view.selectedArticle = settings.feeds[0].items[0];

    await view.actionSaveSelectedArticle();

    expect(modalOpens.items).toHaveLength(0);
    expect(view.saver.saveArticle).toHaveBeenCalledOnce();
  });

  it("offers both save choices from the inline article header Save button", async () => {
    const settings = summarySettings();
    settings.feeds = [makeFeed("https://example.com/feed")];
    const { view } = await makeView(settings);
    view.inlineArticle = settings.feeds[0].items[0];
    const container = createDiv();
    view.renderInlineArticle(container);

    container
      .querySelector<HTMLElement>('[aria-label="Save article"]')
      ?.click();

    const items = Menu.lastItems;
    expect(items.map((item) => item.title)).toEqual([
      "Save with default settings",
      "Save to custom folder...",
    ]);
    expect(view.saver.saveArticle).not.toHaveBeenCalled();

    items[0].trigger();
    await vi.waitFor(() =>
      expect(view.saver.saveArticle).toHaveBeenCalledOnce(),
    );

    items[1].trigger();
    expect(modalOpens.items).toEqual([view.inlineArticle]);
  });

  it("blocks a second save of the same article while its dialog is open, and allows it after the dialog closes", async () => {
    const settings = summarySettings();
    settings.feeds = [makeFeed("https://example.com/feed")];
    const { view } = await makeView(settings);
    const article = settings.feeds[0].items[0];

    view.handleArticleCustomSave(article);
    view.handleArticleCustomSave(article);
    expect(modalOpens.items).toEqual([article]);

    await (
      view as unknown as { handleArticleSave(a: FeedItem): Promise<void> }
    ).handleArticleSave(article);
    expect(view.saver.saveArticle).not.toHaveBeenCalled();

    lastContext().onClose?.();
    await (
      view as unknown as { handleArticleSave(a: FeedItem): Promise<void> }
    ).handleArticleSave(article);
    expect(view.saver.saveArticle).toHaveBeenCalledOnce();
  });
});
