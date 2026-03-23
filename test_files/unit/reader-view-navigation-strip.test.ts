import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReaderView } from "../../src/views/reader-view";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../src/types/types";
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

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Feed Title",
    link: "https://example.com/article",
    description: "",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "guid-1",
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

describe("ReaderView full-article nav/breadcrumb stripping", () => {
  let readerView: any;
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

    mockSettings = { ...DEFAULT_SETTINGS, useWebViewer: false };

    const mockLeaf = new MockLeaf(mockApp);
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

  it("removes breadcrumb nav near the top but preserves article text", async () => {
    const html = `
      <nav data-testid="breadcrumb-container">
        <ol>
          <li><a href="https://example.com/">Home</a></li>
          <li><a href="https://example.com/section">Section</a></li>
        </ol>
      </nav>
      <h1>Headline Here</h1>
      <p>${"x".repeat(260)}</p>
    `;

    (readerView as any).fetchFullArticleContent = vi.fn().mockResolvedValue(html);

    await readerView.displayItem(makeItem());

    const container = (readerView as any).readingContainer as HTMLElement;
    const content = container.querySelector(".rss-reader-article-content") as
      | HTMLElement
      | null;
    expect(content).toBeTruthy();
    expect(content?.querySelector("nav")).toBeNull();
    expect((content?.textContent || "").includes("x".repeat(40))).toBe(true);
  });

  it("does not remove deep nav beyond the conservative cutoff", async () => {
    const spacer = Array.from({ length: 40 }, () => "<span>t</span>").join("");
    const html = `
      <p>${"x".repeat(260)}</p>
      ${spacer}
      <nav data-testid="breadcrumb-container">
        <ol>
          <li><a href="https://example.com/">Home</a></li>
          <li><a href="https://example.com/section">Section</a></li>
        </ol>
      </nav>
      <p>tail</p>
    `;

    (readerView as any).fetchFullArticleContent = vi.fn().mockResolvedValue(html);

    await readerView.displayItem(makeItem());

    const container = (readerView as any).readingContainer as HTMLElement;
    const content = container.querySelector(".rss-reader-article-content") as
      | HTMLElement
      | null;
    expect(content).toBeTruthy();
    expect(content?.querySelector("nav")).toBeTruthy();
  });

  it("stripNavigationChromeFromHtml removes breadcrumb nav", () => {
    const html = `
      <nav data-testid="breadcrumb-container"><ol><li><a href="/">Home</a></li></ol></nav>
      <p>Keep me</p>
    `;

    const cleaned = (readerView as any).stripNavigationChromeFromHtml(html) as string;
    const doc = new DOMParser().parseFromString(cleaned, "text/html");
    expect(doc.body.querySelector("nav")).toBeNull();
    expect(doc.body.textContent || "").toContain("Keep me");
  });
});

