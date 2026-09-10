import { ArticleList } from "../../../src/components/article-list";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { beforeEach, describe, expect, it, vi } from "vitest";

installObsidianDomPolyfills();

/**
 * Regression coverage for tags-dropdown-portal.ts's per-article tag-picker
 * "Delete tag" trash icon: it used to strip the tag from every article's
 * local `tags` directly, without going through the FreshRSS article-facet
 * mutation boundary at all -- the same class of bug fixed for sidebar.ts's
 * "Delete tag" action (see sidebar-tag-freshrss-delete.test.ts). These tests
 * cover ArticleList's wiring of `onCommitLabelMembershipChanges` into
 * `createTagsDropdownPortal`: that clicking the trash icon now routes
 * through that boundary atomically before applying anything locally.
 */

interface ArticleListWithPrivate {
  createPortalDropdown(
    anchor: HTMLElement,
    article: FeedItem,
    onUpdate: () => void,
  ): void;
}

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeFeed(items: FeedItem[]): Feed {
  return {
    feedId: "feed-1",
    title: "Feed One",
    url: "https://example.test/feed.xml",
    folder: "Uncategorized",
    items,
    lastUpdated: 0,
  } as Feed;
}

function makeItem(guid: string, tags: FeedItem["tags"]): FeedItem {
  return {
    title: guid,
    link: `https://example.test/${guid}`,
    description: "",
    pubDate: "",
    guid,
    feedTitle: "Feed One",
    feedUrl: "https://example.test/feed.xml",
    coverImage: "",
    tags,
  } as FeedItem;
}

describe("Tags dropdown portal trash icon (FreshRSS facet boundary integration)", () => {
  let settings: RssDashboardSettings;
  let container: HTMLElement;
  let anchorEl: HTMLElement;

  beforeEach(() => {
    document.body.empty();
    settings = cloneSettings();
    settings.availableTags = [{ name: "Tech", color: "#111111" }];
    container = createDiv();
    document.body.appendChild(container);
    anchorEl = createDiv();
    document.body.appendChild(anchorEl);
  });

  function createArticleList(
    articles: FeedItem[],
    onCommitLabelMembershipChanges: ReturnType<typeof vi.fn>,
  ): ArticleList {
    return new ArticleList(
      container,
      settings,
      "Title",
      null,
      articles,
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
        onCommitLabelMembershipChanges,
      },
      1,
      1,
      50,
      1,
      new Set(),
      new Set(),
      "AND",
    );
  }

  function clickDeleteButton(): void {
    const deleteButton = document.body.querySelector<HTMLElement>(
      ".rss-dashboard-tag-delete-button",
    );
    expect(deleteButton).not.toBeNull();
    deleteButton?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  }

  it("queues one batched facet-boundary commit for every affected article before removing the tag locally", async () => {
    const item1 = makeItem("guid-1", [{ name: "Tech", color: "#111111" }]);
    const item2 = makeItem("guid-2", [
      { name: "Tech", color: "#111111" },
      { name: "Other", color: "#222222" },
    ]);
    const item3 = makeItem("guid-3 (no Tech tag)", [
      { name: "Other", color: "#222222" },
    ]);
    settings.feeds = [makeFeed([item1, item2, item3])];

    const onCommitLabelMembershipChanges = vi
      .fn()
      .mockResolvedValue({ committed: true });
    const list = createArticleList([item1], onCommitLabelMembershipChanges);
    (list as unknown as ArticleListWithPrivate).createPortalDropdown(
      anchorEl,
      item1,
      () => {},
    );

    clickDeleteButton();
    await Promise.resolve();
    await Promise.resolve();

    expect(onCommitLabelMembershipChanges).toHaveBeenCalledTimes(1);
    const [batchArg] = onCommitLabelMembershipChanges.mock.calls[0];
    expect(batchArg).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ articleGuid: "guid-1", nextTags: [] }),
        expect.objectContaining({
          articleGuid: "guid-2",
          nextTags: [{ name: "Other", color: "#222222" }],
        }),
      ]),
    );
    expect(batchArg).toHaveLength(2);

    expect(item1.tags).toEqual([]);
    expect(item2.tags).toEqual([{ name: "Other", color: "#222222" }]);
    expect(item3.tags).toEqual([{ name: "Other", color: "#222222" }]);
    expect(settings.availableTags).toEqual([]);
  });

  it("applies nothing -- keeps the tag defined and on every article -- when the facet-boundary commit fails", async () => {
    const item1 = makeItem("guid-1", [{ name: "Tech", color: "#111111" }]);
    settings.feeds = [makeFeed([item1])];

    const onCommitLabelMembershipChanges = vi.fn().mockResolvedValue({
      committed: false,
      error: "FreshRSS sync is busy right now. Try again in a moment.",
    });
    const list = createArticleList([item1], onCommitLabelMembershipChanges);
    (list as unknown as ArticleListWithPrivate).createPortalDropdown(
      anchorEl,
      item1,
      () => {},
    );

    clickDeleteButton();
    await Promise.resolve();
    await Promise.resolve();

    expect(item1.tags).toEqual([{ name: "Tech", color: "#111111" }]);
    expect(settings.availableTags).toEqual([{ name: "Tech", color: "#111111" }]);
    // The tag item must stay in the DOM since the delete did not go through.
    expect(
      document.body.querySelector(".rss-dashboard-tag-item"),
    ).not.toBeNull();
  });
});
