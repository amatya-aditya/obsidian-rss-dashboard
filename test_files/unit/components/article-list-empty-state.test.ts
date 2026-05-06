import { beforeEach, describe, expect, it, vi } from "vitest";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { ArticleEmptyState } from "../../../src/components/article-empty-state";
import type { FilterContext } from "../../../src/utils/filter-detection";

// Set up Obsidian DOM polyfills for createDiv, createEl, etc.
installObsidianDomPolyfills();

describe("ArticleEmptyState - Component Rendering", () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Create a fresh container for each test
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clean up DOM
    document.body.empty?.();
    if (container.parentElement) {
      container.remove();
    }
  });

  describe("NoArticlesAtAll Context", () => {
    it("renders 'No articles found' heading when context type is NoArticlesAtAll", () => {
      // Arrange
      const context: FilterContext = {
        type: "NoArticlesAtAll",
        unfilteredCount: 0,
      };

      const component = new ArticleEmptyState();

      // Act
      component.render(container, context);

      // Assert
      const heading = container.querySelector("h2");
      expect(heading?.textContent).toContain("No articles found");
    });

    it("renders suggestion text when context type is NoArticlesAtAll", () => {
      // Arrange
      const context: FilterContext = {
        type: "NoArticlesAtAll",
        unfilteredCount: 0,
      };

      const component = new ArticleEmptyState();

      // Act
      component.render(container, context);

      // Assert
      const suggestion = container.querySelector("p");
      expect(suggestion?.textContent).toContain("Try refreshing your feeds");
    });

    it("renders RSS icon when context type is NoArticlesAtAll", () => {
      // Arrange
      const context: FilterContext = {
        type: "NoArticlesAtAll",
        unfilteredCount: 0,
      };

      const component = new ArticleEmptyState();

      // Act
      component.render(container, context);

      // Assert
      const iconDiv = container.querySelector(
        ".rss-dashboard-empty-state-icon",
      );
      expect(iconDiv).toBeTruthy();
    });
  });

  describe("AllArticlesFiltered Context", () => {
    it("renders 'Articles outside your filter' heading when context type is AllArticlesFiltered", () => {
      // Arrange
      const context: FilterContext = {
        type: "AllArticlesFiltered",
        unfilteredCount: 5,
        filteredCount: 0,
        filterReason: "age filter (1 month)",
        thresholdLabel: "1 month",
      };

      const component = new ArticleEmptyState();

      // Act
      component.render(container, context);

      // Assert
      const heading = container.querySelector("h2");
      expect(heading?.textContent).toContain("Articles outside your filter");
    });

    it("includes article count in filtered message", () => {
      // Arrange
      const context: FilterContext = {
        type: "AllArticlesFiltered",
        unfilteredCount: 7,
        filteredCount: 0,
        filterReason: "age filter (1 month)",
        thresholdLabel: "1 month",
      };

      const component = new ArticleEmptyState();

      // Act
      component.render(container, context);

      // Assert
      const description = container.querySelector("p");
      expect(description?.textContent).toContain("7");
      expect(description?.textContent).toContain("article");
    });

    it("includes threshold label in filtered message", () => {
      // Arrange
      const context: FilterContext = {
        type: "AllArticlesFiltered",
        unfilteredCount: 3,
        filteredCount: 0,
        filterReason: "age filter (1 month)",
        thresholdLabel: "1 month",
      };

      const component = new ArticleEmptyState();

      // Act
      component.render(container, context);

      // Assert
      const description = container.querySelector("p");
      expect(description?.textContent).toContain("1 month");
    });

    it("renders view-filter copy without age wording when the active reason is a view filter", () => {
      const context: FilterContext = {
        type: "AllArticlesFiltered",
        unfilteredCount: 3,
        filteredCount: 0,
        filterReason: "view-filter",
        filterReasonLabel: "the Unread view filter",
        actionLabel: "Adjust view filters",
      };

      const component = new ArticleEmptyState();
      component.render(container, context);

      const description = container.querySelector("p");
      const button = container.querySelector('[role="button"]');
      expect(description?.textContent).toContain("the Unread view filter");
      expect(description?.textContent).not.toContain("older than");
      expect(button?.textContent).toContain("Adjust view filters");
    });

    it("renders settings button with keyboard accessibility", () => {
      // Arrange
      const context: FilterContext = {
        type: "AllArticlesFiltered",
        unfilteredCount: 5,
        filteredCount: 0,
        filterReason: "age filter (1 month)",
        thresholdLabel: "1 month",
      };

      const component = new ArticleEmptyState();

      // Act
      component.render(container, context);

      // Assert
      const button = container.querySelector('[role="button"]');
      expect(button).toBeTruthy();
      expect(button?.getAttribute("tabindex")).toBe("0");
      expect(button?.getAttribute("aria-label")).toBeTruthy();
    });

    it("button has aria-label for accessibility", () => {
      // Arrange
      const context: FilterContext = {
        type: "AllArticlesFiltered",
        unfilteredCount: 5,
        filteredCount: 0,
        filterReason: "age filter (1 month)",
        thresholdLabel: "1 month",
      };

      const component = new ArticleEmptyState();

      // Act
      component.render(container, context);

      // Assert
      const button = container.querySelector('[role="button"]');
      expect(button?.getAttribute("aria-label")).toContain("Adjust");
    });

    it("button is keyboard accessible - handles Enter key", () => {
      // Arrange
      const context: FilterContext = {
        type: "AllArticlesFiltered",
        unfilteredCount: 5,
        filteredCount: 0,
        filterReason: "age filter (1 month)",
        thresholdLabel: "1 month",
        actionLabel: "Adjust view filters",
      };

      const component = new ArticleEmptyState();
      const onAction = vi.fn();
      component.render(container, context, { onAction });

      const button = container.querySelector('[role="button"]') as HTMLElement;

      // Act
      const enterEvent = new KeyboardEvent("keydown", { key: "Enter" });
      button.dispatchEvent(enterEvent);

      expect(onAction).toHaveBeenCalledTimes(1);
    });

    it("button is keyboard accessible - handles Space key", () => {
      // Arrange
      const context: FilterContext = {
        type: "AllArticlesFiltered",
        unfilteredCount: 5,
        filteredCount: 0,
        filterReason: "age filter (1 month)",
        thresholdLabel: "1 month",
        actionLabel: "Adjust view filters",
      };

      const component = new ArticleEmptyState();
      const onAction = vi.fn();
      component.render(container, context, { onAction });

      const button = container.querySelector('[role="button"]') as HTMLElement;

      // Act
      const spaceEvent = new KeyboardEvent("keydown", { key: " " });
      button.dispatchEvent(spaceEvent);

      expect(onAction).toHaveBeenCalledTimes(1);
    });

    it("renders icon div with scoped CSS class", () => {
      // Arrange
      const context: FilterContext = {
        type: "AllArticlesFiltered",
        unfilteredCount: 5,
        filteredCount: 0,
        filterReason: "age filter (1 month)",
        thresholdLabel: "1 month",
      };

      const component = new ArticleEmptyState();

      // Act
      component.render(container, context);

      // Assert
      const iconDiv = container.querySelector(
        ".rss-dashboard-empty-state-icon",
      );
      expect(iconDiv).toBeTruthy();
    });
  });

  describe("CSS Class Scoping", () => {
    it("uses scoped CSS classes prefixed with rss-dashboard-", () => {
      // Arrange
      const context: FilterContext = {
        type: "AllArticlesFiltered",
        unfilteredCount: 5,
        filteredCount: 0,
        filterReason: "age filter (1 month)",
        thresholdLabel: "1 month",
      };

      const component = new ArticleEmptyState();

      // Act
      component.render(container, context);

      // Assert - Verify scoped classes are used
      const emptyState = container.querySelector(".rss-dashboard-empty-state");
      expect(emptyState).toBeTruthy();

      const button = container.querySelector(
        ".rss-dashboard-empty-state-button",
      );
      expect(button).toBeTruthy();
    });
  });

  describe("AllArticlesPrunedByRetention Context", () => {
    it("explains that refresh worked but the feed's retention window removed the articles", () => {
      const context: FilterContext = {
        type: "AllArticlesPrunedByRetention",
        unfilteredCount: 0,
        prunedCount: 4,
        retentionLabel: "30 days",
        actionLabel: "Adjust per-feed filter settings",
      };

      const component = new ArticleEmptyState();
      component.render(container, context);

      const heading = container.querySelector("h2");
      const description = container.querySelector("p");
      const button = container.querySelector('[role="button"]');

      expect(heading?.textContent).toContain("Feed refreshed successfully");
      expect(description?.textContent).toContain("4");
      expect(description?.textContent).toContain("30 days");
      expect(button?.textContent).toContain("Adjust per-feed filter settings");
    });

    it("invokes the per-feed action callback when the button is clicked", () => {
      const context: FilterContext = {
        type: "AllArticlesPrunedByRetention",
        unfilteredCount: 0,
        prunedCount: 4,
        retentionLabel: "30 days",
        actionLabel: "Adjust per-feed filter settings",
      };

      const onAction = vi.fn();
      const component = new ArticleEmptyState();
      component.render(container, context, { onAction });

      const button = container.querySelector('[role="button"]') as HTMLElement;
      button.click();

      expect(onAction).toHaveBeenCalledTimes(1);
    });
  });
});
