import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArticleHeader } from "../../../src/components/article-header";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// Mock ResizeObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock as any;

describe("ArticleHeader Component", () => {
  let container: HTMLElement;
  let settings: any;
  let mockCallbacks: any;

  beforeEach(() => {
    installObsidianDomPolyfills();
    container = document.createElement("div");
    document.body.appendChild(container);

    settings = {
      sidebarCollapsed: false,
      viewStyle: "list",
      articleSort: "newest",
      articleGroupBy: "none",
      articleFilter: { value: 0 },
      feeds: [],
      display: {
        mobileShowListToolbar: true,
        mobileListToolbarStyle: "minimal",
        useDomainFavicons: true,
        cardColumnsPerRow: 0,
        cardSpacing: 15,
      }
    };

    mockCallbacks = {
      onToggleSidebar: vi.fn(),
      onSearch: vi.fn(),
      onSortChange: vi.fn(),
      onGroupChange: vi.fn(),
      onFilterChange: vi.fn(),
      onToggleViewStyle: vi.fn(),
      onPersistSettings: vi.fn(),
      onRefreshFeeds: vi.fn(),
      onMarkAllAsRead: vi.fn(),
      onMarkAllAsUnread: vi.fn(),
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("should render the title and sidebar toggle", () => {
    const header = new ArticleHeader(
      container,
      settings,
      "Test Title",
      "Tooltip",
      null,
      new Set(),
      new Set(),
      "OR",
      mockCallbacks
    );

    header.render();

    expect(container.textContent).toContain("Test Title");
    const toggle = container.querySelector(".rss-dashboard-sidebar-toggle");
    expect(toggle).not.toBeNull();
  });

  it("should trigger onToggleSidebar when sidebar toggle is clicked", () => {
    const header = new ArticleHeader(
      container,
      settings,
      "Title",
      null,
      null,
      new Set(),
      new Set(),
      "OR",
      mockCallbacks
    );

    header.render();
    const toggle = container.querySelector(".rss-dashboard-sidebar-toggle") as HTMLElement;
    toggle.click();

    expect(mockCallbacks.onToggleSidebar).toHaveBeenCalled();
  });

  it("should render custom portal selectors instead of native selects for dark mode fixes", () => {
      const header = new ArticleHeader(
        container,
        settings,
        "Title",
        null,
        null,
        new Set(),
        new Set(),
        "OR",
        mockCallbacks
      );

      header.render();

      // We expect NO native selects for these specific filters
      const selectors = container.querySelectorAll("select");
      expect(selectors.length).toBe(0);
      
      // Instead, we expect themed triggers
      const triggers = container.querySelectorAll(".rss-dashboard-themed-select-trigger");
      expect(triggers.length).toBeGreaterThan(0);
  });

  it("shows card layout controls in the hamburger menu for card view", () => {
    settings.viewStyle = "card";
    const header = new ArticleHeader(
      container,
      settings,
      "Title",
      null,
      null,
      new Set(),
      new Set(),
      "OR",
      mockCallbacks
    );

    header.render();

    const hamburgerBtn = container.querySelector(
      ".rss-dashboard-hamburger-button"
    ) as HTMLElement;
    hamburgerBtn.click();

    const dropdown = container.querySelector(".rss-dashboard-dropdown-menu");
    expect(dropdown?.textContent).toContain("Cards / row:");
    expect(dropdown?.textContent).toContain("Card spacing: 15px");
  });

  it("keeps card layout controls out of the hamburger menu for non-card views", () => {
    settings.viewStyle = "list";
    const header = new ArticleHeader(
      container,
      settings,
      "Title",
      null,
      null,
      new Set(),
      new Set(),
      "OR",
      mockCallbacks
    );

    header.render();

    const hamburgerBtn = container.querySelector(
      ".rss-dashboard-hamburger-button"
    ) as HTMLElement;
    hamburgerBtn.click();

    const dropdown = container.querySelector(".rss-dashboard-dropdown-menu");
    expect(dropdown?.textContent).not.toContain("Cards / row:");
    expect(dropdown?.textContent).not.toContain("Card spacing:");
  });

  it("emits batch updates when hamburger card layout controls change", () => {
    settings.viewStyle = "card";
    const header = new ArticleHeader(
      container,
      settings,
      "Title",
      null,
      null,
      new Set(),
      new Set(),
      "OR",
      mockCallbacks
    );

    header.render();

    const hamburgerBtn = container.querySelector(
      ".rss-dashboard-hamburger-button"
    ) as HTMLElement;
    hamburgerBtn.click();

    const cardsPerRowTrigger = container.querySelector(
      ".rss-dashboard-dropdown-cards-per-row-trigger"
    ) as HTMLElement;
    cardsPerRowTrigger.click();

    const portalItems = Array.from(
      document.body.querySelectorAll(".rss-dashboard-themed-menu-portal .rss-dashboard-filter-menu-item")
    );
    expect(portalItems[0]?.textContent).toContain("Auto");
    const optionThree = portalItems.find((item) => item.textContent?.includes("3")) as HTMLElement;
    optionThree.click();

    const spacingInput = container.querySelector(
      ".rss-dashboard-dropdown-card-spacing-input"
    ) as HTMLInputElement;
    spacingInput.value = "22";
    spacingInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(mockCallbacks.onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "batch",
        batch: expect.objectContaining({
          cardColumnsPerRow: 3,
        }),
      })
    );
    expect(mockCallbacks.onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "card-spacing-live",
        value: 22,
      })
    );
  });
});
