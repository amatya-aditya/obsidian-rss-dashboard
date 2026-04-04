import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  DEFAULT_SETTINGS,
  FeedItem,
  RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

class MockLeaf {
  app: any;
  view: any;

  constructor(app: any) {
    this.app = app;
  }

  detach = vi.fn();
  updateHeader = vi.fn();
}

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Article A",
    link: "https://example.com/article-a",
    description: "<p>Fallback description</p>",
    content: "",
    pubDate: "2026-04-01T10:00:00.000Z",
    guid: "guid-a",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Example Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

describe("ReaderView tab title sync", () => {
  let readerView: ReaderView;
  let mockLeaf: MockLeaf;
  let mockSettings: RssDashboardSettings;

  beforeEach(async () => {
    const mockApp = {
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
      },
      vault: {
        getAbstractFileByPath: vi.fn(),
      },
    };

    mockLeaf = new MockLeaf(mockApp);
    mockSettings = { ...DEFAULT_SETTINGS, useWebViewer: false };

    readerView = new ReaderView(
      mockLeaf as any,
      mockSettings,
      { saveArticle: vi.fn() } as any,
      vi.fn(),
      vi.fn(),
    );

    (readerView as any).contentEl = document.createElement("div");
    await readerView.onOpen();
  });

  it("refreshes the tab title when reusing the same reader view for another article", async () => {
    const itemA = makeItem();
    const itemB = makeItem({
      title: "Article B",
      link: "https://example.com/article-b",
      guid: "guid-b",
    });

    (readerView as any).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue("");

    await readerView.displayItem(itemA);
    expect(readerView.getDisplayText()).toBe("Article A");
    expect(mockLeaf.updateHeader).toHaveBeenCalledTimes(2);

    await readerView.displayItem(itemB);

    expect(readerView.getDisplayText()).toBe("Article B");
    expect(mockLeaf.updateHeader).toHaveBeenCalledTimes(4);
  });

  it("refreshes the tab title again when fetched full article content provides a better title", async () => {
    const item = makeItem({
      title: "Feed Title",
      link: "https://example.com/full-article",
      guid: "guid-full",
    });

    (readerView as any).fetchFullArticleContent = vi.fn().mockResolvedValue(`
      <h1>Fetched Full Article Title</h1>
      <p>${"x".repeat(260)}</p>
    `);

    await readerView.displayItem(item);

    expect(readerView.getDisplayText()).toBe("Fetched Full Article Title");
    expect(mockLeaf.updateHeader).toHaveBeenCalledTimes(2);
  });
});
