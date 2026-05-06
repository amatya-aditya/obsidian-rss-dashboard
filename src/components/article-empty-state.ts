import { setIcon } from "obsidian";
import type { FilterContext } from "../utils/filter-detection";

/**
 * ArticleEmptyState - Renders empty article state UI
 *
 * Handles two scenarios:
 * 1. NoArticlesAtAll: Feed is genuinely empty or some articles pass filters
 * 2. AllArticlesFiltered: Feed has articles but all are hidden by active filters
 */
export class ArticleEmptyState {
  /**
   * Render the empty state UI into the provided container
   *
   * @param container - HTML element to render into
   * @param context - FilterContext describing why the article list is empty
   */
  render(container: HTMLElement, context: FilterContext): void {
    const emptyState = container.createDiv({
      cls: "rss-dashboard-empty-state",
    });

    // Render icon
    const iconDiv = emptyState.createDiv({
      cls: "rss-dashboard-empty-state-icon",
    });
    setIcon(iconDiv, "rss");

    // Render heading and description based on context type
    if (context.type === "NoArticlesAtAll") {
      this.renderNoArticlesAtAll(emptyState);
    } else if (context.type === "AllArticlesFiltered") {
      this.renderAllArticlesFiltered(emptyState, context);
    } else if (context.type === "AllArticlesPrunedByRetention") {
      this.renderAllArticlesPrunedByRetention(emptyState, context);
    }
  }

  /**
   * Render UI for genuinely empty feed
   */
  private renderNoArticlesAtAll(emptyState: HTMLElement): void {
    const heading = emptyState.createEl("h2");
    heading.textContent = "No articles found";

    const description = emptyState.createEl("p");
    description.textContent = "Try refreshing your feeds or adding new ones.";
  }

  /**
   * Render UI for articles filtered out by active filters
   */
  private renderAllArticlesFiltered(
    emptyState: HTMLElement,
    context: FilterContext,
  ): void {
    const heading = emptyState.createEl("h2");
    heading.textContent = "Articles outside your filter";

    const description = emptyState.createEl("p");
    description.textContent = `${context.unfilteredCount} article${context.unfilteredCount !== 1 ? "s" : ""} found but all are older than ${context.thresholdLabel}.`;

    // Create settings button
    const button = emptyState.createDiv({
      cls: "rss-dashboard-empty-state-button",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": "Open settings to adjust filter",
      },
    });
    button.textContent = "Adjust filter settings";

    // Add keyboard handlers for Enter and Space
    button.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.openSettings();
      }
    });

    // Add click handler
    button.addEventListener("click", () => {
      this.openSettings();
    });
  }

  private renderAllArticlesPrunedByRetention(
    emptyState: HTMLElement,
    context: FilterContext,
  ): void {
    const heading = emptyState.createEl("h2");
    heading.textContent = "Feed refreshed successfully";

    const description = emptyState.createEl("p");
    description.textContent = `${context.prunedCount ?? 0} fetched article${context.prunedCount === 1 ? " was" : "s were"} outside this feed's ${context.retentionLabel} auto-delete window.`;
  }

  /**
   * Open the RSS Dashboard settings modal
   * This should be injected or access the app context
   */
  private openSettings(): void {
    // Placeholder for settings navigation
    // Will be implemented with proper app context injection
    console.error("Opening settings to adjust filter (not yet implemented)");
  }
}
