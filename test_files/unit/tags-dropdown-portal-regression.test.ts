import { ArticleList } from "../../src/components/article-list";
import { DEFAULT_SETTINGS, type FeedItem, type RssDashboardSettings } from "../../src/types/types";
import { installObsidianDomPolyfills } from "./test-dom-polyfills";
import { beforeEach, describe, expect, it } from "vitest";

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function buildArticle(): FeedItem {
  return {
    title: "Article",
    link: "https://example.com",
    description: "<p>desc</p>",
    pubDate: new Date().toISOString(),
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed",
    coverImage: "",
  };
}

describe("Tags dropdown portal (regression)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("renders portal items for all available tags", () => {
    const container = document.body.createDiv();
    const settings = cloneSettings();
    settings.availableTags = [
      { name: "A", color: "#111111" },
      { name: "B", color: "#222222" },
    ];

    const article = buildArticle();
    const list = new ArticleList(
      container,
      settings,
      "Title",
      [article],
      null,
      {
        onArticleClick: () => {},
        onToggleViewStyle: () => {},
        onRefreshFeeds: () => {},
        onArticleUpdate: () => {},
        onArticleSave: () => {},
        onToggleSidebar: () => {},
        onSortChange: () => {},
        onGroupChange: () => {},
        onFilterChange: () => {},
        onPageChange: () => {},
        onPageSizeChange: () => {},
      },
      1,
      1,
      50,
      1,
      new Set(),
      new Set(),
      "AND",
    );

    const anchorEl = document.body.createDiv();
    (list as any).createPortalDropdown(anchorEl, article, () => {});

    const portal = document.body.querySelector(
      ".rss-dashboard-tags-dropdown-content-portal",
    );
    expect(portal).not.toBeNull();
    expect(
      document.body.querySelectorAll(".rss-dashboard-tag-item"),
    ).toHaveLength(settings.availableTags.length);
    expect(
      document.body.querySelector(".rss-dashboard-tag-inline-add-row"),
    ).not.toBeNull();

    const cleanup = (list as any).tagsDropdownCleanup as (() => void) | null;
    cleanup?.();
  });

  it("opening tags portal must not remove Reader format portal", () => {
    const container = document.body.createDiv();
    const settings = cloneSettings();
    settings.availableTags = [{ name: "A", color: "#111111" }];

    const article = buildArticle();
    const list = new ArticleList(
      container,
      settings,
      "Title",
      [article],
      null,
      {
        onArticleClick: () => {},
        onToggleViewStyle: () => {},
        onRefreshFeeds: () => {},
        onArticleUpdate: () => {},
        onArticleSave: () => {},
        onToggleSidebar: () => {},
        onSortChange: () => {},
        onGroupChange: () => {},
        onFilterChange: () => {},
        onPageChange: () => {},
        onPageSizeChange: () => {},
      },
      1,
      1,
      50,
      1,
      new Set(),
      new Set(),
      "AND",
    );

    const formatPortal = document.body.createDiv({
      cls: "rss-dashboard-tags-dropdown-content-portal rss-reader-format-dropdown-portal",
    });

    const anchorEl = document.body.createDiv();
    (list as any).createPortalDropdown(anchorEl, article, () => {});

    // Regression: tags portal cleanup should not remove reader format portal.
    expect(document.body.contains(formatPortal)).toBe(true);

    const cleanup = (list as any).tagsDropdownCleanup as (() => void) | null;
    cleanup?.();
  });
});
