import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

const readerCss = readFileSync(
  path.resolve(__dirname, "../../../src/styles/reader.css"),
  "utf8",
);

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

describe("ReaderView Tag Synchronization", () => {
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

  it("should update tags DOM when applyExternalUpdate is called", async () => {
    const item = makeItem({ tags: [] });
    (readerView as any).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue("<p>Content</p>");
    await readerView.displayItem(item);

    // Verify initial state: no tags
    let tagsContainer = (readerView as any).readingContainer.querySelector(".rss-reader-tags");
    expect(tagsContainer).toBeNull();

    // Apply update with tags
    const newTags = [{ name: "NewTag", color: "#8b5cf6" }];
    readerView.applyExternalUpdate("guid-1", { tags: newTags });

    // Verify tags are now in the DOM
    tagsContainer = (readerView as any).readingContainer.querySelector(".rss-reader-tags");
    expect(tagsContainer).not.toBeNull();
    const tagElements = tagsContainer.querySelectorAll(".rss-reader-tag");
    expect(tagElements.length).toBe(1);
    expect(tagElements[0].textContent).toBe("NewTag");
    expect(tagElements[0].style.getPropertyValue("--tag-color")).toBe("#8b5cf6");
  });

  it("should render initial reader tags with a color-backed styling contract", async () => {
    const item = makeItem({
      tags: [{ name: "Feature", color: "#22c55e" }],
    });
    (readerView as any).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue("<p>Content</p>");

    await readerView.displayItem(item);

    const tagElement = (readerView as any).readingContainer.querySelector(
      ".rss-reader-tag",
    ) as HTMLElement | null;

    expect(tagElement).not.toBeNull();
    expect(tagElement?.textContent).toBe("Feature");
    expect(tagElement?.style.getPropertyValue("--tag-color")).toBe("#22c55e");
    expect(readerCss).toMatch(
      /\.rss-reader-tag\s*\{[^}]*background(?:-color)?:\s*var\(--tag-color,\s*var\(--interactive-accent\)\)/s,
    );
  });

  it("should keep the reader tag fallback accent color in the stylesheet", () => {
    expect(readerCss).toContain(
      "var(--tag-color, var(--interactive-accent))",
    );
  });

  it("should refresh reader tag colors from settings after tag edits", async () => {
    mockSettings.availableTags = [{ name: "Feature", color: "#22c55e" }] as any;

    const item = makeItem({
      tags: [{ name: "Feature", color: "#8b5cf6" }],
    });
    (readerView as any).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue("<p>Content</p>");

    await readerView.displayItem(item);

    const tagBeforeRefresh = (readerView as any).readingContainer.querySelector(
      ".rss-reader-tag",
    ) as HTMLElement | null;
    expect(tagBeforeRefresh?.style.getPropertyValue("--tag-color")).toBe(
      "#8b5cf6",
    );

    mockSettings.availableTags = [{ name: "Feature", color: "#ef4444" }] as any;
    readerView.refreshTagColors();

    const tagAfterRefresh = (readerView as any).readingContainer.querySelector(
      ".rss-reader-tag",
    ) as HTMLElement | null;
    expect(tagAfterRefresh?.style.getPropertyValue("--tag-color")).toBe(
      "#ef4444",
    );
    expect((readerView as any).currentItem.tags[0].color).toBe("#ef4444");
  });

  it("should remove tags DOM when tags are removed via applyExternalUpdate", async () => {
    const item = makeItem({ tags: [{ name: "Tag1", color: "#8b5cf6" }] });
    (readerView as any).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue("<p>Content</p>");
    await readerView.displayItem(item);

    // Verify initial state: has tags
    let tagsContainer = (readerView as any).readingContainer.querySelector(".rss-reader-tags");
    expect(tagsContainer).not.toBeNull();

    // Apply update with no tags
    readerView.applyExternalUpdate("guid-1", { tags: [] });

    // Verify tags are gone from the DOM
    tagsContainer = (readerView as any).readingContainer.querySelector(".rss-reader-tags");
    expect(tagsContainer).toBeNull();
  });
});
