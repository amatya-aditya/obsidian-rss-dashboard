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
}

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Reader headline",
    link: "https://example.com/article",
    description: "<p>Summary</p>",
    content: "<p>Body copy</p>",
    pubDate: new Date().toISOString(),
    guid: "reader-guid",
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

describe("ReaderView font scaling", () => {
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

    mockSettings = {
      ...DEFAULT_SETTINGS,
      useWebViewer: false,
      readerFormat: {
        ...DEFAULT_SETTINGS.readerFormat,
        fontScalePct: 125,
      },
    };

    readerView = new ReaderView(
      new MockLeaf(mockApp) as any,
      mockSettings,
      { saveArticle: vi.fn() } as any,
      vi.fn(),
      vi.fn(),
    );

    (readerView as any).contentEl = document.createElement("div");
    await readerView.onOpen();
  });

  it("exposes one shared body font-size variable derived from fontScalePct", () => {
    const contentEl = (readerView as any).contentEl as HTMLElement;

    expect(contentEl.style.getPropertyValue("--rss-reader-body-font-size")).toBe(
      "1.25em",
    );
    expect(contentEl.style.getPropertyValue("--rss-reader-font-scale")).toBe(
      "1.25",
    );
  });

  it("updates the article headline font when the reader font changes", async () => {
    mockSettings.readerFormat.fontFamily = "serif";
    (readerView as any).applyReaderFormat();
    await readerView.displayItem(makeItem());

    const headline = (readerView as any).readingContainer.querySelector(
      ".rss-reader-item-title",
    ) as HTMLElement | null;

    expect(headline?.style.fontFamily).toBe(
      'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    );

    mockSettings.readerFormat.fontFamily = "mono";
    (readerView as any).applyReaderFormat();

    expect(headline?.style.fontFamily).toBe(
      'var(--font-monospace), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    );
  });
});
