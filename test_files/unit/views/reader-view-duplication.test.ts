import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import { FeedItem, RssDashboardSettings, DEFAULT_SETTINGS } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// Install polyfills globally for the test
installObsidianDomPolyfills();

// Mocking Obsidian components
class MockLeaf {
  app: any;
  view: any;
  constructor(app: any) { this.app = app; }
  detach = vi.fn();
}

describe("ReaderView Image Duplication", () => {
  let readerView: any;
  let mockApp: any;
  let mockLeaf: any;
  let mockSettings: RssDashboardSettings;
  let mockArticleSaver: any;

  beforeEach(() => {
    mockApp = {
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
      },
      vault: {
        getAbstractFileByPath: vi.fn(),
      }
    };
    mockLeaf = new MockLeaf(mockApp);
    mockSettings = { ...DEFAULT_SETTINGS, useWebViewer: false };
    mockArticleSaver = { saveArticle: vi.fn() };

    readerView = new ReaderView(
      mockLeaf as any,
      mockSettings,
      mockArticleSaver,
      vi.fn(),
      vi.fn()
    );

    // Initialize contentEl since it's used in onOpen
    (readerView as any).contentEl = document.createElement("div");
  });

  it("should extract hero image and remove it from content (Reproduction)", async () => {
    const item: FeedItem = {
      title: "Test Article",
      link: "https://example.com/1",
      description: "<p><img src=\"https://example.com/hero.jpg\" alt=\"Hero\" /></p><p>Content starts here.</p>",
      content: "<p><img src=\"https://example.com/hero.jpg\" alt=\"Hero\" /></p><p>Content starts here.</p>",
      pubDate: new Date().toISOString(),
      guid: "1",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Test Feed",
      feedUrl: "https://example.com/feed.rss",
      coverImage: "https://example.com/hero.jpg",
      mediaType: "article",
      saved: false
    };

    // Prepare the view
    await readerView.onOpen();
    
    // Display the item
    // Note: displayItem calls populateArticleHtml
    await readerView.displayItem(item);

    const readingContainer = (readerView as any).readingContainer;
    const heroSlot = readingContainer.querySelector(".rss-reader-hero-slot");
    const articleContent = readingContainer.querySelector(".rss-reader-article-content");

    // Check hero slot
    const heroImg = heroSlot.querySelector("img");
    expect(heroImg).toBeTruthy();
    expect(heroImg.src).toBe("https://example.com/hero.jpg");

    // Check article content - BUG: Currently it contains the image too
    const contentImg = articleContent.querySelector("img");
    
    // This is the expected behavior AFTER fix. 
    // For now, I'm documenting the current failing state by making it a test that should pass after fix.
    expect(contentImg).toBeNull(); 
  });

  it("should handle description and content sharing the same hero image", async () => {
     // Aeon specific case where description and content both have the image 
     // and they are almost identical but might differ slightly (enough for isEquivalentHtml to fail)
     const item: FeedItem = {
      title: "Aeon Article",
      link: "https://aeon.co/1",
      description: "<p><img src=\"https://aeon.co/hero.jpg\" /></p><p>Summary text</p>",
      content: "<p><img src=\"https://aeon.co/hero.jpg\" /></p><p>Summary text</p><p>More content</p>",
      pubDate: new Date().toISOString(),
      guid: "2",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Aeon",
      feedUrl: "https://aeon.co/feed.rss",
      coverImage: "https://aeon.co/hero.jpg",
      mediaType: "article",
      saved: false
    };

    await readerView.onOpen();
    await readerView.displayItem(item);

    const readingContainer = (readerView as any).readingContainer;
    
    // Count all images in the reading container (excluding hero slot)
    const contentImages = readingContainer.querySelectorAll(".rss-reader-article-content img, .rss-reader-description img");
    
    // There should be 0 images in the content/description if they only had the hero image at the start
    expect(contentImages.length).toBe(0);
  });
});
