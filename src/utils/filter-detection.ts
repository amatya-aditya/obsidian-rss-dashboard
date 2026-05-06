import type { FeedItem, FeedRefreshDiagnostics } from "../types/types";

/**
 * Article filter configuration
 */
interface ArticleFilter {
  type: "age" | "read" | "unread" | "starred" | "saved" | "none";
  value: unknown;
}

/**
 * Represents the context for an empty article state
 */
export interface FilterContext {
  type:
    | "NoArticlesAtAll"
    | "AllArticlesFiltered"
    | "AllArticlesPrunedByRetention";
  unfilteredCount: number;
  filteredCount?: number;
  filterReason?: string;
  thresholdLabel?: string;
  prunedCount?: number;
  retentionLabel?: string;
}

interface BuildArticleEmptyStateContextOptions {
  visibleCount: number;
  scopedCount: number;
  availableBeforeAgeFilterCount: number;
  articleFilter: ArticleFilter;
  refreshDiagnostics?: FeedRefreshDiagnostics;
}

/**
 * Maps millisecond thresholds to human-readable labels.
 * Used to convert age filter values (e.g., 2592000000ms) to display strings (e.g., "1 month")
 */
function getThresholdLabel(thresholdMs: unknown): string {
  if (typeof thresholdMs !== "number") return "threshold";

  // Common filter values from settings
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const oneMonth = 30 * 24 * 60 * 60 * 1000;
  const threeMonths = 90 * 24 * 60 * 60 * 1000;
  const sixMonths = 180 * 24 * 60 * 60 * 1000;
  const oneYear = 365 * 24 * 60 * 60 * 1000;

  if (thresholdMs === oneWeek) return "1 week";
  if (thresholdMs === oneMonth) return "1 month";
  if (thresholdMs === threeMonths) return "3 months";
  if (thresholdMs === sixMonths) return "6 months";
  if (thresholdMs === oneYear) return "1 year";

  // Fallback: convert to days if it's a day-based value
  const days = Math.round(thresholdMs / (24 * 60 * 60 * 1000));
  if (days > 0) return `${days} day${days !== 1 ? "s" : ""}`;

  return "threshold";
}

function getRetentionLabel(days: number | undefined): string | undefined {
  if (typeof days !== "number" || days <= 0) {
    return undefined;
  }

  return `${days} day${days === 1 ? "" : "s"}`;
}

export function buildArticleEmptyStateContext(
  options: BuildArticleEmptyStateContextOptions,
): FilterContext {
  const {
    visibleCount,
    scopedCount,
    availableBeforeAgeFilterCount,
    articleFilter,
    refreshDiagnostics,
  } = options;

  if (visibleCount > 0) {
    return {
      type: "NoArticlesAtAll",
      unfilteredCount: visibleCount,
    };
  }

  if (
    articleFilter.type === "age" &&
    typeof articleFilter.value === "number" &&
    articleFilter.value > 0 &&
    availableBeforeAgeFilterCount > 0
  ) {
    return {
      type: "AllArticlesFiltered",
      unfilteredCount: availableBeforeAgeFilterCount,
      filteredCount: 0,
      filterReason: "age filter",
      thresholdLabel: getThresholdLabel(articleFilter.value),
    };
  }

  const prunedCount =
    (refreshDiagnostics?.skippedByRefreshCutoffCount ?? 0) +
    (refreshDiagnostics?.retentionRemovedCount ?? 0);
  const retentionLabel = getRetentionLabel(
    refreshDiagnostics?.autoDeleteDurationDays,
  );

  if (scopedCount === 0 && prunedCount > 0 && retentionLabel) {
    return {
      type: "AllArticlesPrunedByRetention",
      unfilteredCount: 0,
      prunedCount,
      retentionLabel,
    };
  }

  if (scopedCount > 0) {
    return {
      type: "AllArticlesFiltered",
      unfilteredCount: scopedCount,
      filteredCount: 0,
      filterReason: "active filter combination",
    };
  }

  return {
    type: "NoArticlesAtAll",
    unfilteredCount: 0,
  };
}

/**
 * Detects whether an empty article state is due to genuine emptiness or filtering.
 *
 * This function determines:
 * - `NoArticlesAtAll`: Feed has no articles, or some articles pass the filter (not all hidden)
 * - `AllArticlesFiltered`: Feed has articles but ALL are filtered out by active filters
 *
 * @param feedItems - All articles in the feed (unfiltered)
 * @param currentFilters - Currently active article filter settings
 * @param matchesFiltersFn - Function that applies current filters to an item; returns true if item passes
 * @returns FilterContext describing why the article list is empty
 */
export function detectFilteredOutScenario(
  feedItems: FeedItem[],
  currentFilters: ArticleFilter,
  matchesFiltersFn: (item: FeedItem) => boolean,
): FilterContext {
  const unfilteredCount = feedItems.length;

  // If feed is genuinely empty, no filtering to report
  if (unfilteredCount === 0) {
    return {
      type: "NoArticlesAtAll",
      unfilteredCount: 0,
    };
  }

  // Count articles that pass the filters
  const filteredArticles = feedItems.filter(matchesFiltersFn);
  const filteredCount = filteredArticles.length;

  // If ANY articles pass the filter, this is not an "all filtered" scenario
  if (filteredCount > 0) {
    return {
      type: "NoArticlesAtAll",
      unfilteredCount,
    };
  }

  // ALL articles are filtered out - provide context about why
  let thresholdLabel: string | undefined;
  let filterReason: string;

  if (
    currentFilters &&
    typeof currentFilters === "object" &&
    "type" in currentFilters
  ) {
    const filterType = (currentFilters as { type: string }).type;
    if (filterType === "age") {
      const value = (currentFilters as { value: unknown }).value;
      thresholdLabel = getThresholdLabel(value);
      filterReason = `age filter (${thresholdLabel})`;
    } else {
      filterReason = "active filter combination";
    }
  } else {
    filterReason = "active filter combination";
  }

  return {
    type: "AllArticlesFiltered",
    unfilteredCount,
    filteredCount: 0,
    filterReason,
    thresholdLabel,
  };
}
