// Characterization tests for ArticleFilterMenu before extraction. Keep unchanged during this refactor.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ArticleFilterMenu,
  type ArticleFilterCallbacks,
} from "../../../src/components/article-filter-menu";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  type RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";

describe("ArticleFilterMenu Component", () => {
  let container: HTMLElement;
  let toggleBtn: HTMLElement;
  let mockCallbacks: ArticleFilterCallbacks;
  let settings: RssDashboardSettings;

  beforeEach(() => {
    installObsidianDomPolyfills();
    container = createDiv();
    document.body.appendChild(container);

    toggleBtn = createEl("button");
    toggleBtn.className = "rss-dashboard-filter-trigger";
    document.body.appendChild(toggleBtn);

    settings = {
      ...DEFAULT_SETTINGS,
      viewStyle: "card",
      availableTags: [
        { name: "Tag1", color: "#ff0000" },
        { name: "Tag2", color: "#00ff00" },
      ],
      keywordRules: { ...DEFAULT_SETTINGS.keywordRules, bypassAll: false },
      highlights: { ...DEFAULT_SETTINGS.highlights, enabled: true },
      display: {
        ...DEFAULT_SETTINGS.display,
        showFilterStatusBar: true,
        cardColumnsPerRow: 0,
        cardSpacing: 15,
      },
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
      mockCallbacks,
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
      mockCallbacks,
    );

    filterMenu.show(toggleBtn);

    const applyBtn = document.querySelector(
      ".rss-dashboard-filter-apply-btn",
    ) as HTMLElement;
    // Simulate checking Unread (usually item index 1 or by label)
    // Find the item with text "Unread"
    const unreadItem = Array.from(
      document.querySelectorAll<HTMLElement>(".rss-dashboard-filter-menu-item"),
    ).find((item) => item.textContent?.includes("Unread"));

    if (unreadItem) {
      unreadItem.click();
    }
    applyBtn.click();
    expect(
      document.querySelector(".rss-dashboard-filter-menu-portal"),
    ).toBeNull();

    const mockFn = mockCallbacks.onFilterChange as unknown as {
      mock: { calls: Array<Array<{ batch: { statusFilters: Set<string> } }>> };
    };
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
      mockCallbacks,
    );

    filterMenu.show(toggleBtn);

    const portal = document.querySelector(".rss-dashboard-filter-menu-portal");
    expect(portal?.textContent).not.toContain("Cards per row");
    expect(portal?.textContent).not.toContain("Card spacing");
  });

  describe("dismissal", () => {
    const portalCount = () =>
      document.querySelectorAll(".rss-dashboard-filter-menu-portal").length;
    const newMenu = () =>
      new ArticleFilterMenu(
        settings,
        new Set(),
        new Set(),
        "AND",
        mockCallbacks,
      );

    it("closes with Escape without applying and returns focus to the filter button", () => {
      const filterMenu = newMenu();
      filterMenu.show(toggleBtn);
      expect(portalCount()).toBe(1);

      const escape = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(escape);

      expect(portalCount()).toBe(0);
      expect(toggleBtn.classList.contains("active")).toBe(false);
      expect(escape.defaultPrevented).toBe(true);
      expect(mockCallbacks.onFilterChange).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(toggleBtn);
    });

    it("closes with Escape while focus is inside the menu", () => {
      newMenu().show(toggleBtn);
      const inside = document.querySelector<HTMLElement>(
        ".rss-dashboard-filter-menu-portal button",
      )!;
      inside.focus();

      inside.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );

      expect(portalCount()).toBe(0);
    });

    it("ignores Escape once the menu is closed", () => {
      const filterMenu = newMenu();
      filterMenu.show(toggleBtn);
      filterMenu.show(toggleBtn);
      expect(portalCount()).toBe(0);
      toggleBtn.blur();

      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );

      expect(document.activeElement).not.toBe(toggleBtn);
    });

    it("closes when the filter button is clicked a second time", () => {
      const filterMenu = newMenu();
      filterMenu.show(toggleBtn);
      filterMenu.show(toggleBtn);
      expect(portalCount()).toBe(0);
      expect(toggleBtn.classList.contains("active")).toBe(false);
    });
  });

  describe("opener state", () => {
    const newMenu = () =>
      new ArticleFilterMenu(
        settings,
        new Set(),
        new Set(),
        "AND",
        mockCallbacks,
      );
    const pressEscape = () =>
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    let opener: HTMLElement;

    beforeEach(() => {
      opener = createDiv();
      opener.setAttribute("role", "button");
      opener.setAttribute("tabindex", "0");
      opener.setAttribute("aria-expanded", "false");
      document.body.appendChild(opener);
    });

    it("keeps aria-expanded in step on the trigger through open, Escape and a second click", () => {
      const filterMenu = newMenu();

      filterMenu.show(toggleBtn);
      expect(toggleBtn.getAttribute("aria-expanded")).toBe("true");

      pressEscape();
      expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");

      filterMenu.show(toggleBtn);
      expect(toggleBtn.getAttribute("aria-expanded")).toBe("true");
      filterMenu.show(toggleBtn);
      expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");
    });

    it("resets aria-expanded when Apply closes the menu", () => {
      newMenu().show(toggleBtn);

      document
        .querySelector<HTMLElement>(".rss-dashboard-filter-apply-btn")
        ?.click();

      expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");
    });

    it("marks the opener expanded as well as the trigger, and clears both on close", () => {
      newMenu().show(toggleBtn, opener);
      expect(opener.getAttribute("aria-expanded")).toBe("true");
      expect(toggleBtn.getAttribute("aria-expanded")).toBe("true");

      pressEscape();

      expect(opener.getAttribute("aria-expanded")).toBe("false");
      expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");
    });

    it("returns Escape focus to the opener, not the trigger", () => {
      newMenu().show(toggleBtn, opener);

      pressEscape();

      expect(document.activeElement).toBe(opener);
    });

    it("returns Escape focus to the trigger when no separate opener is given", () => {
      newMenu().show(toggleBtn);

      pressEscape();

      expect(document.activeElement).toBe(toggleBtn);
    });

    it("clears the opener when the same trigger is clicked to close", () => {
      const filterMenu = newMenu();
      filterMenu.show(toggleBtn, opener);
      filterMenu.show(toggleBtn, opener);

      expect(opener.getAttribute("aria-expanded")).toBe("false");
    });

    it("survives an opener that left the document", () => {
      newMenu().show(toggleBtn, opener);
      opener.remove();

      expect(() => pressEscape()).not.toThrow();
      expect(opener.getAttribute("aria-expanded")).toBe("false");
    });

    it("does not add popup attributes to a trigger that did not declare them", () => {
      newMenu().show(toggleBtn);
      pressEscape();

      expect(toggleBtn.hasAttribute("aria-haspopup")).toBe(false);
    });
  });
});
