import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

class MockLeaf {
  app: unknown;
  view: unknown;
  constructor(app: unknown) {
    this.app = app;
  }
  detach = vi.fn();
}

type ReaderViewInternals = {
  contentEl: HTMLElement;
  readingContainer: HTMLElement;
  fetchFullArticleContent: ReturnType<typeof vi.fn>;
};

function getInternals(view: ReaderView): ReaderViewInternals {
  return view as unknown as ReaderViewInternals;
}

describe("ReaderView hero image ignores feed icon", () => {
  let readerView: ReaderView;
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
      mockLeaf as never,
      mockSettings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );

    getInternals(readerView).contentEl = document.createElement("div");
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

    getInternals(readerView).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue("");
    await readerView.displayItem(item);

    const container = getInternals(readerView).readingContainer;
    const hero = container.querySelector<HTMLElement>(".rss-reader-hero-slot");
    expect(hero?.querySelector("img")).toBeNull();
  });
});
