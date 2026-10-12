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
}));

vi.mock("../../../src/modals/custom-save-modal", () => ({
  CustomSaveModal: class CustomSaveModalMock {
    constructor(_app: unknown, _item: unknown, context: unknown) {
      modalOpens.contexts.push(context);
    }
    open(): void {}
  },
}));

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

/** Summary-mode settings keep the save path off the full-content fetch. */
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
  containerEl: HTMLElement;
  inlineArticle: FeedItem | null;
  saver: {
    saveArticleWithContentPolicy: Mock<(...args: any[]) => unknown>;
    saveArticleWithFullContent: Mock<(...args: any[]) => unknown>;
    saveArticle: Mock<(...args: any[]) => unknown>;
    findSavedArticleFile: Mock<(...args: any[]) => unknown>;
  };
  handleArticleCustomSave(article: FeedItem): void;
  applyExternalArticleUpdate(
    articleGuid: string,
    feedUrl: string,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ): void;
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
    findSavedArticleFile: vi.fn(async () => null),
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

/** Opens an article inline and returns its rendered header save control. */
function openInline(
  view: DashboardViewInternal,
  article: FeedItem,
): HTMLButtonElement {
  view.inlineArticle = article;
  const container = createDiv();
  view.containerEl.appendChild(container);
  view.renderInlineArticle(container);
  const saveButton = container.querySelector<HTMLButtonElement>(
    '.inline-reader-header [data-rss-action="save"]',
  );
  if (!saveButton) throw new Error("The inline Reader save control is missing");
  return saveButton;
}

describe("Dashboard inline Reader save state", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    modalOpens.contexts.length = 0;
  });

  it("applies the saved state and tooltip immediately after a default save", async () => {
    const settings = summarySettings();
    settings.feeds = [makeFeed("https://example.com/feed")];
    const { view } = await makeView(settings);
    const article = settings.feeds[0].items[0];
    const saveButton = openInline(view, article);

    expect(saveButton.classList.contains("saved")).toBe(false);
    expect(saveButton.getAttribute("aria-label")).toBe("Save article");

    saveButton.click();
    Menu.lastItems[0].trigger();
    await vi.waitFor(() =>
      expect(saveButton.classList.contains("saved")).toBe(true),
    );

    expect(saveButton.getAttribute("aria-label")).toBe(
      "Click to open saved article",
    );
    // The save path updates the header in place; only a full render rebuilds it.
    expect(view.render).not.toHaveBeenCalled();
  });

  it("applies the same immediate saved state after the custom save dialog completes", async () => {
    const settings = summarySettings();
    settings.feeds = [makeFeed("https://example.com/feed")];
    const { view } = await makeView(settings);
    const article = settings.feeds[0].items[0];
    const saveButton = openInline(view, article);

    view.handleArticleCustomSave(article);
    article.saved = true;
    article.savedFilePath = "Custom/Folder/a.md";
    lastContext().onArticleSave(article);

    await vi.waitFor(() =>
      expect(saveButton.classList.contains("saved")).toBe(true),
    );

    expect(saveButton.getAttribute("aria-label")).toBe(
      "Click to open saved article",
    );
    expect(view.render).not.toHaveBeenCalled();
  });

  it("finds the header control for a later update after its tooltip changed", async () => {
    const settings = summarySettings();
    settings.feeds = [makeFeed("https://example.com/feed")];
    const { view } = await makeView(settings);
    const article = settings.feeds[0].items[0];
    const saveButton = openInline(view, article);

    saveButton.click();
    Menu.lastItems[0].trigger();
    await vi.waitFor(() =>
      expect(saveButton.classList.contains("saved")).toBe(true),
    );

    // The tooltip now reads "Click to open saved article"; a text-based lookup
    // would no longer match, so the control must be found by its action hook.
    view.applyExternalArticleUpdate(article.guid, article.feedUrl, {
      saved: false,
      savedFilePath: undefined,
      tags: [],
    });

    expect(saveButton.classList.contains("saved")).toBe(false);
    expect(saveButton.getAttribute("aria-label")).toBe("Save article");
  });

  it("shows the saved state and tooltip when an already-saved article opens inline", async () => {
    const settings = summarySettings();
    const feed = makeFeed("https://example.com/feed");
    feed.items[0].saved = true;
    feed.items[0].savedFilePath = "Summary/a.md";
    settings.feeds = [feed];
    const { view } = await makeView(settings);
    const saveButton = openInline(view, feed.items[0]);

    expect(saveButton.classList.contains("saved")).toBe(true);
    expect(saveButton.getAttribute("aria-label")).toBe(
      "Click to open saved article",
    );
  });
});
