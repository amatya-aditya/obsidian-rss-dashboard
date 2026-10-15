/**
 * The standalone Reader's article body sits in a named landmark (WCAG 2.2
 * 1.3.1 Info and Relationships, 2.4.1 Bypass Blocks; Slice 4 audit row R-004
 * of #826, AC-014g).
 *
 * The Reader opens beside the dashboard, which already has a `main`, so the
 * body is a `region` named by the article title, not a second `main`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
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

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Article Title",
    link: "https://example.com/article",
    description: "Description",
    content: "Content",
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

describe("ReaderView landmarks", () => {
  let view: ReaderView;
  let contentEl: HTMLElement;

  const body = () =>
    contentEl.querySelector<HTMLElement>(".rss-reader-content")!;

  beforeEach(async () => {
    contentEl = createDiv();
    activeDocument.body.appendChild(contentEl);
    const app = {
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
      },
      vault: { getAbstractFileByPath: vi.fn() },
    };
    const settings: RssDashboardSettings = {
      ...DEFAULT_SETTINGS,
      useWebViewer: false,
    };
    view = new ReaderView(
      new MockLeaf(app) as never,
      settings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );
    (view as unknown as { contentEl: HTMLElement }).contentEl = contentEl;
    (
      view as unknown as { fetchFullArticleContent: unknown }
    ).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue({ content: "<p>Content</p>", failureType: "none" });
    vi.spyOn(activeWindow, "open").mockImplementation(() => null);
    await view.onOpen();
  });

  afterEach(() => {
    activeDocument.body.empty();
    vi.restoreAllMocks();
  });

  it("puts the article body in a region", () => {
    expect(body().getAttribute("role")).toBe("region");
  });

  it("names the region from the visible title, not an aria-label", async () => {
    await view.displayItem(makeItem({ title: "A named article" }));

    const label = activeDocument.getElementById(
      body().getAttribute("aria-labelledby") ?? "",
    );
    expect(label).not.toBeNull();
    expect(label?.classList.contains("rss-reader-title")).toBe(true);
    expect(label?.textContent).toContain("A named article");
    // Obsidian draws a hover tooltip from aria-label.
    expect(body().hasAttribute("aria-label")).toBe(false);
  });

  it("does not add a second main landmark", async () => {
    await view.displayItem(makeItem());

    expect(contentEl.querySelectorAll('[role="main"], main')).toHaveLength(0);
  });
});
