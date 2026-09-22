import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

// Regression coverage for GH Issue #332: the reader view's star toggle
// (also reached via the star hotkey, which calls the same
// `actionToggleStarStatus`) must request only a `starred` update, never a
// `tags` update — proving the reader's primary star entry point does not
// itself touch tags. Actual normalization (main.ts's shared
// `applyAutomaticArticleTags` seam) is covered separately in
// tag-utils.test.ts and dashboard-star-tag-independence.test.ts.

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
  currentItem: FeedItem;
  fetchFullArticleContent: ReturnType<typeof vi.fn>;
  actionToggleStarStatus: () => void;
};

function getInternals(view: ReaderView): ReaderViewInternals {
  return view as unknown as ReaderViewInternals;
}

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Article Title",
    link: "https://example.com/article",
    description: "Description",
    content: "Content",
    pubDate: new Date().toISOString(),
    guid: "guid-1",
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

describe("ReaderView star/tag independence (GH Issue #332)", () => {
  let readerView: ReaderView;
  let mockSettings: RssDashboardSettings;
  let onArticleUpdate: ReturnType<typeof vi.fn>;

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
    onArticleUpdate = vi.fn();

    const mockLeaf = new MockLeaf(mockApp);
    readerView = new ReaderView(
      mockLeaf as never,
      mockSettings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      onArticleUpdate,
    );

    getInternals(readerView).contentEl = createDiv();
    await readerView.onOpen();
  });

  it("starring via the reader's star action requests only a starred update", async () => {
    const item = makeItem({
      starred: false,
      tags: [{ name: "news", color: "#111111" }],
    });
    getInternals(readerView).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue("<p>Content</p>");
    await readerView.displayItem(item);

    getInternals(readerView).actionToggleStarStatus();

    expect(onArticleUpdate).toHaveBeenCalledTimes(1);
    const [, updates] = onArticleUpdate.mock.calls[0] as [
      FeedItem,
      Partial<FeedItem>,
    ];
    expect(updates).toEqual({ starred: true });
    expect(updates.tags).toBeUndefined();
  });

  it("unstarring via the reader's star action requests only a starred update", async () => {
    const item = makeItem({
      starred: true,
      tags: [{ name: "Favorite", color: "#f1c40f" }],
    });
    getInternals(readerView).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue("<p>Content</p>");
    await readerView.displayItem(item);

    getInternals(readerView).actionToggleStarStatus();

    expect(onArticleUpdate).toHaveBeenCalledTimes(1);
    const [, updates] = onArticleUpdate.mock.calls[0] as [
      FeedItem,
      Partial<FeedItem>,
    ];
    expect(updates).toEqual({ starred: false });
    expect(updates.tags).toBeUndefined();
  });
});
