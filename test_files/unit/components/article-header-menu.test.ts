import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArticleHeaderMenu } from "../../../src/components/article-header-menu";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock as any;

describe("ArticleHeaderMenu Component", () => {
  let container: HTMLElement;
  let settings: any;
  let callbacks: any;

  beforeEach(() => {
    installObsidianDomPolyfills();
    container = document.createElement("div");
    document.body.appendChild(container);

    settings = {
      viewStyle: "list",
      articleSort: "newest",
      articleGroupBy: "none",
      articleFilter: { value: 0 },
      display: {
        cardColumnsPerRow: 0,
        cardSpacing: 15,
      },
    };

    callbacks = {
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

  it("renders the hamburger trigger and dropdown structure", () => {
    const menu = new ArticleHeaderMenu(
      settings,
      "",
      callbacks,
    );

    menu.render(container);

    expect(
      container.querySelector(".rss-dashboard-hamburger-button")
    ).not.toBeNull();
    expect(
      container.querySelector(".rss-dashboard-dropdown-menu")
    ).not.toBeNull();
  });

  it("toggles is-menu-open classes on button and dropdown", () => {
    const menu = new ArticleHeaderMenu(
      settings,
      "",
      callbacks,
    );

    menu.render(container);

    const button = container.querySelector(
      ".rss-dashboard-hamburger-button"
    ) as HTMLElement;
    const dropdown = container.querySelector(
      ".rss-dashboard-dropdown-menu"
    ) as HTMLElement;

    button.click();
    expect(button.classList.contains("is-menu-open")).toBe(true);
    expect(dropdown.classList.contains("is-menu-open")).toBe(true);

    button.click();
    expect(button.classList.contains("is-menu-open")).toBe(false);
    expect(dropdown.classList.contains("is-menu-open")).toBe(false);
  });

  it("renders card layout controls only for card view", () => {
    const listMenu = new ArticleHeaderMenu(
      settings,
      "",
      callbacks,
    );
    listMenu.render(container);
    expect(container.textContent).not.toContain("Cards / row:");
    listMenu.destroy();
    container.empty();

    settings.viewStyle = "card";

    const cardMenu = new ArticleHeaderMenu(
      settings,
      "",
      callbacks,
    );
    cardMenu.render(container);

    expect(container.textContent).toContain("Cards / row:");
    expect(container.textContent).toContain("Card spacing: 15px");
  });

  it("forwards refresh and mark-all actions unchanged", () => {
    const menu = new ArticleHeaderMenu(
      settings,
      "",
      callbacks,
    );

    menu.render(container);
    const button = container.querySelector(
      ".rss-dashboard-hamburger-button"
    ) as HTMLElement;
    button.click();

    (
      container.querySelector(".rss-dashboard-view-refresh-button") as HTMLButtonElement
    ).click();
    (
      container.querySelector(".rss-dashboard-mark-read") as HTMLButtonElement
    ).click();
    (
      container.querySelectorAll(".rss-dashboard-mark-all-button")[1] as HTMLButtonElement
    ).click();

    expect(callbacks.onRefreshFeeds).toHaveBeenCalledTimes(1);
    expect(callbacks.onMarkAllAsRead).toHaveBeenCalledTimes(1);
    expect(callbacks.onMarkAllAsUnread).toHaveBeenCalledTimes(1);
  });

  it("emits live and commit events for card spacing changes", () => {
    settings.viewStyle = "card";
    const menu = new ArticleHeaderMenu(
      settings,
      "",
      callbacks,
    );

    menu.render(container);
    const button = container.querySelector(
      ".rss-dashboard-hamburger-button"
    ) as HTMLElement;
    button.click();

    const spacingInput = container.querySelector(
      ".rss-dashboard-dropdown-card-spacing-input"
    ) as HTMLInputElement;
    spacingInput.value = "23";
    spacingInput.dispatchEvent(new Event("input", { bubbles: true }));
    spacingInput.dispatchEvent(new Event("change", { bubbles: true }));

    expect(callbacks.onFilterChange).toHaveBeenCalledWith({
      type: "card-spacing-live",
      value: 23,
    });
    expect(callbacks.onFilterChange).toHaveBeenCalledWith({
      type: "card-spacing-commit",
      value: 23,
    });
  });

  it("closes cleanly and removes outside-click handling on destroy", () => {
    const menu = new ArticleHeaderMenu(
      settings,
      "",
      callbacks,
    );

    menu.render(container);
    const button = container.querySelector(
      ".rss-dashboard-hamburger-button"
    ) as HTMLElement;
    const dropdown = container.querySelector(
      ".rss-dashboard-dropdown-menu"
    ) as HTMLElement;

    button.click();
    expect(dropdown.classList.contains("is-menu-open")).toBe(true);

    menu.destroy();

    expect(dropdown.classList.contains("is-menu-open")).toBe(false);
    expect(button.classList.contains("is-menu-open")).toBe(false);

    document.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true })
    );

    expect(dropdown.classList.contains("is-menu-open")).toBe(false);
  });
});
