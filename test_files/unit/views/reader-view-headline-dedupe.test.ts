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

function makeBaseItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Feed Title Here",
    link: "https://example.com/article",
    description: "<p>Feed description</p>",
    content: "",
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

describe("ReaderView headline de-dupe", () => {
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

    const mockLeaf = new MockLeaf(mockApp);
    mockSettings = { ...DEFAULT_SETTINGS, useWebViewer: false };

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

  it("uses page <h1> as display title and strips it from content", async () => {
    const html = `<h1>Page Headline From Site</h1><p>${"x".repeat(260)}</p>`;
    getInternals(readerView).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue(html);

    const item = makeBaseItem({ title: "Feed Title Should Not Show" });
    await readerView.displayItem(item);

    const container = getInternals(readerView).readingContainer;
    expect(
      container.querySelector(".rss-reader-item-title")?.textContent,
    ).toContain("Page Headline From Site");

    const content = container.querySelector(".rss-reader-article-content");
    expect(content?.querySelector("h1")).toBeNull();
  });

  it("does not override title for boilerplate <h1> but still strips it near the top", async () => {
    const html = `<h1>Sign in</h1><p>${"x".repeat(260)}</p>`;
    getInternals(readerView).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue(html);

    const item = makeBaseItem({ title: "Feed Title Here" });
    await readerView.displayItem(item);

    const container = getInternals(readerView).readingContainer;
    expect(
      container.querySelector(".rss-reader-item-title")?.textContent,
    ).toContain("Feed Title Here");

    const content = container.querySelector(".rss-reader-article-content");
    expect(content?.querySelector("h1")).toBeNull();
  });

  it("does not strip deep <h1> headings from content", async () => {
    const prefix = Array.from({ length: 12 }, (_, i) => `<p>pre${i}</p>`).join(
      "",
    );
    const html = `<div>${prefix}<h1>Deep Heading</h1><p>${"x".repeat(260)}</p></div>`;
    getInternals(readerView).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue(html);

    const item = makeBaseItem({ title: "Feed Title Here" });
    await readerView.displayItem(item);

    const container = getInternals(readerView).readingContainer;
    expect(
      container.querySelector(".rss-reader-item-title")?.textContent,
    ).toContain("Feed Title Here");

    const content = container.querySelector(".rss-reader-article-content");
    expect(content?.querySelector("h1")?.textContent).toContain("Deep Heading");
  });
});
