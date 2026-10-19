/**
 * Regression tests for the Reader view's RSS-content hero (#1354).
 *
 * Bug: the dashboard's manual cover-image fetch stores the article page's image
 * in `coverImage`, and the RSS version's hero read that same field, so a page
 * image replaced the feed's own picture in the feed's version. The RSS hero now
 * ignores a page-derived cover and resolves the feed's own image instead.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

const PAGE_COVER = "https://daily.jstor.org/wp-content/uploads/page-hero.jpg";
const FEED_IMAGE = "https://daily.jstor.org/wp-content/uploads/feed-own.jpg";

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

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Why Washing Machines Took Decades to Catch On",
    link: "https://daily.jstor.org/why-washing-machines-took-decades-to-catch-on/",
    description: "",
    content: "<p>Body text of the article.</p>",
    pubDate: new Date().toISOString(),
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "JSTOR Daily",
    feedUrl: "http://daily.jstor.org/feed/",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

describe("ReaderView RSS hero keeps the feed's own image (#1354)", () => {
  let readerView: ReaderView;

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

    const settings: RssDashboardSettings = {
      ...DEFAULT_SETTINGS,
      useWebViewer: false,
      feeds: [],
    };

    const mockLeaf = new MockLeaf(mockApp);
    readerView = new ReaderView(
      mockLeaf as never,
      settings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );

    getInternals(readerView).contentEl = createDiv();
    await readerView.onOpen();

    // No network: the RSS content comes from the item fields only.
    getInternals(readerView).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue({ content: "", failureType: "none" });
  });

  afterEach(() => {
    document.body.empty();
    vi.clearAllMocks();
  });

  const heroImg = () =>
    getInternals(readerView).readingContainer.querySelector<HTMLImageElement>(
      ".rss-reader-hero-slot img",
    );

  it("shows the feed's own image, not the page cover fetched for the card", async () => {
    await readerView.displayItem(
      makeItem({
        coverImage: PAGE_COVER,
        coverImageFromPage: true,
        image: FEED_IMAGE,
      }),
    );

    expect(heroImg()?.getAttribute("src")).toBe(FEED_IMAGE);
  });

  it("shows no hero when the feed supplies no image of its own", async () => {
    await readerView.displayItem(
      makeItem({
        coverImage: PAGE_COVER,
        coverImageFromPage: true,
      }),
    );

    expect(heroImg()).toBeNull();
  });
});
