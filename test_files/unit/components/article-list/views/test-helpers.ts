import { vi } from "vitest";
import type { FeedItem } from "../../../../../src/types/types";
import type { ViewDeps } from "../../../../../src/components/article-list/views/view-types";
import type { BaseViewContext } from "../../../../../src/components/article-list/views/view-types";

export function makeArticle(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Test Article",
    link: "https://example.com/article",
    description: "Article description text",
    pubDate: "2024-06-01T12:00:00Z",
    guid: "test-article-guid",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/feed",
    coverImage: "",
    ...overrides,
  };
}

export function baseViewContext(
  overrides: Partial<BaseViewContext> = {},
): BaseViewContext {
  return {
    selectedArticle: null,
    showFeedSource: true,
    settings: {
      highlights: {
        highlightInTitles: false,
        highlightInSummaries: false,
      },
      display: {
        articleDateStyle: "relative",
      },
    } as BaseViewContext["settings"],
    highlightService: null,
    callbacks: {
      onArticleClick: vi.fn(),
    },
    ...overrides,
  };
}

export function baseViewDeps(overrides: Partial<ViewDeps> = {}): ViewDeps {
  return {
    renderFeedIcon: vi.fn(),
    createArticleActionButtons: vi.fn(),
    showArticleContextMenu: vi.fn(),
    scheduleCardTagLayout: vi.fn(),
    ...overrides,
  };
}
