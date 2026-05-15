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
};

function getInternals(view: ReaderView): ReaderViewInternals {
  return view as unknown as ReaderViewInternals;
}

describe("ReaderView tooltip attribute stripping", () => {
  let readerView: ReaderView;
  let mockApp: {
    workspace: {
      getLeavesOfType: ReturnType<typeof vi.fn>;
      setActiveLeaf: ReturnType<typeof vi.fn>;
      revealLeaf: ReturnType<typeof vi.fn>;
    };
    vault: {
      getAbstractFileByPath: ReturnType<typeof vi.fn>;
    };
  };
  let mockLeaf: MockLeaf;
  let mockSettings: RssDashboardSettings;

  beforeEach(async () => {
    mockApp = {
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
      mockLeaf as never,
      mockSettings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );

    getInternals(readerView).contentEl = document.createElement("div");
    await readerView.onOpen();
  });

  it("removes aria-label/data-tooltip attributes from embedded article HTML", async () => {
    const item: FeedItem = {
      title: "Tooltip Sanitization Test",
      link: "https://aeon.co/test-article",
      description:
        '<nav aria-label="Breadcrumbs"><a href="/crumbs" data-tooltip="Breadcrumbs">crumbs</a></nav>',
      content:
        '<main aria-label="Article body" data-tooltip-position="top" data-tooltip-delay="1"><p>Hello</p></main>',
      pubDate: new Date().toISOString(),
      guid: "tooltip-1",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Aeon",
      feedUrl: "https://aeon.co/feed.rss",
      coverImage: "",
      mediaType: "article",
      saved: false,
    };

    await readerView.displayItem(item);

    const readingContainer = getInternals(readerView).readingContainer;
    const articleContent = readingContainer.querySelector<HTMLElement>(
      ".rss-reader-article-content",
    );
    const descriptionContent = readingContainer.querySelector<HTMLElement>(
      ".rss-reader-description",
    );

    expect(articleContent).toBeTruthy();
    expect(descriptionContent).toBeTruthy();

    expect(articleContent?.querySelector("[aria-label]")).toBeNull();
    expect(descriptionContent?.querySelector("[aria-label]")).toBeNull();

    expect(articleContent?.querySelector("[data-tooltip]")).toBeNull();
    expect(descriptionContent?.querySelector("[data-tooltip]")).toBeNull();
    expect(articleContent?.querySelector("[data-tooltip-position]")).toBeNull();
    expect(articleContent?.querySelector("[data-tooltip-delay]")).toBeNull();

    const descriptionLink =
      descriptionContent?.querySelector<HTMLAnchorElement>("a");
    expect(descriptionLink?.getAttribute("href")).toBe(
      "https://aeon.co/crumbs",
    );
  });
});
