import { setIcon } from "obsidian";
import type { FeedMetadata } from "../types/discover-types";
import { computePagination } from "../utils/pagination-utils";

type FeedComparator = (a: FeedMetadata, b: FeedMetadata) => number;

const feedComparators: Record<string, FeedComparator> = {
  "title-asc": (a, b) => a.title.localeCompare(b.title),
  "title-desc": (a, b) => b.title.localeCompare(a.title),
  "created-desc": (a, b) =>
    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
  "created-asc": (a, b) =>
    new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
  "tags-desc": (a, b) => b.tags.length - a.tags.length,
  "tags-asc": (a, b) => a.tags.length - b.tags.length,
  "category-asc": (a, b) =>
    (a.domain[0] || "").localeCompare(b.domain[0] || ""),
  "tag-name-asc": (a, b) => (a.tags[0] || "").localeCompare(b.tags[0] || ""),
  "type-asc": (a, b) => (a.type || "").localeCompare(b.type || ""),
  "type-desc": (a, b) => (b.type || "").localeCompare(a.type || ""),
};

export function sortDiscoverFeeds(
  feeds: FeedMetadata[],
  sortMode: string,
): void {
  const comparator = feedComparators[sortMode];
  feeds.sort((a, b) => (comparator ? comparator(a, b) : 0));
}

export function renderDiscoverFeedSummary(
  container: HTMLElement,
  totalFeeds: number,
  renderAddAllButton: (container: HTMLElement) => void,
  renderSelectedFilters: (container: HTMLElement) => void,
): void {
  const leftSection = container.createDiv({
    cls: "rss-discover-filter-header-left",
  });

  const resultsCount = leftSection.createDiv({
    cls: "rss-discover-results-count",
  });
  resultsCount.textContent = `${totalFeeds} feeds found`;
  renderAddAllButton(leftSection);
  renderSelectedFilters(leftSection);
}

interface RenderDiscoverFeedResultsOptions {
  container: HTMLElement;
  feeds: FeedMetadata[];
  pageSize: number;
  currentPage: number;
  onCurrentPageChange: (page: number) => void;
  renderFeedCard: (grid: HTMLElement, feed: FeedMetadata) => void;
  renderPagination: (
    container: HTMLElement,
    currentPage: number,
    totalPages: number,
    pageSize: number,
    totalFeeds: number,
  ) => void;
}

export function renderDiscoverFeedResults({
  container,
  feeds,
  pageSize,
  currentPage,
  onCurrentPageChange,
  renderFeedCard,
  renderPagination,
}: RenderDiscoverFeedResultsOptions): void {
  const grid = container.createDiv({ cls: "rss-discover-grid" });

  if (feeds.length === 0) {
    const emptyState = container.createDiv({
      cls: "rss-discover-empty",
    });
    setIcon(emptyState, "search");
    emptyState.appendText(" No feeds match your filters");
    return;
  }

  const pagination = computePagination({
    totalItems: feeds.length,
    pageSize,
    requestedPage: currentPage,
  });
  onCurrentPageChange(pagination.currentPage);
  const feedsForPage = feeds.slice(pagination.startIdx, pagination.endIdx);

  feedsForPage.forEach((feed) => {
    renderFeedCard(grid, feed);
  });

  const paginationWrapper = container.createDiv({
    cls: "rss-dashboard-pagination-wrapper",
  });
  renderPagination(
    paginationWrapper,
    pagination.currentPage,
    pagination.totalPages,
    pageSize,
    feeds.length,
  );
}
