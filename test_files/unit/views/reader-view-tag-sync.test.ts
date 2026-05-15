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
  currentItem: FeedItem;
  fetchFullArticleContent: ReturnType<typeof vi.fn>;
  refreshTagColors: () => void;
};

function getInternals(view: ReaderView): ReaderViewInternals {
  return view as unknown as ReaderViewInternals;
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
  let readerView: ReaderView;
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
      mockLeaf as never,
      mockSettings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );

    getInternals(readerView).contentEl = document.createElement("div");
    await readerView.onOpen();
  });

  it("should update tags DOM when applyExternalUpdate is called", async () => {
    const item = makeItem({ tags: [] });
    getInternals(readerView).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue("<p>Content</p>");
    await readerView.displayItem(item);

    // Verify initial state: no tags
    let tagsContainer =
      getInternals(readerView).readingContainer.querySelector(
        ".rss-reader-tags",
      );
    expect(tagsContainer).toBeNull();

    // Apply update with tags
    const newTags = [{ name: "NewTag", color: "#8b5cf6" }];
    readerView.applyExternalUpdate("guid-1", { tags: newTags });

    // Verify tags are now in the DOM
    tagsContainer =
      getInternals(readerView).readingContainer.querySelector(
        ".rss-reader-tags",
      );
    expect(tagsContainer).not.toBeNull();
    const tagElements =
      tagsContainer!.querySelectorAll<HTMLElement>(".rss-reader-tag");
    expect(tagElements.length).toBe(1);
    expect(tagElements[0].textContent).toBe("NewTag");
    expect(tagElements[0].style.getPropertyValue("--tag-color")).toBe(
      "#8b5cf6",
    );
  });

  it("should render initial reader tags with tag color variable", async () => {
    const item = makeItem({
      tags: [{ name: "Feature", color: "#22c55e" }],
    });
    getInternals(readerView).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue("<p>Content</p>");

    await readerView.displayItem(item);

    const tagElement =
      getInternals(readerView).readingContainer.querySelector<HTMLElement>(
        ".rss-reader-tag",
      );

    expect(tagElement).not.toBeNull();
    expect(tagElement?.textContent).toBe("Feature");
    expect(tagElement?.style.getPropertyValue("--tag-color")).toBe("#22c55e");
  });

  it("should refresh reader tag colors from settings after tag edits", async () => {
    mockSettings.availableTags = [{ name: "Feature", color: "#22c55e" }];

    const item = makeItem({
      tags: [{ name: "Feature", color: "#8b5cf6" }],
    });
    getInternals(readerView).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue("<p>Content</p>");

    await readerView.displayItem(item);

    const tagBeforeRefresh =
      getInternals(readerView).readingContainer.querySelector<HTMLElement>(
        ".rss-reader-tag",
      );
    expect(tagBeforeRefresh?.style.getPropertyValue("--tag-color")).toBe(
      "#8b5cf6",
    );

    mockSettings.availableTags = [{ name: "Feature", color: "#ef4444" }];
    getInternals(readerView).refreshTagColors();

    const tagAfterRefresh =
      getInternals(readerView).readingContainer.querySelector<HTMLElement>(
        ".rss-reader-tag",
      );
    expect(tagAfterRefresh?.style.getPropertyValue("--tag-color")).toBe(
      "#ef4444",
    );
    expect(getInternals(readerView).currentItem.tags[0].color).toBe("#ef4444");
  });

  it("should remove tags DOM when tags are removed via applyExternalUpdate", async () => {
    const item = makeItem({ tags: [{ name: "Tag1", color: "#8b5cf6" }] });
    getInternals(readerView).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue("<p>Content</p>");
    await readerView.displayItem(item);

    // Verify initial state: has tags
    let tagsContainer =
      getInternals(readerView).readingContainer.querySelector(
        ".rss-reader-tags",
      );
    expect(tagsContainer).not.toBeNull();

    // Apply update with no tags
    readerView.applyExternalUpdate("guid-1", { tags: [] });

    // Verify tags are gone from the DOM
    tagsContainer =
      getInternals(readerView).readingContainer.querySelector(
        ".rss-reader-tags",
      );
    expect(tagsContainer).toBeNull();
  });
});
