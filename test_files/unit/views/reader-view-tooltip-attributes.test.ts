import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import { FeedItem, RssDashboardSettings, DEFAULT_SETTINGS } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

class MockLeaf {
  app: any;
  view: any;
  constructor(app: any) {
    this.app = app;
  }
  detach = vi.fn();
}

describe("ReaderView tooltip attribute stripping", () => {
  let readerView: any;
  let mockApp: any;
  let mockLeaf: any;
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
      mockLeaf as any,
      mockSettings,
      { saveArticle: vi.fn() } as any,
      vi.fn(),
      vi.fn(),
    );

    (readerView as any).contentEl = document.createElement("div");
    await readerView.onOpen();
  });

  it("removes aria-label/data-tooltip attributes from embedded article HTML", async () => {
    const item: FeedItem = {
      title: "Tooltip Sanitization Test",
      link: "https://aeon.co/test-article",
      description:
        "<nav aria-label=\"Breadcrumbs\"><a href=\"/crumbs\" data-tooltip=\"Breadcrumbs\">crumbs</a></nav>",
      content:
        "<main aria-label=\"Article body\" data-tooltip-position=\"top\" data-tooltip-delay=\"1\"><p>Hello</p></main>",
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

    const readingContainer = (readerView as any).readingContainer as HTMLElement;
    const articleContent = readingContainer.querySelector(
      ".rss-reader-article-content",
    ) as HTMLElement | null;
    const descriptionContent = readingContainer.querySelector(
      ".rss-reader-description",
    ) as HTMLElement | null;

    expect(articleContent).toBeTruthy();
    expect(descriptionContent).toBeTruthy();

    expect(articleContent?.querySelector("[aria-label]")).toBeNull();
    expect(descriptionContent?.querySelector("[aria-label]")).toBeNull();

    expect(articleContent?.querySelector("[data-tooltip]")).toBeNull();
    expect(descriptionContent?.querySelector("[data-tooltip]")).toBeNull();
    expect(articleContent?.querySelector("[data-tooltip-position]")).toBeNull();
    expect(articleContent?.querySelector("[data-tooltip-delay]")).toBeNull();

    const descriptionLink = descriptionContent?.querySelector("a") as HTMLAnchorElement | null;
    expect(descriptionLink?.getAttribute("href")).toBe("https://aeon.co/crumbs");
  });
});
