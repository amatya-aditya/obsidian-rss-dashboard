import { describe, it, expect, beforeEach, vi } from "vitest";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  RESTRICTED_ARTICLE_NOTICE,
  RESTRICTED_ARTICLE_REASON,
} from "../../../src/utils/full-article-fetch";

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

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Restricted Article",
    link: "https://example.com/article",
    description: "<p>Fallback excerpt from feed.</p>",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "guid-restricted-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

describe("ArticleRenderer restricted-content handling", () => {
  let renderer: ArticleRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.empty();

    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "",
      failureType: "restricted",
    });

    const mockApp = {
      workspace: { getLeavesOfType: vi.fn().mockReturnValue([]) },
      vault: { getAbstractFileByPath: vi.fn() },
    };

    renderer = new ArticleRenderer({
      app: mockApp as never,
      settings: { ...DEFAULT_SETTINGS } as RssDashboardSettings,
      onArticleSave: vi.fn(),
      onArticleUpdate: vi.fn(),
    });

    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("shows a restricted notice and inline banner while keeping the feed excerpt", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const item = makeItem();

    await renderer.render(container, item);

    expect(fetchFullArticleContentWithOutcomeMock).toHaveBeenCalledWith(
      item.link,
      undefined,
    );
    expect(item.restrictedReason).toBe(RESTRICTED_ARTICLE_REASON);
    expect(logSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      RESTRICTED_ARTICLE_NOTICE,
    );

    const banner = container.querySelector(".rss-reader-paywall-banner");
    const content = container.querySelector(".rss-reader-article-content");
    expect(banner).not.toBeNull();
    expect(content).not.toBeNull();

    if (!banner || !content) {
      throw new Error("Expected banner and content elements to be present");
    }

    const link = banner.querySelector("a");

    expect(banner?.textContent).toContain("restricted or paywalled");
    expect(banner?.textContent).toContain("Click here to double check.");
    expect(link?.getAttribute("href")).toBe(item.link);
    expect(
      content.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(content.textContent).toContain("Fallback excerpt from feed.");
  });

  it("skips restricted full-article fetch for media:content video items", async () => {
    const item = makeItem({
      link: "https://www.bloomberg.com/news/videos/2025-05-12/sample-video",
      mediaContentType: "video/mp4",
    });

    await renderer.render(container, item);

    expect(fetchFullArticleContentWithOutcomeMock).not.toHaveBeenCalled();
    expect(item.restrictedReason).toBeUndefined();
    expect(
      container.querySelector(".rss-reader-paywall-banner"),
    ).toBeNull();
    expect(container.textContent).toContain("Fallback excerpt from feed.");
  });

  it("skips full-article fetch for Bloomberg video routes even when media metadata is image-only", async () => {
    const item = makeItem({
      link: "https://www.bloomberg.com/news/videos/2025-05-12/sample-video",
      mediaContentType: "image/jpeg",
      mediaType: "article",
    });

    await renderer.render(container, item);

    expect(fetchFullArticleContentWithOutcomeMock).not.toHaveBeenCalled();
    expect(item.restrictedReason).toBeUndefined();
    expect(container.querySelector(".rss-reader-paywall-banner")).toBeNull();

    const videoBanner = container.querySelector(".rss-reader-video-banner");
    expect(videoBanner).not.toBeNull();
    expect(videoBanner?.textContent).toContain("appears to be a video");

    const sourceLink = videoBanner?.querySelector("a");
    expect(sourceLink?.textContent).toContain("Open video at source");
    expect(sourceLink?.getAttribute("href")).toBe(item.link);
  });
});
