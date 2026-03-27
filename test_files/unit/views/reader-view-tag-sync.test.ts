import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

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
    (readerView as any).fetchFullArticleContent = vi.fn().mockResolvedValue("<p>Content</p>");
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

  it("should remove tags DOM when tags are removed via applyExternalUpdate", async () => {
    const item = makeItem({ tags: [{ name: "Tag1", color: "#8b5cf6" }] });
    (readerView as any).fetchFullArticleContent = vi.fn().mockResolvedValue("<p>Content</p>");
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
