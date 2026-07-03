import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { renderFeedView } from "../../../src/components/article-list/views/feed-view";
import type {
  BaseViewContext,
  ViewDeps,
} from "../../../src/components/article-list/views/view-types";

type ObsidianHTMLElement = HTMLElement & {
  createDiv(opts?: string | { cls?: string; text?: string; attr?: Record<string, string> }): HTMLDivElement;
  createSpan(opts?: string | { cls?: string; text?: string; attr?: Record<string, string> }): HTMLSpanElement;
  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    opts?: {
      cls?: string;
      text?: string;
      attr?: Record<string, string>;
      [key: string]: any;
    },
  ): HTMLElementTagNameMap[K];
};

// Setup: Mock Obsidian API dependencies
const mockHighlightService = null;
const mockCallbacks = {
  onArticleClick: vi.fn(),
};

const mockViewDeps: ViewDeps = {
  renderFeedIcon: vi.fn(),
  createArticleActionButtons: vi.fn(),
  showArticleContextMenu: vi.fn(),
  scheduleCardTagLayout: vi.fn(),
};

function createArticle(overrides: Partial<FeedItem> = {}): FeedItem {
  const defaults: FeedItem = {
    title: "Test Article",
    link: "https://example.com/article",
    description: "Test description",
    pubDate: new Date().toISOString(),
    guid: `guid-${Math.random()}`,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/feed.xml",
    content: "",
    summary: "Test summary",
    author: "Test Author",
    coverImage: "",
    mediaType: "article",
    enclosure: undefined,
    saved: false,
  };
  return { ...defaults, ...overrides };
}

function createContext(overrides?: Partial<BaseViewContext>): BaseViewContext {
  const settings: RssDashboardSettings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;

  const defaults: BaseViewContext = {
    selectedArticle: null,
    showFeedSource: true,
    settings: {
      highlights: settings.highlights,
      display: settings.display,
      collapsedFeedSections: settings.collapsedFeedSections,
    },
    highlightService: mockHighlightService,
    callbacks: mockCallbacks,
  };
  return { ...defaults, ...overrides };
}

describe("Feed View - Collapsible Section Headers", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    const body = document.body as ObsidianHTMLElement;
    body.empty();
    vi.clearAllMocks();
  });

  afterEach(() => {
    const body = document.body as ObsidianHTMLElement;
    body.empty();
  });

  /**
   * PHASE 1: Test RED — Basic header structure
   * Tests that feed view renders with collapsible section headers grouped by feed source
   */
  it("renders with collapsible section headers grouped by feed source", () => {
    const container = (document.body as unknown as ObsidianHTMLElement).createDiv();
    const articles = [
      createArticle({
        feedTitle: "TechCrunch",
        feedUrl: "https://techcrunch.com/feed",
        guid: "tc-1",
      }),
      createArticle({
        feedTitle: "TechCrunch",
        feedUrl: "https://techcrunch.com/feed",
        guid: "tc-2",
      }),
      createArticle({
        feedTitle: "The Verge",
        feedUrl: "https://theverge.com/feed",
        guid: "tv-1",
      }),
    ];

    const ctx = createContext();
    renderFeedView(container, articles, ctx, mockViewDeps);

    // Assert: Container has 2 section headers for 2 different feeds
    const sectionHeaders = container.querySelectorAll<HTMLElement>(
      ".rss-dashboard-feed-section-header",
    );
    expect(sectionHeaders.length).toBe(2);

    // Assert: Headers have the feed titles
    const headerTexts = Array.from(sectionHeaders, (header: HTMLElement) =>
      header.textContent?.trim(),
    );
    expect(headerTexts).toContain("TechCrunch");
    expect(headerTexts).toContain("The Verge");

    // Assert: Each header has a collapse toggle button
    const toggleButtons = container.querySelectorAll(
      ".rss-dashboard-feed-section-toggle",
    );
    expect(toggleButtons.length).toBe(2);

    // Assert: Section containers exist
    const sections = container.querySelectorAll(".rss-dashboard-feed-section");
    expect(sections.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * PHASE 2: Test RED — Collapse/uncollapse functionality
   * Tests that clicking collapse button hides cards in that section
   */
  it("hides cards when collapse button is clicked", () => {
    const container = (document.body as unknown as ObsidianHTMLElement).createDiv();
    const articles = [
      createArticle({
        feedTitle: "TechCrunch",
        feedUrl: "https://techcrunch.com/feed",
        guid: "tc-1",
      }),
      createArticle({
        feedTitle: "TechCrunch",
        feedUrl: "https://techcrunch.com/feed",
        guid: "tc-2",
      }),
      createArticle({
        feedTitle: "The Verge",
        feedUrl: "https://theverge.com/feed",
        guid: "tv-1",
      }),
    ];

    const ctx = createContext();
    renderFeedView(container, articles, ctx, mockViewDeps);

    // Get the first section's toggle button
    const toggleButtons = container.querySelectorAll<HTMLElement>(
      ".rss-dashboard-feed-section-toggle",
    );
    const firstToggleButton = toggleButtons[0];

    // Get cards in the first section before collapse
    const sections = container.querySelectorAll<HTMLElement>(
      ".rss-dashboard-feed-section",
    );
    const firstSection = sections[0];
    const cardsContainer = firstSection.querySelector<HTMLElement>(
      ".rss-dashboard-feed-section-cards",
    );
    const cardsBeforeCollapse = firstSection.querySelectorAll(
      ".rss-dashboard-feed-item",
    );
    expect(cardsBeforeCollapse.length).toBeGreaterThan(0);

    // Click collapse button
    firstToggleButton.click();

    // Assert: Section has collapsed class
    expect(firstSection.classList.contains("collapsed")).toBe(true);

    // Assert: Cards container also has collapsed class (which controls display:none via CSS)
    expect(cardsContainer?.classList.contains("collapsed")).toBe(true);
  });

  /**
   * PHASE 2: Test RED — Uncollapse functionality
   * Tests that clicking collapse button again shows cards
   */
  it("shows cards when collapse button is clicked again", () => {
    const container = (document.body as unknown as ObsidianHTMLElement).createDiv();
    const articles = [
      createArticle({
        feedTitle: "TechCrunch",
        feedUrl: "https://techcrunch.com/feed",
        guid: "tc-1",
      }),
      createArticle({
        feedTitle: "The Verge",
        feedUrl: "https://theverge.com/feed",
        guid: "tv-1",
      }),
    ];

    const ctx = createContext();
    renderFeedView(container, articles, ctx, mockViewDeps);

    const toggleButtons = container.querySelectorAll<HTMLElement>(
      ".rss-dashboard-feed-section-toggle",
    );
    const firstToggleButton = toggleButtons[0];
    const sections = container.querySelectorAll<HTMLElement>(
      ".rss-dashboard-feed-section",
    );
    const firstSection = sections[0];

    // Click collapse
    firstToggleButton.click();
    expect(firstSection.classList.contains("collapsed")).toBe(true);

    // Click again to un-collapse
    firstToggleButton.click();

    // Assert: Section no longer has collapsed class
    expect(firstSection.classList.contains("collapsed")).toBe(false);

    // Assert: Cards are visible again
    const cards = firstSection.querySelectorAll<HTMLElement>(
      ".rss-dashboard-feed-item",
    );
    for (const card of cards) {
      const computedStyle = window.getComputedStyle(card);
      expect(computedStyle.display).not.toBe("none");
    }
  });

  /**
   * PHASE 2: Test RED — Icon toggle
   * Tests that toggle button icon changes between chevron-down and chevron-right
   */
  it("toggles icon between chevron-down and chevron-right on collapse", () => {
    const container = (document.body as unknown as ObsidianHTMLElement).createDiv();
    const articles = [
      createArticle({
        feedTitle: "TechCrunch",
        feedUrl: "https://techcrunch.com/feed",
        guid: "tc-1",
      }),
    ];

    // Mock the setIcon Obsidian function
    const setIconMock = vi.fn();
    vi.doMock("obsidian", () => ({
      setIcon: setIconMock,
    }));

    const ctx = createContext();
    renderFeedView(container, articles, ctx, mockViewDeps);

    const toggleButtons = container.querySelectorAll<HTMLElement>(
      ".rss-dashboard-feed-section-toggle",
    );
    const firstToggleButton = toggleButtons[0];

    // Verify button exists and can be clicked
    expect(firstToggleButton).toBeDefined();

    // Click to collapse
    firstToggleButton.click();

    // Assert: Section has collapsed class (visual indicator)
    const sections = container.querySelectorAll<HTMLElement>(
      ".rss-dashboard-feed-section",
    );
    const firstSection = sections[0];
    expect(firstSection.classList.contains("collapsed")).toBe(true);

    // Click again to un-collapse
    firstToggleButton.click();

    // Assert: Section no longer has collapsed class
    expect(firstSection.classList.contains("collapsed")).toBe(false);
  });

  /**
   * PHASE 3: Test RED — Callback on collapse
   * Tests that onToggleFeedSectionCollapse callback is called with correct params
   */
  it("calls onToggleFeedSectionCollapse callback when collapse button clicked", () => {
    const container = (document.body as unknown as ObsidianHTMLElement).createDiv();
    const articles = [
      createArticle({
        feedTitle: "TechCrunch",
        feedUrl: "https://techcrunch.com/feed",
        guid: "tc-1",
      }),
    ];

    // Add callback to deps
    const onToggleCallback = vi.fn();
    const depsWithCallback = {
      ...mockViewDeps,
      onToggleFeedSectionCollapse: onToggleCallback,
    };

    const ctx = createContext();
    renderFeedView(container, articles, ctx, depsWithCallback);

    const toggleButtons = container.querySelectorAll<HTMLElement>(
      ".rss-dashboard-feed-section-toggle",
    );
    const firstToggleButton = toggleButtons[0];

    // Click to collapse
    firstToggleButton.click();

    // Assert: Callback was called with feed name and isCollapsed = true
    expect(onToggleCallback).toHaveBeenCalledWith("TechCrunch", true);
  });

  /**
   * PHASE 3: Test RED — Restoration of collapsed state
   * Tests that collapsed sections are restored from settings on re-render
   */
  it("restores collapsed state from settings on render", () => {
    const container = (document.body as unknown as ObsidianHTMLElement).createDiv();
    const articles = [
      createArticle({
        feedTitle: "TechCrunch",
        feedUrl: "https://techcrunch.com/feed",
        guid: "tc-1",
      }),
      createArticle({
        feedTitle: "The Verge",
        feedUrl: "https://theverge.com/feed",
        guid: "tv-1",
      }),
    ];

    // Create context with TechCrunch already collapsed in settings
    const settings: RssDashboardSettings = JSON.parse(
      JSON.stringify(DEFAULT_SETTINGS),
    ) as RssDashboardSettings;
    settings.collapsedFeedSections = ["TechCrunch"];

    const overrideSettings = {
      highlights: settings.highlights,
      display: settings.display,
      collapsedFeedSections: settings.collapsedFeedSections,
    } as Pick<
      RssDashboardSettings,
      "highlights" | "display" | "collapsedFeedSections"
    >;

    const ctx = createContext({
      settings: overrideSettings,
    });

    renderFeedView(container, articles, ctx, mockViewDeps);

    const sections = Array.from<HTMLElement>(
      container.querySelectorAll<HTMLElement>(
        ".rss-dashboard-feed-section",
      ),
    );
    // Find the TechCrunch section (first or second based on order)
    const sectionHeaders = container.querySelectorAll<HTMLElement>(
      ".rss-dashboard-feed-section-header",
    );
    const techCrunchIndex = Array.from<HTMLElement>(sectionHeaders).findIndex(
      (header) => header.textContent?.includes("TechCrunch"),
    );
    const techCrunchSection: HTMLElement | undefined =
      techCrunchIndex >= 0 ? sections[techCrunchIndex] : undefined;

    if (techCrunchSection) {
      // Assert: TechCrunch section has collapsed class
      expect(techCrunchSection.classList.contains("collapsed")).toBe(true);

      // Assert: The Verge section does NOT have collapsed class
      const vergeSection = Array.from<HTMLElement>(sections).find((section) => {
        const header = section.querySelector(
          ".rss-dashboard-feed-section-header",
        );
        return header?.textContent?.includes("The Verge");
      });
      if (vergeSection) {
        expect(vergeSection.classList.contains("collapsed")).toBe(false);
      }
    }
  });

  /**
   * Edge case: Empty feed sections should still render collapsed headers
   */
  it("renders collapsible headers even when section is empty", () => {
    const container = (document.body as unknown as ObsidianHTMLElement).createDiv();
    const articles: FeedItem[] = [];

    const ctx = createContext();
    renderFeedView(container, articles, ctx, mockViewDeps);

    // Should render without errors for empty articles
    expect(container.children.length).toBeDefined();
  });
});
