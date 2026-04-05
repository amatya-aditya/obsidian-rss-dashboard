import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArticleFilterMenu } from "../../../src/components/article-filter-menu";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

describe("ArticleFilterMenu Component", () => {
  let container: HTMLElement;
  let toggleBtn: HTMLElement;
  let mockCallbacks: any;
  let settings: any;

  beforeEach(() => {
    installObsidianDomPolyfills();
    container = document.createElement("div");
    document.body.appendChild(container);

    toggleBtn = document.createElement("button");
    toggleBtn.className = "rss-dashboard-filter-trigger";
    document.body.appendChild(toggleBtn);

    settings = {
      viewStyle: "card",
      availableTags: [
        { name: "Tag1", color: "#ff0000" },
        { name: "Tag2", color: "#00ff00" }
      ],
      keywordRules: { bypassAll: false },
      highlights: { enabled: true },
      display: {
        showFilterStatusBar: true,
        cardColumnsPerRow: 0,
        cardSpacing: 15,
      }
    };

    mockCallbacks = {
      onFilterChange: vi.fn(),
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("should render the filter menu portal when show is called", () => {
    const filterMenu = new ArticleFilterMenu(
      settings,
      new Set(["unread"]),
      new Set(),
      "AND",
      mockCallbacks
    );

    filterMenu.show(toggleBtn);

    const portal = document.querySelector(".rss-dashboard-filter-menu-portal");
    expect(portal).not.toBeNull();
    expect(portal?.textContent).toContain("Unread");
    expect(portal?.textContent).toContain("Read");
  });

  it("should trigger callback when a filter is applied", () => {
    const filterMenu = new ArticleFilterMenu(
      settings,
      new Set(),
      new Set(),
      "AND",
      mockCallbacks
    );

    filterMenu.show(toggleBtn);

    const applyBtn = document.querySelector(".rss-dashboard-filter-apply-btn") as HTMLElement;
    // Simulate checking Unread (usually item index 1 or by label)
    // Find the item with text "Unread"
    const items = document.querySelectorAll(".rss-dashboard-filter-menu-item");
    let unreadItem: HTMLElement | null = null;
    items.forEach(item => {
        if (item.textContent?.includes("Unread")) unreadItem = item as HTMLElement;
    });

    (unreadItem as any)?.click(); 
    applyBtn.click();

    expect(mockCallbacks.onFilterChange).toHaveBeenCalledWith(expect.objectContaining({
      type: "batch",
      batch: expect.objectContaining({
        statusFilters: expect.any(Set)
      })
    }));

    const lastCall = mockCallbacks.onFilterChange.mock.calls[0][0];
    expect(lastCall.batch.statusFilters.has("unread")).toBe(true);
  });

  it("keeps card layout controls out of the filter menu", () => {
    const filterMenu = new ArticleFilterMenu(
      settings,
      new Set(),
      new Set(),
      "AND",
      mockCallbacks
    );

    filterMenu.show(toggleBtn);

    const portal = document.querySelector(".rss-dashboard-filter-menu-portal");
    expect(portal?.textContent).not.toContain("Cards per row");
    expect(portal?.textContent).not.toContain("Card spacing");
  });
});
