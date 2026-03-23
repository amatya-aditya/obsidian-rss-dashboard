import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReaderView } from "../../src/views/reader-view";
import { FeedItem, RssDashboardSettings, DEFAULT_SETTINGS } from "../../src/types/types";
import { installObsidianDomPolyfills } from "./test-dom-polyfills";

installObsidianDomPolyfills();

class MockLeaf {
  app: any;
  view: any;
  constructor(app: any) {
    this.app = app;
  }
  detach = vi.fn();
}

function makeNitterItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "A very long tweet title that should not be used in the reader header",
    link: "https://twitter.com/janedoe/status/123",
    description: "<p>Hello<br><br>World</p>",
    content: "<p>Hello World</p>",
    pubDate: "2026-03-20T12:34:56.000Z",
    guid: "nitter-guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Jane Doe / @janedoe",
    feedUrl: "https://nitter.net/janedoe/rss",
    coverImage: "",
    mediaType: "article",
    saved: false,
    author: "@janedoe",
    ...overrides,
  };
}

describe("ReaderView Nitter rendering", () => {
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

  it("uses a compact reader-only title for Nitter items (header, H1, and tab text)", async () => {
    (readerView as any).fetchFullArticleContent = vi.fn().mockResolvedValue("<p>should not fetch</p>");

    const item = makeNitterItem();
    await readerView.displayItem(item);

    const expectedTitle = "Jane Doe (@janedoe) · 2026-03-20";

    const headerTitle = (readerView as any).contentEl.querySelector(".rss-reader-title");
    expect(headerTitle?.textContent).toContain(expectedTitle);

    const container = (readerView as any).readingContainer as HTMLElement;
    expect(container.querySelector(".rss-reader-item-title")?.textContent).toContain(expectedTitle);

    expect(readerView.getDisplayText()).toContain(expectedTitle);

    expect((readerView as any).fetchFullArticleContent).not.toHaveBeenCalled();
  });

  it("uses a compact title for X/Twitter links even when feedUrl is not Nitter", async () => {
    const item = makeNitterItem({
      feedUrl: "https://rss.app/feeds/example.xml",
      feedTitle: "",
      author: "",
      link: "https://x.com/janedoe/status/123",
    });

    await readerView.displayItem(item);

    const container = (readerView as any).readingContainer as HTMLElement;
    expect(container.querySelector(".rss-reader-item-title")?.textContent).toContain(
      "@janedoe · 2026-03-20",
    );
  });

  it("renders a single formatted tweet body and skips the feed description callout for Nitter", async () => {
    const item = makeNitterItem({
      description: "<p>Hello<br><br>World</p>",
      content: "<p>Hello World</p>",
    });
    await readerView.displayItem(item);

    const container = (readerView as any).readingContainer as HTMLElement;
    expect(container.querySelector(".rss-reader-description-callout")).toBeNull();

    const content = container.querySelector(".rss-reader-article-content") as HTMLElement | null;
    expect(content).toBeTruthy();
    expect(content?.querySelectorAll("br").length).toBeGreaterThanOrEqual(2);
  });

  it("replaces Nitter stats markup with a compact icon row when present", async () => {
    const statsHtml = `
      <div class="tweet-stats">
        <span class="tweet-stat"><span class="icon-comment"></span> 3</span>
        <span class="tweet-stat"><span class="icon-retweet"></span> 10</span>
        <span class="tweet-stat"><span class="icon-heart"></span> 42</span>
        <span class="tweet-stat"><span class="icon-views"></span> 999</span>
      </div>
    `;

    const item = makeNitterItem({
      description: `<p>Tweet body</p>${statsHtml}`,
      content: "",
    });
    await readerView.displayItem(item);

    const container = (readerView as any).readingContainer as HTMLElement;
    const stats = container.querySelector(".rss-nitter-stats");
    expect(stats).toBeTruthy();

    const icons = Array.from(container.querySelectorAll<HTMLElement>(".rss-nitter-stat-icon"));
    expect(icons.length).toBe(4);
    icons.forEach((el) => {
      expect(el.dataset.icon).toBeTruthy();
    });

    expect(
      container.querySelector<HTMLElement>('.rss-nitter-stat[data-stat="comment"] .rss-nitter-stat-count')
        ?.textContent,
    ).toContain("3");
    expect(
      container.querySelector<HTMLElement>('.rss-nitter-stat[data-stat="retweet"] .rss-nitter-stat-count')
        ?.textContent,
    ).toContain("10");
    expect(
      container.querySelector<HTMLElement>('.rss-nitter-stat[data-stat="heart"] .rss-nitter-stat-count')
        ?.textContent,
    ).toContain("42");
    expect(
      container.querySelector<HTMLElement>('.rss-nitter-stat[data-stat="views"] .rss-nitter-stat-count')
        ?.textContent,
    ).toContain("999");
  });
});
