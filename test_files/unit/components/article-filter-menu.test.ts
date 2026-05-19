import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArticleFilterMenu, type ArticleFilterCallbacks } from "../../../src/components/article-filter-menu";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { type RssDashboardSettings, DEFAULT_SETTINGS } from "../../../src/types/types";

describe("ArticleFilterMenu Component", () => {
  let container: HTMLElement;
  let toggleBtn: HTMLElement;
  let mockCallbacks: ArticleFilterCallbacks;
  let settings: RssDashboardSettings;

  beforeEach(() => {
    installObsidianDomPolyfills();
    container = document.createElement("div");
    document.body.appendChild(container);

    toggleBtn = document.createElement("button");
    toggleBtn.className = "rss-dashboard-filter-trigger";
    document.body.appendChild(toggleBtn);

    settings = {
      ...DEFAULT_SETTINGS,
      viewStyle: "card",
      availableTags: [
        { name: "Tag1", color: "#ff0000" },
        { name: "Tag2", color: "#00ff00" }
      ],
      keywordRules: { ...DEFAULT_SETTINGS.keywordRules, bypassAll: false },
      highlights: { ...DEFAULT_SETTINGS.highlights, enabled: true },
      display: {
        ...DEFAULT_SETTINGS.display,
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
    const unreadItem = Array.from(document.querySelectorAll<HTMLElement>(".rss-dashboard-filter-menu-item"))
        .find(item => item.textContent?.includes("Unread"));

    if (unreadItem) {
      unreadItem.click();
    }
    applyBtn.click();

    const mockFn = mockCallbacks.onFilterChange as unknown as { mock: { calls: Array<Array<{ batch: { statusFilters: Set<string> } }>> } };
    expect(mockFn.mock.calls.length).toBe(1);

    const lastCall = mockFn.mock.calls[0][0];
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
