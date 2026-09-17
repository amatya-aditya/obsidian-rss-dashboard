import { describe, it, expect, beforeEach, vi } from "vitest";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { Component } from "obsidian";

const fetchFullArticleContentWithOutcomeMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/utils/full-article-fetch", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/utils/full-article-fetch")
  >("../../../src/utils/full-article-fetch");

  return {
    ...actual,
    fetchFullArticleContentWithOutcome: fetchFullArticleContentWithOutcomeMock,
  };
});

installObsidianDomPolyfills();

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Undated Article",
    link: "https://example.com/article",
    description: "<p>Fallback excerpt from feed.</p>",
    content: "",
    pubDate: "",
    guid: "guid-undated-1",
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

describe("ArticleRenderer undated-item date display", () => {
  let renderer: ArticleRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.empty();

    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "",
      failureType: "restricted",
    });

    const mockApp = {
      workspace: { getLeavesOfType: vi.fn().mockReturnValue([]) },
      vault: { getAbstractFileByPath: vi.fn() },
    };

    renderer = new ArticleRenderer({
      app: mockApp as never,
      component: new Component(),
      settings: { ...DEFAULT_SETTINGS } as RssDashboardSettings,
      onArticleSave: vi.fn(),
      onArticleUpdate: vi.fn(),
    });

    container = createDiv();
    document.body.appendChild(container);
  });

  it("shows the first-seen date, not the literal string 'Invalid Date', when pubDate is empty", async () => {
    const firstSeenMs = Date.parse("2026-01-01T00:00:00Z");
    const item = makeItem({ firstSeenMs });

    await renderer.render(container, item);

    const dateText = container.querySelector(".rss-reader-pub-date")?.textContent;
    expect(dateText).not.toBe("Invalid Date");
    expect(dateText).toContain("First seen:");
    expect(dateText).toContain(new Date(firstSeenMs).toLocaleString());
  });

  it("shows 'Unknown date' rather than 'Invalid Date' when neither pubDate nor firstSeenMs exist", async () => {
    const item = makeItem({ firstSeenMs: undefined });

    await renderer.render(container, item);

    const dateText = container.querySelector(".rss-reader-pub-date")?.textContent;
    expect(dateText).toBe("Unknown date");
  });

  it("still shows the real pubDate, unprefixed, when one is present", async () => {
    const item = makeItem({
      pubDate: "2024-01-01T00:00:00Z",
      firstSeenMs: Date.now(),
    });

    await renderer.render(container, item);

    const dateText = container.querySelector(".rss-reader-pub-date")?.textContent;
    expect(dateText).toBe(new Date("2024-01-01T00:00:00Z").toLocaleString());
  });
});
