import { afterEach, describe, expect, it, vi } from "vitest";
import { App, TFile } from "obsidian";
import { ArticleSaver } from "../../../src/services/article-saver";
import * as fetchHelpers from "../../../src/utils/fetch-helpers";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import { ReaderView } from "../../../src/views/reader-view";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
  type SavedTemplate,
} from "../../../src/types/types";

type ReaderInternals = {
  currentItem: FeedItem | null;
  currentFullContent?: string;
  currentContentIsFullArticle: boolean;
  currentFullContentFetchAttempted: boolean;
  getCustomSaveModalContext(): {
    saveArticle(
      item: FeedItem,
      request: {
        folder?: string;
        template?: string;
        savedTemplate?: SavedTemplate;
      },
    ): Promise<TFile | null>;
  };
};

type DashboardInternals = {
  selectedArticle: FeedItem | null;
  markArticleSaved: ReturnType<typeof vi.fn>;
};

function settings(saveFullContent: boolean): RssDashboardSettings {
  const result = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  result.articleSaving.saveFullContent = saveFullContent;
  result.articleSaving.defaultTemplate =
    "{{summary}}\n{{content}}\n{{content}}";
  result.articleSaving.includeFrontmatter = false;
  return result;
}

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Source policy fixture",
    link: "https://example.substack.com/p/fixture",
    content: "<p>RSS item body.</p>",
    description: "<p>RSS description.</p>",
    summary: "Stable summary output",
    pubDate: "2026-01-01",
    guid: "source-policy-fixture",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Fixture feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    ...overrides,
  };
}

function feed(article: FeedItem): Feed {
  return {
    title: article.feedTitle,
    url: article.feedUrl,
    folder: "",
    items: [article],
    lastUpdated: 0,
  };
}

function setReaderArticle(view: ReaderView, article: FeedItem): void {
  const internal = view as unknown as ReaderInternals;
  internal.currentItem = article;
  internal.currentFullContent = "<p>Reader fetched article body.</p>";
  internal.currentContentIsFullArticle = true;
  internal.currentFullContentFetchAttempted = true;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saved content source policy", () => {
  it("saves the fetched body from the Dashboard even when Substack RSS is longer", async () => {
    const app = App.createMock();
    const article = item({
      content: `<p>${"Long RSS item body. ".repeat(30)}</p>`,
    });
    const settingsValue = settings(true);
    settingsValue.feeds = [feed(article)];
    const plugin = {
      settings: settingsValue,
      saveSettings: vi.fn(async () => {}),
      updateArticle: vi.fn(async () => {}),
    };
    const view = new RssDashboardView({ app } as never, plugin as never);
    const internal = view as unknown as DashboardInternals;
    internal.selectedArticle = article;
    internal.markArticleSaved = vi.fn(
      async (savedArticle: FeedItem, path: string) => {
        savedArticle.savedFilePath = path;
      },
    );
    const fetchMock = vi
      .spyOn(fetchHelpers, "fetchWithProxyFallbackDetailed")
      .mockResolvedValueOnce({
        content: "<p>Fetched article body.</p>",
        failureType: "none",
      });

    await view.actionSaveSelectedArticle();

    expect(article.savedFilePath).toBeDefined();
    const saved = app.vault.getAbstractFileByPath(article.savedFilePath ?? "");
    expect(saved).toBeInstanceOf(TFile);
    if (!(saved instanceof TFile)) throw new Error("expected saved TFile");
    const written = await app.vault.read(saved);
    expect(written).toContain("Fetched article body.");
    expect(written).not.toContain("Long RSS item body.");
    expect(written.match(/Fetched article body\./g)).toHaveLength(2);
    expect(written).toContain("Stable summary output");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses RSS output in the Reader action when the setting is off", async () => {
    const app = App.createMock();
    const settingsValue = settings(false);
    const saver = new ArticleSaver(app, settingsValue.articleSaving);
    const article = item();
    const view = new ReaderView(
      { app } as never,
      settingsValue,
      saver,
      vi.fn(),
      vi.fn(),
    );
    setReaderArticle(view, article);

    await view.actionSaveCurrentArticle();

    expect(article.savedFilePath).toBeDefined();
    const saved = app.vault.getAbstractFileByPath(article.savedFilePath ?? "");
    expect(saved).toBeInstanceOf(TFile);
    if (!(saved instanceof TFile)) throw new Error("expected saved TFile");
    const written = await app.vault.read(saved);
    expect(written).toContain("RSS item body.");
    expect(written).not.toContain("Reader fetched article body.");
    expect(written.match(/RSS item body\./g)).toHaveLength(2);
    expect(written).toContain("Stable summary output");
  });

  it("uses Reader content for a custom-folder save without fetching again", async () => {
    const app = App.createMock();
    const settingsValue = settings(true);
    const saver = new ArticleSaver(app, settingsValue.articleSaving);
    const article = item();
    const view = new ReaderView(
      { app } as never,
      settingsValue,
      saver,
      vi.fn(),
      vi.fn(),
    );
    setReaderArticle(view, article);
    const fetchMock = vi.spyOn(fetchHelpers, "fetchWithProxyFallbackDetailed");
    const savedTemplate: SavedTemplate = {
      id: "custom-template",
      name: "Custom template",
      template: "{{content}}",
      defaultFolder: "Custom",
    };

    const result = await (view as unknown as ReaderInternals)
      .getCustomSaveModalContext()
      .saveArticle(article, {
        folder: "Custom",
        template: "{{content}}",
        savedTemplate,
      });

    expect(result).toBeInstanceOf(TFile);
    if (!(result instanceof TFile)) throw new Error("expected saved TFile");
    expect(result.path).toBe("Custom/Source policy fixture.md");
    expect(await app.vault.read(result)).toContain(
      "Reader fetched article body.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves a short successful Reader fetch even when display uses longer RSS content", async () => {
    const app = App.createMock();
    const settingsValue = settings(true);
    settingsValue.articleSaving.defaultTemplate = "{{content}}";
    const saver = new ArticleSaver(app, settingsValue.articleSaving);
    const longFeedBody = `<p>${"Long RSS feed body. ".repeat(20)}</p>`;
    const article = item({ content: longFeedBody, description: longFeedBody });
    const view = new ReaderView(
      { app } as never,
      settingsValue,
      saver,
      vi.fn(),
      vi.fn(),
    );
    const fetchMock = vi
      .spyOn(fetchHelpers, "fetchWithProxyFallbackDetailed")
      .mockResolvedValueOnce({
        content: "<p>Short fetched Reader body.</p>",
        failureType: "none",
      });

    (view as unknown as { contentEl: HTMLElement }).contentEl = createDiv();
    await view.onOpen();
    await view.displayItem(article);

    const readingContainer = (
      view as unknown as { readingContainer: HTMLElement }
    ).readingContainer;
    expect(readingContainer.textContent).toContain("Long RSS feed body.");
    expect(readingContainer.textContent).not.toContain(
      "Short fetched Reader body.",
    );

    await view.actionSaveCurrentArticle();

    expect(article.savedFilePath).toBeDefined();
    const saved = app.vault.getAbstractFileByPath(article.savedFilePath ?? "");
    expect(saved).toBeInstanceOf(TFile);
    if (!(saved instanceof TFile)) throw new Error("expected saved TFile");
    const written = await app.vault.read(saved);
    expect(written).toContain("Short fetched Reader body.");
    expect(written).not.toContain("Long RSS feed body.");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
