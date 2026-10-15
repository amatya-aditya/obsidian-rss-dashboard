/**
 * Regression tests for the Reader view's hero image (#1182).
 *
 * Bug: every path that chooses an image from a bare stored URL applied no
 * tracking-pixel check, so an item whose stored `coverImage` is a pixel showed
 * it as the hero. Only the URL pattern can reject it here; a stored URL
 * carries no declared width or height.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

const PIXEL = "https://img.example.com/pixel.gif";
const PHOTO = "https://img.example.com/photo.jpg";

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
    title: "Roman fort in Wales",
    link: "https://theconversation.com/roman-fort-in-wales-293076",
    description: "",
    content: "<p>Body text of the article.</p>",
    pubDate: new Date().toISOString(),
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "The Conversation",
    feedUrl: "https://theconversation.com/articles.atom",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

describe("ReaderView hero image ignores a stored tracking pixel", () => {
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

    // No configured feeds, so the feed-icon exclusion never applies here.
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

  const heroImg = () =>
    getInternals(readerView).readingContainer.querySelector<HTMLImageElement>(
      ".rss-reader-hero-slot img",
    );

  it("does not use a stored coverImage tracking pixel as the hero", async () => {
    await readerView.displayItem(makeItem({ coverImage: PIXEL }));

    expect(heroImg()).toBeNull();
  });

  it("does not use a stored image tracking pixel as the hero", async () => {
    await readerView.displayItem(makeItem({ image: PIXEL }));

    expect(heroImg()).toBeNull();
  });

  it("still uses a stored coverImage photo as the hero", async () => {
    await readerView.displayItem(makeItem({ coverImage: PHOTO }));

    expect(heroImg()?.getAttribute("src")).toBe(PHOTO);
  });
});
