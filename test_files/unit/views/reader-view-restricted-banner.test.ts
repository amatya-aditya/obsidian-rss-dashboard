import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { RESTRICTED_ARTICLE_REASON } from "../../../src/utils/full-article-fetch";

const fetchFullArticleContentWithOutcomeMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/utils/full-article-fetch", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/utils/full-article-fetch")
  >("../../../src/utils/full-article-fetch");

  return {
    ...actual,
    fetchFullArticleContentWithOutcome: fetchFullArticleContentWithOutcomeMock,
  };
});

installObsidianDomPolyfills();

class MockLeaf {
  app: unknown;

  constructor(app: unknown) {
    this.app = app;
  }

  detach = vi.fn();
}

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Restricted Reader Article",
    link: "https://example.com/restricted-reader",
    description: "<p>Reader fallback excerpt.</p>",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "reader-restricted-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Reader Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

describe("ReaderView restricted-content handling", () => {
  let readerView: ReaderView;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";

    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "",
      failureType: "restricted",
    });

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

    readerView = new ReaderView(
      new MockLeaf(mockApp) as never,
      { ...DEFAULT_SETTINGS, useWebViewer: false, corsProxyEnabled: false } as RssDashboardSettings,
      {
        saveArticle: vi.fn(),
        checkSavedFileExists: vi.fn().mockReturnValue(true),
      } as never,
      vi.fn(),
      vi.fn(),
    );

    (readerView as unknown as { contentEl: HTMLElement }).contentEl =
      document.createElement("div");
  });

  it("shows a restricted notice and banner while keeping the feed excerpt", async () => {
    const item = makeItem();

    await readerView.onOpen();
    await readerView.displayItem(item);

    expect(fetchFullArticleContentWithOutcomeMock).toHaveBeenCalledWith(
      item.link,
      undefined,
    );
    expect(item.restrictedReason).toBe(RESTRICTED_ARTICLE_REASON);

    const readingContainer = (
      readerView as unknown as { readingContainer: HTMLElement }
    ).readingContainer;
    const banner = readingContainer.querySelector(".rss-reader-paywall-banner");
    const content = readingContainer.querySelector(
      ".rss-reader-article-content",
    );
    const link = banner?.querySelector("a");

    expect(banner?.textContent).toContain("restricted or paywalled");
    expect(banner?.textContent).toContain("Click here to double check.");
    expect(link?.getAttribute("href")).toBe(item.link);
    expect(content).toBeTruthy();
    expect(
      content!.compareDocumentPosition(banner as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(content?.textContent).toContain("Reader fallback excerpt.");
  });

  it("skips restricted full-article fetch for media:content video items", async () => {
    const item = makeItem({
      link: "https://www.bloomberg.com/news/videos/2025-05-12/sample-video",
      mediaContentType: "video/mp4",
    });

    await readerView.onOpen();
    await readerView.displayItem(item);

    expect(fetchFullArticleContentWithOutcomeMock).not.toHaveBeenCalled();
    expect(item.restrictedReason).toBeUndefined();

    const readingContainer = (
      readerView as unknown as { readingContainer: HTMLElement }
    ).readingContainer;

    expect(
      readingContainer.querySelector(".rss-reader-paywall-banner"),
    ).toBeNull();
    expect(readingContainer.textContent).toContain("Reader fallback excerpt.");
  });

  it("skips full-article fetch for Bloomberg video routes even when media metadata is image-only", async () => {
    const item = makeItem({
      link: "https://www.bloomberg.com/news/videos/2025-05-12/sample-video",
      mediaContentType: "image/jpeg",
      mediaType: "article",
    });

    await readerView.onOpen();
    await readerView.displayItem(item);

    expect(fetchFullArticleContentWithOutcomeMock).not.toHaveBeenCalled();
    expect(item.restrictedReason).toBeUndefined();

    const readingContainer = (
      readerView as unknown as { readingContainer: HTMLElement }
    ).readingContainer;

    expect(
      readingContainer.querySelector(".rss-reader-paywall-banner"),
    ).toBeNull();

    const videoBanner = readingContainer.querySelector(
      ".rss-reader-video-banner",
    );
    expect(videoBanner).not.toBeNull();
    expect(videoBanner?.textContent).toContain("appears to be a video");

    const sourceLink = videoBanner?.querySelector("a");
    expect(sourceLink?.textContent).toContain("Open video at source");
    expect(sourceLink?.getAttribute("href")).toBe(item.link);
  });
});
