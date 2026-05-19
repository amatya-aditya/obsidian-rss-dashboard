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
  applyReaderFormat: () => void;
};

function getInternals(view: ReaderView): ReaderViewInternals {
  return view as unknown as ReaderViewInternals;
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
      new MockLeaf(mockApp) as never,
      mockSettings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );

    getInternals(readerView).contentEl = document.createElement("div");
    await readerView.onOpen();
  });

  it("exposes one shared body font-size variable derived from fontScalePct", () => {
    const contentEl = getInternals(readerView).contentEl;

    expect(
      contentEl.style.getPropertyValue("--rss-reader-body-font-size"),
    ).toBe("1.25em");
    expect(contentEl.style.getPropertyValue("--rss-reader-font-scale")).toBe(
      "1.25",
    );
  });

  it("updates the article headline font when the reader font changes", async () => {
    mockSettings.readerFormat.fontFamily = "serif";
    getInternals(readerView).applyReaderFormat();
    await readerView.displayItem(makeItem());

    const headline = getInternals(
      readerView,
    ).readingContainer.querySelector<HTMLElement>(".rss-reader-item-title");

    expect(headline?.style.fontFamily).toBe(
      'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    );

    mockSettings.readerFormat.fontFamily = "mono";
    getInternals(readerView).applyReaderFormat();

    expect(headline?.style.fontFamily).toBe(
      'var(--font-monospace), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    );
  });
});
