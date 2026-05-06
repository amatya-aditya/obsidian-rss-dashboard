import { setIcon } from "obsidian";
import type { FilterContext } from "../utils/filter-detection";

interface ArticleEmptyStateOptions {
  onAction?: () => void;
}

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
  render(
    container: HTMLElement,
    context: FilterContext,
    options?: ArticleEmptyStateOptions,
  ): void {
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
      this.renderAllArticlesFiltered(emptyState, context, options);
    } else if (context.type === "AllArticlesPrunedByRetention") {
      this.renderAllArticlesPrunedByRetention(emptyState, context, options);
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
    options?: ArticleEmptyStateOptions,
  ): void {
    const heading = emptyState.createEl("h2");
    heading.textContent = "Articles outside your filter";

    const description = emptyState.createEl("p");
    if (context.thresholdLabel && context.filterReason !== "view-filter") {
      description.textContent = `${context.unfilteredCount} article${context.unfilteredCount !== 1 ? "s" : ""} found but all are older than ${context.thresholdLabel}.`;
    } else {
      const reasonLabel =
        context.filterReasonLabel ?? "the current view filters";
      description.textContent = `${context.unfilteredCount} article${context.unfilteredCount !== 1 ? "s" : ""} found but none match ${reasonLabel}.`;
    }

    this.renderActionButton(
      emptyState,
      context.actionLabel ?? "Adjust view filters",
      options?.onAction,
    );
  }

  private renderAllArticlesPrunedByRetention(
    emptyState: HTMLElement,
    context: FilterContext,
    options?: ArticleEmptyStateOptions,
  ): void {
    const heading = emptyState.createEl("h2");
    heading.textContent = "Feed refreshed successfully";

    const description = emptyState.createEl("p");
    description.textContent = `${context.prunedCount ?? 0} fetched article${context.prunedCount === 1 ? " was" : "s were"} outside this feed's ${context.retentionLabel} auto-delete window.`;

    this.renderActionButton(
      emptyState,
      context.actionLabel ?? "Adjust per-feed filter settings",
      options?.onAction,
    );
  }

  private renderActionButton(
    emptyState: HTMLElement,
    label: string,
    onAction?: () => void,
  ): void {
    const button = emptyState.createDiv({
      cls: "rss-dashboard-empty-state-button",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": label,
      },
    });
    button.textContent = label;

    if (!onAction) {
      return;
    }

    button.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onAction();
      }
    });

    button.addEventListener("click", () => {
      onAction();
    });
  }
}
