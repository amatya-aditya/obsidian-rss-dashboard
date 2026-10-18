import { beforeEach, describe, expect, it, vi } from "vitest";
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
  constructor(app: unknown) {
    this.app = app;
  }
  detach = vi.fn();
}

function makeVideoItem(link: string): FeedItem {
  return {
    title: "Video without an id",
    link,
    description: "",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "video-no-id-1297",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Video Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "video",
    saved: false,
  };
}

describe("ReaderView video-id-not-found Watch on YouTube link (#1297)", () => {
  let readerView: ReaderView;

  beforeEach(() => {
    document.body.innerHTML = "";
    readerView = new ReaderView(
      new MockLeaf({
        workspace: {
          getLeavesOfType: vi.fn().mockReturnValue([]),
          setActiveLeaf: vi.fn(),
          revealLeaf: vi.fn(),
        },
        vault: { getAbstractFileByPath: vi.fn() },
      }) as never,
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
      vi.fn(),
    );
    (readerView as unknown as { contentEl: HTMLElement }).contentEl =
      createDiv();
  });

  async function renderError(link: string): Promise<Element | null> {
    await readerView.onOpen();
    const internals = readerView as unknown as {
      readingContainer: HTMLElement;
      displayArticle: (item: FeedItem) => Promise<void>;
      displayVideo: (item: FeedItem) => Promise<void>;
    };
    // The article body path is covered elsewhere; only the error row matters here.
    internals.displayArticle = vi.fn().mockResolvedValue(undefined);
    await internals.displayVideo(makeVideoItem(link));
    return internals.readingContainer.querySelector(".rss-reader-error");
  }

  it("omits the link when the feed link is not http(s)", async () => {
    const error = await renderError("javascript:alert(1)");
    expect(error?.textContent).toContain("Video id not found");
    expect(error?.querySelector("a")).toBeNull();
  });

  it("keeps the link for an http(s) feed link", async () => {
    const error = await renderError("https://example.com/watch");
    expect(error?.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com/watch",
    );
  });
});
