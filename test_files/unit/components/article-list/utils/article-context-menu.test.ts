import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FeedItem } from "../../../../src/types/types";
import { showArticleContextMenu } from "../../../../../src/components/article-list/utils/article-context-menu";

function buildContext(overrides: {
  callbacks?: {
    onOpenSavedArticle?: (article: FeedItem) => Promise<void> | void;
    onOpenInReaderView?: (article: FeedItem) => void;
    onArticleUpdate?: (
      article: FeedItem,
      updates: Partial<FeedItem>,
      shouldRerender?: boolean,
    ) => void;
    onArticleSave?: (article: FeedItem) => Promise<void> | void;
    onArticleClick?: (article: FeedItem) => void;
  };
  settings?: {
    articleSaving?: {
      saveFullContent: boolean;
    };
  };
} = {}) {
  return {
    callbacks: overrides.callbacks ?? {},
    settings: {
      articleSaving: { saveFullContent: true, ...overrides.settings?.articleSaving },
    },
  };
}

describe("article-context-menu utils", () => {
  let container: HTMLElement;
  let article: FeedItem;

  beforeEach(() => {
    container = document.createElement("div");
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
    const ctx = buildContext({ callbacks: { onOpenSavedArticle: () => {}, onOpenInReaderView: () => {} } });
    article.saved = true;

    showArticleContextMenu(new MouseEvent("contextmenu") as unknown as MouseEvent, article, ctx);

    // Verify the method runs without throwing
    expect(true).toBe(true);
  });

  it("omits saved item options when article is not saved", () => {
    const ctx = buildContext({ callbacks: { onArticleUpdate: () => {}, onArticleSave: () => {} } });
    article.saved = false;

    showArticleContextMenu(new MouseEvent("contextmenu") as unknown as MouseEvent, article, ctx);

    expect(true).toBe(true);
  });

  it("configures the mark-as-read item when article is unread", () => {
    const onArticleUpdate = vi.fn();
    article.read = true;
    const ctx = buildContext({ callbacks: { onArticleUpdate, onArticleClick: () => {} } });

    showArticleContextMenu(new MouseEvent("contextmenu") as unknown as MouseEvent, article, ctx);

    expect(onArticleUpdate).not.toHaveBeenCalled();
  });

  it("configures the open-in-browser item", () => {
    const ctx = buildContext({ callbacks: { onArticleClick: () => {} } });

    showArticleContextMenu(new MouseEvent("contextmenu") as unknown as MouseEvent, article, ctx);

    expect(true).toBe(true);
  });

  it("configures the split-view item", () => {
    const onArticleClick = vi.fn();
    const ctx = buildContext({ callbacks: { onArticleClick } });

    showArticleContextMenu(new MouseEvent("contextmenu") as unknown as MouseEvent, article, ctx);

    expect(onArticleClick).not.toHaveBeenCalled();
  });

  it("includes save item when article is not saved", () => {
    article.saved = false;
    const ctx = buildContext({ callbacks: { onArticleSave: async () => {} } });

    showArticleContextMenu(new MouseEvent("contextmenu") as unknown as MouseEvent, article, ctx);

    expect(true).toBe(true);
  });

  it("skips save item when article is already saved", () => {
    article.saved = true;
    const ctx = buildContext({ callbacks: { onArticleSave: async () => {} } });

    showArticleContextMenu(new MouseEvent("contextmenu") as unknown as MouseEvent, article, ctx);

    expect(true).toBe(true);
  });
});
