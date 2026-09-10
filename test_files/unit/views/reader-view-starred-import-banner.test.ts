import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

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
    title: "Starred Import Article",
    link: "https://example.com/starred-article",
    description: "<p>Export-provided excerpt.</p>",
    content: "<p>Export-provided excerpt.</p>",
    pubDate: new Date().toISOString(),
    guid: "starred-import-1",
    read: false,
    starred: true,
    tags: [],
    feedTitle: "Reader Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

function makeMockApp() {
  return {
    workspace: {
      getLeavesOfType: vi.fn().mockReturnValue([]),
      setActiveLeaf: vi.fn(),
      revealLeaf: vi.fn(),
    },
    vault: {
      getAbstractFileByPath: vi.fn(),
    },
  };
}

describe("ReaderView starred-import cached-preview banner", () => {
  let readerView: ReaderView;
  let onArticleUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";

    onArticleUpdate = vi.fn();

    readerView = new ReaderView(
      new MockLeaf(makeMockApp()) as never,
      {
        ...DEFAULT_SETTINGS,
        useWebViewer: false,
        corsProxyEnabled: false,
      } as RssDashboardSettings,
      {
        saveArticle: vi.fn(),
        checkSavedFileExists: vi.fn().mockReturnValue(true),
      } as never,
      vi.fn(),
      onArticleUpdate,
    );

    (readerView as unknown as { contentEl: HTMLElement }).contentEl =
      createDiv();
  });

  it("skips the automatic fetch-on-open and shows the cached-preview banner for an unfetched article", async () => {
    const importedAt = new Date("2026-01-05T10:00:00.000Z").getTime();
    const item = makeItem({
      starredImportContentState: "unfetched",
      starredImportedAt: importedAt,
    });

    await readerView.onOpen();
    await readerView.displayItem(item);

    expect(fetchFullArticleContentWithOutcomeMock).not.toHaveBeenCalled();

    const readingContainer = (
      readerView as unknown as { readingContainer: HTMLElement }
    ).readingContainer;
    const banner = readingContainer.querySelector(
      ".rss-reader-starred-import-banner",
    );
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain(
      "cached preview from the starred.json import",
    );
    expect(banner?.textContent).toContain(
      new Date(importedAt).toLocaleString(),
    );

    const fetchNowButton = banner?.querySelector(
      ".rss-reader-starred-import-fetch-now",
    );
    expect(fetchNowButton?.textContent).toContain("Fetch now");

    const openLink = banner?.querySelector(
      ".rss-reader-starred-import-open-link",
    );
    expect(openLink?.getAttribute("href")).toBe(item.link);
    expect(openLink?.textContent).toContain("Open in Browser");
  });

  it("shows a distinct banner wording for an article whose last fetch attempt failed", async () => {
    const item = makeItem({
      starredImportContentState: "failed",
      starredImportedAt: Date.now(),
    });

    await readerView.onOpen();
    await readerView.displayItem(item);

    expect(fetchFullArticleContentWithOutcomeMock).not.toHaveBeenCalled();

    const readingContainer = (
      readerView as unknown as { readingContainer: HTMLElement }
    ).readingContainer;
    const banner = readingContainer.querySelector(
      ".rss-reader-starred-import-banner",
    );
    expect(banner?.textContent).toContain("last attempt to fetch");
    expect(banner?.textContent?.startsWith("The last attempt to fetch")).toBe(
      true,
    );
  });

  it("does not affect automatic fetch-on-open for an article without the content-state field", async () => {
    const item = makeItem({ starredImportContentState: undefined });

    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "",
      failureType: "network",
    });

    await readerView.onOpen();
    await readerView.displayItem(item);

    expect(fetchFullArticleContentWithOutcomeMock).toHaveBeenCalledWith(
      item.link,
      undefined,
    );

    const readingContainer = (
      readerView as unknown as { readingContainer: HTMLElement }
    ).readingContainer;
    expect(
      readingContainer.querySelector(".rss-reader-starred-import-banner"),
    ).toBeNull();
  });

  it("fetches, replaces the content, clears the state, and persists on a successful 'Fetch now' click for a starred article", async () => {
    const item = makeItem({
      starred: true,
      saved: false,
      starredImportContentState: "unfetched",
      starredImportedAt: Date.now(),
    });

    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "<p>Full fetched article body.</p>",
      failureType: "none",
    });

    await readerView.onOpen();
    await readerView.displayItem(item);

    const readingContainer = (
      readerView as unknown as { readingContainer: HTMLElement }
    ).readingContainer;
    const fetchNowButton = readingContainer.querySelector<HTMLButtonElement>(
      ".rss-reader-starred-import-fetch-now",
    );
    expect(fetchNowButton).not.toBeNull();

    fetchNowButton!.dispatchEvent(new Event("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchFullArticleContentWithOutcomeMock).toHaveBeenCalledWith(
      item.link,
      undefined,
    );
    expect(item.content).toBe("<p>Full fetched article body.</p>");
    expect(item.starredImportContentState).toBeUndefined();

    expect(onArticleUpdate).toHaveBeenCalledWith(
      item,
      {
        content: "<p>Full fetched article body.</p>",
        starredImportContentState: undefined,
      },
      false,
    );

    expect(
      readingContainer.querySelector(".rss-reader-starred-import-banner"),
    ).toBeNull();
    expect(readingContainer.textContent).toContain(
      "Full fetched article body.",
    );
  });

  it("does not persist a successful 'Fetch now' fetch for an article that is neither starred nor saved", async () => {
    const item = makeItem({
      starred: false,
      saved: false,
      starredImportContentState: "unfetched",
      starredImportedAt: Date.now(),
    });

    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "<p>Full fetched article body.</p>",
      failureType: "none",
    });

    await readerView.onOpen();
    await readerView.displayItem(item);

    const readingContainer = (
      readerView as unknown as { readingContainer: HTMLElement }
    ).readingContainer;
    const fetchNowButton = readingContainer.querySelector<HTMLButtonElement>(
      ".rss-reader-starred-import-fetch-now",
    );

    fetchNowButton!.dispatchEvent(new Event("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Content is still replaced in-memory for this reading session...
    expect(item.content).toBe("<p>Full fetched article body.</p>");
    // ...but nothing is persisted, since the article is neither starred nor saved.
    expect(onArticleUpdate).not.toHaveBeenCalled();
  });

  it("moves the article to the 'failed' state and shows a notice when 'Fetch now' does not return usable content", async () => {
    const item = makeItem({
      starred: true,
      starredImportContentState: "unfetched",
      starredImportedAt: Date.now(),
    });

    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "",
      failureType: "network",
    });

    await readerView.onOpen();
    await readerView.displayItem(item);

    const readingContainer = (
      readerView as unknown as { readingContainer: HTMLElement }
    ).readingContainer;
    const fetchNowButton = readingContainer.querySelector<HTMLButtonElement>(
      ".rss-reader-starred-import-fetch-now",
    );

    fetchNowButton!.dispatchEvent(new Event("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(item.starredImportContentState).toBe("failed");
    expect(onArticleUpdate).toHaveBeenCalledWith(
      item,
      { starredImportContentState: "failed" },
      false,
    );

    const banner = readingContainer.querySelector(
      ".rss-reader-starred-import-banner",
    );
    expect(banner?.textContent).toContain("last attempt to fetch");
  });
});
