import { ArticleList } from "../../../src/components/article-list";
import {
  createTagsDropdownPortal,
  refreshTagsDropdownPortalColors,
} from "../../../src/utils/tags-dropdown-portal";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "obsidian";

/** Exposes private ArticleList members used by these regression tests. */
interface ArticleListWithPrivate {
  createPortalDropdown(
    anchor: HTMLElement,
    article: FeedItem,
    onUpdate: () => void,
  ): void;
  tagsDropdownCleanup: (() => void) | null;
}

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
    const container = createDiv();
    document.body.appendChild(container);
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
      null,
      [article],
      null,
      {
        onArticleClick: () => {},
        onToggleViewStyle: () => {},
        onRefreshFeeds: async () => {},
        onSearch: () => {},
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
      null,
      true,
      new App(),
    );

    const anchorEl = createDiv();
    document.body.appendChild(anchorEl);
    (list as unknown as ArticleListWithPrivate).createPortalDropdown(
      anchorEl,
      article,
      () => {},
    );

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

    const cleanup = (list as unknown as ArticleListWithPrivate)
      .tagsDropdownCleanup;
    cleanup?.();
  });

  it("refreshes labels in an already-open portal when global defaults change", () => {
    const anchor = (() => {
      const container = createDiv();
      document.body.appendChild(container);
      return container.createEl("button");
    })();
    const settings = cloneSettings();
    settings.availableTags = [{ name: "Inherited" }];
    const cleanup = createTagsDropdownPortal({
      app: new App(),
      anchor,
      settings,
      item: buildArticle(),
      onTagAssignmentChange: () => {},
    });
    const label = document.querySelector<HTMLElement>(
      ".rss-dashboard-tags-dropdown-content-portal .rss-dashboard-tag-label",
    );
    expect(label?.style.getPropertyValue("--tag-color")).toBe(
      DEFAULT_SETTINGS.defaultTagColor,
    );

    settings.defaultTagColor = "#123456";
    settings.defaultTagTextColor = "#abcdef";
    refreshTagsDropdownPortalColors(document, settings);

    expect(label?.style.getPropertyValue("--tag-color")).toBe("#123456");
    expect(label?.style.getPropertyValue("--tag-text-color")).toBe("#abcdef");
    cleanup();
  });

  it("adds an inline tag without color overrides even when the profile defaults changed", () => {
    const anchor = createDiv().createEl("button");
    document.body.appendChild(anchor.parentElement!);
    const settings = cloneSettings();
    settings.availableTags = [];
    settings.defaultTagColor = "#123456";
    settings.defaultTagTextColor = "#abcdef";
    const cleanup = createTagsDropdownPortal({
      app: new App(),
      anchor,
      settings,
      item: buildArticle(),
      onTagAssignmentChange: () => {},
    });
    expect(
      document.querySelector(
        ".rss-dashboard-tag-inline-add-row input[type='color']",
      ),
    ).toBeNull();
    document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-inline-input",
    )!.value = "Later";
    document
      .querySelector<HTMLButtonElement>(".rss-dashboard-tag-inline-add")!
      .click();

    expect(settings.availableTags).toStrictEqual([{ name: "Later" }]);
    cleanup();
  });

  it("clicking the same tags anchor twice closes the portal", () => {
    const container = createDiv();
    document.body.appendChild(container);
    const settings = cloneSettings();
    settings.availableTags = [{ name: "A", color: "#111111" }];

    const article = buildArticle();
    const list = new ArticleList(
      container,
      settings,
      "Title",
      null,
      [article],
      null,
      {
        onArticleClick: () => {},
        onToggleViewStyle: () => {},
        onRefreshFeeds: async () => {},
        onSearch: () => {},
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
      null,
      true,
      new App(),
    );

    const anchorEl = createDiv();
    document.body.appendChild(anchorEl);
    (list as unknown as ArticleListWithPrivate).createPortalDropdown(
      anchorEl,
      article,
      () => {},
    );

    expect(
      document.body.querySelector(
        ".rss-dashboard-tags-dropdown-content-portal",
      ),
    ).not.toBeNull();

    (list as unknown as ArticleListWithPrivate).createPortalDropdown(
      anchorEl,
      article,
      () => {},
    );

    expect(
      document.body.querySelector(
        ".rss-dashboard-tags-dropdown-content-portal",
      ),
    ).toBeNull();
    expect(
      (list as unknown as ArticleListWithPrivate).tagsDropdownCleanup,
    ).toBeNull();
  });

  it("opening tags portal must not remove Reader format portal", () => {
    const container = createDiv();
    document.body.appendChild(container);
    const settings = cloneSettings();
    settings.availableTags = [{ name: "A", color: "#111111" }];

    const article = buildArticle();
    const list = new ArticleList(
      container,
      settings,
      "Title",
      null,
      [article],
      null,
      {
        onArticleClick: () => {},
        onToggleViewStyle: () => {},
        onRefreshFeeds: async () => {},
        onSearch: () => {},
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
      null,
      true,
      new App(),
    );

    const formatPortal = createDiv();
    formatPortal.className =
      "rss-dashboard-tags-dropdown-content-portal rss-reader-format-dropdown-portal";
    document.body.appendChild(formatPortal);

    const anchorEl = createDiv();
    document.body.appendChild(anchorEl);
    (list as unknown as ArticleListWithPrivate).createPortalDropdown(
      anchorEl,
      article,
      () => {},
    );

    // Regression: tags portal cleanup should not remove reader format portal.
    expect(document.body.contains(formatPortal)).toBe(true);

    const cleanup = (list as unknown as ArticleListWithPrivate)
      .tagsDropdownCleanup;
    cleanup?.();
  });
});
