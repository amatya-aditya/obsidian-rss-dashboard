import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  renderPagination,
  type PaginationDependencies,
} from "../../../../../src/components/article-list/utils/pagination";

const baseDeps = (overrides: Partial<PaginationDependencies> = {}): PaginationDependencies => ({
  isMobileViewport: () => false,
  onPageChange: vi.fn(),
  onPageSizeChange: vi.fn(),
  notices: { show: vi.fn() },
  ...overrides,
});

describe("pagination utils", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders pagination controls", () => {
    renderPagination({
      container,
      currentPage: 1,
      totalPages: 3,
      pageSize: 10,
      totalArticles: 30,
      articles: [],
      deps: baseDeps(),
    });

    expect(container.querySelector(".rss-dashboard-pagination")).toBeTruthy();
  });

  it("disables prev button on page 1", () => {
    renderPagination({
      container,
      currentPage: 1,
      totalPages: 3,
      pageSize: 10,
      totalArticles: 30,
      articles: [],
      deps: baseDeps(),
    });

    const prev = container.querySelector(
      ".rss-dashboard-pagination-btn.prev",
    ) as HTMLButtonElement | null;
    expect(prev).toBeTruthy();
    expect(prev!.disabled).toBe(true);
  });

  it("disables next button on last page", () => {
    renderPagination({
      container,
      currentPage: 3,
      totalPages: 3,
      pageSize: 10,
      totalArticles: 30,
      articles: [],
      deps: baseDeps(),
    });

    const next = container.querySelector(
      ".rss-dashboard-pagination-btn.next",
    ) as HTMLButtonElement | null;
    expect(next).toBeTruthy();
    expect(next!.disabled).toBe(true);
  });

  it("calls onPageChange when non-active page button is clicked", () => {
    const onPageChange = vi.fn();
    renderPagination({
      container,
      currentPage: 2,
      totalPages: 4,
      pageSize: 10,
      totalArticles: 40,
      articles: [],
      deps: baseDeps({ onPageChange }),
    });

    const target = container.querySelector(
      ".rss-dashboard-pagination-btn:not(.prev):not(.next)",
    ) as HTMLElement | null;
    expect(target).toBeTruthy();
    target!.click();

    expect(onPageChange).toHaveBeenCalledWith(Number(target!.textContent?.trim()));
  });
});
