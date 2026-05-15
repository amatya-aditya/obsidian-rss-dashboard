import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// Install polyfills globally for the test
installObsidianDomPolyfills();

// Mocking Obsidian components
class MockLeaf {
  app: unknown;
  view: unknown;
  constructor(app: unknown) {
    this.app = app;
  }
  detach = vi.fn();
}

type ReaderViewHarness = {
  contentEl: HTMLElement;
  readingContainer: HTMLElement;
  fetchFullArticleContent: ReturnType<typeof vi.fn>;
};

function getHarness(view: ReaderView): ReaderViewHarness {
  return view as unknown as ReaderViewHarness;
}

describe("ReaderView Image Duplication", () => {
  let readerView: ReaderView;
  let mockApp: {
    workspace: {
      getLeavesOfType: ReturnType<typeof vi.fn>;
      setActiveLeaf: ReturnType<typeof vi.fn>;
      revealLeaf: ReturnType<typeof vi.fn>;
    };
    vault: {
      getAbstractFileByPath: ReturnType<typeof vi.fn>;
    };
  };
  let mockLeaf: MockLeaf;
  let mockSettings: RssDashboardSettings;
  let mockArticleSaver: { saveArticle: ReturnType<typeof vi.fn> };

  beforeEach(() => {
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
    mockArticleSaver = { saveArticle: vi.fn() };

    readerView = new ReaderView(
      mockLeaf as never,
      mockSettings,
      mockArticleSaver as never,
      vi.fn(),
      vi.fn(),
    );

    // Initialize contentEl since it's used in onOpen
    getHarness(readerView).contentEl = document.createElement("div");
  });

  it("should extract hero image and remove it from content (Reproduction)", async () => {
    const item: FeedItem = {
      title: "Test Article",
      link: "https://example.com/1",
      description:
        '<p><img src="https://example.com/hero.jpg" alt="Hero" /></p><p>Content starts here.</p>',
      content:
        '<p><img src="https://example.com/hero.jpg" alt="Hero" /></p><p>Content starts here.</p>',
      pubDate: new Date().toISOString(),
      guid: "1",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Test Feed",
      feedUrl: "https://example.com/feed.rss",
      coverImage: "https://example.com/hero.jpg",
      mediaType: "article",
      saved: false,
    };

    // Prepare the view
    await readerView.onOpen();

    // Display the item
    // Note: displayItem calls populateArticleHtml
    await readerView.displayItem(item);

    const readingContainer = getHarness(readerView).readingContainer;
    const heroSlot = readingContainer.querySelector<HTMLElement>(
      ".rss-reader-hero-slot",
    );
    const articleContent = readingContainer.querySelector<HTMLElement>(
      ".rss-reader-article-content",
    );

    // Check hero slot
    const heroImg = heroSlot?.querySelector<HTMLImageElement>("img");
    expect(heroImg).toBeTruthy();
    expect(heroImg?.src).toBe("https://example.com/hero.jpg");

    // Check article content - BUG: Currently it contains the image too
    const contentImg = articleContent?.querySelector("img");

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
      description:
        '<p><img src="https://aeon.co/hero.jpg" /></p><p>Summary text</p>',
      content:
        '<p><img src="https://aeon.co/hero.jpg" /></p><p>Summary text</p><p>More content</p>',
      pubDate: new Date().toISOString(),
      guid: "2",
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Aeon",
      feedUrl: "https://aeon.co/feed.rss",
      coverImage: "https://aeon.co/hero.jpg",
      mediaType: "article",
      saved: false,
    };

    await readerView.onOpen();
    await readerView.displayItem(item);

    const readingContainer = getHarness(readerView).readingContainer;

    // Count all images in the reading container (excluding hero slot)
    const contentImages = readingContainer.querySelectorAll(
      ".rss-reader-article-content img, .rss-reader-description img",
    );

    // There should be 0 images in the content/description if they only had the hero image at the start
    expect(contentImages.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Summary de-duplication parity tests for ReaderView
// These mirror the ArticleRenderer tests to ensure both rendering paths behave
// identically after the isEquivalentHtml fix.
// ---------------------------------------------------------------------------

describe("ReaderView – summary de-duplication", () => {
  let readerView: ReaderView;
  let mockSettings: RssDashboardSettings;

  beforeEach(async () => {
    const mockApp = {
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
      },
      vault: { getAbstractFileByPath: vi.fn() },
    };

    const mockLeaf = new MockLeaf(mockApp);
    mockSettings = { ...DEFAULT_SETTINGS, useWebViewer: false };

    readerView = new ReaderView(
      mockLeaf as never,
      mockSettings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    );

    getHarness(readerView).contentEl = document.createElement("div");
    // Prevent outbound HTTP — content comes from item fields only
    getHarness(readerView).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue("");
    await readerView.onOpen();
  });

  function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
    return {
      title: "Test Article",
      link: "https://example.com/article",
      description: "",
      content: "",
      pubDate: new Date().toISOString(),
      guid: "guid-rv-1",
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

  // ------------------------------------------------------------------ RED ---

  it("RED: no callout when description equals content except for HTML entity encoding", async () => {
    const item = makeItem({
      description: "<p>Rocks &amp; Minerals: a survey</p>",
      content: "<p>Rocks & Minerals: a survey</p>",
    });

    await readerView.displayItem(item);

    const rc = getHarness(readerView).readingContainer;
    const callout = rc.querySelector(".rss-reader-description-callout");
    expect(callout).toBeNull();
  });

  it("RED: no callout when description and content are whitespace-structurally different but same text", async () => {
    const item = makeItem({
      description: "<p>Hello   world</p>",
      content: "<p>Hello world</p>",
    });

    await readerView.displayItem(item);

    const rc = getHarness(readerView).readingContainer;
    const callout = rc.querySelector(".rss-reader-description-callout");
    expect(callout).toBeNull();
  });

  it("RED: fetched full article keeps feed hero and strips duplicated lead stack from body", async () => {
    const summarySentence =
      '"Emily Hart" is a young, AI-created conservative woman who likes to take off her clothes.';
    const realBodySnippet = "Like many medical school students, Sam was broke.";
    const coverImageUrl = "https://cdn.example.com/hero.jpg";
    const iconUrl = "https://example.com/icon-nib.png";
    const fetchedHtml = `
      <h1>Indian med student rakes in thousands with AI-generated MAGA hottie</h1>
      <figure><img src="${iconUrl}" alt="stylized icon of a fountain pen nib" /></figure>
      <p>Truthiness</p>
      <p>${summarySentence}</p>
      <p>${realBodySnippet} ${"A longer body paragraph follows with more reporting detail. ".repeat(6)}</p>
    `;
    const item = makeItem({
      title:
        "Indian med student rakes in thousands with AI-generated MAGA hottie",
      description: `<p>${summarySentence}</p>`,
      content: "",
      coverImage: coverImageUrl,
      link: "https://arstechnica.com/tech-policy/2026/04/example/",
    });

    getHarness(readerView).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue(fetchedHtml);

    await readerView.displayItem(item);

    const rc = getHarness(readerView).readingContainer;
    const callout = rc.querySelector(".rss-reader-description-callout");
    const heroImg = rc.querySelector<HTMLImageElement>(
      ".rss-reader-hero-slot img",
    );
    const body = rc.querySelector<HTMLElement>(".rss-reader-article-content");

    expect(callout).toBeTruthy();
    expect(heroImg).toBeTruthy();
    expect(heroImg?.src).toBe(coverImageUrl);
    expect(body?.querySelector(`img[src="${iconUrl}"]`)).toBeNull();
    expect(body?.textContent || "").not.toContain("Truthiness");
    expect(body?.textContent || "").not.toContain(summarySentence);
    expect(body?.textContent || "").toContain(realBodySnippet);
  });

  // --------------------------------------------------------------- CONTROL ---

  it("CONTROL: renders both callout and body when description and content are genuinely distinct", async () => {
    const item = makeItem({
      description: "<p>Short summary only.</p>",
      content:
        "<p>Short summary only.</p><p>Extended body paragraph that is unique and clearly longer than the summary.</p>",
    });

    await readerView.displayItem(item);

    const rc = getHarness(readerView).readingContainer;
    const callout = rc.querySelector(".rss-reader-description-callout");
    const body = rc.querySelector(".rss-reader-article-content");
    expect(callout).toBeTruthy();
    expect(body).toBeTruthy();
  });

  it("CONTROL: renders only body (no callout) when description and content are byte-identical", async () => {
    const html = "<p>Exactly the same content.</p>";
    const item = makeItem({ description: html, content: html });

    await readerView.displayItem(item);

    const rc = getHarness(readerView).readingContainer;
    const callout = rc.querySelector(".rss-reader-description-callout");
    expect(callout).toBeNull();
  });

  // ----------------------------------------------------------------- REGRESSION: SVG stripping ---

  it("strips publisher SVG section icons from fetched full-article HTML", async () => {
    const bodyText =
      "Like many medical school students, Sam was broke. " +
      "More detail follows here. ".repeat(8);
    // Simulate Readability output: publisher header with SVG section icon
    const fetchedHtml = `
      <div id="readability-page-1" class="page">
        <div id="main">
          <article>
            <header>
              <div>
                <p>
                  <span><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path fill="currentColor" d="M1 1h38v38H1z"/></svg></span>
                  <span>Truthiness</span>
                </p>
              </div>
            </header>
            <p>${bodyText}</p>
          </article>
        </div>
      </div>
    `;
    const item = makeItem({
      description: "<p>Short teaser sentence for this article.</p>",
      content: "",
      link: "https://arstechnica.com/tech-policy/2026/04/example/",
    });

    getHarness(readerView).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue(fetchedHtml);
    await readerView.displayItem(item);

    const body = getHarness(
      readerView,
    ).readingContainer.querySelector<HTMLElement>(
      ".rss-reader-article-content",
    );
    expect(body).not.toBeNull();
    if (!body) {
      throw new Error("Expected .rss-reader-article-content to exist");
    }
    expect(body.querySelector("svg")).toBeNull();
    expect(body.textContent).toContain("Sam was broke");
  });

  // --------- REGRESSION: deep description dedup via Readability-wrapped header ---

  it("removes description duplicate nested in Readability article header", async () => {
    const descriptionText =
      '"Emily Hart" is a young, AI-created conservative woman who likes to take off her clothes.';
    const bodyText =
      "Like many medical school students, Sam was broke. " +
      "More detail follows here. ".repeat(8);
    // Readability wraps everything in a single div — only 1 direct body child,
    // which previously caused the fast-path dedup to exit early.
    const fetchedHtml = `
      <div id="readability-page-1" class="page">
        <div id="main">
          <article>
            <header>
              <div>
                <p>${descriptionText}</p>
              </div>
            </header>
            <p>${bodyText}</p>
          </article>
        </div>
      </div>
    `;
    const item = makeItem({
      description: `<p>${descriptionText}</p>`,
      content: "",
      link: "https://arstechnica.com/tech-policy/2026/04/example/",
    });

    getHarness(readerView).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue(fetchedHtml);
    await readerView.displayItem(item);

    const body = getHarness(readerView).readingContainer.querySelector(
      ".rss-reader-article-content",
    ) as HTMLElement;
    const callout = getHarness(readerView).readingContainer.querySelector(
      ".rss-reader-description-callout",
    );

    // Description must NOT appear in the article body
    expect(body.textContent).not.toContain(descriptionText);
    // Real body content must still be present
    expect(body.textContent).toContain("Sam was broke");
    // Callout should still be rendered (description is kept in the callout)
    expect(callout).toBeTruthy();
  });

  it("removes skip-link and lead media/caption duplicates while keeping kicker text", async () => {
    const descriptionText =
      "Google's new generation of Tensor AI chips is actually two chips, one for inference and one for training.";
    const captionText =
      "Google's TPU 8t chips were designed for training AI models, not running them.";
    const bodyText =
      "Most of the companies that have fully committed to building AI models are gobbling up every Nvidia AI accelerator they can get." +
      " Additional context follows with infrastructure details and architecture differences.".repeat(
        3,
      );
    const coverImageUrl =
      "https://cdn.arstechnica.net/wp-content/uploads/2026/04/TPU-8t-board-1152x648.jpg";

    const fetchedHtml = `
      <div id="readability-page-1" class="page">
        <div id="main">
          <article>
            <a class="skip-link" href="#main">Skip to content</a>
            <header>
              <p><span>A tale of two Tensors</span></p>
            </header>
            <a href="https://cdn.arstechnica.net/wp-content/uploads/2026/04/TPU-8t-board.jpg" target="_blank">
              <img
                src="https://cdn.arstechnica.net/wp-content/uploads/2026/04/TPU-8t-board.jpg"
                srcset="https://cdn.arstechnica.net/wp-content/uploads/2026/04/TPU-8t-board-1152x648.jpg 1152w"
                alt="TPU 8t chips on a board"
              />
            </a>
            <div id="caption-2151046">
              <p>${captionText}<span>Credit: Google</span></p>
            </div>
            <p>${captionText}<span>Credit: Google</span></p>
            <p>${bodyText}</p>
          </article>
        </div>
      </div>
    `;

    const item = makeItem({
      title: "Google unveils two new TPUs designed for the agentic era",
      description: `<p>${descriptionText}</p>`,
      content: "",
      coverImage: coverImageUrl,
      link: "https://arstechnica.com/ai/2026/04/google-unveils-two-new-tpus-designed-for-the-agentic-era/",
    });

    getHarness(readerView).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue(fetchedHtml);
    await readerView.displayItem(item);

    const rc = getHarness(readerView).readingContainer;
    const body = rc.querySelector(".rss-reader-article-content") as HTMLElement;
    const callout = rc.querySelector(".rss-reader-description-callout");

    expect(body.querySelector("a[href='#main']")).toBeNull();
    expect(body.textContent || "").not.toContain("Skip to content");
    expect(body.querySelector("img[src*='TPU-8t-board']")).toBeNull();
    expect(body.querySelector("[id^='caption-']")).toBeNull();
    expect(body.textContent || "").not.toContain(captionText);
    expect(body.textContent || "").toContain("A tale of two Tensors");
    expect(body.textContent || "").toContain(
      "Most of the companies that have fully committed",
    );
    expect(callout).toBeTruthy();
  });
});
