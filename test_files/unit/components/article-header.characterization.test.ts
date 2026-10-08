import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArticleHeader } from "../../../src/components/article-header";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type TestSettings = ConstructorParameters<typeof ArticleHeader>[1];
type TestCallbacks = ConstructorParameters<typeof ArticleHeader>[8];

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// Pins the header behavior that must survive removing the never-shown desktop
// controls (#896): everything reachable through the hamburger menu and the
// mobile Filters button.
describe("ArticleHeader characterization", () => {
  let container: HTMLElement;
  let settings: TestSettings;
  let callbacks: TestCallbacks & Record<string, ReturnType<typeof vi.fn>>;
  let header: ArticleHeader;

  const menuInput = () =>
    container.querySelector<HTMLInputElement>(
      ".rss-dashboard-dropdown-menu .rss-dashboard-article-search-input",
    ) as HTMLInputElement;

  function makeHeader(): ArticleHeader {
    return new ArticleHeader(
      container,
      settings,
      "Title",
      null,
      null,
      new Set(),
      new Set(),
      "OR",
      callbacks,
    );
  }

  beforeEach(() => {
    installObsidianDomPolyfills();
    container = createDiv();
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
        cardColumnsPerRow: 0,
        cardSpacing: 15,
      },
      availableTags: [],
      media: { useDomainIconsRss: true },
    } as unknown as TestSettings;
    callbacks = {
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
    } as unknown as TestCallbacks & Record<string, ReturnType<typeof vi.fn>>;
    header = makeHeader();
  });

  afterEach(() => {
    header.destroy();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders the sidebar toggle, title, mobile Filters button and hamburger menu", () => {
    header.render();

    expect(
      container.querySelector(".rss-dashboard-sidebar-toggle"),
    ).not.toBeNull();
    expect(
      container.querySelector(".rss-dashboard-articles-title")?.textContent,
    ).toBe("Title");
    expect(
      container.querySelector(".rss-dashboard-mobile-filter-button"),
    ).not.toBeNull();
    expect(
      container.querySelector(".rss-dashboard-dropdown-menu"),
    ).not.toBeNull();
  });

  it("focusSearch opens the hamburger menu and focuses its search input", async () => {
    header.render();
    // A display:none input refuses focus; jsdom has no layout, so simulate it
    // for any input that lives in the (never shown) desktop controls.
    const realFocus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (
      this: HTMLElement,
      ...args: Parameters<HTMLElement["focus"]>
    ) {
      if (this.closest(".rss-dashboard-desktop-controls")) return;
      realFocus.apply(this, args);
    });

    await expect(header.focusSearch()).resolves.toBe(true);

    expect(document.activeElement).toBe(menuInput());
    expect(
      container
        .querySelector(".rss-dashboard-dropdown-menu")
        ?.classList.contains("is-menu-open"),
    ).toBe(true);
  });

  it("typing in the hamburger search reports the query", () => {
    header.render();

    menuInput().value = "rust";
    menuInput().dispatchEvent(new Event("input", { bubbles: true }));

    expect(callbacks.onSearch).toHaveBeenCalledWith("rust");
  });

  it("keeps the hamburger search query across a re-render", () => {
    header.render();
    menuInput().value = "rust";
    menuInput().dispatchEvent(new Event("input", { bubbles: true }));

    header.render();

    expect(menuInput().value).toBe("rust");
  });
});
