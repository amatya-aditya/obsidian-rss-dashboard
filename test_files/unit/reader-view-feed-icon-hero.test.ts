import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReaderView } from "../../src/views/reader-view";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../src/types/types";
import { installObsidianDomPolyfills } from "./test-dom-polyfills";

installObsidianDomPolyfills();

class MockLeaf {
  app: any;
  view: any;
  constructor(app: any) {
    this.app = app;
  }
  detach = vi.fn();
}

describe("ReaderView hero image ignores feed icon", () => {
  let readerView: any;
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

    mockSettings = { ...DEFAULT_SETTINGS, useWebViewer: false };
    mockSettings.feeds = [
      {
        title: "MarketWatch.com - Top Stories",
        url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
        folder: "RSS",
        items: [],
        lastUpdated: Date.now(),
        iconUrl: "https://www.marketwatch.com/rss/marketwatch.gif",
      },
    ];

    const mockLeaf = new MockLeaf(mockApp);
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

  it("does not render feed icon as hero fallback when content has no images", async () => {
    const item: FeedItem = {
      title: "Example",
      link: "https://example.com/article",
      description: "",
      content: "<p>Just text</p>",
      pubDate: new Date().toISOString(),
      guid: "guid-1",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "MarketWatch.com - Top Stories",
      feedUrl: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
      coverImage: "https://www.marketwatch.com/rss/marketwatch.gif",
      mediaType: "article",
      saved: false,
    };

    (readerView as any).fetchFullArticleContent = vi.fn().mockResolvedValue("");
    await readerView.displayItem(item);

    const container = (readerView as any).readingContainer as HTMLElement;
    const hero = container.querySelector(".rss-reader-hero-slot");
    expect(hero?.querySelector("img")).toBeNull();
  });
});

