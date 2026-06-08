import type { FeedItem } from "../../../types/types";
import { computeResultsRange } from "../../../utils/pagination-utils";
import {
  getPageSizeOptions,
  PAGE_SIZE_OPTIONS,
} from "../../../utils/page-size-options";

export interface PaginationDependencies {
  isMobileViewport(): boolean;
  onPageChange(page: number): void;
  onPageSizeChange(pageSize: number): void;
  onMarkPageAsRead?(): void;
  onPersistSettings?(): Promise<void> | void;
  notices?: { show(message: string): void };
}

export interface RenderPaginationArgs {
  container: HTMLElement;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalArticles: number;
  articles: FeedItem[];
  deps: PaginationDependencies;
}

export function createPageButton(
  container: HTMLElement,
  page: number,
  currentPage: number,
  onPageChange: (page: number) => void,
): HTMLElement {
  const btn = container.createEl("button", {
    cls:
      "rss-dashboard-pagination-btn" +
      (page === currentPage ? " active" : ""),
    text: String(page),
  });
  btn.disabled = page === currentPage;
  btn.onclick = () => {
    if (page !== currentPage) {
      onPageChange(page);
    }
  };
  return btn;
}

export function renderPagination(args: RenderPaginationArgs): void {
  const {
    container,
    currentPage,
    totalPages,
    pageSize,
    totalArticles,
    articles,
    deps,
  } = args;

  const paginationContainer = container.createDiv({
    cls: "rss-dashboard-pagination",
  });

  const pagesRow = paginationContainer.createDiv({
    cls: "rss-dashboard-pagination-pages",
  });

  const prevButton = pagesRow.createEl("button", {
    cls: "rss-dashboard-pagination-btn prev",
    text: "<",
  });
  prevButton.disabled = currentPage === 1;
  prevButton.onclick = () => {
    if (currentPage > 1) {
      deps.onPageChange(currentPage - 1);
    }
  };

  const isMobile = deps.isMobileViewport();
  const maxPagesToShow = isMobile ? 3 : 5;
  const padding = isMobile ? 1 : 2;

  let startPage = Math.max(1, currentPage - padding);
  let endPage = Math.min(totalPages, currentPage + padding);
  if (endPage - startPage < maxPagesToShow - 1) {
    if (startPage === 1) {
      endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    } else if (endPage === totalPages) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
  }
  if (startPage > 1) {
    createPageButton(pagesRow, 1, currentPage, deps.onPageChange);
    if (startPage > 2) {
      pagesRow.createEl("span", {
        text: "...",
        cls: "rss-dashboard-pagination-ellipsis",
      });
    }
  }
  for (let i = startPage; i <= endPage; i++) {
    createPageButton(pagesRow, i, currentPage, deps.onPageChange);
  }
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      pagesRow.createEl("span", {
        text: "...",
        cls: "rss-dashboard-pagination-ellipsis",
      });
    }
    createPageButton(pagesRow, totalPages, currentPage, deps.onPageChange);
  }

  const nextButton = pagesRow.createEl("button", {
    cls: "rss-dashboard-pagination-btn next",
    text: ">",
  });
  nextButton.disabled = currentPage === totalPages;
  nextButton.onclick = () => {
    if (currentPage < totalPages) {
      deps.onPageChange(currentPage + 1);
    }
  };

  const controlsRow = paginationContainer.createDiv({
    cls: "rss-dashboard-pagination-controls",
  });

  const markPageReadButton = controlsRow.createEl("button", {
    cls: "rss-dashboard-pagination-btn rss-dashboard-pagination-mark-page-read",
    text: "Mark page read",
  });
  markPageReadButton.onclick = () => {
    if (deps.onMarkPageAsRead) {
      deps.onMarkPageAsRead();
    } else {
      let changedCount = 0;
      articles.forEach((article) => {
        if (!article.read) {
          article.read = true;
          changedCount++;
        }
      });

      if (changedCount > 0) {
        if (deps.onPersistSettings) {
          void deps.onPersistSettings();
        }
        deps.onPageChange(currentPage);
      } else if (deps.notices) {
        deps.notices.show("No unread items on current page");
      }
    }
  };

  const pageSizeWrapper = controlsRow.createDiv({
    cls: "rss-dashboard-page-size-wrapper",
  });
  const pageSizeDropdown = pageSizeWrapper.createEl("select", {
    cls: "rss-dashboard-page-size-dropdown",
  });
  for (const size of getPageSizeOptions(pageSize)) {
    const isStandardOption = PAGE_SIZE_OPTIONS.includes(
      size as (typeof PAGE_SIZE_OPTIONS)[number],
    );
    const label =
      size === 0
        ? "All"
        : isStandardOption
          ? String(size)
          : `Current (${size})`;
    const opt = pageSizeDropdown.createEl("option", {
      text: label,
      value: String(size),
    });
    if (size === pageSize) opt.selected = true;
  }

  pageSizeDropdown.onchange = (e) => {
    const size = Number((e.target as HTMLSelectElement).value);
    deps.onPageSizeChange(size);
  };

  const { start: startIdx, end: endIdx } = computeResultsRange({
    totalItems: totalArticles,
    pageSize,
    currentPage,
  });

  const resultsRow = paginationContainer.createDiv({
    cls: "rss-dashboard-pagination-results",
  });

  resultsRow.createEl("span", {
    cls: "rss-dashboard-pagination-results",
    text: `Results: ${startIdx} - ${endIdx} of ${totalArticles}`,
  });
}
