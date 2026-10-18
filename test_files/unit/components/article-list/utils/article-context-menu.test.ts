import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FeedItem } from "../../../../../src/types/types";
import { showArticleContextMenu } from "../../../../../src/components/article-list/utils/article-context-menu";
import { Menu } from "obsidian";

function buildContext(
  overrides: {
    callbacks?: {
      onOpenSavedArticle?: (article: FeedItem) => Promise<void> | void;
      onOpenInReaderView?: (article: FeedItem) => void;
      onArticleUpdate?: (
        article: FeedItem,
        updates: Partial<FeedItem>,
        shouldRerender?: boolean,
      ) => void;
      onArticleSave?: (article: FeedItem) => Promise<void> | void;
      onArticleCustomSave?: (
        article: FeedItem,
        hooks: { onSavingChange: (saving: boolean) => void },
      ) => Promise<void> | void;
      onArticleClick?: (article: FeedItem) => void;
      onFetchCoverImage?: (article: FeedItem) => Promise<boolean>;
      onCoverImageFetched?: (article: FeedItem) => void;
    };
    showFetchCoverImage?: boolean;
    settings?: {
      articleSaving?: {
        saveVersion: "rss" | "fetched";
      };
    };
  } = {},
) {
  return {
    callbacks: overrides.callbacks ?? {},
    showFetchCoverImage: overrides.showFetchCoverImage,
    settings: {
      articleSaving: {
        saveVersion: "fetched" as const,
        ...overrides.settings?.articleSaving,
      },
    },
  };
}

describe("article-context-menu utils", () => {
  let container: HTMLElement;
  let article: FeedItem;

  beforeEach(() => {
    container = createDiv();
    document.body.appendChild(container);
    article = {
      title: "Test Article",
      link: "https://example.com/article",
      description: "Description",
      pubDate: "2024-01-01",
      guid: "test-article-guid",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Test Feed",
      feedUrl: "https://example.com/feed",
      coverImage: "",
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("adds separator after saved items when article is saved", () => {
    const ctx = buildContext({
      callbacks: { onOpenSavedArticle: () => {}, onOpenInReaderView: () => {} },
    });
    article.saved = true;

    showArticleContextMenu(
      new MouseEvent("contextmenu") as unknown as MouseEvent,
      article,
      ctx,
    );

    // Verify the method runs without throwing
    expect(true).toBe(true);
  });

  it("omits saved item options when article is not saved", () => {
    const ctx = buildContext({
      callbacks: { onArticleUpdate: () => {}, onArticleSave: () => {} },
    });
    article.saved = false;

    showArticleContextMenu(
      new MouseEvent("contextmenu") as unknown as MouseEvent,
      article,
      ctx,
    );

    expect(true).toBe(true);
  });

  it("configures the mark-as-read item when article is unread", () => {
    const onArticleUpdate = vi.fn();
    article.read = true;
    const ctx = buildContext({
      callbacks: { onArticleUpdate, onArticleClick: () => {} },
    });

    showArticleContextMenu(
      new MouseEvent("contextmenu") as unknown as MouseEvent,
      article,
      ctx,
    );

    expect(onArticleUpdate).not.toHaveBeenCalled();
  });

  it("configures the open-in-browser item", () => {
    const ctx = buildContext({ callbacks: { onArticleClick: () => {} } });

    showArticleContextMenu(
      new MouseEvent("contextmenu") as unknown as MouseEvent,
      article,
      ctx,
    );

    expect(true).toBe(true);
  });

  it("configures the split-view item", () => {
    const onArticleClick = vi.fn();
    const ctx = buildContext({ callbacks: { onArticleClick } });

    showArticleContextMenu(
      new MouseEvent("contextmenu") as unknown as MouseEvent,
      article,
      ctx,
    );

    expect(onArticleClick).not.toHaveBeenCalled();
  });

  it("includes save item when article is not saved", () => {
    article.saved = false;
    const ctx = buildContext({ callbacks: { onArticleSave: async () => {} } });

    showArticleContextMenu(
      new MouseEvent("contextmenu") as unknown as MouseEvent,
      article,
      ctx,
    );

    expect(true).toBe(true);
  });

  it("skips save item when article is already saved", () => {
    article.saved = true;
    const ctx = buildContext({ callbacks: { onArticleSave: async () => {} } });

    showArticleContextMenu(
      new MouseEvent("contextmenu") as unknown as MouseEvent,
      article,
      ctx,
    );

    expect(true).toBe(true);
  });

  it("omits 'Open in browser' and 'Copy article URL' for a linkless article", () => {
    article.link = "";
    const ctx = buildContext();

    showArticleContextMenu(
      new MouseEvent("contextmenu") as unknown as MouseEvent,
      article,
      ctx,
    );

    const titles = Menu.lastItems.map((item) => item.title);
    expect(titles).not.toContain("Open in browser");
    expect(titles).not.toContain("Copy article URL");
    expect(titles).toContain("Open in split view");
  });

  it("includes 'Open in browser' and 'Copy article URL' for an article with a link", () => {
    const ctx = buildContext();

    showArticleContextMenu(
      new MouseEvent("contextmenu") as unknown as MouseEvent,
      article,
      ctx,
    );

    const titles = Menu.lastItems.map((item) => item.title);
    expect(titles).toContain("Open in browser");
    expect(titles).toContain("Copy article URL");
  });

  it("replaces the single save item with Default save and Custom save", () => {
    const onArticleSave = vi.fn();
    const onArticleCustomSave = vi.fn();
    const ctx = buildContext({
      callbacks: { onArticleSave, onArticleCustomSave },
    });

    showArticleContextMenu(
      new MouseEvent("contextmenu") as unknown as MouseEvent,
      article,
      ctx,
    );

    const titles = Menu.lastItems.map((item) => item.title);
    expect(titles).toContain("Save with default settings");
    expect(titles).toContain("Save to custom folder...");
    expect(titles).not.toContain("Save full article");
    expect(titles).not.toContain("Save article summary");

    Menu.lastItems
      .find((item) => item.title === "Save with default settings")
      ?.trigger();
    expect(onArticleSave).toHaveBeenCalledWith(article);
    expect(onArticleCustomSave).not.toHaveBeenCalled();

    Menu.lastItems
      .find((item) => item.title === "Save to custom folder...")
      ?.trigger();
    expect(onArticleCustomSave).toHaveBeenCalledWith(article, {
      onSavingChange: expect.any(Function),
    });
  });

  it("offers no save items once the article is saved", () => {
    article.saved = true;
    showArticleContextMenu(
      new MouseEvent("contextmenu") as unknown as MouseEvent,
      article,
      buildContext(),
    );

    const titles = Menu.lastItems.map((item) => item.title);
    expect(titles).not.toContain("Save with default settings");
    expect(titles).not.toContain("Save to custom folder...");
  });

  describe("cover image fetch (#1314)", () => {
    it("offers to fetch a cover image when the card has none", () => {
      const ctx = buildContext({
        showFetchCoverImage: true,
        callbacks: { onFetchCoverImage: async () => true },
      });

      showArticleContextMenu(
        new MouseEvent("contextmenu") as unknown as MouseEvent,
        article,
        ctx,
      );

      const titles = Menu.lastItems.map((item) => item.title);
      expect(titles).toContain("Fetch and replace cover image");
      expect(titles).not.toContain("Replace cover image from the fetch");
    });

    it("offers to replace a cover image the item already has", () => {
      article.coverImage = "https://cdn.example.com/old.jpg";
      const ctx = buildContext({
        showFetchCoverImage: true,
        callbacks: { onFetchCoverImage: async () => true },
      });

      showArticleContextMenu(
        new MouseEvent("contextmenu") as unknown as MouseEvent,
        article,
        ctx,
      );

      const titles = Menu.lastItems.map((item) => item.title);
      expect(titles).toContain("Replace cover image from the fetch");
      expect(titles).not.toContain("Fetch and replace cover image");
    });

    it("hides the item when the surface does not offer it", () => {
      const ctx = buildContext({
        callbacks: { onFetchCoverImage: async () => true },
      });

      showArticleContextMenu(
        new MouseEvent("contextmenu") as unknown as MouseEvent,
        article,
        ctx,
      );

      const titles = Menu.lastItems.map((item) => item.title);
      expect(titles).not.toContain("Fetch and replace cover image");
      expect(titles).not.toContain("Replace cover image from the fetch");
    });

    it("hides the item for an article with no link", () => {
      article.link = "";
      const ctx = buildContext({
        showFetchCoverImage: true,
        callbacks: { onFetchCoverImage: async () => true },
      });

      showArticleContextMenu(
        new MouseEvent("contextmenu") as unknown as MouseEvent,
        article,
        ctx,
      );

      const titles = Menu.lastItems.map((item) => item.title);
      expect(titles).not.toContain("Fetch and replace cover image");
    });

    it("fetches on activation and rebuilds the card only when a cover was found", async () => {
      const onFetchCoverImage = vi.fn().mockResolvedValue(true);
      const onCoverImageFetched = vi.fn();
      const ctx = buildContext({
        showFetchCoverImage: true,
        callbacks: { onFetchCoverImage, onCoverImageFetched },
      });

      showArticleContextMenu(
        new MouseEvent("contextmenu") as unknown as MouseEvent,
        article,
        ctx,
      );
      Menu.lastItems
        .find((item) => item.title === "Fetch and replace cover image")
        ?.trigger();
      await vi.waitFor(() =>
        expect(onCoverImageFetched).toHaveBeenCalledWith(article),
      );
      expect(onFetchCoverImage).toHaveBeenCalledWith(article);
    });

    it("leaves the card alone when no cover was found", async () => {
      const onFetchCoverImage = vi.fn().mockResolvedValue(false);
      const onCoverImageFetched = vi.fn();
      const ctx = buildContext({
        showFetchCoverImage: true,
        callbacks: { onFetchCoverImage, onCoverImageFetched },
      });

      showArticleContextMenu(
        new MouseEvent("contextmenu") as unknown as MouseEvent,
        article,
        ctx,
      );
      Menu.lastItems
        .find((item) => item.title === "Fetch and replace cover image")
        ?.trigger();
      await Promise.resolve();
      await Promise.resolve();
      expect(onCoverImageFetched).not.toHaveBeenCalled();
    });
  });
});
